import type { ControlState } from "../repository.js";

/**
 * Synchronization strategy options (simplified)
 */
export enum SyncStrategy {
  FullSync = 'full',           // Sync all controls
  IncrementalSync = 'incremental' // Sync only changed controls  
}

/**
 * Conflict resolution policies (simplified)
 */
export enum ConflictResolutionPolicy {
  CacheWins = 'cache-wins',        // Cache value takes precedence
  QSysWins = 'qsys-wins'           // Q-SYS Core value takes precedence
}

/**
 * Synchronization configuration
 */
export interface SyncConfig {
  strategy: SyncStrategy;
  conflictResolutionPolicy: ConflictResolutionPolicy;
  batchSize: number;
  syncIntervalMs: number;
  autoSync: boolean;
  includeMetadata: boolean;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
}

/**
 * Synchronization result
 */
export interface SyncResult {
  timestamp: Date;
  strategy: SyncStrategy;
  totalControls: number;
  syncedCount: number;
  skippedCount: number;
  conflictCount: number;
  errorCount: number;
  executionTimeMs: number;
  details: SyncDetail[];
}

/**
 * Individual control sync result
 */
export interface SyncDetail {
  controlName: string;
  action: 'synced' | 'skipped' | 'conflict' | 'error';
  cacheValue?: ControlState['value'];
  qsysValue?: ControlState['value'];
  resolvedValue?: ControlState['value'];
  error?: string;
  timestamp: Date;
}

/**
 * Sync events
 */
export enum SyncEvent {
  Started = 'sync:started',
  Progress = 'sync:progress',
  Completed = 'sync:completed',
  Conflict = 'sync:conflict',
  Error = 'sync:error',
  Retry = 'sync:retry'
}

/**
 * Sync result from Q-SYS or persistence
 */
export interface SyncSourceResult {
  updates: Map<string, ControlState>;
  conflicts: SyncDetail[];
}