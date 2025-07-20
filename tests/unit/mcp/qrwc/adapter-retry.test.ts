import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';

describe('QRWCClientAdapter - BUG-026 Retry Logic', () => {
  let mockClient: jest.Mocked<OfficialQRWCClient>;
  let adapter: QRWCClientAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock QRWC client
    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      setControlValue: jest.fn(),
      getComponent: jest.fn(),
      getQrwc: jest.fn().mockReturnValue({
        components: {
          'TestComponent': {
            controls: {
              'testControl': { state: 1.0 }
            }
          }
        }
      })
    } as any;

    adapter = new QRWCClientAdapter(mockClient);
  });

  describe('Retry on transient errors', () => {
    it('should retry on ETIMEDOUT error and succeed', async () => {
      // First call fails with timeout, second succeeds
      mockClient.getQrwc
        .mockImplementationOnce(() => {
          const error: any = new Error('Connection timeout');
          error.code = 'ETIMEDOUT';
          throw error;
        })
        .mockImplementationOnce(() => ({
          components: { 'TestComponent': { controls: { 'testControl': { state: 1.0 } } } }
        }));

      const result = await adapter.sendCommand('Component.GetComponents');
      
      expect(result).toBeDefined();
      expect(mockClient.getQrwc).toHaveBeenCalledTimes(2);
    });

    it('should retry on ECONNRESET error with exponential backoff', async () => {
      const startTime = Date.now();
      
      // Fail 2 times, succeed on 3rd
      mockClient.getQrwc
        .mockImplementationOnce(() => {
          const error: any = new Error('Connection reset');
          error.code = 'ECONNRESET';
          throw error;
        })
        .mockImplementationOnce(() => {
          const error: any = new Error('Connection reset');
          error.code = 'ECONNRESET';
          throw error;
        })
        .mockImplementationOnce(() => ({
          components: { 'TestComponent': { controls: { 'testControl': { state: 1.0 } } } }
        }));

      const result = await adapter.sendCommand('Component.GetComponents', {}, {
        maxRetries: 3,
        retryDelay: 100,
        retryBackoff: 2
      });
      
      const elapsed = Date.now() - startTime;
      
      expect(result).toBeDefined();
      expect(mockClient.getQrwc).toHaveBeenCalledTimes(3);
      // Should have delays: 100ms (1st retry) + 200ms (2nd retry) = 300ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(250); // Allow some margin
    });

    it('should retry on timeout message in error', async () => {
      mockClient.getQrwc
        .mockImplementationOnce(() => {
          throw new Error('Request timeout after 5000ms');
        })
        .mockImplementationOnce(() => ({
          components: { 'TestComponent': { controls: { 'testControl': { state: 1.0 } } } }
        }));

      const result = await adapter.sendCommand('Component.GetComponents');
      
      expect(result).toBeDefined();
      expect(mockClient.getQrwc).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      // Always fail with timeout
      mockClient.getQrwc.mockImplementation(() => {
        const error: any = new Error('Connection timeout');
        error.code = 'ETIMEDOUT';
        throw error;
      });

      await expect(
        adapter.sendCommand('Component.GetComponents', {}, { maxRetries: 2 })
      ).rejects.toThrow('Command failed after 3 attempts: Connection timeout');
      
      expect(mockClient.getQrwc).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe('Non-retryable errors', () => {
    it('should not retry on non-transient errors', async () => {
      mockClient.getQrwc.mockImplementationOnce(() => {
        throw new Error('Component not found');
      });

      await expect(
        adapter.sendCommand('Component.GetComponents')
      ).rejects.toThrow('Component not found');
      
      // Should not retry
      expect(mockClient.getQrwc).toHaveBeenCalledTimes(1);
    });

    it('should not retry when client is not connected', async () => {
      mockClient.isConnected.mockReturnValue(false);

      await expect(
        adapter.sendCommand('Component.GetComponents')
      ).rejects.toThrow('QRWC client not connected');
      
      // Should not even attempt the command
      expect(mockClient.getQrwc).not.toHaveBeenCalled();
    });
  });

  describe('Retry with different commands', () => {
    it('should retry Control.SetValues on network error', async () => {
      mockClient.setControlValue
        .mockRejectedValueOnce((() => {
          const error: any = new Error('Network error');
          error.code = 'ECONNREFUSED';
          return error;
        })())
        .mockResolvedValueOnce(undefined);

      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [{ Name: 'TestComponent.testControl', Value: 0.5 }]
      });
      
      expect(result.result).toHaveLength(1);
      expect(result.result[0].Result).toBe('Success');
      expect(mockClient.setControlValue).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success/failure in Control.SetValues', async () => {
      // First control succeeds, second fails then succeeds
      mockClient.setControlValue
        .mockResolvedValueOnce(undefined) // First control succeeds
        .mockRejectedValueOnce((() => {
          const error: any = new Error('Network error');
          error.code = 'ENOTFOUND';
          return error;
        })())
        .mockResolvedValueOnce(undefined); // Second control succeeds on retry

      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [
          { Name: 'TestComponent.control1', Value: 0.5 },
          { Name: 'TestComponent.control2', Value: 0.7 }
        ]
      });
      
      // Both should eventually succeed
      expect(result.result).toHaveLength(2);
      expect(result.result[0].Result).toBe('Success');
      expect(result.result[1].Result).toBe('Success');
      expect(mockClient.setControlValue).toHaveBeenCalledTimes(3);
    });
  });
});