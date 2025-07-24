/**
 * Tests for EventCacheManager disk spillover functionality
 */

import { EventCacheManager, type EventCacheConfig } from '../manager.js';
import type { QRWCClientAdapter } from '../../../qrwc/adapter.js';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock adapter that implements only what EventCacheManager needs
class MockAdapter extends EventEmitter {
  emitChanges(groupId: string, changes: Array<{ Name: string; Value: unknown; String: string }>): void {
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

describe('EventCacheManager Disk Spillover', () => {
  let manager: EventCacheManager;
  let mockAdapter: MockAdapter;
  const testDir = `./test-spillover-${Date.now()}`;
  
  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore if doesn't exist
    }
    
    const config: EventCacheConfig = {
      maxEvents: 10000,
      maxAgeMs: 3600000,
      globalMemoryLimitMB: 5,
      memoryCheckIntervalMs: 100,
      diskSpilloverConfig: {
        enabled: true,
        directory: testDir,
        thresholdMB: 2, // Low threshold for testing
        maxFileSizeMB: 1
      }
    };
    
    manager = new EventCacheManager(config);
    mockAdapter = new MockAdapter();
    manager.attachToAdapter(mockAdapter as any);
  });
  
  afterEach(async () => {
    manager.destroy();
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore
    }
  });
  
  describe('Spillover directory creation', () => {
    it('should create spillover directory on initialization', async () => {
      // Trigger spillover by adding many events
      for (let i = 0; i < 1000; i++) {
        mockAdapter.emitChanges('test-group', [
          { Name: `control${i}`, Value: i, String: i.toString() }
        ]);
      }
      
      // Wait for potential spillover
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check directory exists
      const stats = await fs.stat(testDir).catch(() => null);
      expect(stats).toBeTruthy();
      expect(stats?.isDirectory()).toBe(true);
    });
  });
  
  describe('Event spillover to disk', () => {
    it('should spill events to disk when threshold exceeded', async () => {
      const groupId = 'test-group';
      let spilloverEmitted = false;
      
      manager.on('diskSpillover', (event) => {
        spilloverEmitted = true;
        expect(event.groupId).toBe(groupId);
        expect(event.eventCount).toBeGreaterThan(0);
      });
      
      // Add many large events to exceed memory threshold
      for (let i = 0; i < 20000; i++) {
        mockAdapter.emitChanges(groupId, [
          { 
            Name: `control${i % 100}`, 
            Value: Math.random() * 1000, 
            String: 'A'.repeat(100) // Large string to consume memory
          }
        ]);
      }
      
      // Wait for memory check and spillover
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      expect(spilloverEmitted).toBe(true);
      
      // Check files were created
      const files = await fs.readdir(testDir);
      const spillFiles = files.filter(f => f.startsWith(groupId) && f.endsWith('.json'));
      expect(spillFiles.length).toBeGreaterThan(0);
    });
  });
  
  describe('Transparent retrieval from disk', () => {
    it('should transparently load spilled events during queries', async () => {
      const groupId = 'test-group';
      const controlName = 'test.control';
      
      // Add events with specific pattern
      const values: number[] = [];
      for (let i = 0; i < 5000; i++) {
        const value = i * 10;
        values.push(value);
        mockAdapter.emitChanges(groupId, [
          { Name: controlName, Value: value, String: value.toString() }
        ]);
      }
      
      // Force spillover
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Clear in-memory buffers to ensure we're reading from disk
      manager.clearGroup(groupId);
      
      // Query should still find events from disk
      const results = await manager.query({
        groupId,
        controlNames: [controlName],
        valueFilter: { operator: 'gt', value: 40000 },
        startTime: Date.now() - 60000
      });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(e => (e.value as number) > 40000)).toBe(true);
    });
    
    it('should merge disk and memory events correctly', async () => {
      const groupId = 'test-group';
      
      // Add old events that will be spilled
      for (let i = 0; i < 2000; i++) {
        mockAdapter.emitChanges(groupId, [
          { Name: 'old.control', Value: i, String: `old-${i}` }
        ]);
      }
      
      // Wait for spillover
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Add new events that stay in memory
      for (let i = 0; i < 100; i++) {
        mockAdapter.emitChanges(groupId, [
          { Name: 'new.control', Value: i, String: `new-${i}` }
        ]);
      }
      
      // Query all events
      const results = await manager.query({
        groupId,
        startTime: Date.now() - 60000
      });
      
      // Should have both old and new events
      const oldEvents = results.filter(e => e.controlName === 'old.control');
      const newEvents = results.filter(e => e.controlName === 'new.control');
      
      expect(oldEvents.length).toBeGreaterThan(0);
      expect(newEvents.length).toBe(100);
      
      // Check chronological order
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.timestampMs).toBeGreaterThanOrEqual(results[i-1]!.timestampMs);
      }
    });
  });
  
  describe('Spillover file cleanup', () => {
    it('should clean up old spillover files', async () => {
      const groupId = 'test-group';
      
      // Create an old spillover file manually
      await fs.mkdir(testDir, { recursive: true });
      const oldFile = path.join(testDir, `${groupId}-${Date.now() - 7200000}-100.json`);
      await fs.writeFile(oldFile, JSON.stringify({
        groupId,
        timestamp: Date.now() - 7200000,
        eventCount: 100,
        events: []
      }));
      
      // Update file times to be old
      const oldTime = new Date(Date.now() - 7200000);
      await fs.utimes(oldFile, oldTime, oldTime);
      
      // Add new events to trigger cleanup
      for (let i = 0; i < 1000; i++) {
        mockAdapter.emitChanges(groupId, [
          { Name: 'test.control', Value: i, String: i.toString() }
        ]);
      }
      
      // Wait for spillover and cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Old file should be deleted
      const files = await fs.readdir(testDir);
      expect(files).not.toContain(path.basename(oldFile));
    });
  });
  
  describe('Error handling', () => {
    it('should disable spillover if directory creation fails', async () => {
      // Create a file with same name as directory to cause error
      const badConfig: EventCacheConfig = {
        maxEvents: 1000,
        maxAgeMs: 3600000,
        diskSpilloverConfig: {
          enabled: true,
          directory: '/root/impossible-directory', // Should fail
          thresholdMB: 1,
          maxFileSizeMB: 1
        }
      };
      
      const badManager = new EventCacheManager(badConfig);
      const adapter = new MockAdapter();
      badManager.attachToAdapter(adapter as any);
      
      // Try to trigger spillover
      for (let i = 0; i < 1000; i++) {
        adapter.emitChanges('test', [
          { Name: 'control', Value: i, String: i.toString() }
        ]);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Spillover should be disabled
      expect(badConfig.diskSpilloverConfig!.enabled).toBe(false);
      
      badManager.destroy();
    });
  });
});