/**
 * Event Cache Module
 * 
 * Exports for time-series event storage infrastructure
 */

export { CircularBuffer } from './circular-buffer.js';
export type { BufferEvent } from './circular-buffer.js';
export { EventCacheManager } from './manager.js';
export type { CachedEvent, EventQuery, CacheStatistics, EventCacheConfig } from './manager.js';