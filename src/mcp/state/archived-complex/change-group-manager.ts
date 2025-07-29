/**
 * Change Group Manager Module
 *
 * Re-exports the sophisticated transaction-based ChangeGroupManager from modular components.
 * This is the primary change group implementation for Q-SYS control batch operations with
 * features like rollback, concurrency control, and detailed execution tracking.
 *
 * Note: The cache layer has its own lightweight CacheChangeGroupManager for cache-specific operations.
 */
export { ChangeGroupManager } from './change-group/manager.js';
export { ChangeGroupExecutor } from './change-group/change-group-executor.js';
export { RollbackHandler } from './change-group/rollback-handler.js';
export {
  Semaphore,
  createTimeoutPromise,
} from './change-group/concurrency-utils.js';
export * from './change-group/types.js';
