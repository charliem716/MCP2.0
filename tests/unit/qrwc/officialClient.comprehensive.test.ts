/**
 * Comprehensive tests for OfficialQRWCClient to achieve 80%+ coverage
 * Fixed version that avoids hanging issues
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConnectionState } from '../../../src/shared/types/common.js';
import { QSysError } from '../../../src/shared/types/errors.js';

// Direct import - no dynamic mocking
import { OfficialQRWCClient } from '../../../src/qrwc/officialClient.js';

describe('OfficialQRWCClient - Comprehensive Coverage Tests', () => {
  let clients: OfficialQRWCClient[] = [];

  // Handle unhandled rejections in tests
  const unhandledRejections = new Map();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Capture unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      unhandledRejections.set(promise, reason);
    });
  });

  afterEach(() => {
    // Clean up all clients
    for (const client of clients) {
      try {
        if (client.getState() !== ConnectionState.DISCONNECTED) {
          client.disconnect();
        }
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    clients = [];
    
    // Clear unhandled rejections
    unhandledRejections.clear();
    process.removeAllListeners('unhandledRejection');
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default options', () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
      });
      clients.push(client);

      expect(client.getConnectionOptions()).toEqual({
        host: 'test.local',
        port: 443,
      });
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should initialize with custom options', () => {
      const client = new OfficialQRWCClient({
        host: 'test.local',
        port: 8443,
        pollingInterval: 500,
        reconnectInterval: 10000,
        maxReconnectAttempts: 10,
        connectionTimeout: 30000,
        enableAutoReconnect: false,
      });
      clients.push(client);

      expect(client.getConnectionOptions()).toEqual({
        host: 'test.local',
        port: 8443,
      });
      expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe('Disconnected State Operations', () => {
    it('should throw when getting component while disconnected', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      expect(() => client.getComponent('test')).toThrow('Not connected to Q-SYS Core');
    });

    it('should throw when getting control while disconnected', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      expect(() => client.getControl('test', 'control')).toThrow('Not connected to Q-SYS Core');
    });

    it('should throw when setting control value while disconnected', async () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      await expect(client.setControlValue('test', 'control', 50)).rejects.toThrow('Not connected to Q-SYS Core');
    });

    it('should throw when getting control value while disconnected', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      expect(() => client.getControlValue('test', 'control')).toThrow('Not connected to Q-SYS Core');
    });

    it('should throw when sending raw command while disconnected', async () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      await expect(client.sendRawCommand('test', {})).rejects.toThrow('WebSocket not connected');
    });

    it('should throw when adding control listener while disconnected', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      expect(() => client.onControlUpdate('test', 'control', jest.fn()))
        .toThrow('Not connected to Q-SYS Core');
    });

    it('should throw when removing control listener while disconnected', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      expect(() => client.offControlUpdate('test', 'control', jest.fn()))
        .toThrow('Not connected to Q-SYS Core');
    });
  });

  describe('Connection State', () => {
    it('should return undefined for getQrwc when not connected', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      expect(client.getQrwc()).toBeUndefined();
    });

    it('should handle disconnect when already disconnected', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      // Should not throw
      expect(() => client.disconnect()).not.toThrow();
    });

    it('should return correct connection state', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      expect(client.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should return false for isConnected when disconnected', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('QSysError', () => {
    it('should serialize QSysError correctly', () => {
      const error = new QSysError('Test error', 'TEST_ERROR');
      const json = error.toJSON();
      
      expect(json).toMatchObject({
        message: 'Test error',
        code: 'TEST_ERROR',
      });
      expect(json.id).toBeDefined();
      expect(json.timestamp).toBeDefined();
      expect(json.severity).toBeDefined();
      expect(json.category).toBeDefined();
    });

    it('should handle QSysError with context', () => {
      const error = new QSysError('Test error', 'TEST_ERROR', { detail: 'test' });
      const json = error.toJSON();
      
      expect(json.context).toEqual({ detail: 'test' });
    });
  });

  describe('Event Emitter', () => {
    it('should emit state_change events', (done) => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      let stateChangeHandled = false;
      client.on('state_change', (state) => {
        if (!stateChangeHandled && state === ConnectionState.CONNECTING) {
          stateChangeHandled = true;
          expect(state).toBe(ConnectionState.CONNECTING);
          done();
        }
      });
      
      // This will fail but trigger state change
      client.connect().catch(() => {
        // Expected to fail - ignore
      });
    });

    it('should handle multiple event listeners', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      client.on('state_change', listener1);
      client.on('state_change', listener2);
      
      // Trigger state change
      client.connect().catch(() => {
        // Expected to fail - ignore
      });
      
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should remove event listeners', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      const listener = jest.fn();
      
      client.on('state_change', listener);
      client.off('state_change', listener);
      
      // Trigger state change
      client.connect().catch(() => {
        // Expected to fail - ignore
      });
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Configuration Options', () => {
    it('should handle all configuration options', () => {
      const options = {
        host: 'test.local',
        port: 8443,
        username: 'user',
        password: 'pass',
        pollingInterval: 1000,
        reconnectInterval: 5000,
        maxReconnectAttempts: 5,
        connectionTimeout: 10000,
        enableAutoReconnect: true,
        logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      };
      
      const client = new OfficialQRWCClient(options);
      clients.push(client);
      
      expect(client.getConnectionOptions()).toEqual({
        host: 'test.local',
        port: 8443,
      });
    });

    it('should use default port 443', () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      expect(client.getConnectionOptions().port).toBe(443);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty host', () => {
      const client = new OfficialQRWCClient({ host: '' });
      clients.push(client);
      
      expect(client.getConnectionOptions().host).toBe('');
    });

    it('should handle very long host names', () => {
      const longHost = 'a'.repeat(255) + '.local';
      const client = new OfficialQRWCClient({ host: longHost });
      clients.push(client);
      
      expect(client.getConnectionOptions().host).toBe(longHost);
    });

    it('should handle connection with already connecting state', async () => {
      const client = new OfficialQRWCClient({ host: 'test.local' });
      clients.push(client);
      
      // Start first connection
      const firstConnect = client.connect();
      
      // Try to connect again immediately
      const secondConnect = client.connect();
      
      // Both should be the same promise
      expect(secondConnect).toBe(firstConnect);
      
      // Clean up
      await firstConnect.catch(() => {
        // Expected to fail - ignore
      });
    });
  });
});