/**
 * Verification test for 33Hz polling fix
 */

import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { SQLiteEventMonitor } from '../../src/mcp/state/event-monitor/sqlite-event-monitor.js';
import { SimpleStateManager } from '../../src/mcp/state/simple-state-manager.js';

describe('33Hz Polling Fix Verification', () => {
  describe('33Hz Polling Support', () => {
    it('should accept 0.03 second (33Hz) polling rate', () => {
      const mockClient = {
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
        sendCommand: jest.fn().mockResolvedValue({}),
      } as any;
      
      const adapter = new QRWCClientAdapter(mockClient);
      
      // Create a mock change group
      adapter['changeGroups'].set('test-group', {
        id: 'test-group',
        controls: ['Test.control'],
      } as any);
      
      // Test that 33Hz rate is accepted
      const result = adapter['handleChangeGroupAutoPoll']({
        Id: 'test-group',
        Rate: 0.03, // 33Hz
      });
      
      expect(result).toEqual({
        result: {
          Id: 'test-group',
          Rate: 0.03,
        },
      });
    });

    it('should default to 0.03 seconds (33Hz) when no rate specified', () => {
      const mockClient = {
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
        sendCommand: jest.fn().mockResolvedValue({}),
      } as any;
      
      const adapter = new QRWCClientAdapter(mockClient);
      
      // Create a mock change group
      adapter['changeGroups'].set('test-group', {
        id: 'test-group',
        controls: ['Test.control'],
      } as any);
      
      // Test default rate
      const result = adapter['handleChangeGroupAutoPoll']({
        Id: 'test-group',
      });
      
      expect(result).toEqual({
        result: {
          Id: 'test-group',
          Rate: 0.03, // Should default to 33Hz
        },
      });
    });

    it('should validate minimum rate of 0.03 seconds', () => {
      const mockClient = {
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
        sendCommand: jest.fn().mockResolvedValue({}),
      } as any;
      
      const adapter = new QRWCClientAdapter(mockClient);
      
      // Create a mock change group
      adapter['changeGroups'].set('test-group', {
        id: 'test-group',
        controls: ['Test.control'],
      } as any);
      
      // Test rate below minimum
      expect(() => {
        adapter['handleChangeGroupAutoPoll']({
          Id: 'test-group',
          Rate: 0.02, // Too fast
        });
      }).toThrow('Invalid poll rate');
    });
  });

  describe('30-Day Retention Configuration', () => {
    it('should default to 30-day retention', async () => {
      // Set environment variable
      process.env['EVENT_MONITORING_RETENTION_DAYS'] = '30';
      
      const stateManager = new SimpleStateManager();
      const mockAdapter = {
        on: jest.fn(),
        emit: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
      } as any;
      
      const monitor = new SQLiteEventMonitor(stateManager, mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      
      await monitor.initialize();
      
      // Verify 30-day retention
      expect(monitor['config'].retentionDays).toBe(30);
      
      await monitor.close();
      delete process.env['EVENT_MONITORING_RETENTION_DAYS'];
    });

    it('should respect custom retention period from environment', async () => {
      // Set custom retention
      process.env['EVENT_MONITORING_RETENTION_DAYS'] = '45';
      
      const stateManager = new SimpleStateManager();
      const mockAdapter = {
        on: jest.fn(),
        emit: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
      } as any;
      
      const monitor = new SQLiteEventMonitor(stateManager, mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      
      await monitor.initialize();
      
      // Verify custom retention
      expect(monitor['config'].retentionDays).toBe(45);
      
      await monitor.close();
      delete process.env['EVENT_MONITORING_RETENTION_DAYS'];
    });

    it('should use 30 days when environment variable not set', async () => {
      // Ensure env var is not set
      delete process.env['EVENT_MONITORING_RETENTION_DAYS'];
      
      const stateManager = new SimpleStateManager();
      const mockAdapter = {
        on: jest.fn(),
        emit: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
      } as any;
      
      const monitor = new SQLiteEventMonitor(stateManager, mockAdapter, {
        enabled: true,
        dbPath: ':memory:',
      });
      
      await monitor.initialize();
      
      // Should default to 30 days
      expect(monitor['config'].retentionDays).toBe(30);
      
      await monitor.close();
    });
  });
});