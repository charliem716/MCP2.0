/**
 * Unit tests for BUG-075: gte/lte operators in Event Cache query engine
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  EventCacheManager,
  EventQuery,
  CachedEvent,
} from '../src/mcp/state/event-cache/manager';

describe('EventCacheManager - gte/lte operators', () => {
  let cacheManager: EventCacheManager;

  beforeEach(() => {
    cacheManager = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 3600000,
    });

    // Create test buffer
    (cacheManager as any).createBuffer('test-group');
    const buffer = (cacheManager as any).buffers.get('test-group');

    // Add test events with various numeric values
    const testData = [
      { value: 0.0, string: '0.0' },
      { value: 0.3, string: '0.3' },
      { value: 0.5, string: '0.5' },
      { value: 0.5, string: '0.5' }, // Duplicate to test exact matches
      { value: 0.7, string: '0.7' },
      { value: 1.0, string: '1.0' },
      { value: 5, string: '5' }, // Integer values
      { value: 10, string: '10' },
      { value: 15, string: '15' },
      { value: -6, string: '-6' }, // Negative values
      { value: -3, string: '-3' },
      { value: 'text', string: 'text' }, // Non-numeric value
    ];

    testData.forEach((data, i) => {
      const event: CachedEvent = {
        groupId: 'test-group',
        controlName: 'TestControl',
        timestamp: BigInt(Date.now() - 1000 * (testData.length - i)) * 1000000n,
        timestampMs: Date.now() - 1000 * (testData.length - i),
        value: data.value,
        string: data.string,
        sequenceNumber: i,
      };
      buffer.add(event, event.timestamp);
    });
  });

  describe('gte operator', () => {
    it('should find values greater than or equal to 0.5', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'gte',
          value: 0.5,
        },
      };

      const results = cacheManager.querySync(query);
      const values = results.map(e => e.value);

      expect(results.length).toBe(7); // 0.5, 0.5, 0.7, 1.0, 5, 10, 15
      expect(values).toEqual([0.5, 0.5, 0.7, 1.0, 5, 10, 15]);
    });

    it('should find values greater than or equal to exact integer', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'gte',
          value: 5,
        },
      };

      const results = cacheManager.querySync(query);
      const values = results.map(e => e.value);

      expect(results.length).toBe(3); // 5, 10, 15
      expect(values).toEqual([5, 10, 15]);
    });

    it('should handle negative values correctly', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'gte',
          value: -6,
        },
      };

      const results = cacheManager.querySync(query);
      const numericResults = results.filter(e => typeof e.value === 'number');

      expect(numericResults.length).toBe(11); // All numeric values >= -6
      // First numeric result should be -6 when sorted
      const sortedResults = numericResults.sort(
        (a, b) => (a.value as number) - (b.value as number)
      );
      expect(sortedResults[0].value).toBe(-6);
    });

    it('should ignore non-numeric values', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'gte',
          value: 0,
        },
      };

      const results = cacheManager.querySync(query);
      const hasNonNumeric = results.some(e => typeof e.value !== 'number');

      expect(hasNonNumeric).toBe(false);
    });
  });

  describe('lte operator', () => {
    it('should find values less than or equal to 0.7', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'lte',
          value: 0.7,
        },
      };

      const results = cacheManager.querySync(query);
      const values = results
        .map(e => e.value)
        .filter(v => typeof v === 'number');

      expect(values.length).toBe(7); // -6, -3, 0.0, 0.3, 0.5, 0.5, 0.7
      // Sort values since query may not return in exact order
      values.sort((a, b) => a - b);
      expect(values).toEqual([-6, -3, 0.0, 0.3, 0.5, 0.5, 0.7]);
    });

    it('should find values less than or equal to exact integer', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'lte',
          value: 5,
        },
      };

      const results = cacheManager.querySync(query);
      const values = results
        .map(e => e.value)
        .filter(v => typeof v === 'number');

      expect(values).toContain(5);
      expect(values).not.toContain(10);
      expect(values).not.toContain(15);
    });

    it('should handle negative values correctly', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'lte',
          value: -3,
        },
      };

      const results = cacheManager.querySync(query);
      const values = results.map(e => e.value);

      expect(results.length).toBe(2); // -6, -3
      expect(values).toEqual([-6, -3]);
    });

    it('should ignore non-numeric values', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'lte',
          value: 100,
        },
      };

      const results = cacheManager.querySync(query);
      const hasNonNumeric = results.some(e => typeof e.value !== 'number');

      expect(hasNonNumeric).toBe(false);
    });
  });

  describe('range queries with gte and lte', () => {
    it('should find values in range 0.5 <= x <= 1.0', () => {
      // First query: gte 0.5
      const query1: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'gte',
          value: 0.5,
        },
      };
      const results1 = cacheManager.querySync(query1);

      // Then filter those results with lte 1.0
      const inRange = results1.filter(
        e => typeof e.value === 'number' && e.value <= 1.0
      );

      expect(inRange.length).toBe(4); // 0.5, 0.5, 0.7, 1.0
      expect(inRange.map(e => e.value)).toEqual([0.5, 0.5, 0.7, 1.0]);
    });
  });

  describe('edge cases', () => {
    it('should handle floating point precision correctly', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'gte',
          value: 0.5,
        },
      };

      const results = cacheManager.querySync(query);
      const hasExactMatch = results.some(e => e.value === 0.5);

      expect(hasExactMatch).toBe(true);
    });

    it('should return empty array when value filter has non-numeric comparison value', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 120000, // Include all events
        endTime: Date.now() + 10000,
        valueFilter: {
          operator: 'gte',
          value: 'string',
        },
      };

      const results = cacheManager.querySync(query);
      expect(results.length).toBe(0);
    });
  });

  afterEach(() => {
    cacheManager.destroy();
  });
});
