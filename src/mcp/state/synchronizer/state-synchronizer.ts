import { EventEmitter } from "events";
import { globalLogger as logger } from "../../../shared/utils/logger.js";
import type { IStateRepository, ControlState } from "../repository.js";
import { StateRepositoryEvent } from "../repository.js";
import type { QRWCClientInterface } from "../../qrwc/adapter.js";
import type { 
  SyncConfig, 
  SyncResult, 
  SyncDetail,
  SyncSourceResult
} from "./types.js";
import { 
  SyncStrategy, 
  ConflictResolutionPolicy, 
  SyncEvent 
} from "./types.js";
import { QSysSyncAdapter } from "./qsys-sync-adapter.js";
import { SyncStrategyExecutor } from "./sync-strategies.js";

/**
 * Advanced State Synchronizer
 * 
 * Provides sophisticated synchronization between cache and Q-SYS Core:
 * - Multiple sync strategies (full, incremental)
 * - Intelligent conflict resolution with configurable policies
 * - Batch operations for performance optimization
 * - Automatic retry logic with exponential backoff
 * - Comprehensive progress tracking and reporting
 * - Event-driven architecture for real-time monitoring
 */
export class StateSynchronizer extends EventEmitter {
  private syncTimer?: NodeJS.Timeout;
  private isSyncing = false;
  private lastSyncTimestamp?: Date;
  private syncHistory: SyncResult[] = [];
  private readonly dirtyControls = new Set<string>();
  private readonly config: SyncConfig;
  private readonly qsysAdapter: QSysSyncAdapter;
  private readonly strategyExecutor: SyncStrategyExecutor;

  // Default configuration
  private readonly defaultConfig: SyncConfig = {
    strategy: SyncStrategy.IncrementalSync,
    conflictResolutionPolicy: ConflictResolutionPolicy.QSysWins,
    batchSize: 100,
    syncIntervalMs: 30000, // 30 seconds
    autoSync: false,
    includeMetadata: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 10000
  };

  constructor(
    private readonly repository: IStateRepository,
    private readonly qrwcClient: QRWCClientInterface,
    config: Partial<SyncConfig> = {}
  ) {
    super();
    
    this.config = { ...this.defaultConfig, ...config };
    this.qsysAdapter = new QSysSyncAdapter(qrwcClient);
    this.strategyExecutor = new SyncStrategyExecutor(this.config, this.qsysAdapter);
    
    this.setupEventListeners();
    logger.info('StateSynchronizer created', { config: this.config });
  }

  /**
   * Start automatic synchronization
   */
  start(): void {
    if (this.config.autoSync && !this.syncTimer) {
      logger.info('Starting auto-sync', { 
        intervalMs: this.config.syncIntervalMs 
      });
      
      this.syncTimer = setInterval(() => {
        this.synchronize().catch(error => {
          logger.error('Auto-sync failed', { error });
        });
      }, this.config.syncIntervalMs);
      
      // Perform initial sync
      this.synchronize().catch(error => {
        logger.error('Initial sync failed', { error });
      });
    }
  }

  /**
   * Stop automatic synchronization
   */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      delete this.syncTimer;
      logger.info('Auto-sync stopped');
    }
  }

  /**
   * Perform synchronization
   */
  async synchronize(
    cacheStates?: Map<string, ControlState>,
    source: 'qsys' | 'persistence' = 'qsys'
  ): Promise<SyncSourceResult> {
    if (this.isSyncing) {
      logger.warn('Sync already in progress');
      return { updates: new Map(), conflicts: [] };
    }
    
    this.isSyncing = true;
    const startTime = Date.now();
    
    try {
      logger.info('Starting synchronization', { 
        strategy: this.config.strategy,
        source 
      });
      
      this.emit(SyncEvent.Started, { strategy: this.config.strategy });
      
      // Get current cache states if not provided
      if (!cacheStates) {
        cacheStates = await this.getAllCacheStates();
      }
      
      // Execute sync based on strategy
      let updates: Map<string, ControlState>;
      let details: SyncDetail[];
      
      if (this.config.strategy === SyncStrategy.FullSync) {
        const result = await this.strategyExecutor.performFullSync(cacheStates);
        updates = result.updates;
        details = result.details;
      } else {
        const result = await this.strategyExecutor.performIncrementalSync(
          cacheStates,
          this.dirtyControls
        );
        updates = result.updates;
        details = result.details;
      }
      
      // Clear dirty controls after sync
      this.dirtyControls.clear();
      
      // Create sync result
      const syncResult: SyncResult = {
        timestamp: new Date(),
        strategy: this.config.strategy,
        totalControls: cacheStates.size,
        syncedCount: details.filter(d => d.action === 'synced').length,
        skippedCount: details.filter(d => d.action === 'skipped').length,
        conflictCount: details.filter(d => d.action === 'conflict').length,
        errorCount: details.filter(d => d.action === 'error').length,
        executionTimeMs: Date.now() - startTime,
        details
      };
      
      // Update history
      this.syncHistory.push(syncResult);
      if (this.syncHistory.length > 100) {
        this.syncHistory.shift();
      }
      
      this.lastSyncTimestamp = new Date();
      
      logger.info('Synchronization completed', {
        syncedCount: syncResult.syncedCount,
        conflictCount: syncResult.conflictCount,
        errorCount: syncResult.errorCount,
        executionTimeMs: syncResult.executionTimeMs
      });
      
      this.emit(SyncEvent.Completed, syncResult);
      
      return {
        updates,
        conflicts: details.filter(d => d.action === 'conflict')
      };
      
    } catch (error) {
      logger.error('Synchronization failed', { error });
      this.emit(SyncEvent.Error, { error });
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Mark controls as dirty for next sync
   */
  markDirty(controlNames: string[]): void {
    controlNames.forEach(name => this.dirtyControls.add(name));
    logger.debug('Controls marked dirty', { count: controlNames.length });
  }

  /**
   * Clear dirty controls
   */
  clearDirty(): void {
    this.dirtyControls.clear();
    logger.debug('Dirty controls cleared');
  }

  /**
   * Get synchronization statistics
   */
  getStatistics(): {
    lastSync: Date | null;
    syncCount: number;
    averageSyncTime: number;
    dirtyControlCount: number;
  } {
    const avgTime = this.syncHistory.length > 0
      ? this.syncHistory.reduce((sum, r) => sum + r.executionTimeMs, 0) / this.syncHistory.length
      : 0;
    
    return {
      lastSync: this.lastSyncTimestamp || null,
      syncCount: this.syncHistory.length,
      averageSyncTime: Math.round(avgTime),
      dirtyControlCount: this.dirtyControls.size
    };
  }

  /**
   * Get sync history
   */
  getSyncHistory(): SyncResult[] {
    return [...this.syncHistory];
  }

  /**
   * Shutdown synchronizer
   */
  shutdown(): void {
    this.stop();
    this.dirtyControls.clear();
    this.syncHistory = [];
    logger.info('Synchronizer shutdown');
  }

  /**
   * Get all cache states
   */
  private async getAllCacheStates(): Promise<Map<string, ControlState>> {
    const keys = await this.repository.getKeys();
    return this.repository.getStates(keys);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for cache updates to mark as dirty
    this.repository.on(StateRepositoryEvent.StateChanged, (data: any) => {
      if (data.newState?.source === 'user') {
        this.markDirty([data.controlName]);
      }
    });
    
    // For batch updates, we'll need to handle them differently
    // since there's no BATCH_UPDATE event
    this.repository.on(StateRepositoryEvent.StateChanged, (data: any) => {
      if (!data.updates) return;
      const userUpdates = data.updates
        .filter((u: any) => u.newState?.source === 'user')
        .map((u: any) => u.controlName);
      
      if (userUpdates.length > 0) {
        this.markDirty(userUpdates);
      }
    });
  }
}