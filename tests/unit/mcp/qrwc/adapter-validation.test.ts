import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';

describe('QRWCClientAdapter - BUG-029 Control Value Validation', () => {
  let mockClient: jest.Mocked<OfficialQRWCClient>;
  let adapter: QRWCClientAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      setControlValue: jest.fn().mockResolvedValue(undefined),
      getComponent: jest.fn(),
      getQrwc: jest.fn().mockReturnValue({
        components: {
          'TestComponent': {
            controls: {
              'gain': { state: 0.5, type: 'Number', min: -100, max: 10 },
              'mute': { state: false, type: 'Boolean' },
              'name': { state: 'Test', type: 'String', maxLength: 50 }
            }
          }
        }
      })
    } as any;

    adapter = new QRWCClientAdapter(mockClient);
  });

  describe('Current behavior - No validation (BUG-029)', () => {
    it('sends invalid boolean values without conversion', async () => {
      // Boolean controls in Q-SYS expect 0/1, not true/false
      await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'TestComponent.mute',
          Value: true // Should be converted to 1
        }]
      });

      // Currently sends true instead of 1
      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        'TestComponent',
        'mute',
        true // BUG: Should be 1
      );
    });

    it('sends out-of-range numeric values without validation', async () => {
      // Gain control has range -100 to 10
      await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'TestComponent.gain',
          Value: 50 // Out of range!
        }]
      });

      // Currently sends invalid value
      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        'TestComponent',
        'gain',
        50 // BUG: Should validate range
      );
    });

    it('sends wrong type values without validation', async () => {
      // Sending string to numeric control
      await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'TestComponent.gain',
          Value: 'loud' // Wrong type!
        }]
      });

      // Currently sends invalid type
      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        'TestComponent',
        'gain',
        'loud' // BUG: Should validate type
      );
    });

    it('sends excessively long strings without validation', async () => {
      const longString = 'x'.repeat(100); // Too long for maxLength: 50
      
      await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'TestComponent.name',
          Value: longString
        }]
      });

      // Currently sends string that's too long
      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        'TestComponent',
        'name',
        longString // BUG: Should validate length
      );
    });
  });

  describe('Fixed behavior - With validation', () => {
    it('converts boolean values to 0/1 for Q-SYS', async () => {
      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'TestComponent.mute',
          Value: true
        }]
      });

      // Should convert true to 1
      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        'TestComponent',
        'mute',
        1 // Converted to Q-SYS format
      );
      const typedResult = result as { result: Array<{ Result: string }> };
      expect(typedResult.result[0].Result).toBe('Success');
    });

    it('rejects out-of-range numeric values', async () => {
      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'TestComponent.gain',
          Value: 50 // Out of range!
        }]
      });

      // Should not call setControlValue
      expect(mockClient.setControlValue).not.toHaveBeenCalled();
      const typedResult = result as { result: Array<{ Result: string; Error?: string }> };
      expect(typedResult.result[0].Result).toBe('Error');
      expect(typedResult.result[0].Error).toContain('above maximum 10');
    });

    it('rejects wrong type values', async () => {
      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'TestComponent.gain',
          Value: 'loud' // Wrong type!
        }]
      });

      // Should not call setControlValue
      expect(mockClient.setControlValue).not.toHaveBeenCalled();
      const typedResult = result as { result: Array<{ Result: string; Error?: string }> };
      expect(typedResult.result[0].Result).toBe('Error');
      expect(typedResult.result[0].Error).toContain('expects a number');
    });

    it('rejects excessively long strings', async () => {
      const longString = 'x'.repeat(100); // Too long for maxLength: 50
      
      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'TestComponent.name',
          Value: longString
        }]
      });

      // Should not call setControlValue
      expect(mockClient.setControlValue).not.toHaveBeenCalled();
      const typedResult = result as { result: Array<{ Result: string; Error?: string }> };
      expect(typedResult.result[0].Result).toBe('Error');
      expect(typedResult.result[0].Error).toContain('String too long');
    });

    it('accepts valid values within constraints', async () => {
      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [
          { Name: 'TestComponent.gain', Value: -5 }, // Within range
          { Name: 'TestComponent.mute', Value: false }, // Boolean
          { Name: 'TestComponent.name', Value: 'Valid Name' } // Valid string
        ]
      });

      // Type assertions for result
      expect(result).toBeDefined();
      const typedResult = result as { result: Array<{ Result: string; Name: string; Error?: string }> };
      
      // All should succeed
      expect(mockClient.setControlValue).toHaveBeenCalledTimes(3);
      expect(mockClient.setControlValue).toHaveBeenNthCalledWith(1, 'TestComponent', 'gain', -5);
      expect(mockClient.setControlValue).toHaveBeenNthCalledWith(2, 'TestComponent', 'mute', 0); // false -> 0
      expect(mockClient.setControlValue).toHaveBeenNthCalledWith(3, 'TestComponent', 'name', 'Valid Name');
      
      expect(typedResult.result.every(r => r.Result === 'Success')).toBe(true);
    });

    it('handles controls without type info gracefully', async () => {
      // Remove type info from mock
      mockClient.getQrwc = jest.fn().mockReturnValue({
        components: {
          'TestComponent': {
            controls: {
              'unknown': { state: 'test' } // No type info
            }
          }
        }
      });

      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [{
          Name: 'TestComponent.unknown',
          Value: 'any value'
        }]
      });

      // Should pass through without validation
      expect(mockClient.setControlValue).toHaveBeenCalledWith(
        'TestComponent',
        'unknown',
        'any value'
      );
      const typedResult = result as { result: Array<{ Result: string }> };
      expect(typedResult.result[0].Result).toBe('Success');
    });
  });
});