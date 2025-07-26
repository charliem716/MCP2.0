import { QueryCache } from '../../../../../src/mcp/state/event-cache/query-cache';
import { EventQuery, CachedEvent } from '../../../../../src/mcp/state/event-cache/types';

describe('QueryCache', () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache({ maxSize: 5, ttlMs: 1000 });
  });

  afterEach(() => {
    cache.clear();
  });

  const createMockEvent = (groupId: string, name: string, value: number): CachedEvent => ({
    groupId,
    controlName: name,
    value,
    string: value.toString(),
    timestamp: BigInt(Date.now() * 1_000_000),
    timestampMs: Date.now(),
    sequenceNumber: 1,
  });

  describe('Basic caching', () => {
    it('should return undefined for cache miss', () => {
      const query: EventQuery = { groupId: 'test', limit: 10 };
      const result = cache.get(query);
      expect(result).toBeUndefined();
    });

    it('should cache and retrieve query results', () => {
      const query: EventQuery = { groupId: 'test', limit: 10 };
      const events = [createMockEvent('test', 'control1', 100)];

      cache.set(query, events);
      const result = cache.get(query);

      expect(result).toEqual(events);
    });

    it('should generate same key for equivalent queries', () => {
      const query1: EventQuery = { 
        groupId: 'test', 
        controlNames: ['b', 'a'],
        limit: 10 
      };
      const query2: EventQuery = { 
        groupId: 'test', 
        controlNames: ['a', 'b'], // Different order
        limit: 10 
      };
      const events = [createMockEvent('test', 'control1', 100)];

      cache.set(query1, events);
      const result = cache.get(query2);

      expect(result).toEqual(events);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const query: EventQuery = { groupId: 'test', limit: 10 };
      const events = [createMockEvent('test', 'control1', 100)];

      cache.set(query, events);
      expect(cache.get(query)).toEqual(events);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(cache.get(query)).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when cache is full', () => {
      const events = [createMockEvent('test', 'control1', 100)];

      // Fill cache to capacity
      for (let i = 0; i < 5; i++) {
        const query: EventQuery = { groupId: `group${i}`, limit: 10 };
        cache.set(query, events);
      }

      // Verify all entries exist
      for (let i = 0; i < 5; i++) {
        const query: EventQuery = { groupId: `group${i}`, limit: 10 };
        expect(cache.get(query)).toEqual(events);
      }

      // Add one more entry (should evict group0)
      const newQuery: EventQuery = { groupId: 'group5', limit: 10 };
      cache.set(newQuery, events);

      // Verify oldest was evicted
      const oldestQuery: EventQuery = { groupId: 'group0', limit: 10 };
      expect(cache.get(oldestQuery)).toBeUndefined();

      // Verify newest exists
      expect(cache.get(newQuery)).toEqual(events);
    });
  });

  describe('Invalidation', () => {
    it('should invalidate specific group entries', () => {
      const events1 = [createMockEvent('group1', 'control1', 100)];
      const events2 = [createMockEvent('group2', 'control1', 200)];

      const query1: EventQuery = { groupId: 'group1', limit: 10 };
      const query2: EventQuery = { groupId: 'group2', limit: 10 };

      cache.set(query1, events1);
      cache.set(query2, events2);

      // Invalidate group1
      cache.invalidate('group1');

      expect(cache.get(query1)).toBeUndefined();
      expect(cache.get(query2)).toEqual(events2);
    });

    it('should invalidate all entries when no group specified', () => {
      const events = [createMockEvent('test', 'control1', 100)];

      for (let i = 0; i < 3; i++) {
        const query: EventQuery = { groupId: `group${i}`, limit: 10 };
        cache.set(query, events);
      }

      cache.invalidate();

      for (let i = 0; i < 3; i++) {
        const query: EventQuery = { groupId: `group${i}`, limit: 10 };
        expect(cache.get(query)).toBeUndefined();
      }
    });
  });

  describe('Statistics', () => {
    it('should track hit rate accurately', () => {
      const query: EventQuery = { groupId: 'test', limit: 10 };
      const events = [createMockEvent('test', 'control1', 100)];

      // Initial stats
      let stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);

      // Cache miss
      cache.get(query);
      stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);

      // Set and hit
      cache.set(query, events);
      cache.get(query);
      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);

      // Another hit
      cache.get(query);
      stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 3);
    });

    it('should track cache size', () => {
      let stats = cache.getStats();
      expect(stats.size).toBe(0);

      for (let i = 0; i < 3; i++) {
        const query: EventQuery = { groupId: `group${i}`, limit: 10 };
        const events = [createMockEvent(`group${i}`, 'control1', i)];
        cache.set(query, events);
      }

      stats = cache.getStats();
      expect(stats.size).toBe(3);
    });
  });

  describe('Complex queries', () => {
    it('should handle queries with all parameters', () => {
      const query: EventQuery = {
        groupId: 'test',
        startTime: Date.now() - 60000,
        endTime: Date.now(),
        controlNames: ['control1', 'control2'],
        valueFilter: { operator: 'gt', value: 50 },
        limit: 100,
        offset: 20,
        orderBy: 'value',
        orderDirection: 'desc',
        eventTypes: ['change', 'threshold_crossed'],
        aggregation: 'changes_only',
      };

      const events = [createMockEvent('test', 'control1', 100)];
      cache.set(query, events);

      expect(cache.get(query)).toEqual(events);
    });
  });
});