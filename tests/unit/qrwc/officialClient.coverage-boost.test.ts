/**
 * Additional tests to boost coverage above 80% threshold
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConnectionState } from '../../../src/shared/types/common.js';

// Mock createLogger to test fallback logger path
jest.mock('../../../src/shared/utils/logger', () => ({
  createLogger: jest.fn(() => {
    throw new Error('Logger creation failed');
  }),
  globalLogger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { OfficialQRWCClient } from '../../../src/qrwc/officialClient.js';

describe('OfficialQRWCClient - Coverage Boost', () => {
  let clients: OfficialQRWCClient[] = [];
  
  beforeEach(() => {
    jest.clearAllMocks();
    process.setMaxListeners(20);
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
    process.setMaxListeners(10);
  });

  it('should use fallback logger when createLogger throws', () => {
    // This covers line 75 - the fallback logger creation
    const client = new OfficialQRWCClient({ host: 'test.local' });
    clients.push(client);
    
    expect(client).toBeDefined();
    expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
  });

  it('should handle options with explicit logger', () => {
    const customLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };
    
    const client = new OfficialQRWCClient({ 
      host: 'test.local',
      logger: customLogger,
    });
    clients.push(client);
    
    expect(client).toBeDefined();
  });

  it('should handle connection with credentials', () => {
    const client = new OfficialQRWCClient({ 
      host: 'test.local',
      username: 'admin',
      password: 'password123',
    });
    clients.push(client);
    
    expect(client.getConnectionOptions()).toMatchObject({
      host: 'test.local',
      port: 443,
    });
  });

  it('should handle getComponent error path', () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    clients.push(client);
    
    // Mock client to appear connected but with no qrwc
    Object.defineProperty(client, 'qrwc', {
      value: { components: {} },
      writable: true,
      configurable: true,
    });
    
    // This should return undefined for missing component
    const component = client.getComponent('NonExistent');
    expect(component).toBeUndefined();
  });

  it('should handle control operations with missing component', () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    clients.push(client);
    
    // Mock client to appear connected but with empty components
    Object.defineProperty(client, 'qrwc', {
      value: { components: {} },
      writable: true,
      configurable: true,
    });
    
    expect(() => client.getControl('NonExistent', 'control')).toThrow("Component 'NonExistent' not found");
  });

  it('should handle control operations with missing control', () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    clients.push(client);
    
    // Mock client with component but no control
    Object.defineProperty(client, 'qrwc', {
      value: { 
        components: {
          TestComponent: {
            controls: {}
          }
        }
      },
      writable: true,
      configurable: true,
    });
    
    // getControl returns undefined for missing control
    const control = client.getControl('TestComponent', 'NonExistent');
    expect(control).toBeUndefined();
  });

  it('should handle setControlValue with connected client', async () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    clients.push(client);
    
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    
    // Mock client with full component and control
    Object.defineProperty(client, 'qrwc', {
      value: { 
        components: {
          TestComponent: {
            controls: {
              TestControl: {
                state: { Value: 0 },
                update: mockUpdate,
              }
            }
          }
        }
      },
      writable: true,
      configurable: true,
    });
    
    await client.setControlValue('TestComponent', 'TestControl', 50);
    expect(mockUpdate).toHaveBeenCalledWith(50);
  });

  it('should handle getControlValue with connected client', () => {
    const client = new OfficialQRWCClient({ host: 'test.local' });
    clients.push(client);
    
    // Mock client with full component and control
    Object.defineProperty(client, 'qrwc', {
      value: { 
        components: {
          TestComponent: {
            controls: {
              TestControl: {
                state: { Value: 75, Position: 0.75 },
              }
            }
          }
        }
      },
      writable: true,
      configurable: true,
    });
    
    const value = client.getControlValue('TestComponent', 'TestControl');
    expect(value).toEqual({ Value: 75, Position: 0.75 });
  });
});