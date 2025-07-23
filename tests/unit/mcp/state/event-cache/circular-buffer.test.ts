import { CircularBuffer } from '../../../../../src/mcp/state/event-cache/circular-buffer.js';

describe('CircularBuffer', () => {
  describe('constructor', () => {
    it('should create buffer with specified capacity', () => {
      const buffer = new CircularBuffer<string>(10);
      expect(buffer.getSize()).toBe(0);
      expect(buffer.isEmpty()).toBe(true);
    });

    it('should throw error for non-positive capacity', () => {
      expect(() => new CircularBuffer<string>(0)).toThrow('Capacity must be positive');
      expect(() => new CircularBuffer<string>(-1)).toThrow('Capacity must be positive');
    });
  });

  describe('add operations', () => {
    it('should add items up to capacity', () => {
      const buffer = new CircularBuffer<number>(3);
      
      buffer.add(1);
      expect(buffer.getSize()).toBe(1);
      
      buffer.add(2);
      expect(buffer.getSize()).toBe(2);
      
      buffer.add(3);
      expect(buffer.getSize()).toBe(3);
    });

    it('should overwrite oldest items when full', () => {
      const buffer = new CircularBuffer<string>(3);
      
      buffer.add('a');
      buffer.add('b');
      buffer.add('c');
      buffer.add('d'); // Overwrites 'a'
      
      expect(buffer.getSize()).toBe(3);
    });
  });

  describe('time-based queries', () => {
    beforeEach(() => {
      // Mock hrtime.bigint for predictable timestamps
      let counter = 0n;
      jest.spyOn(process.hrtime, 'bigint').mockImplementation(() => {
        return counter++;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should query events within time range', () => {
      const buffer = new CircularBuffer<string>(10);
      
      buffer.add('event1'); // timestamp: 0n
      buffer.add('event2'); // timestamp: 1n
      buffer.add('event3'); // timestamp: 2n
      buffer.add('event4'); // timestamp: 3n
      
      const results = buffer.queryTimeRange(1n, 2n);
      expect(results).toEqual(['event2', 'event3']);
    });

    it('should return empty array for empty time range', () => {
      const buffer = new CircularBuffer<string>(10);
      
      buffer.add('event1');
      buffer.add('event2');
      
      const results = buffer.queryTimeRange(10n, 20n);
      expect(results).toEqual([]);
    });

    it('should handle queries on circular overwritten buffer', () => {
      const buffer = new CircularBuffer<number>(3);
      
      buffer.add(1); // timestamp: 0n
      buffer.add(2); // timestamp: 1n
      buffer.add(3); // timestamp: 2n
      buffer.add(4); // timestamp: 3n, overwrites 1
      buffer.add(5); // timestamp: 4n, overwrites 2
      
      const results = buffer.queryTimeRange(2n, 4n);
      expect(results).toEqual([3, 4, 5]);
    });
  });

  describe('age-based eviction', () => {
    beforeEach(() => {
      let counter = 0n;
      jest.spyOn(process.hrtime, 'bigint').mockImplementation(() => {
        // Simulate 1ms = 1_000_000 nanoseconds between events
        return counter++ * 1_000_000n;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should evict events older than maxAge', () => {
      const buffer = new CircularBuffer<string>(10, 5); // 5ms max age
      
      buffer.add('old1');    // 0ms
      buffer.add('old2');    // 1ms
      buffer.add('old3');    // 2ms
      
      // Advance time by 10ms
      jest.spyOn(process.hrtime, 'bigint').mockReturnValue(10n * 1_000_000n);
      
      buffer.add('new1');    // This triggers eviction
      
      expect(buffer.getSize()).toBe(1); // Only 'new1' remains
      const results = buffer.queryTimeRange(0n, 20n * 1_000_000n);
      expect(results).toEqual(['new1']);
    });
  });

  describe('clear operation', () => {
    it('should clear all data', () => {
      const buffer = new CircularBuffer<number>(5);
      
      buffer.add(1);
      buffer.add(2);
      buffer.add(3);
      
      expect(buffer.getSize()).toBe(3);
      expect(buffer.isEmpty()).toBe(false);
      
      buffer.clear();
      
      expect(buffer.getSize()).toBe(0);
      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.queryTimeRange(0n, 1000n)).toEqual([]);
    });
  });

  describe('performance', () => {
    it('should handle high-frequency insertions (33Hz)', () => {
      const buffer = new CircularBuffer<number>(10000);
      const startTime = Date.now();
      
      // Simulate 1 second of 33Hz insertions
      for (let i = 0; i < 33; i++) {
        buffer.add(i);
      }
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
      expect(buffer.getSize()).toBe(33);
    });

    it('should handle large capacity buffers', () => {
      const buffer = new CircularBuffer<{ id: number; data: string }>(100000);
      
      // Add 100k items
      for (let i = 0; i < 100000; i++) {
        buffer.add({ id: i, data: `event${i}` });
      }
      
      expect(buffer.getSize()).toBe(100000);
    });
  });

  describe('edge cases', () => {
    it('should handle capacity of 1', () => {
      // Mock timestamps for predictable behavior
      let counter = 0n;
      jest.spyOn(process.hrtime, 'bigint').mockImplementation(() => {
        return counter++;
      });
      
      const buffer = new CircularBuffer<string>(1);
      
      buffer.add('a'); // timestamp: 0n
      expect(buffer.getSize()).toBe(1);
      
      buffer.add('b'); // timestamp: 1n
      expect(buffer.getSize()).toBe(1);
      
      const results = buffer.queryTimeRange(0n, 2n);
      expect(results.length).toBe(1);
      expect(results[0]).toBe('b'); // Should contain the latest item
      
      jest.restoreAllMocks();
    });

    it('should handle complex data types', () => {
      interface Event {
        groupId: string;
        changes: Array<{ Name: string; Value: unknown }>;
      }
      
      const buffer = new CircularBuffer<Event>(5);
      
      buffer.add({
        groupId: 'group1',
        changes: [{ Name: 'control1', Value: 100 }]
      });
      
      buffer.add({
        groupId: 'group2',
        changes: [{ Name: 'control2', Value: 'test' }]
      });
      
      expect(buffer.getSize()).toBe(2);
    });
  });
});