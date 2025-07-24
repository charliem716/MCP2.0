import logger from '../shared/logger';
import { CircularBuffer } from './circular-buffer';

describe('CircularBuffer', () => {
  describe('queryTimeRange bug reproduction', () => {
    it('should handle wraparound correctly when buffer is full', () => {
      const capacity = 5;
      const buffer = new CircularBuffer<string>(capacity);

      // Fill buffer with events at timestamps 1-5
      for (let i = 1; i <= capacity; i++) {
        buffer.add(`event${i}`, BigInt(i * 1000));
      }

      // Buffer is now full with events 1-5
      // Now add 3 more events, which should overwrite events 1-3
      for (let i = 6; i <= 8; i++) {
        buffer.add(`event${i}`, BigInt(i * 1000));
      }

      // Buffer should now contain events 4-8
      // Query for events 6-7 (which exist)
      const results = buffer.queryTimeRange(BigInt(6000), BigInt(7000));

      // Expected: ['event6', 'event7']
      logger.info('Query results for 6-7:', results);
      expect(results).toEqual(['event6', 'event7']);

      // Query for events 4-5 (which should still exist)
      const olderResults = buffer.queryTimeRange(BigInt(4000), BigInt(5000));
      logger.info('Query results for 4-5:', olderResults);
      expect(olderResults).toEqual(['event4', 'event5']);

      // Query for events 1-3 (which should have been overwritten)
      const overwrittenResults = buffer.queryTimeRange(
        BigInt(1000),
        BigInt(3000)
      );
      logger.info(
        'Query results for 1-3 (should be empty):',
        overwrittenResults
      );
      expect(overwrittenResults).toEqual([]);
    });

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
      logger.info('Stale query result:', staleQuery);

      // But the bug is that it might return D instead!
      expect(staleQuery).toEqual([]); // Should be empty
    });

    it('demonstrates the actual bug - performance issue with large buffers', () => {
      // The real bug is performance, not correctness
      // EventCacheManager avoids queryTimeRange because it's slow on large buffers
      const capacity = 10000;
      const buffer = new CircularBuffer<{ id: string; value: number }>(
        capacity
      );

      // Fill buffer with 10k events
      for (let i = 0; i < capacity; i++) {
        buffer.add({ id: `event${i}`, value: i }, BigInt(i * 1000));
      }

      // Measure performance of queryTimeRange vs getAll
      const startQuery = process.hrtime.bigint();
      const queryResult = buffer.queryTimeRange(
        BigInt(9900000),
        BigInt(9999000)
      );
      const queryTime = process.hrtime.bigint() - startQuery;

      const startGetAll = process.hrtime.bigint();
      buffer.getAll(); // Just measure timing, don't store result
      // Removed unnecessary filter that always returns true
      const getAllTime = process.hrtime.bigint() - startGetAll;

      logger.info(`queryTimeRange time: ${queryTime / 1000000n}ms`);
      logger.info(`getAll time: ${getAllTime / 1000000n}ms`);
      logger.info(`Query returned ${queryResult.length} events`);

      // The performance should be better with queryTimeRange
      // But there might be an issue making it slower
      expect(queryResult.length).toBe(100);
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
      logger.info('Cycle1 query results:', cycle1Results);

      // Query for cycle2 events (should return the current buffer contents)
      const cycle2Results = buffer.queryTimeRange(BigInt(10000), BigInt(14000));
      logger.info('Cycle2 query results:', cycle2Results);

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

    it('confirms queryTimeRange works correctly but may have performance concerns', () => {
      interface TestEvent {
        id: string;
        timestampMs: number;
        value: number;
      }

      const buffer = new CircularBuffer<TestEvent>(5);

      // Add events with timestampMs as part of the data
      for (let i = 0; i < 5; i++) {
        const timestamp = BigInt(i * 1000000); // nanoseconds
        const timestampMs = i; // milliseconds
        buffer.add({ id: `event${i}`, timestampMs, value: i }, timestamp);
      }

      // queryTimeRange should work correctly
      const results = buffer.queryTimeRange(BigInt(1000000), BigInt(3000000));
      logger.info('Query results:', results);

      expect(results).toEqual([
        { id: 'event1', timestampMs: 1, value: 1 },
        { id: 'event2', timestampMs: 2, value: 2 },
        { id: 'event3', timestampMs: 3, value: 3 },
      ]);

      // The issue might be that EventCacheManager needs additional filtering
      // after queryTimeRange, which could be inefficient
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

      logger.info(
        `Query returned ${results.length} events in ${elapsed / 1000000n}ms`
      );

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

      // Let's check what's actually in the buffer
      logger.info('Buffer contents:', buffer.getAll());

      // Query for recent events (should only get D since C is at 3000)
      const recent = buffer.queryTimeRange(BigInt(3500), BigInt(4500));
      logger.info('Recent events:', recent);

      // Query for C and D (2500-4500)
      const cAndD = buffer.queryTimeRange(BigInt(2500), BigInt(4500));
      logger.info('Query for C and D:', cAndD);

      // Query for old events (should only get E)
      const old = buffer.queryTimeRange(BigInt(0), BigInt(1000));
      logger.info('Old events:', old);

      // The actual bug: When B (timestamp 2000) was overwritten by E,
      // the index for 2000 should have been removed, but let's check
      const shouldBeEmpty = buffer.queryTimeRange(BigInt(2000), BigInt(2000));
      logger.info('Query for overwritten B:', shouldBeEmpty);

      expect(recent).toEqual(['D']);
      expect(cAndD.sort()).toEqual(['C', 'D'].sort());
      expect(old).toEqual(['E']);
      expect(shouldBeEmpty).toEqual([]); // B was overwritten
    });
  });
});
