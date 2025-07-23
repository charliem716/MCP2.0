/**
 * Unit tests for BUG-077: Event Cache pagination support
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventCacheManager, EventQuery, CachedEvent } from '../src/mcp/state/event-cache/manager.js';

describe('EventCacheManager - Pagination with offset', () => {
  let cacheManager: EventCacheManager;
  
  beforeEach(() => {
    cacheManager = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 3600000
    });
    
    // Create test buffer
    (cacheManager as any).createBuffer('test-group');
    const buffer = (cacheManager as any).buffers.get('test-group');
    
    // Add 100 test events
    for (let i = 0; i < 100; i++) {
      const event: CachedEvent = {
        groupId: 'test-group',
        controlName: `Control${i}`,
        timestamp: BigInt(Date.now() - (100 - i) * 1000) * 1000000n,
        timestampMs: Date.now() - (100 - i) * 1000,
        value: i,
        string: `Value ${i}`,
        sequenceNumber: i
      };
      buffer.add(event, event.timestamp);
    }
  });
  
  describe('Basic pagination', () => {
    it('should skip events with offset', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        offset: 10
      };
      
      const results = cacheManager.query(query);
      
      expect(results[0].value).toBe(10);
      expect(results[0].controlName).toBe('Control10');
    });
    
    it('should return correct page with offset and limit', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        offset: 20,
        limit: 10
      };
      
      const results = cacheManager.query(query);
      
      expect(results.length).toBe(10);
      expect(results[0].value).toBe(20);
      expect(results[9].value).toBe(29);
    });
    
    it('should handle offset beyond result count', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        offset: 200  // Beyond 100 events
      };
      
      const results = cacheManager.query(query);
      
      expect(results.length).toBe(0);
    });
    
    it('should handle offset of 0 same as no offset', () => {
      const queryWithOffset: EventQuery = {
        groupId: 'test-group',
        offset: 0,
        limit: 5
      };
      
      const queryNoOffset: EventQuery = {
        groupId: 'test-group',
        limit: 5
      };
      
      const resultsWithOffset = cacheManager.query(queryWithOffset);
      const resultsNoOffset = cacheManager.query(queryNoOffset);
      
      expect(resultsWithOffset).toEqual(resultsNoOffset);
    });
  });
  
  describe('Pagination with filters', () => {
    it('should apply offset after filtering by value', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        valueFilter: {
          operator: 'gte',
          value: 50
        },
        offset: 10,
        limit: 10
      };
      
      const results = cacheManager.query(query);
      
      // Events 50-99 match filter (50 events)
      // Skip first 10 (50-59), return 60-69
      expect(results.length).toBe(10);
      expect(results[0].value).toBe(60);
      expect(results[9].value).toBe(69);
    });
    
    it('should apply offset after time range filtering', () => {
      const midTime = Date.now() - 50 * 1000; // Middle of our test data
      
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: midTime,
        offset: 5,
        limit: 10
      };
      
      const results = cacheManager.query(query);
      
      // Should get events from ~50 onwards, skip 5, take 10
      expect(results.length).toBe(10);
      expect(results[0].value).toBeGreaterThanOrEqual(55);
    });
    
    it('should apply offset after control name filtering', () => {
      // Add some events with different control names
      const buffer = (cacheManager as any).buffers.get('test-group');
      for (let i = 0; i < 10; i++) {
        const event: CachedEvent = {
          groupId: 'test-group',
          controlName: 'SpecialControl',
          timestamp: BigInt(Date.now() + i * 1000) * 1000000n,
          timestampMs: Date.now() + i * 1000,
          value: 100 + i,
          string: `Special ${i}`,
          sequenceNumber: 100 + i
        };
        buffer.add(event, event.timestamp);
      }
      
      const query: EventQuery = {
        groupId: 'test-group',
        controlNames: ['SpecialControl'],
        offset: 3,
        limit: 5
      };
      
      const results = cacheManager.query(query);
      
      expect(results.length).toBe(5);
      expect(results[0].value).toBe(103);
      expect(results[0].controlName).toBe('SpecialControl');
    });
  });
  
  describe('Pagination consistency', () => {
    it('should return consistent pages across multiple queries', () => {
      const pageSize = 20;
      const pages: CachedEvent[][] = [];
      
      // Get 5 pages
      for (let page = 0; page < 5; page++) {
        const query: EventQuery = {
          groupId: 'test-group',
          offset: page * pageSize,
          limit: pageSize
        };
        pages.push(cacheManager.query(query));
      }
      
      // Verify no overlap between pages
      for (let i = 0; i < pages.length - 1; i++) {
        const lastOfPage = pages[i][pages[i].length - 1];
        const firstOfNextPage = pages[i + 1][0];
        
        expect(lastOfPage.value).toBeLessThan(firstOfNextPage.value as number);
      }
      
      // Verify continuity
      expect(pages[0][0].value).toBe(0);
      expect(pages[4][19].value).toBe(99);
    });
  });
  
  describe('Edge cases', () => {
    it('should handle limit without offset', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        limit: 10
      };
      
      const results = cacheManager.query(query);
      
      expect(results.length).toBe(10);
      expect(results[0].value).toBe(0);
    });
    
    it('should handle offset without limit', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        offset: 90
      };
      
      const results = cacheManager.query(query);
      
      expect(results.length).toBe(10); // 90-99
      expect(results[0].value).toBe(90);
    });
    
    it('should handle offset + limit exceeding total', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        offset: 95,
        limit: 20
      };
      
      const results = cacheManager.query(query);
      
      expect(results.length).toBe(5); // Only 95-99 available
      expect(results[0].value).toBe(95);
      expect(results[4].value).toBe(99);
    });
  });
  
  describe('UI pagination scenarios', () => {
    it('should support "Load More" functionality', () => {
      let allResults: CachedEvent[] = [];
      const pageSize = 25;
      
      // Initial load
      let query: EventQuery = {
        groupId: 'test-group',
        offset: 0,
        limit: pageSize
      };
      let batch = cacheManager.query(query);
      allResults = [...batch];
      
      // Load more
      while (batch.length === pageSize) {
        query = {
          groupId: 'test-group',
          offset: allResults.length,
          limit: pageSize
        };
        batch = cacheManager.query(query);
        allResults.push(...batch);
      }
      
      expect(allResults.length).toBe(100);
      expect(allResults[0].value).toBe(0);
      expect(allResults[99].value).toBe(99);
    });
    
    it('should support jumping to specific page', () => {
      const pageSize = 10;
      const targetPage = 7; // 8th page (0-indexed)
      
      const query: EventQuery = {
        groupId: 'test-group',
        offset: targetPage * pageSize,
        limit: pageSize
      };
      
      const results = cacheManager.query(query);
      
      expect(results.length).toBe(10);
      expect(results[0].value).toBe(70);
      expect(results[9].value).toBe(79);
    });
  });
  
  afterEach(() => {
    cacheManager.destroy();
  });
});