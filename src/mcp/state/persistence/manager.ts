import { globalLogger as logger } from '../../../shared/utils/logger.js';
import type { ControlState } from '../repository.js';
import type {
  PersistenceConfig,
  PersistenceStats,
  PersistedState,
} from './types.js';
import { PersistenceFormat, CompressionType } from './types.js';
import { BackupManager } from './backup.js';
import { FileOperations } from './file-operations.js';
import { PersistenceError, PersistenceErrorCode } from './errors.js';

/**
 * Simple and Efficient State Persistence Manager (simplified)
 *
 * Provides reliable state persistence with:
 * - JSON file storage with atomic writes
 * - Automatic backup management
 * - Error recovery and validation
 * - Performance monitoring and statistics
 */
export class StatePersistenceManager {
  private readonly config: PersistenceConfig;
  private autoSaveTimer?: NodeJS.Timeout;
  private stats: PersistenceStats;
  private readonly version = '1.0.0';
  private readonly backupManager: BackupManager;
  private readonly fileOps: FileOperations;

  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = {
      filePath: './cache-state.json',
      format: PersistenceFormat.JSON,
      compression: CompressionType.None,
      backupCount: 3,
      autoSave: false,
      saveIntervalMs: 60000, // 1 minute
      atomicWrites: true,
      pretty: true,
      ...config,
    };

    this.stats = {
      totalSaves: 0,
      totalLoads: 0,
      fileSizeBytes: 0,
      saveErrors: 0,
      loadErrors: 0,
    };

    this.backupManager = new BackupManager(
      this.config.filePath,
      this.config.backupCount
    );
    this.fileOps = new FileOperations(this.config);

    logger.debug('StatePersistenceManager created', { config: this.config });
  }

  /**
   * Start auto-save if enabled
   */
  start(): void {
    if (this.config.autoSave && !this.autoSaveTimer) {
      logger.info('Starting auto-save', {
        intervalMs: this.config.saveIntervalMs,
      });

      this.autoSaveTimer = setInterval(() => {
        logger.debug('Auto-save triggered');
        // Note: Actual save would be triggered by the cache manager
      }, this.config.saveIntervalMs);
    }
  }

  /**
   * Stop auto-save
   */
  stop(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      delete this.autoSaveTimer;
      logger.info('Auto-save stopped');
    }
  }

  /**
   * Save state to persistent storage
   */
  async saveState(
    controls: Map<string, ControlState>,
    metadata?: Record<string, any>
  ): Promise<void> {
    const startTime = Date.now();

    try {
      logger.debug('Saving state', { controlCount: controls.size });

      // Create backup before save
      if (this.config.backupCount > 0) {
        await this.backupManager.createBackup();
      }

      // Prepare state
      const state: PersistedState = {
        version: this.version,
        timestamp: new Date(),
        controlCount: controls.size,
        controls: Object.fromEntries(controls),
        ...(metadata ? { metadata } : {}),
      };

      // Save based on format (currently only JSON is supported)
      await this.fileOps.writeJSON(state);

      // Update stats
      this.stats.totalSaves++;
      this.stats.lastSaveTime = new Date();
      this.stats.fileSizeBytes = await this.fileOps.getFileSize(
        this.config.filePath
      );

      const duration = Date.now() - startTime;
      logger.info('State saved successfully', {
        controlCount: controls.size,
        duration,
        fileSizeBytes: this.stats.fileSizeBytes,
      });
    } catch (error) {
      this.stats.saveErrors++;
      logger.error('Failed to save state', { error });
      throw error;
    }
  }

  /**
   * Load state from persistent storage
   */
  async loadState(): Promise<Map<string, ControlState> | null> {
    const startTime = Date.now();

    try {
      logger.debug('Loading state');

      // Check if file exists
      const exists = await this.fileOps.fileExists(this.config.filePath);
      if (!exists) {
        logger.info('No persisted state found');
        return null;
      }

      // Load based on format (currently only JSON is supported)
      const state = await this.fileOps.readJSON();

      // Validate state
      this.validatePersistedState(state);

      // Convert to Map
      const controls = new Map<string, ControlState>();
      for (const [key, value] of Object.entries(state.controls)) {
        controls.set(key, value);
      }

      // Update stats
      this.stats.totalLoads++;
      this.stats.lastLoadTime = new Date();
      this.stats.fileSizeBytes = await this.fileOps.getFileSize(
        this.config.filePath
      );

      const duration = Date.now() - startTime;
      logger.info('State loaded successfully', {
        controlCount: controls.size,
        duration,
        stateVersion: state.version,
        stateTimestamp: state.timestamp,
      });

      return controls;
    } catch (error) {
      this.stats.loadErrors++;
      logger.error('Failed to load state', { error });

      // Try to recover from backup
      if (this.config.backupCount > 0) {
        return await this.backupManager.recoverFromBackup(
          async path => this.fileOps.readJSONFromPath(path),
          state => this.validatePersistedState(state)
        );
      }

      return null;
    }
  }

  /**
   * Clear persisted state and backups
   */
  async clearState(): Promise<void> {
    try {
      logger.info('Clearing persisted state');

      // Delete main file
      const exists = await this.fileOps.fileExists(this.config.filePath);
      if (exists) {
        await this.fileOps.deleteFile(this.config.filePath);
      }

      // Clear backups
      if (this.config.backupCount > 0) {
        await this.backupManager.clearBackups();
      }

      logger.info('Persisted state cleared');
    } catch (error) {
      logger.error('Failed to clear state', { error });
      throw error;
    }
  }

  /**
   * Get persistence statistics
   */
  getStatistics(): PersistenceStats {
    return { ...this.stats };
  }

  /**
   * Get current configuration
   */
  getConfig(): PersistenceConfig {
    return { ...this.config };
  }

  /**
   * Shutdown persistence manager
   */
  shutdown(): void {
    this.stop();
    logger.info('Persistence manager shutdown');
  }

  /**
   * Validate persisted state structure
   */
  private validatePersistedState(state: unknown): void {
    if (!state || typeof state !== 'object') {
      throw new PersistenceError(
        'Invalid state: not an object',
        PersistenceErrorCode.INVALID_STATE,
        { state }
      );
    }

    const stateObj = state as Record<string, unknown>;

    if (!stateObj['version'] || typeof stateObj['version'] !== 'string') {
      throw new PersistenceError(
        'Invalid state: missing or invalid version',
        PersistenceErrorCode.VALIDATION_ERROR,
        { version: stateObj['version'] }
      );
    }

    if (!stateObj['timestamp']) {
      throw new PersistenceError(
        'Invalid state: missing timestamp',
        PersistenceErrorCode.VALIDATION_ERROR,
        { state: 'timestamp missing' }
      );
    }

    if (
      typeof stateObj['controlCount'] !== 'number' ||
      stateObj['controlCount'] < 0
    ) {
      throw new PersistenceError(
        'Invalid state: invalid control count',
        PersistenceErrorCode.VALIDATION_ERROR,
        { controlCount: stateObj['controlCount'] }
      );
    }

    if (!stateObj['controls'] || typeof stateObj['controls'] !== 'object') {
      throw new PersistenceError(
        'Invalid state: missing or invalid controls',
        PersistenceErrorCode.VALIDATION_ERROR,
        { controls: stateObj['controls'] }
      );
    }

    // Validate control count matches
    const actualCount = Object.keys(
      stateObj['controls'] as Record<string, unknown>
    ).length;
    if (actualCount !== stateObj['controlCount']) {
      throw new PersistenceError(
        `Invalid state: control count mismatch (expected ${stateObj['controlCount']}, got ${actualCount})`,
        PersistenceErrorCode.VALIDATION_ERROR,
        { expected: stateObj['controlCount'], actual: actualCount }
      );
    }
  }
}
