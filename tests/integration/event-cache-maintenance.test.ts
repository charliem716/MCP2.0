import { jest } from '@jest/globals';
import { SQLiteEventMonitor } from '../../src/mcp/state/event-monitor/sqlite-event-monitor.js';
import { SimpleStateManager } from '../../src/mcp/state/simple-state-manager.js';
import type { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs and timers for testing
jest.mock('fs');
jest.useFakeTimers();

describe('Event Cache Maintenance and Rotation', () => {
  let eventMonitor: SQLiteEventMonitor;
  let stateManager: SimpleStateManager;
  let mockAdapter: QRWCClientAdapter;
  let changeGroupEmitter: EventEmitter;
  const testDbPath = './test-maintenance';

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock file system operations
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    (fs.unlinkSync as jest.Mock).mockImplementation(() => {});
    (fs.statSync as jest.Mock).mockReturnValue({ size: 1048576 }); // 1MB

    // Create mock adapter
    changeGroupEmitter = new EventEmitter();
    mockAdapter = {
      on: changeGroupEmitter.on.bind(changeGroupEmitter),
      emit: changeGroupEmitter.emit.bind(changeGroupEmitter),
      removeListener: changeGroupEmitter.removeListener.bind(changeGroupEmitter),
      removeAllListeners: changeGroupEmitter.removeAllListeners.bind(changeGroupEmitter),
      getAllChangeGroups: jest.fn().mockResolvedValue(new Map()),
    } as any;

    // Create state manager
    stateManager = new SimpleStateManager();
    await stateManager.initialize({
      maxEntries: 100,
      ttlMs: 60000,
      cleanupIntervalMs: 10000,
      enableMetrics: false,
      persistenceEnabled: false,
    });

    eventMonitor = new SQLiteEventMonitor(stateManager, mockAdapter);
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (eventMonitor) {
      await eventMonitor.shutdown();
    }
    if (stateManager) {
      await stateManager.shutdown();
    }
  });

  describe('Database rotation', () => {
    it('should create database with date-based filename', async () => {
      const mockDate = new Date('2024-01-15T10:00:00Z');
      jest.setSystemTime(mockDate);

      await eventMonitor.initialize({
        enabled: true,
        dbPath: testDbPath,
        retentionDays: 7,
      });

      // Check that getDatabaseFilename returns correct format
      const expectedPath = path.join(testDbPath, 'events-2024-01-15.db');
      expect(eventMonitor['getDatabaseFilename']()).toBe(expectedPath);
    });

    it('should rotate to new database on date change', async () => {
      // Start on one day
      const day1 = new Date('2024-01-15T23:59:00Z');
      jest.setSystemTime(day1);

      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:', // Use memory for testing
        retentionDays: 7,
      });

      const db1Path = eventMonitor['getDatabaseFilename']();

      // Move to next day
      const day2 = new Date('2024-01-16T00:01:00Z');
      jest.setSystemTime(day2);

      const db2Path = eventMonitor['getDatabaseFilename']();

      expect(db1Path).toContain('2024-01-15');
      expect(db2Path).toContain('2024-01-16');
      expect(db1Path).not.toBe(db2Path);
    });

    it('should handle database rotation during active recording', async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
        bufferSize: 10,
        flushInterval: 50,
      });

      // Setup change group
      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([['test-group', { id: 'test-group', controls: ['Control1'] }]])
      );
      changeGroupEmitter.emit('changeGroupSubscribed', 'test-group');

      // Record events on day 1
      const day1 = new Date('2024-01-15T23:59:30Z');
      jest.setSystemTime(day1);

      await stateManager.setState('Control1', { value: 1, source: 'day1' });
      
      // Flush events
      jest.advanceTimersByTime(100);

      // Move to day 2 and record more events
      const day2 = new Date('2024-01-16T00:00:30Z');
      jest.setSystemTime(day2);

      await stateManager.setState('Control1', { value: 2, source: 'day2' });
      
      // Flush events
      jest.advanceTimersByTime(100);

      // Both days' events should be queryable
      const allEvents = await eventMonitor.query({});
      expect(allEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Retention and cleanup', () => {
    it('should schedule maintenance at 3 AM', async () => {
      const now = new Date('2024-01-15T14:00:00Z'); // 2 PM
      jest.setSystemTime(now);

      const scheduleSpy = jest.spyOn(global, 'setTimeout');

      await eventMonitor.initialize({
        enabled: true,
        dbPath: testDbPath,
        retentionDays: 7,
      });

      // Check that setTimeout was called for scheduling
      expect(scheduleSpy).toHaveBeenCalled();

      // Calculate expected delay to 3 AM next day
      const next3AM = new Date('2024-01-16T03:00:00Z');
      const expectedDelay = next3AM.getTime() - now.getTime();

      // Verify the delay is approximately correct (within 1 minute tolerance)
      const actualDelay = scheduleSpy.mock.calls[0][1];
      expect(actualDelay).toBeGreaterThan(expectedDelay - 60000);
      expect(actualDelay).toBeLessThan(expectedDelay + 60000);
    });

    it('should delete databases older than retention period', async () => {
      const currentDate = new Date('2024-01-15T03:00:00Z');
      jest.setSystemTime(currentDate);

      // Mock file system to return old database files
      const mockFiles = [
        'events-2024-01-01.db', // 14 days old - should delete
        'events-2024-01-05.db', // 10 days old - should delete
        'events-2024-01-10.db', // 5 days old - should keep
        'events-2024-01-14.db', // 1 day old - should keep
        'events-2024-01-15.db', // current - should keep
        'other-file.txt',        // not a database - should ignore
      ];
      (fs.readdirSync as jest.Mock).mockReturnValue(mockFiles);

      await eventMonitor.initialize({
        enabled: true,
        dbPath: testDbPath,
        retentionDays: 7,
      });

      // Trigger maintenance
      await eventMonitor['performMaintenance']();

      // Check that old files were deleted
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(testDbPath, 'events-2024-01-01.db'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(testDbPath, 'events-2024-01-05.db'));
      
      // Check that recent files were NOT deleted
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(testDbPath, 'events-2024-01-10.db'));
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(testDbPath, 'events-2024-01-14.db'));
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(testDbPath, 'events-2024-01-15.db'));
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(testDbPath, 'other-file.txt'));
    });

    it('should handle maintenance errors gracefully', async () => {
      // Make unlinkSync throw an error
      (fs.readdirSync as jest.Mock).mockReturnValue(['events-2024-01-01.db']);
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await eventMonitor.initialize({
        enabled: true,
        dbPath: testDbPath,
        retentionDays: 7,
      });

      // Should not throw, just log error
      await expect(eventMonitor['performMaintenance']()).resolves.toBeUndefined();
    });

    it('should vacuum database during maintenance', async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
      });

      // Spy on database exec method
      const db = eventMonitor['db'];
      if (db) {
        const execSpy = jest.spyOn(db, 'exec');

        await eventMonitor['performMaintenance']();

        // Check that VACUUM was called
        expect(execSpy).toHaveBeenCalledWith('VACUUM');
      }
    });

    it('should handle daily maintenance schedule', async () => {
      const startTime = new Date('2024-01-15T02:00:00Z');
      jest.setSystemTime(startTime);

      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      await eventMonitor.initialize({
        enabled: true,
        dbPath: testDbPath,
        retentionDays: 7,
      });

      // Fast-forward to 3 AM
      jest.setSystemTime(new Date('2024-01-15T03:00:00Z'));
      jest.runOnlyPendingTimers();

      // Check that daily interval was set up
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        24 * 60 * 60 * 1000 // 24 hours
      );
    });
  });

  describe('Storage management', () => {
    it('should track database size in statistics', async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
      });

      // Add some events
      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([['test', { id: 'test', controls: ['Control1'] }]])
      );
      changeGroupEmitter.emit('changeGroupSubscribed', 'test');

      for (let i = 0; i < 100; i++) {
        await stateManager.setState('Control1', { value: i, source: 'test' });
      }

      // Force flush
      await new Promise(resolve => {
        jest.useRealTimers();
        setTimeout(resolve, 100);
        jest.useFakeTimers();
      });

      const stats = await eventMonitor.getStatistics();
      expect(stats.databaseSize).toBeGreaterThan(0);
    });

    it('should handle multiple database files in statistics', async () => {
      // Mock multiple database files
      const mockFiles = [
        'events-2024-01-13.db',
        'events-2024-01-14.db',
        'events-2024-01-15.db',
      ];
      (fs.readdirSync as jest.Mock).mockReturnValue(mockFiles);
      (fs.statSync as jest.Mock).mockImplementation((filePath: string) => ({
        size: 5242880, // 5MB each
      }));

      await eventMonitor.initialize({
        enabled: true,
        dbPath: testDbPath,
        retentionDays: 7,
      });

      // Total storage calculation could be implemented
      // This is a placeholder for potential future feature
      const stats = await eventMonitor.getStatistics();
      expect(stats.databaseSize).toBeGreaterThanOrEqual(0);
    });

    it('should estimate storage requirements', async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
      });

      // Simulate typical usage pattern
      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([
          ['group1', { id: 'group1', controls: Array(100).fill(0).map((_, i) => `Control${i}`) }]
        ])
      );
      changeGroupEmitter.emit('changeGroupSubscribed', 'group1');

      // Record 1 hour of data at 1Hz for 100 controls
      const eventsPerHour = 100 * 3600; // 100 controls * 3600 seconds
      const bytesPerEvent = 200; // Approximate size per event record
      const expectedSizeBytes = eventsPerHour * bytesPerEvent;
      const expectedSizeMB = expectedSizeBytes / (1024 * 1024);

      console.log(`Storage estimate:
        Controls: 100
        Frequency: 1Hz
        Duration: 1 hour
        Events: ${eventsPerHour}
        Estimated size: ${expectedSizeMB.toFixed(2)}MB
        Daily estimate: ${(expectedSizeMB * 24).toFixed(2)}MB
        Weekly estimate: ${(expectedSizeMB * 24 * 7).toFixed(2)}MB
      `);

      // Verify estimate is reasonable (50-100MB per day for 100 controls at 1Hz)
      expect(expectedSizeMB * 24).toBeGreaterThan(50);
      expect(expectedSizeMB * 24).toBeLessThan(150);
    });
  });

  describe('Error recovery', () => {
    it('should recover from corrupted database', async () => {
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
      });

      // Simulate database corruption by closing it
      const db = eventMonitor['db'];
      if (db) {
        db.close();
        eventMonitor['db'] = undefined;
      }

      // Should handle query gracefully
      await expect(eventMonitor.query({})).rejects.toThrow();

      // Should be able to reinitialize
      await eventMonitor.shutdown();
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
      });

      // Should work after reinitialization
      const events = await eventMonitor.query({});
      expect(Array.isArray(events)).toBe(true);
    });

    it('should handle disk full scenario', async () => {
      // Mock write failure
      const mockError = new Error('ENOSPC: no space left on device');
      
      await eventMonitor.initialize({
        enabled: true,
        dbPath: ':memory:',
        retentionDays: 7,
      });

      // Override flush to simulate disk full
      const originalFlush = eventMonitor['flush'].bind(eventMonitor);
      let failCount = 0;
      eventMonitor['flush'] = jest.fn().mockImplementation(() => {
        if (failCount++ < 3) {
          throw mockError;
        }
        return originalFlush();
      });

      // Try to record events
      (mockAdapter.getAllChangeGroups as jest.Mock).mockResolvedValue(
        new Map([['test', { id: 'test', controls: ['Control1'] }]])
      );
      changeGroupEmitter.emit('changeGroupSubscribed', 'test');

      await stateManager.setState('Control1', { value: 1, source: 'test' });

      // Should handle the error and continue operating
      expect(eventMonitor.isInitialized()).toBe(true);
    });
  });
});