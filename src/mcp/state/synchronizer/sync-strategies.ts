import { globalLogger as logger } from "../../../shared/utils/logger.js";
import type { ControlState } from "../repository.js";
import { StateUtils } from "../repository.js";
import type { 
  SyncConfig, 
  SyncDetail, 
  ConflictResolutionPolicy 
} from "./types.js";
import type { QSysSyncAdapter } from "./qsys-sync-adapter.js";

/**
 * Sync Strategy Executor
 * 
 * Implements different synchronization strategies and conflict resolution
 */
export class SyncStrategyExecutor {
  constructor(
    private config: SyncConfig,
    private qsysAdapter: QSysSyncAdapter
  ) {}

  /**
   * Perform full synchronization
   */
  async performFullSync(
    cacheStates: Map<string, ControlState>
  ): Promise<{ updates: Map<string, ControlState>, details: SyncDetail[] }> {
    logger.info('Performing full sync');
    
    const qsysStates = await this.qsysAdapter.getQSysControls();
    const updates = new Map<string, ControlState>();
    const details: SyncDetail[] = [];
    
    // Sync all Q-SYS controls to cache
    for (const [name, qsysState] of qsysStates) {
      const cacheState = cacheStates.get(name);
      const syncDetail = await this.syncIndividualControl(
        name, 
        cacheState, 
        qsysState
      );
      
      details.push(syncDetail);
      
      if (syncDetail.action === 'synced' && syncDetail.resolvedValue !== undefined) {
        updates.set(name, {
          name,
          value: syncDetail.resolvedValue,
          timestamp: new Date(),
          source: 'qsys'
        });
      }
    }
    
    return { updates, details };
  }

  /**
   * Perform incremental synchronization
   */
  async performIncrementalSync(
    cacheStates: Map<string, ControlState>,
    dirtyControls: Set<string>
  ): Promise<{ updates: Map<string, ControlState>, details: SyncDetail[] }> {
    logger.info('Performing incremental sync', { 
      dirtyCount: dirtyControls.size 
    });
    
    const controlsToSync = Array.from(dirtyControls);
    const updates = new Map<string, ControlState>();
    const details: SyncDetail[] = [];
    
    // Process in batches
    for (let i = 0; i < controlsToSync.length; i += this.config.batchSize) {
      const batch = controlsToSync.slice(i, i + this.config.batchSize);
      const batchResult = await this.processBatch(batch, cacheStates);
      
      batchResult.updates.forEach((state, name) => updates.set(name, state));
      details.push(...batchResult.details);
    }
    
    return { updates, details };
  }

  /**
   * Process a batch of controls
   */
  async processBatch(
    controlNames: string[],
    cacheStates: Map<string, ControlState>
  ): Promise<{ updates: Map<string, ControlState>, details: SyncDetail[] }> {
    const qsysStates = await this.qsysAdapter.getQSysControlsByNames(controlNames);
    const updates = new Map<string, ControlState>();
    const details: SyncDetail[] = [];
    
    for (const controlName of controlNames) {
      const cacheState = cacheStates.get(controlName);
      const qsysState = qsysStates.get(controlName);
      
      if (!qsysState) {
        details.push({
          controlName,
          action: 'error',
          error: 'Control not found in Q-SYS',
          timestamp: new Date()
        });
        continue;
      }
      
      const syncDetail = await this.syncIndividualControl(
        controlName,
        cacheState,
        qsysState
      );
      
      details.push(syncDetail);
      
      if (syncDetail.action === 'synced' && syncDetail.resolvedValue !== undefined) {
        updates.set(controlName, {
          name: controlName,
          value: syncDetail.resolvedValue,
          timestamp: new Date(),
          source: 'qsys'
        });
      }
    }
    
    return { updates, details };
  }

  /**
   * Sync an individual control
   */
  async syncIndividualControl(
    controlName: string,
    cacheState: ControlState | undefined,
    qsysState: ControlState
  ): Promise<SyncDetail> {
    const detail: SyncDetail = {
      controlName,
      action: 'synced',
      timestamp: new Date()
    };
    
    if (!cacheState) {
      // New control - add to cache
      detail.qsysValue = qsysState.value;
      detail.resolvedValue = qsysState.value;
      return detail;
    }
    
    detail.cacheValue = cacheState.value;
    detail.qsysValue = qsysState.value;
    
    // Check if values are equal
    if (StateUtils.areValuesEqual(cacheState.value, qsysState.value)) {
      detail.action = 'skipped';
      return detail;
    }
    
    // Conflict detected - resolve based on policy
    const resolvedValue = this.resolveConflict(
      cacheState,
      qsysState,
      this.config.conflictResolutionPolicy
    );
    
    detail.action = 'conflict';
    detail.resolvedValue = resolvedValue;
    
    logger.debug('Conflict resolved', {
      controlName,
      cacheValue: cacheState.value,
      qsysValue: qsysState.value,
      resolvedValue,
      policy: this.config.conflictResolutionPolicy
    });
    
    return detail;
  }

  /**
   * Resolve conflict between cache and Q-SYS values
   */
  private resolveConflict(
    cacheState: ControlState,
    qsysState: ControlState,
    policy: ConflictResolutionPolicy
  ): ControlState['value'] {
    switch (policy) {
      case 'cache-wins':
        return cacheState.value;
      
      case 'qsys-wins':
        return qsysState.value;
      
      default:
        // Default to Q-SYS wins
        return qsysState.value;
    }
  }
}