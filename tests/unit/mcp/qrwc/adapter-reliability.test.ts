import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter';
import type { QRWCClientInterface } from '../../../../src/qrwc/types';

/**
 * Minimal adapter reliability tests focused on testable behavior
 */
describe('QRWCClientAdapter - Reliability (Minimal)', () => {
  let mockClient: jest.Mocked<QRWCClientInterface>;
  let adapter: QRWCClientAdapter;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a minimal mock
    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      setControlValue: jest.fn(),
      getComponent: jest.fn(),
      sendCommand: jest.fn(),
      getQrwc: jest.fn().mockReturnValue({
        components: {
          'TestComponent': {
            controls: {
              'TestControl': {
                Value: 0,
                String: '0',
                Type: 'Float'
              }
            }
          }
        },
        setControlValue: jest.fn().mockResolvedValue(true)
      }),
    } as any;

    adapter = new QRWCClientAdapter(mockClient);
  });

  describe('Basic command execution', () => {
    it('should execute Control.Set successfully', async () => {
      const result = await adapter.sendCommand('Control.Set', {
        Controls: [
          { Name: 'TestComponent.TestControl', Value: 1 }
        ]
      });

      expect(result).toHaveProperty('result');
      const results = (result as any).result;
      expect(Array.isArray(results)).toBe(true);
      expect(results[0]).toMatchObject({
        Name: 'TestComponent.TestControl',
        Result: 'Success'
      });
    });

    it('should validate Control.Set parameters', async () => {
      await expect(
        adapter.sendCommand('Control.Set', {
          Controls: 'not-an-array'
        })
      ).rejects.toThrow('Controls array is required');
    });

    it('should handle Status.Get when disconnected', async () => {
      mockClient.isConnected.mockReturnValue(false);
      
      const result = await adapter.sendCommand('Status.Get');
      
      expect(result).toHaveProperty('result');
      expect((result as any).result.State).toBe('Disconnected');
    });

    it('should reject other commands when disconnected', async () => {
      mockClient.isConnected.mockReturnValue(false);
      
      await expect(
        adapter.sendCommand('Component.GetComponents')
      ).rejects.toThrow('QRWC client not connected');
    });
  });

  describe('Component operations', () => {
    it('should get components list', async () => {
      const result = await adapter.sendCommand('Component.GetComponents');
      
      expect(result).toHaveProperty('result');
      const components = (result as any).result;
      expect(Array.isArray(components)).toBe(true);
      expect(components.length).toBeGreaterThan(0);
      expect(components[0]).toHaveProperty('Name', 'TestComponent');
    });

    it('should get all controls', async () => {
      const result = await adapter.sendCommand('Component.GetAllControlValues', {
        Name: 'TestComponent'
      });
      
      expect(result).toHaveProperty('result');
      const controls = (result as any).result;
      expect(typeof controls).toBe('object');
      expect('TestComponent.TestControl' in controls).toBe(true);
      expect(controls['TestComponent.TestControl']).toHaveProperty('Value', 0);
    });
  });

  describe('Error handling', () => {
    it('should handle missing component', async () => {
      await expect(
        adapter.sendCommand('Control.Set', {
          Controls: [
            { Name: 'NonExistent.Control', Value: 1 }
          ]
        })
      ).rejects.toThrow('Component not found: NonExistent');
    });

    it('should handle invalid control format', async () => {
      await expect(
        adapter.sendCommand('Control.Set', {
          Controls: [
            { Name: 'InvalidFormat', Value: 1 } // Missing dot separator
          ]
        })
      ).rejects.toThrow('Invalid control name format');
    });

    it('should handle unknown commands', async () => {
      await expect(
        adapter.sendCommand('Unknown.Command', {})
      ).rejects.toThrow('Unknown QRWC command: Unknown.Command');
    });
  });

  describe('State management', () => {
    it('should track connection state', () => {
      expect(adapter.isConnected()).toBe(true);
      
      mockClient.isConnected.mockReturnValue(false);
      expect(adapter.isConnected()).toBe(false);
    });

    it('should handle direct control operations', async () => {
      // The adapter doesn't expose change groups directly, but we can test control operations
      const result = await adapter.sendCommand('Control.Get', {
        Controls: [
          { Name: 'TestComponent.TestControl' }
        ]
      });
      
      expect(result).toHaveProperty('result');
      const controlResults = (result as any).result;
      expect(Array.isArray(controlResults)).toBe(true);
    });
  });
});