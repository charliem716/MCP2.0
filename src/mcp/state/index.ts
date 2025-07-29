/**
 * Simplified State Management - BUG-132
 * 
 * This is the new, simplified state management system that replaces
 * the complex multi-layer architecture.
 */

// Core exports
export { SimpleStateManager } from './simple-state-manager.js';
export { createStateRepository, getDefaultStateConfig } from './factory.js';
export type { 
  IStateRepository,
  ControlState,
  ChangeGroup,
  CacheConfig,
  CacheStatistics,
  StateRepositoryEvent,
  StateRepositoryEventData
} from './repository.js';

// Simple utilities
export { LRUCache } from './lru-cache.js';

// Legacy exports for backwards compatibility (to be removed)
// These are deprecated and should not be used in new code
export { StateError, StateErrorCode } from './errors.js';

/**
 * @deprecated The complex state management system has been replaced.
 * Files in the following directories are archived and should not be used:
 * - cache/
 * - change-group/
 * - event-cache/
 * - persistence/
 * 
 * Use SimpleStateManager instead.
 */