/**
 * Unit tests for BUG-078: Event type detection in Event Cache
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventCacheManager, EventQuery, CachedEvent } from '../src/mcp/state/event-cache/manager.js';

describe('EventCacheManager - Event Type Detection', () => {
  let cacheManager: EventCacheManager;
  let mockAdapter: any;
  
  beforeEach(() => {
    cacheManager = new EventCacheManager({
      maxEvents: 1000,
      maxAgeMs: 3600000
    });
    
    // Create test buffer
    (cacheManager as any).createBuffer('test-group');
    
    // Mock adapter
    mockAdapter = {
      emit: (eventName: string, data: any) => {
        (cacheManager as any).handleChangeEvent(data);
      }
    };
  });
  
  describe('State transition detection', () => {
    it('should detect boolean state transitions', () => {
      // Initial state
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 2000) * 1000000n,
        timestampMs: Date.now() - 2000,
        changes: [{ Name: 'Mute', Value: false, String: 'false' }]
      });
      
      // State change
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 1000) * 1000000n,
        timestampMs: Date.now() - 1000,
        changes: [{ Name: 'Mute', Value: true, String: 'true' }]
      });
      
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000
      };
      
      const results = cacheManager.querySync(query);
      const transitionEvent = results.find(e => e.value === true);
      
      expect(transitionEvent?.eventType).toBe('state_transition');
    });
    
    it('should detect string state transitions', () => {
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 2000) * 1000000n,
        timestampMs: Date.now() - 2000,
        changes: [{ Name: 'Mode', Value: 'Auto', String: 'Auto' }]
      });
      
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 1000) * 1000000n,
        timestampMs: Date.now() - 1000,
        changes: [{ Name: 'Mode', Value: 'Manual', String: 'Manual' }]
      });
      
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000
      };
      
      const results = cacheManager.querySync(query);
      const transitionEvent = results.find(e => e.value === 'Manual');
      
      expect(transitionEvent?.eventType).toBe('state_transition');
    });
  });
  
  describe('Threshold crossing detection', () => {
    it('should detect level threshold crossings', () => {
      // Start below -6dB
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 2000) * 1000000n,
        timestampMs: Date.now() - 2000,
        changes: [{ Name: 'Level', Value: -10, String: '-10dB' }]
      });
      
      // Cross -6dB threshold
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 1000) * 1000000n,
        timestampMs: Date.now() - 1000,
        changes: [{ Name: 'Level', Value: -5, String: '-5dB' }]
      });
      
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000
      };
      
      const results = cacheManager.querySync(query);
      const crossingEvent = results.find(e => e.value === -5);
      
      expect(crossingEvent?.eventType).toBe('threshold_crossed');
      expect(crossingEvent?.threshold).toBe(-6);
    });
    
    it('should detect generic threshold crossings', () => {
      // For non-level controls, use 0-1 thresholds
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 2000) * 1000000n,
        timestampMs: Date.now() - 2000,
        changes: [{ Name: 'Gain', Value: 0.4, String: '0.4' }]
      });
      
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 1000) * 1000000n,
        timestampMs: Date.now() - 1000,
        changes: [{ Name: 'Gain', Value: 0.6, String: '0.6' }]
      });
      
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000
      };
      
      const results = cacheManager.querySync(query);
      const crossingEvent = results.find(e => e.controlName === 'Gain' && e.value === 0.6);
      
      expect(crossingEvent?.eventType).toBe('threshold_crossed');
      expect(crossingEvent?.threshold).toBe(0.5);
    });
  });
  
  describe('Significant change detection', () => {
    it('should detect significant numeric changes (>5%)', () => {
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 2000) * 1000000n,
        timestampMs: Date.now() - 2000,
        changes: [{ Name: 'Volume', Value: 100, String: '100' }]
      });
      
      // 10% change
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 1000) * 1000000n,
        timestampMs: Date.now() - 1000,
        changes: [{ Name: 'Volume', Value: 110, String: '110' }]
      });
      
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000
      };
      
      const results = cacheManager.querySync(query);
      const significantEvent = results.find(e => e.value === 110);
      
      expect(significantEvent?.eventType).toBe('significant_change');
    });
    
    it('should mark small changes as regular change', () => {
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 2000) * 1000000n,
        timestampMs: Date.now() - 2000,
        changes: [{ Name: 'Meter', Value: 0.50, String: '0.50' }]
      });
      
      // 2% change
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 1000) * 1000000n,
        timestampMs: Date.now() - 1000,
        changes: [{ Name: 'Meter', Value: 0.51, String: '0.51' }]
      });
      
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000
      };
      
      const results = cacheManager.querySync(query);
      const smallChangeEvent = results.find(e => e.value === 0.51);
      
      expect(smallChangeEvent?.eventType).toBe('change');
    });
  });
  
  describe('Event type filtering', () => {
    beforeEach(() => {
      // Add various types of events
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 5000) * 1000000n,
        timestampMs: Date.now() - 5000,
        changes: [
          { Name: 'Level', Value: -10, String: '-10dB' },
          { Name: 'Mute', Value: false, String: 'false' },
          { Name: 'Gain', Value: 0.5, String: '0.5' }
        ]
      });
      
      mockAdapter.emit('changeGroup:changes', {
        groupId: 'test-group',
        timestamp: BigInt(Date.now() - 1000) * 1000000n,
        timestampMs: Date.now() - 1000,
        changes: [
          { Name: 'Level', Value: -5, String: '-5dB' },    // threshold_crossed
          { Name: 'Mute', Value: true, String: 'true' },   // state_transition
          { Name: 'Gain', Value: 0.52, String: '0.52' }    // change (small)
        ]
      });
    });
    
    it('should filter by single event type', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000,
        eventTypes: ['threshold_crossed']
      };
      
      const results = cacheManager.querySync(query);
      
      expect(results.length).toBe(1);
      expect(results[0].eventType).toBe('threshold_crossed');
      expect(results[0].controlName).toBe('Level');
    });
    
    it('should filter by multiple event types', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000,
        eventTypes: ['threshold_crossed', 'state_transition']
      };
      
      const results = cacheManager.querySync(query);
      
      expect(results.length).toBe(2);
      const types = results.map(e => e.eventType);
      expect(types).toContain('threshold_crossed');
      expect(types).toContain('state_transition');
    });
    
    it('should return all events when no type filter specified', () => {
      const query: EventQuery = {
        groupId: 'test-group',
        startTime: Date.now() - 10000,
        endTime: Date.now() + 10000
      };
      
      const results = cacheManager.querySync(query);
      
      expect(results.length).toBe(6); // 3 initial + 3 changed
    });
  });
  
  afterEach(() => {
    cacheManager.destroy();
  });
});