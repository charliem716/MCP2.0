import { globalLogger as logger } from '../../../../shared/utils/logger.js';
import { CircularBuffer } from '../circular-buffer.js';

describe('BUG-074 Fix: queryTimeRange performance', () => {
  it('should demonstrate O(log n) vs O(n) performance difference', () => {
    const totalEvents = 100000;

    // Create a buffer directly to test performance
    const buffer = new CircularBuffer<{ id: number; timestampMs: number }>(
      totalEvents
    );

    // Fill buffer
    for (let i = 0; i < totalEvents; i++) {
      buffer.add(
        { id: i, timestampMs: i },
        BigInt(i * 1000000) // nanoseconds
      );
    }

    // Test queryTimeRange (O(log n))
    const queryStart = process.hrtime.bigint();
    const queryResults = buffer.queryTimeRange(
      BigInt(50000 * 1000000), // middle of dataset
      BigInt(50100 * 1000000) // 100 events
    );
    const queryTime = process.hrtime.bigint() - queryStart;

    // Test getAll + filter (O(n))
    const getAllStart = process.hrtime.bigint();
    const allEvents = buffer.getAll();
    const filtered = allEvents.filter(
      e => e.timestampMs >= 50000 && e.timestampMs <= 50100
    );
    const getAllTime = process.hrtime.bigint() - getAllStart;

    // Use console.log for test output visibility
    console.log(
      `queryTimeRange (O(log n)): ${queryTime / 1000000n}ms for ${queryResults.length} results`
    );
    console.log(
      `getAll + filter (O(n)): ${getAllTime / 1000000n}ms for ${filtered.length} results`
    );

    // queryTimeRange should be significantly faster
    expect(queryResults.length).toBe(101);
    expect(filtered.length).toBe(101);

    // On 100k events, queryTimeRange should be at least 10x faster
    const speedup = Number(getAllTime) / Number(queryTime);
    console.log(`Speedup: ${speedup.toFixed(1)}x`);
    expect(speedup).toBeGreaterThan(5); // Conservative expectation
  });

  it('verifies queryTimeRange works correctly after fix', () => {
    const buffer = new CircularBuffer<{
      control: string;
      value: number;
      timestampMs: number;
    }>(1000);

    // Add 1000 events
    for (let i = 0; i < 1000; i++) {
      buffer.add(
        { control: `control${i % 10}`, value: i, timestampMs: i },
        BigInt(i * 1000000) // nanoseconds
      );
    }

    // Query for a specific time range
    const startNs = BigInt(100 * 1000000);
    const endNs = BigInt(200 * 1000000);
    const results = buffer.queryTimeRange(startNs, endNs);

    // Should return 101 events (100-200 inclusive)
    expect(results.length).toBe(101);

    // Verify all results are in the correct range
    results.forEach(event => {
      expect(event.timestampMs).toBeGreaterThanOrEqual(100);
      expect(event.timestampMs).toBeLessThanOrEqual(200);
    });

    // Verify first and last events
    expect(results[0]?.timestampMs).toBe(100);
    expect(results[100]?.timestampMs).toBe(200);
  });
});
