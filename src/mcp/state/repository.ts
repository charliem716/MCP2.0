import { z } from "zod";
import type { EventEmitter } from "events";
import type { globalLogger as logger } from "../../shared/utils/logger.js";

/**
 * Q-SYS Control State Schema
 */
export const ControlStateSchema = z.object({
  name: z.string().describe("Unique control identifier"),
  value: z.union([z.number(), z.string(), z.boolean()]).describe("Control value"),
  timestamp: z.date().describe("Last update timestamp"),
  source: z.enum(['qsys', 'cache', 'user']).describe("Value source"),
  metadata: z.object({
    type: z.string().optional().describe("Control type (gain, mute, etc)"),
    component: z.string().optional().describe("Parent component name"),
    min: z.number().optional().describe("Minimum value"),
    max: z.number().optional().describe("Maximum value"),
    step: z.number().optional().describe("Value increment step"),
    units: z.string().optional().describe("Value units (dB, Hz, etc)"),
  }).optional().describe("Control metadata")
});

export type ControlState = z.infer<typeof ControlStateSchema>;

/**
 * Change Group Schema for batch operations
 */
export const ChangeGroupSchema = z.object({
  id: z.string().uuid().describe("Unique change group identifier"),
  controls: z.array(z.object({
    name: z.string().describe("Control name"),
    value: z.union([z.number(), z.string(), z.boolean()]).describe("New value"),
    ramp: z.number().positive().optional().describe("Ramp time in seconds"),
  })).min(1).describe("Controls to update"),
  timestamp: z.date().describe("Change group creation time"),
  status: z.enum(['pending', 'applying', 'completed', 'failed']).describe("Change group status"),
  source: z.string().describe("Source of the change group"),
});

export type ChangeGroup = z.infer<typeof ChangeGroupSchema>;

/**
 * Cache Statistics for monitoring and performance
 */
export interface CacheStatistics {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
  memoryUsage: number;
  hitRatio: number;
  uptime: number;
}

/**
 * Cache Configuration
 */
export interface CacheConfig {
  maxEntries: number;
  ttlMs: number;
  cleanupIntervalMs: number;
  enableMetrics: boolean;
  persistenceEnabled: boolean;
  persistenceFile?: string;
}

/**
 * State Repository Interface
 * 
 * Defines the contract for Q-SYS control state management including:
 * - CRUD operations for control states
 * - Change group management for batch updates  
 * - Cache invalidation and synchronization
 * - Performance monitoring and statistics
 */
export interface IStateRepository extends EventEmitter {
  /**
   * Initialize the repository with configuration
   */
  initialize(config: CacheConfig): Promise<void>;

  /**
   * Get control state by name
   */
  getState(controlName: string): Promise<ControlState | null>;

  /**
   * Get multiple control states by names
   */
  getStates(controlNames: string[]): Promise<Map<string, ControlState>>;

  /**
   * Set control state 
   */
  setState(controlName: string, state: ControlState): Promise<void>;

  /**
   * Set multiple control states atomically
   */
  setStates(states: Map<string, ControlState>): Promise<void>;

  /**
   * Remove control state from repository
   */
  removeState(controlName: string): Promise<boolean>;

  /**
   * Remove multiple control states
   */
  removeStates(controlNames: string[]): Promise<number>;

  /**
   * Clear all cached states
   */
  clear(): Promise<void>;

  /**
   * Check if control state exists in cache
   */
  hasState(controlName: string): Promise<boolean>;

  /**
   * Get all cached control names
   */
  getKeys(): Promise<string[]>;

  /**
   * Get cache statistics
   */
  getStatistics(): Promise<CacheStatistics>;

  /**
   * Create a new change group for batch updates
   */
  createChangeGroup(controls: ChangeGroup['controls'], source: string): Promise<ChangeGroup>;

  /**
   * Get change group by ID
   */
  getChangeGroup(id: string): Promise<ChangeGroup | null>;

  /**
   * Update change group status
   */
  updateChangeGroupStatus(id: string, status: ChangeGroup['status']): Promise<boolean>;

  /**
   * Remove completed/failed change groups
   */
  cleanupChangeGroups(): Promise<number>;

  /**
   * Invalidate specific control states
   */
  invalidateStates(controlNames: string[]): Promise<void>;

  /**
   * Invalidate states matching pattern
   */
  invalidatePattern(pattern: RegExp): Promise<void>;

  /**
   * Synchronize cache with Q-SYS Core
   */
  synchronize(forceRefresh?: boolean): Promise<void>;

  /**
   * Persist current state to storage
   */
  persist(): Promise<void>;

  /**
   * Load state from persistent storage
   */
  restore(): Promise<void>;

  /**
   * Cleanup expired entries and resources
   */
  cleanup(): Promise<void>;

  /**
   * Shutdown repository and cleanup
   */
  shutdown(): Promise<void>;
}

/**
 * State Repository Events
 */
export enum StateRepositoryEvent {
  StateChanged = 'state:changed',
  StateInvalidated = 'state:invalidated',
  CacheEvicted = 'cache:evicted',
  ChangeGroupCreated = 'changegroup:created',
  ChangeGroupCompleted = 'changegroup:completed',
  SyncCompleted = 'sync:completed',
  Error = 'error'
}

/**
 * Event data for state repository events
 */
export interface StateRepositoryEventData {
  [StateRepositoryEvent.StateChanged]: {
    controlName: string;
    oldState: ControlState | null;
    newState: ControlState;
  };
  [StateRepositoryEvent.StateInvalidated]: {
    controlNames: string[];
    reason: 'ttl' | 'manual' | 'sync' | 'eviction';
  };
  [StateRepositoryEvent.CacheEvicted]: {
    controlName: string;
    state: ControlState;
    reason: 'lru' | 'ttl' | 'memory';
  };
  [StateRepositoryEvent.ChangeGroupCreated]: {
    changeGroup: ChangeGroup;
  };
  [StateRepositoryEvent.ChangeGroupCompleted]: {
    changeGroup: ChangeGroup;
    success: boolean;
  };
  [StateRepositoryEvent.SyncCompleted]: {
    syncedCount: number;
    duration: number;
  };
  [StateRepositoryEvent.Error]: {
    error: Error;
    context: Record<string, unknown>;
  };
}

/**
 * Base error class for state repository operations
 */
export class StateRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'StateRepositoryError';
  }
}

/**
 * Utility functions for state management
 */
export class StateUtils {
  /**
   * Create a new control state
   */
  static createState(
    name: string, 
    value: ControlState['value'], 
    source: ControlState['source'] = 'cache',
    metadata?: ControlState['metadata']
  ): ControlState {
    return {
      name,
      value,
      timestamp: new Date(),
      source,
      metadata
    };
  }

  /**
   * Check if state is expired based on TTL
   */
  static isExpired(state: ControlState, ttlMs: number): boolean {
    const now = Date.now();
    const stateTime = state.timestamp.getTime();
    return (now - stateTime) > ttlMs;
  }

  /**
   * Calculate memory usage of a control state (approximate)
   */
  static calculateMemoryUsage(state: ControlState): number {
    const baseSize = 100; // Base object overhead
    const nameSize = state.name.length * 2; // UTF-16 encoding
    const valueSize = typeof state.value === 'string' ? state.value.length * 2 : 8;
    const metadataSize = state.metadata ? JSON.stringify(state.metadata).length * 2 : 0;
    
    return baseSize + nameSize + valueSize + metadataSize;
  }

  /**
   * Compare two control states for equality
   */
  static areStatesEqual(state1: ControlState, state2: ControlState): boolean {
    return state1.name === state2.name && 
           state1.value === state2.value &&
           state1.source === state2.source;
  }

  /**
   * Compare two control values for equality
   */
  static areValuesEqual(value1: ControlState['value'], value2: ControlState['value']): boolean {
    return value1 === value2;
  }

  /**
   * Merge state metadata
   */
  static mergeMetadata(
    base: ControlState['metadata'], 
    updates: ControlState['metadata']
  ): ControlState['metadata'] {
    if (!base && !updates) return undefined;
    if (!base) return updates;
    if (!updates) return base;
    
    return { ...base, ...updates };
  }

  /**
   * Validate control value against metadata constraints
   */
  static validateValue(
    value: ControlState['value'], 
    metadata: ControlState['metadata']
  ): { valid: boolean; error?: string } {
    if (!metadata) return { valid: true };

    if (typeof value === 'number') {
      if (metadata.min !== undefined && value < metadata.min) {
        return { valid: false, error: `Value ${value} below minimum ${metadata.min}` };
      }
      if (metadata.max !== undefined && value > metadata.max) {
        return { valid: false, error: `Value ${value} above maximum ${metadata.max}` };
      }
    }

    return { valid: true };
  }
} 