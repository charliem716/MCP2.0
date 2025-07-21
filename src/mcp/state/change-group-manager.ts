/**
 * Change Group Manager Module
 * 
 * Re-exports the sophisticated transaction-based ChangeGroupManager from modular components.
 * This is the primary change group implementation for Q-SYS control batch operations with
 * features like rollback, concurrency control, and detailed execution tracking.
 * 
 * Note: The cache layer has its own lightweight CacheChangeGroupManager for cache-specific operations.
 */
export * from "./change-group/index.js";