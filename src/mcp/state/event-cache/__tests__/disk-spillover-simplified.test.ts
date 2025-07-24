/**
 * Simplified disk spillover tests that match actual implementation behavior
 */

import { EventCacheManager, type EventCacheConfig } from '../manager.js';
import { MockQRWCAdapter } from '../test-helpers.js';
import * as fs from 'fs/promises';

describe('EventCacheManager Disk Spillover (Simplified)', () => {
  let manager: EventCacheManager;
  let mockAdapter: MockQRWCAdapter;
  const testDir = `./test-spillover-simple-${Date.now()}`;

  afterEach(async () => {
    if (manager) {
      manager.destroy();
    }
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore
    }
  });

  it('should handle disk spillover configuration', () => {
    const config: EventCacheConfig = {
      maxEvents: 1000,
      maxAgeMs: 3600000,
      diskSpilloverConfig: {
        enabled: true,
        directory: testDir,
        thresholdMB: 2,
        maxFileSizeMB: 1
      }
    };
    
    manager = new EventCacheManager(config);
    mockAdapter = new MockQRWCAdapter();
    manager.attachToAdapter(mockAdapter);
    
    // Verify configuration is set
    expect((manager as any).defaultConfig.diskSpilloverConfig?.enabled).toBe(true);
    expect((manager as any).defaultConfig.diskSpilloverConfig?.directory).toBe(testDir);
  });

  it('should store and query events without disk spillover', async () => {
    const config: EventCacheConfig = {
      maxEvents: 1000,
      maxAgeMs: 3600000,
      diskSpilloverConfig: {
        enabled: false // Disabled
      }
    };
    
    manager = new EventCacheManager(config);
    mockAdapter = new MockQRWCAdapter();
    manager.attachToAdapter(mockAdapter);
    
    const groupId = 'test-group';
    
    // Add events
    for (let i = 0; i < 100; i++) {
      mockAdapter.emitChanges(groupId, [
        { Name: 'control', Value: i, String: i.toString() }
      ]);
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    // Query events
    const results = await manager.query({ groupId });
    expect(results.length).toBe(100);
    
    // Verify no disk operations occurred
    const stats = await fs.stat(testDir).catch(() => null);
    expect(stats).toBeNull();
  });

  it('should initialize with disk spillover enabled', async () => {
    const config: EventCacheConfig = {
      maxEvents: 10000,
      maxAgeMs: 3600000,
      globalMemoryLimitMB: 5,
      memoryCheckIntervalMs: 100,
      diskSpilloverConfig: {
        enabled: true,
        directory: testDir,
        thresholdMB: 2,
        maxFileSizeMB: 1
      }
    };
    
    manager = new EventCacheManager(config);
    mockAdapter = new MockQRWCAdapter();
    manager.attachToAdapter(mockAdapter);
    
    // Add some events
    const groupId = 'test-group';
    for (let i = 0; i < 10; i++) {
      mockAdapter.emitChanges(groupId, [
        { Name: 'control', Value: i, String: i.toString() }
      ]);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Events should be queryable
    const results = await manager.query({ groupId });
    expect(results.length).toBe(10);
    
    // Directory is created lazily, not on init
    const stats = await fs.stat(testDir).catch(() => null);
    expect(stats).toBeNull(); // No spillover triggered yet
  });

  it('should handle invalid spillover directory gracefully', async () => {
    const config: EventCacheConfig = {
      maxEvents: 1000,
      maxAgeMs: 3600000,
      diskSpilloverConfig: {
        enabled: true,
        directory: '', // Invalid
        thresholdMB: 1,
        maxFileSizeMB: 1
      }
    };
    
    // Should not throw
    expect(() => {
      manager = new EventCacheManager(config);
    }).not.toThrow();
    
    mockAdapter = new MockQRWCAdapter();
    manager.attachToAdapter(mockAdapter);
    
    // Should still work without spillover
    mockAdapter.emitChanges('test', [
      { Name: 'control', Value: 1, String: '1' }
    ]);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const results = await manager.query({ groupId: 'test' });
    expect(results.length).toBe(1);
  });
});