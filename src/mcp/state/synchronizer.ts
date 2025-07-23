/**
 * State Synchronizer Module
 * 
 * Exports simplified synchronizer for basic state sync needs
 */
export { SimpleSynchronizer as StateSynchronizer } from "./simple-synchronizer.js";

// Export types for compatibility
export type { SyncConfig, SyncResult, SyncDetail, SyncSourceResult } from "./synchronizer/types.js";
export { SyncStrategy, ConflictResolutionPolicy, SyncEvent } from "./synchronizer/types.js";