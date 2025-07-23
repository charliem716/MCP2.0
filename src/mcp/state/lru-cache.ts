import { EventEmitter } from "events";
import { globalLogger as logger } from "../../shared/utils/logger.js";
import type { CacheStatistics, CacheConfig } from "./repository.js";

/**
 * LRU Cache Node for doubly-linked list
 */
class CacheNode<K, V> {
  constructor(
    public key: K,
    public value: V,
    public timestamp: number = Date.now(),
    public accessCount = 0,
    public memorySize = 0,
    public prev: CacheNode<K, V> | null = null,
    public next: CacheNode<K, V> | null = null
  ) {}

  /**
   * Update node access statistics
   */
  markAccessed(): void {
    this.accessCount++;
    this.timestamp = Date.now();
  }

  /**
   * Calculate memory usage of this node
   */
  calculateMemorySize(): number {
    const keySize = this.getObjectMemorySize(this.key);
    const valueSize = this.getObjectMemorySize(this.value);
    const nodeOverhead = 96; // Approximate overhead for node object and pointers
    
    this.memorySize = keySize + valueSize + nodeOverhead;
    return this.memorySize;
  }

  private getObjectMemorySize(obj: unknown): number {
    if (obj === null || obj === undefined) return 4;
    if (typeof obj === 'boolean') return 4;
    if (typeof obj === 'number') return 8;
    if (typeof obj === 'string') return obj.length * 2 + 24; // UTF-16 + string overhead
    if (obj instanceof Date) return 24;
    if (typeof obj === 'object') {
      // Simplified object size calculation
      return JSON.stringify(obj).length * 2 + 32;
    }
    return 32; // Default size for unknown types
  }
}

/**
 * Eviction policy (simplified to LRU only)
 */
export enum EvictionPolicy {
  LRU = 'lru'            // Least Recently Used
}

/**
 * Cache events for monitoring
 */
export enum CacheEvent {
  Hit = 'hit',
  Miss = 'miss',
  Set = 'set',
  Evict = 'evict',
  Clear = 'clear',
  Expire = 'expire'
}

/**
 * High-performance LRU Cache (simplified)
 * 
 * Features:
 * - O(1) get, set, delete operations using HashMap + doubly-linked list
 * - LRU eviction policy for simplicity and performance
 * - Memory usage tracking and limits
 * - TTL (Time To Live) support
 * - Comprehensive statistics and monitoring
 * - Event emission for cache operations
 * - Thread-safe operations (single-threaded Node.js)
 */
export class LRUCache<K, V> extends EventEmitter {
  private readonly cache = new Map<K, CacheNode<K, V>>();
  private readonly head: CacheNode<K, V>;
  private readonly tail: CacheNode<K, V>;
  
  // Statistics tracking
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;
  private totalMemoryUsage = 0;
  private readonly createdAt = Date.now();
  
  // Cleanup timer
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly maxEntries = 1000,
    private readonly ttlMs: number = 30 * 60 * 1000, // 30 minutes default
    private readonly maxMemoryBytes: number = 50 * 1024 * 1024, // 50MB default
    private readonly evictionPolicy: EvictionPolicy = EvictionPolicy.LRU,
    private readonly cleanupIntervalMs: number = 5 * 60 * 1000 // 5 minutes
  ) {
    super();
    
    // Initialize doubly-linked list with sentinel nodes
    // Use symbols for sentinel keys to ensure uniqueness and type safety
    const SENTINEL_HEAD = Symbol('SENTINEL_HEAD') as unknown as K;
    const SENTINEL_TAIL = Symbol('SENTINEL_TAIL') as unknown as K;
    this.head = new CacheNode<K, V>(SENTINEL_HEAD, null as unknown as V, 0);
    this.tail = new CacheNode<K, V>(SENTINEL_TAIL, null as unknown as V, 0);
    this.head.next = this.tail;
    this.tail.prev = this.head;

    // Start periodic cleanup
    this.startCleanup();
    
    logger.debug('LRU Cache initialized', {
      maxEntries,
      ttlMs,
      maxMemoryBytes,
      evictionPolicy,
      cleanupIntervalMs
    });
  }

  /**
   * Get value from cache
   */
  get(key: K): V | null {
    const node = this.cache.get(key);
    
    if (!node) {
      this.missCount++;
      this.emit(CacheEvent.Miss, key);
      return null;
    }

    // Check TTL expiration
    if (this.isExpired(node)) {
      this.delete(key);
      this.missCount++;
      this.emit(CacheEvent.Miss, key);
      return null;
    }

    // Update access statistics and move to front
    node.markAccessed();
    this.moveToHead(node);
    
    this.hitCount++;
    this.emit(CacheEvent.Hit, key, node.value);
    return node.value;
  }

  /**
   * Set key-value pair in cache
   */
  set(key: K, value: V, customTtl?: number): boolean {
    let node = this.cache.get(key);
    const now = Date.now();

    if (node) {
      // Update existing node
      const oldMemorySize = node.memorySize;
      node.value = value;
      node.timestamp = customTtl ? now + customTtl : now;
      node.markAccessed();
      node.calculateMemorySize();
      
      this.totalMemoryUsage += (node.memorySize - oldMemorySize);
      this.moveToHead(node);
      
      this.emit(CacheEvent.Set, key, value, false);
      return true;
    }

    // Create new node
    node = new CacheNode(key, value, now);
    node.calculateMemorySize();
    
    // Check if we need to evict before adding
    if (!this.canAccommodate(node)) {
      if (!this.evictToMakeRoom(node.memorySize)) {
        logger.warn('Cannot accommodate new cache entry', { key, memorySize: node.memorySize });
        return false;
      }
    }

    // Add new node
    this.cache.set(key, node);
    this.addToHead(node);
    this.totalMemoryUsage += node.memorySize;

    this.emit(CacheEvent.Set, key, value, true);
    return true;
  }

  /**
   * Delete key from cache
   */
  delete(key: K): boolean {
    const node = this.cache.get(key);
    if (!node) return false;

    this.cache.delete(key);
    this.removeNode(node);
    this.totalMemoryUsage -= node.memorySize;

    this.emit(CacheEvent.Evict, key, node.value, 'manual');
    return true;
  }

  /**
   * Check if key exists in cache (without affecting LRU order)
   */
  has(key: K): boolean {
    const node = this.cache.get(key);
    return node ? !this.isExpired(node) : false;
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    
    // Reset linked list
    this.head.next = this.tail;
    this.tail.prev = this.head;
    
    this.totalMemoryUsage = 0;
    this.emit(CacheEvent.Clear, size);
    
    logger.debug('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Get all keys in cache (in LRU order, most recent first)
   */
  keys(): K[] {
    const keys: K[] = [];
    let current = this.head.next;
    
    while (current && current !== this.tail) {
      if (!this.isExpired(current)) {
        keys.push(current.key);
      }
      current = current.next;
    }
    
    return keys;
  }

  /**
   * Get all values in cache (in LRU order)
   */
  values(): V[] {
    const values: V[] = [];
    let current = this.head.next;
    
    while (current && current !== this.tail) {
      if (!this.isExpired(current)) {
        values.push(current.value);
      }
      current = current.next;
    }
    
    return values;
  }

  /**
   * Get cache size (number of entries)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    const total = this.hitCount + this.missCount;
    const hitRatio = total > 0 ? this.hitCount / total : 0;
    
    return {
      totalEntries: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
      memoryUsage: this.totalMemoryUsage,
      hitRatio,
      uptime: Date.now() - this.createdAt
    };
  }

  /**
   * Remove expired entries
   */
  removeExpired(): number {
    let removedCount = 0;
    const keysToRemove: K[] = [];
    
    // Collect expired keys
    for (const [key, node] of this.cache) {
      if (this.isExpired(node)) {
        keysToRemove.push(key);
      }
    }

    // Remove expired entries
    for (const key of keysToRemove) {
      if (this.delete(key)) {
        removedCount++;
        this.emit(CacheEvent.Expire, key);
      }
    }

    if (removedCount > 0) {
      logger.debug('Removed expired entries', { count: removedCount });
    }

    return removedCount;
  }

  /**
   * Cleanup resources and stop timers
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      delete this.cleanupTimer;
    }
    
    this.clear();
    this.removeAllListeners();
    
    logger.debug('LRU Cache shutdown completed');
  }

  // Private helper methods

  private canAccommodate(node: CacheNode<K, V>): boolean {
    if (this.cache.size >= this.maxEntries) return false;
    if (this.totalMemoryUsage + node.memorySize > this.maxMemoryBytes) return false;
    return true;
  }

  private evictToMakeRoom(requiredMemory: number): boolean {
    let freedMemory = 0;
    let attempts = 0;
    const maxAttempts = Math.min(100, this.cache.size); // Prevent infinite loops

    while ((this.cache.size >= this.maxEntries || 
            this.totalMemoryUsage + requiredMemory > this.maxMemoryBytes) && 
           attempts < maxAttempts) {
      
      const evicted = this.evictOne();
      if (!evicted) break;
      
      freedMemory += evicted.memorySize;
      attempts++;
      
      // If we've freed enough memory, we can stop
      if (freedMemory >= requiredMemory && this.cache.size < this.maxEntries) {
        break;
      }
    }

    return this.cache.size < this.maxEntries && 
           this.totalMemoryUsage + requiredMemory <= this.maxMemoryBytes;
  }

  private evictOne(): CacheNode<K, V> | null {
    // Use LRU eviction (simplified)
    const nodeToEvict = this.tail.prev !== this.head ? this.tail.prev : null;

    if (nodeToEvict && nodeToEvict !== this.head && nodeToEvict !== this.tail) {
      this.cache.delete(nodeToEvict.key);
      this.removeNode(nodeToEvict);
      this.totalMemoryUsage -= nodeToEvict.memorySize;
      this.evictionCount++;
      
      this.emit(CacheEvent.Evict, nodeToEvict.key, nodeToEvict.value, this.evictionPolicy);
      return nodeToEvict;
    }

    return null;
  }



  private isExpired(node: CacheNode<K, V>): boolean {
    return Date.now() > (node.timestamp + this.ttlMs);
  }

  private moveToHead(node: CacheNode<K, V>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private addToHead(node: CacheNode<K, V>): void {
    node.prev = this.head;
    node.next = this.head.next;
    
    if (this.head.next) {
      this.head.next.prev = node;
    }
    this.head.next = node;
  }

  private removeNode(node: CacheNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      try {
        this.removeExpired();
      } catch (error) {
        logger.error('Error during cache cleanup', { error });
        this.emit('error', error);
      }
    }, this.cleanupIntervalMs);
  }
} 