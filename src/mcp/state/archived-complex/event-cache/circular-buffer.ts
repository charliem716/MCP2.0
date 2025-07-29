/**
 * Circular Buffer for Time-Series Event Storage
 *
 * High-performance circular buffer implementation for storing time-series events
 * with nanosecond precision timestamps and efficient time-range queries.
 */

import { CacheError, CacheErrorCode } from '../errors.js';

export interface BufferEvent<T> {
  timestamp: bigint;
  data: T;
  index?: number;
}

export class CircularBuffer<T> {
  private buffer: Array<BufferEvent<T>>;
  private head = 0;
  private tail = 0;
  private size = 0;
  private sequenceNumber = 0;

  // Time index for O(log n) range queries
  private timeIndex: SortedArray<bigint, number>;

  constructor(
    private readonly capacity: number,
    private readonly maxAgeMs?: number
  ) {
    if (capacity <= 0) {
      throw new CacheError('Capacity must be positive', CacheErrorCode.CAPACITY_ERROR,
        { capacity });
    }
    this.buffer = new Array<BufferEvent<T>>(capacity);
    this.timeIndex = new SortedArray();
  }

  add(data: T, timestamp?: bigint): void {
    timestamp ??= process.hrtime.bigint();
    const event: BufferEvent<T> = {
      timestamp,
      data,
      index: this.sequenceNumber++,
    };

    // Remove events older than maxAge
    if (this.maxAgeMs) {
      this.evictOldEvents();
    }

    // If overwriting, remove old event from index
    if (this.size === this.capacity) {
      const oldEvent = this.buffer[this.head];
      if (oldEvent) {
        this.timeIndex.remove(oldEvent.timestamp);
      }
    }

    // Add to buffer
    this.buffer[this.head] = event;
    this.timeIndex.insert(timestamp, this.head);

    // Update pointers
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    } else {
      // Overwriting oldest event
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  queryTimeRange(startTime: bigint, endTime: bigint): T[] {
    const indices = this.timeIndex.findInRange(startTime, endTime);
    const results: T[] = [];

    for (const bufferIdx of indices) {
      const event = this.buffer[bufferIdx];
      if (event && event.timestamp >= startTime && event.timestamp <= endTime) {
        results.push(event.data);
      }
    }

    return results;
  }

  getSize(): number {
    return this.size;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  getOldest(): T | undefined {
    if (this.size === 0) return undefined;
    const oldestEvent = this.buffer[this.tail];
    return oldestEvent?.data;
  }

  getNewest(): T | undefined {
    if (this.size === 0) return undefined;
    const newestIdx = (this.head - 1 + this.capacity) % this.capacity;
    const newestEvent = this.buffer[newestIdx];
    return newestEvent?.data;
  }

  getMemoryUsage(): number {
    // Rough estimate: 200 bytes per event
    return this.size * 200;
  }

  /**
   * Get all events in the buffer (for debugging/testing)
   */
  getAll(): T[] {
    const results: T[] = [];
    if (this.size === 0) return results;

    let idx = this.tail;
    for (let i = 0; i < this.size; i++) {
      const event = this.buffer[idx];
      if (event) {
        results.push(event.data);
      }
      idx = (idx + 1) % this.capacity;
    }

    return results;
  }

  clear(): void {
    this.buffer = new Array<BufferEvent<T>>(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.timeIndex.clear();
  }

  evictOldEvents(): void {
    if (!this.maxAgeMs) return;

    const nowMs = Date.now();
    const cutoffTime = BigInt((nowMs - this.maxAgeMs) * 1_000_000);

    while (this.size > 0) {
      const oldestIdx = this.tail;
      const oldest = this.buffer[oldestIdx];

      if (oldest && oldest.timestamp < cutoffTime) {
        this.timeIndex.remove(oldest.timestamp);
        this.tail = (this.tail + 1) % this.capacity;
        this.size--;
      } else {
        break;
      }
    }
  }

  /**
   * Force eviction of a specific number of oldest events
   * @returns Number of events actually evicted
   */
  forceEvict(count: number): number {
    let evicted = 0;
    const toEvict = Math.min(count, this.size);

    while (evicted < toEvict && this.size > 0) {
      const oldestIdx = this.tail;
      const oldest = this.buffer[oldestIdx];

      if (oldest) {
        this.timeIndex.remove(oldest.timestamp);
      }

      this.tail = (this.tail + 1) % this.capacity;
      this.size--;
      evicted++;
    }

    return evicted;
  }
}

/**
 * Sorted array implementation for time-based indexing
 */
class SortedArray<K extends bigint, V> {
  private keys: K[] = [];
  private values: V[] = [];

  insert(key: K, value: V): void {
    const idx = this.binarySearch(key);
    this.keys.splice(idx, 0, key);
    this.values.splice(idx, 0, value);
  }

  remove(key: K): boolean {
    const idx = this.findExact(key);
    if (idx >= 0) {
      this.keys.splice(idx, 1);
      this.values.splice(idx, 1);
      return true;
    }
    return false;
  }

  findInRange(startKey: K, endKey: K): V[] {
    const startIdx = this.binarySearch(startKey);
    const endIdx = this.binarySearchEnd(endKey);
    return this.values.slice(startIdx, endIdx);
  }

  clear(): void {
    this.keys = [];
    this.values = [];
  }

  private binarySearch(key: K): number {
    let left = 0;
    let right = this.keys.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midKey = this.keys[mid];
      if (midKey !== undefined && midKey < key) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  private binarySearchEnd(key: K): number {
    let left = 0;
    let right = this.keys.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midKey = this.keys[mid];
      if (midKey !== undefined && midKey <= key) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  private findExact(key: K): number {
    const idx = this.binarySearch(key);
    if (idx < this.keys.length && this.keys[idx] === key) {
      return idx;
    }
    return -1;
  }
}
