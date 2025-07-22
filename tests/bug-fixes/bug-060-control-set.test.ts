import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter';
import { OfficialQRWCClient } from '../../src/qrwc/officialClient';
import { globalLogger } from '../../src/shared/utils/logger';

// Mock the logger
jest.mock('../../src/shared/utils/logger', () => ({
  globalLogger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

describe('BUG-060: Control.Set and Component.Set ReferenceError Fix', () => {
  let adapter: QRWCClientAdapter;
  let mockOfficialClient: jest.Mocked<OfficialQRWCClient>;

  beforeEach(() => {
    // Create mock official client
    mockOfficialClient = {
      isConnected: jest.fn().mockReturnValue(true),
      setControlValue: jest.fn().mockResolvedValue(undefined),
      getComponent: jest.fn().mockReturnValue(
{
        controls: {
          gain: {
            state: {
              Value: 0,
              String: '0.0 dB',
              Position: 0.5,
              Type: 'Float'
            }
          }
        }
      }),
      getQrwc: jest.fn().mockReturnValue({
        components: {
          TestGain: {
            controls: {
              gain: {
                state: {
                  Value: 0,
                  String: '0.0 dB',
                  Position: 0.5,
                  Type: 'Float'
                }
              }
            }
          }
        }
      }),
      sendRawCommand: jest.fn()
    } as any;

    // Create adapter instance
    adapter = new QRWCClientAdapter(mockOfficialClient);
  });

  describe('Control.Set command', () => {
    it('should set control value without ReferenceError', async () => {
      // Execute Control.Set command
      const result = await adapter.sendCommand('Control.Set', {
        Controls: [{
          Name: 'TestGain.gain',
          Value: -10
        }]
      });

      // Verify no ReferenceError and successful execution
      expect(result).toBeDefined();
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(Array.isArray(resultArray)).toBe(true);
      expect(resultArray[0]).toMatchObject({
        Name: 'TestGain.gain',
        Result: 'Success'
      });
      
      // Verify the mock was called correctly
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('TestGain', 'gain', -10);
    });

    it('should handle error without ReferenceError when name is undefined', async () => {
      // This test specifically verifies the BUG-060 fix
      // Pass a control without a Name property to trigger the error early
      const result = await adapter.sendCommand('Control.Set', {
        Controls: [{ Value: -20 }] // Missing Name property
      });

      // Should handle error gracefully without ReferenceError
      expect(result).toBeDefined();
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray[0]).toMatchObject({
        Name: '', // Should be empty string, not undefined
        Result: 'Error',
        Error: expect.stringContaining('Control name is required')
      });
      
      // Verify logger was called with empty name (not undefined)
      expect(globalLogger.error).toHaveBeenCalledWith(
        'Failed to set control value',
        expect.objectContaining({
          control: '', // Should be empty string
          error: expect.any(Error)
        })
      );
    });
  });

  describe('Component.Set command', () => {
    it('should set component control value without ReferenceError', async () => {
      // Execute Component.Set command
      const result = await adapter.sendCommand('Component.Set', {
        Name: 'TestGain',
        Controls: [{
          Name: 'gain',
          Value: -15
        }]
      });

      // Verify successful execution
      expect(result).toBeDefined();
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(Array.isArray(resultArray)).toBe(true);
      expect(resultArray[0]).toMatchObject({
        Name: 'gain',
        Result: 'Success'
      });
      
      // Verify the mock was called correctly
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('TestGain', 'gain', -15);
    });

    it('should handle error without ReferenceError in Component.Set', async () => {
      // Test BUG-060 fix for Component.Set
      // Missing component name should trigger error early
      const result = await adapter.sendCommand('Component.Set', {
        Controls: [{ Name: 'gain', Value: 0.75 }] // Missing component Name
      });

      // Should handle error gracefully
      expect(result).toBeDefined();
      // Component.Set throws error for missing component name
      expect(result).toEqual(expect.objectContaining({
        error: expect.any(Error)
      }));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});