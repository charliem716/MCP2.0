/**
 * Tests for EventCacheManager compression functionality
 */

import { EventCacheManager } from '../manager.js';
import type { EventCacheConfig } from '../manager.js';
import type { QRWCClientAdapter } from '../../../qrwc/adapter.js';
import { MockQRWCAdapter } from '../test-helpers.js';

// Mock adapter with emit helper
class MockAdapter extends MockQRWCAdapter {
  emitChanges(groupId: string, changes: Array<{Name: string, Value: unknown, String?: string}>): void {
    const now = Date.now();
    const timestamp = process.hrtime.bigint();
    
    this.emit('changeGroup:changes', {
      groupId,
      changes,
      timestamp,
      timestampMs: now,
      sequenceNumber: 0
    });
  }
}

describe('EventCacheManager Compression', () => {
  let manager: EventCacheManager;
  let mockAdapter: MockAdapter;
  
  beforeEach(() => {
    const config: EventCacheConfig = {
      maxEvents: 10000,
      maxAgeMs: 3600000,
      compressionConfig: {
        enabled: true,
        checkIntervalMs: 100, // Fast for testing
        recentWindowMs: 1000,  // 1 second
        mediumWindowMs: 5000,  // 5 seconds
        ancientWindowMs: 10000, // 10 seconds
        significantChangePercent: 10,
        minTimeBetweenEventsMs: 100
      }
    };
    
    manager = new EventCacheManager(config);
    mockAdapter = new MockAdapter();
    manager.attachToAdapter(mockAdapter as QRWCClientAdapter);
  });
  
  afterEach(() => {
    manager.destroy();
  });
  
  describe('Compression thresholds', () => {
    it('should keep all events in recent window', async () => {
      const groupId = 'test-group';
      
      // Add 10 rapid events
      for (let i = 0; i < 10; i++) {
        mockAdapter.emitChanges(groupId, [
          { Name: 'test.control', Value: i, String: i.toString() }
        ]);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Query immediately (all in recent window)
      const results = await manager.query({ groupId });
      expect(results.length).toBe(10);
    });
    
    it('should compress events in medium window based on significance', async () => {
      const groupId = 'test-group';
      
      // Add events with small changes (< 10%)
      mockAdapter.emitChanges(groupId, [
        { Name: 'test.control', Value: 100, String: '100' }
      ]);
      
      // Wait to enter medium window
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Add small changes
      for (let i = 1; i <= 5; i++) {
        mockAdapter.emitChanges(groupId, [
          { Name: 'test.control', Value: 100 + i, String: (100 + i).toString() }
        ]);
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
      // Add significant change (> 10%)
      mockAdapter.emitChanges(groupId, [
        { Name: 'test.control', Value: 120, String: '120' }
      ]);
      
      // Trigger compression
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const results = await manager.query({ 
        groupId,
        startTime: Date.now() - 10000 
      });
      
      // Should have initial + significant change + maybe 1-2 small changes
      expect(results.length).toBeLessThan(7);
      expect(results.some(e => e.value === 100)).toBe(true);
      expect(results.some(e => e.value === 120)).toBe(true);
    });
    
    it('should keep only state transitions in ancient window', async () => {
      const groupId = 'test-group';
      
      // Add boolean state changes
      const states = [true, true, false, false, false, true, true, true, false];
      
      for (const state of states) {
        mockAdapter.emitChanges(groupId, [
          { Name: 'test.mute', Value: state, String: state.toString() }
        ]);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Wait to enter ancient window
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      // Trigger compression
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const results = await manager.query({ 
        groupId,
        startTime: Date.now() - 20000 
      });
      
      // Should only have state transitions: true->false, false->true, true->false
      const transitions = results.filter((e, i) => 
        i === 0 || e.value !== results[i-1].value
      );
      
      expect(transitions.length).toBeLessThanOrEqual(4);
    });
  });
  
  describe('Compression statistics', () => {
    it('should track compression stats', async () => {
      const groupId = 'test-group';
      let compressionEmitted = false;
      
      manager.on('compression', (stats) => {
        compressionEmitted = true;
        expect(stats.totalCompressed).toBeGreaterThan(0);
      });
      
      // Add many events
      for (let i = 0; i < 100; i++) {
        mockAdapter.emitChanges(groupId, [
          { Name: 'test.control', Value: Math.random() * 100, String: 'value' }
        ]);
      }
      
      // Wait for events to age into medium window
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Trigger compression
      await new Promise(resolve => setTimeout(resolve, 300));
      
      expect(compressionEmitted).toBe(true);
    });
  });
  
  describe('Event type preservation', () => {
    it('should always keep threshold_crossed events', async () => {
      const groupId = 'test-group';
      
      // Add events that cross common audio thresholds
      const values = [-25, -15, -8, -4, 2, -4, -8, -15, -25];
      
      for (const value of values) {
        mockAdapter.emitChanges(groupId, [
          { Name: 'MainOutput.level', Value: value, String: value.toString() }
        ]);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Wait for medium window
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Trigger compression
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const results = await manager.query({ 
        groupId,
        eventTypes: ['threshold_crossed'],
        startTime: Date.now() - 10000 
      });
      
      // Should have kept all threshold crossings
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(e => e.eventType === 'threshold_crossed')).toBe(true);
    });
  });
  
  describe('Compression under memory pressure', () => {
    it('should trigger aggressive compression when memory is high', async () => {
      const config: EventCacheConfig = {
        maxEvents: 1000,
        maxAgeMs: 3600000,
        globalMemoryLimitMB: 1, // Very low limit
        memoryCheckIntervalMs: 100,
        compressionConfig: {
          enabled: true,
          checkIntervalMs: 100,
          recentWindowMs: 500,
          mediumWindowMs: 2000,
          ancientWindowMs: 5000,
          significantChangePercent: 5,
          minTimeBetweenEventsMs: 50
        }
      };
      
      const smallManager = new EventCacheManager(config);
      smallManager.attachToAdapter(mockAdapter);
      
      let memoryPressureEmitted = false;
      smallManager.on('memoryPressure', () => {
        memoryPressureEmitted = true;
      });
      
      // Add many events to trigger memory pressure
      for (let i = 0; i < 5000; i++) {
        mockAdapter.emitChanges('group1', [
          { Name: 'control' + (i % 10), Value: i, String: i.toString() }
        ]);
      }
      
      // Wait for memory check
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(memoryPressureEmitted).toBe(true);
      
      // Check that events were compressed/evicted
      const results = await smallManager.query({ 
        groupId: 'group1',
        startTime: Date.now() - 60000 
      });
      
      expect(results.length).toBeLessThan(5000);
      
      smallManager.destroy();
    });
  });
});