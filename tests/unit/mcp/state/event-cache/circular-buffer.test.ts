import { CircularBuffer } from '../../../../../src/mcp/state/event-cache/circular-buffer.js';

describe('CircularBuffer', () => {
  describe('constructor', () => {
    it('should create buffer with specified capacity', () => {
      const buffer = new CircularBuffer<string>(10);
      expect(buffer.getSize()).toBe(0);
      expect(buffer.isEmpty()).toBe(true);
    });

    it('should throw error for non-positive capacity', () => {
      expect(() => new CircularBuffer<string>(0)).toThrow(
        'Capacity must be positive'
      );
      expect(() => new CircularBuffer<string>(-1)).toThrow(
        'Capacity must be positive'
      );
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

      buffer.add('old1'); // 0ms
      buffer.add('old2'); // 1ms
      buffer.add('old3'); // 2ms

      // Advance time by 10ms
      jest.spyOn(process.hrtime, 'bigint').mockReturnValue(10n * 1_000_000n);

      buffer.add('new1'); // This triggers eviction

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
        changes: [{ Name: 'control1', Value: 100 }],
      });

      buffer.add({
        groupId: 'group2',
        changes: [{ Name: 'control2', Value: 'test' }],
      });

      expect(buffer.getSize()).toBe(2);
    });
  });

  describe('Bug Regression Tests', () => {
    // These tests reproduce specific bugs found in production
    
    it('demonstrates the stale index problem', () => {
      const capacity = 3;
      const buffer = new CircularBuffer<string>(capacity);

      // Add events 1-3 (fills buffer)
      buffer.add('A', BigInt(1000)); // index 0
      buffer.add('B', BigInt(2000)); // index 1
      buffer.add('C', BigInt(3000)); // index 2

      // Add event 4 (overwrites A at index 0)
      buffer.add('D', BigInt(4000)); // overwrites index 0

      // The time index still has:
      // timestamp 1000 -> index 0 (but index 0 now contains D!)
      // timestamp 2000 -> index 1 (contains B)
      // timestamp 3000 -> index 2 (contains C)
      // timestamp 4000 -> index 0 (contains D)

      // Query for timestamp 1000 should return nothing (A was overwritten)
      const staleQuery = buffer.queryTimeRange(BigInt(1000), BigInt(1000));

      // But the bug is that it might return D instead!
      expect(staleQuery).toEqual([]); // Should be empty
    });

    it('shows the real bug - queryTimeRange returns wrong data after multiple overwrites', () => {
      const capacity = 5;
      const buffer = new CircularBuffer<string>(capacity);

      // Fill buffer completely multiple times to create complex wraparound
      for (let cycle = 0; cycle < 3; cycle++) {
        for (let i = 0; i < capacity; i++) {
          const timestamp = BigInt((cycle * capacity + i) * 1000);
          buffer.add(`cycle${cycle}-event${i}`, timestamp);
        }
      }

      // Buffer should now contain only cycle2 events (timestamps 10000-14000)
      // But the index might have stale entries pointing to wrong positions

      // Query for cycle1 events (should be empty as they were overwritten)
      const cycle1Results = buffer.queryTimeRange(BigInt(5000), BigInt(9000));

      // Query for cycle2 events (should return the current buffer contents)
      const cycle2Results = buffer.queryTimeRange(BigInt(10000), BigInt(14000));

      // The bug might cause cycle1 query to return wrong data
      expect(cycle1Results).toEqual([]);
      expect(cycle2Results.length).toBe(5);
      expect(cycle2Results).toEqual([
        'cycle2-event0',
        'cycle2-event1',
        'cycle2-event2',
        'cycle2-event3',
        'cycle2-event4',
      ]);
    });

    it('demonstrates the actual performance bug - queryTimeRange is O(n) not O(log n)', () => {
      // The bug report mentions that queryTimeRange has O(n) performance instead of O(log n)
      // This happens because findInRange returns ALL indices in the range,
      // not just valid ones, causing unnecessary iteration

      const capacity = 10000;
      const buffer = new CircularBuffer<{ id: string; value: number }>(
        capacity
      );

      // Fill buffer completely
      for (let i = 0; i < capacity; i++) {
        buffer.add({ id: `event${i}`, value: i }, BigInt(i * 1000));
      }

      // Now overwrite half the buffer with new events
      for (let i = 0; i < capacity / 2; i++) {
        buffer.add(
          { id: `new-event${i}`, value: i },
          BigInt((capacity + i) * 1000)
        );
      }

      // At this point, the SortedArray might have stale indices
      // Query for a small range of recent events
      const startTime = BigInt((capacity + 100) * 1000);
      const endTime = BigInt((capacity + 200) * 1000);

      const start = process.hrtime.bigint();
      const results = buffer.queryTimeRange(startTime, endTime);
      const elapsed = process.hrtime.bigint() - start;

      // The performance should be fast for a small result set
      expect(results.length).toBe(101); // events 100-200

      // Check if we're getting correct results
      expect(results[0]).toEqual({ id: 'new-event100', value: 100 });
      expect(results[100]).toEqual({ id: 'new-event200', value: 200 });
    });

    it('FAILING TEST - demonstrates stale index bug after buffer wraparound', () => {
      const buffer = new CircularBuffer<string>(3);

      // Add 3 events to fill the buffer
      buffer.add('A', BigInt(1000)); // pos 0
      buffer.add('B', BigInt(2000)); // pos 1
      buffer.add('C', BigInt(3000)); // pos 2

      // Add a 4th event that overwrites position 0
      buffer.add('D', BigInt(4000)); // overwrites pos 0

      // At this point:
      // - Buffer positions: [D, B, C]
      // - Time index should have: 2000->1, 3000->2, 4000->0
      // - But the old 1000->0 entry was removed

      // Add a 5th event with an OLD timestamp
      buffer.add('E', BigInt(500)); // This goes to pos 1, overwriting B

      // Now buffer is: [D, E, C]
      // Time index has: 500->1, 3000->2, 4000->0

      // Query for recent events (should only get D since C is at 3000)
      const recent = buffer.queryTimeRange(BigInt(3500), BigInt(4500));

      // Query for C and D (2500-4500)
      const cAndD = buffer.queryTimeRange(BigInt(2500), BigInt(4500));

      // Query for old events (should only get E)
      const old = buffer.queryTimeRange(BigInt(0), BigInt(1000));

      // The actual bug: When B (timestamp 2000) was overwritten by E,
      // the index for 2000 should have been removed, but let's check
      const shouldBeEmpty = buffer.queryTimeRange(BigInt(2000), BigInt(2000));

      expect(recent).toEqual(['D']);
      expect(cAndD.sort()).toEqual(['C', 'D'].sort());
      expect(old).toEqual(['E']);
      expect(shouldBeEmpty).toEqual([]); // B was overwritten
    });
  });
});
