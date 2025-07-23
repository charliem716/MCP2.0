/**
 * Circular Buffer for Time-Series Event Storage
 * 
 * High-performance circular buffer implementation for storing time-series events
 * with nanosecond precision timestamps and efficient time-range queries.
 */

export interface BufferEvent<T> {
  timestamp: bigint;
  data: T;
  index?: number;
}

export class CircularBuffer<T> {
  private buffer: Array<BufferEvent<T>>;
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private sequenceNumber: number = 0;
  
  // Time index for O(log n) range queries
  private timeIndex: SortedArray<bigint, number>;
  
  constructor(
    private readonly capacity: number,
    private readonly maxAgeMs?: number
  ) {
    if (capacity <= 0) {
      throw new Error('Capacity must be positive');
    }
    this.buffer = new Array(capacity);
    this.timeIndex = new SortedArray();
  }
  
  add(data: T): void {
    const timestamp = process.hrtime.bigint();
    const event: BufferEvent<T> = {
      timestamp,
      data,
      index: this.sequenceNumber++
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
  
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.timeIndex.clear();
  }
  
  private evictOldEvents(): void {
    const cutoffTime = process.hrtime.bigint() - BigInt(this.maxAgeMs! * 1_000_000);
    
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