/**
 * Synchronizer Types
 * 
 * Type definitions for state synchronization between cache and Q-SYS Core
 */

import type { ControlState } from '../repository.js';

/**
 * Synchronization configuration
 */
export interface SyncConfig {
  intervalMs: number;
  strategy: SyncStrategy;
  conflictPolicy: ConflictResolutionPolicy;
}

/**
 * Synchronization strategy
 */
export enum SyncStrategy {
  PUSH = 'push',
  PULL = 'pull',
  BIDIRECTIONAL = 'bidirectional'
}

/**
 * Conflict resolution policy
 */
export enum ConflictResolutionPolicy {
  LOCAL_WINS = 'local_wins',
  REMOTE_WINS = 'remote_wins',
  NEWEST_WINS = 'newest_wins',
  MANUAL = 'manual'
}

/**
 * Sync event types
 */
export enum SyncEvent {
  SYNC_STARTED = 'sync:started',
  SYNC_COMPLETED = 'sync:completed',
  SYNC_FAILED = 'sync:failed',
  CONFLICT_DETECTED = 'conflict:detected',
  CONFLICT_RESOLVED = 'conflict:resolved'
}

/**
 * Sync detail information
 */
export interface SyncDetail {
  controlName: string;
  localValue: unknown;
  remoteValue: unknown;
  resolution: 'local' | 'remote' | 'merged';
  timestamp: Date;
}

/**
 * Sync source result
 */
export interface SyncSourceResult {
  updates: Map<string, ControlState>;
  conflicts: SyncDetail[];
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  updatedCount: number;
  conflictCount: number;
  duration: number;
  errors: string[];
  details?: SyncDetail[];
}