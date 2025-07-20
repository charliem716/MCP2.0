/**
 * Tests for BUG-035: Parameter Format Compatibility with Q-SYS API Specification
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';

describe('QRWCClientAdapter - Parameter Format Compatibility', () => {
  let mockOfficialClient: jest.Mocked<OfficialQRWCClient>;
  let adapter: QRWCClientAdapter;
  let mockQrwc: any;

  beforeEach(() => {
    // Mock QRWC instance with test components and controls
    mockQrwc = {
      components: {
        'Main Gain': {
          controls: {
            'gain': { state: -10 },
            'mute': { state: 0 }
          }
        },
        'Channel Strip': {
          controls: {
            'gain': { state: -5 },
            'phantom': { state: 1 }
          }
        }
      }
    };

    // Create mock official client
    mockOfficialClient = {
      isConnected: jest.fn().mockReturnValue(true),
      getQrwc: jest.fn().mockReturnValue(mockQrwc),
      getComponent: jest.fn().mockImplementation((name: string) => mockQrwc.components[name]),
      setControlValue: jest.fn().mockResolvedValue(undefined),
      sendRawCommand: jest.fn()
    } as any;

    adapter = new QRWCClientAdapter(mockOfficialClient);
  });

  describe('Control.Get Parameter Formats', () => {
    it('should support direct array format (API spec)', async () => {
      // Direct array format as per Q-SYS API spec
      const result = await adapter.sendCommand('Control.Get', ['MainGain', 'MainMute'] as any);
      
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray).toHaveLength(2);
      expect(resultArray[0]).toMatchObject({
        Name: 'MainGain',
        Value: null, // Named controls not in our mock
        String: 'N/A'
      });
      expect(resultArray[1]).toMatchObject({
        Name: 'MainMute',
        Value: null,
        String: 'N/A'
      });
    });

    it('should support object-wrapped format (current implementation)', async () => {
      // Object-wrapped format
      const result = await adapter.sendCommand('Control.Get', {
        Controls: ['MainGain', 'MainMute']
      });
      
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray).toHaveLength(2);
    });

    it('should support alternative Names property', async () => {
      // Alternative naming with Names property
      const result = await adapter.sendCommand('Control.Get', {
        Names: ['MainGain', 'MainMute']
      });
      
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray).toHaveLength(2);
    });

    it('should handle component.control format', async () => {
      // Component.control format
      const result = await adapter.sendCommand('Control.Get', {
        Controls: ['Main Gain.gain', 'Channel Strip.phantom']
      });
      
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray).toHaveLength(2);
      expect(resultArray[0]).toMatchObject({
        Name: 'Main Gain.gain',
        Value: -10,
        String: '-10'
      });
      expect(resultArray[1]).toMatchObject({
        Name: 'Channel Strip.phantom',
        Value: 1,
        String: '1'
      });
    });
  });

  describe('Control.Set Parameter Formats', () => {
    it('should support single control format (API spec)', async () => {
      // Single control format as per Q-SYS API spec
      const result = await adapter.sendCommand('Control.Set', {
        Name: 'MainGain',
        Value: -12,
        Ramp: 2.0
      });
      
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray).toHaveLength(1);
      expect(resultArray[0]).toMatchObject({
        Name: 'MainGain',
        Result: 'Success'
      });
    });

    it('should support array format (current implementation)', async () => {
      // Array format with Controls property
      const result = await adapter.sendCommand('Control.Set', {
        Controls: [
          { Name: 'MainGain', Value: -12, Ramp: 2.0 },
          { Name: 'MainMute', Value: false }
        ]
      });
      
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray).toHaveLength(2);
      expect(resultArray[0]).toMatchObject({
        Name: 'MainGain',
        Result: 'Success'
      });
      expect(resultArray[1]).toMatchObject({
        Name: 'MainMute',
        Result: 'Success'
      });
    });

    it('should handle single control in Controls array', async () => {
      // Single control wrapped in Controls property
      const result = await adapter.sendCommand('Control.Set', {
        Controls: { Name: 'MainGain', Value: -12 }
      });
      
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray).toHaveLength(1);
      expect(resultArray[0]).toMatchObject({
        Name: 'MainGain',
        Result: 'Success'
      });
    });

    it('should handle component.control format in Control.Set', async () => {
      // Component.control format
      const result = await adapter.sendCommand('Control.Set', {
        Name: 'Main Gain.gain',
        Value: -15
      });
      
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray).toHaveLength(1);
      expect(resultArray[0]).toMatchObject({
        Name: 'Main Gain.gain',
        Result: 'Success'
      });
      
      // Verify the control was set with the correct component/control split
      expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith('Main Gain', 'gain', -15);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty parameters for Control.Get', async () => {
      const result = await adapter.sendCommand('Control.Get', {});
      expect(result).toHaveProperty('result');
      expect((result as any).result).toEqual([]);
    });

    it('should handle empty parameters for Control.Set', async () => {
      const result = await adapter.sendCommand('Control.Set', {});
      expect(result).toHaveProperty('result');
      expect((result as any).result).toEqual([]);
    });

    it('should handle invalid parameter types', async () => {
      // String instead of array for Control.Get
      const result = await adapter.sendCommand('Control.Get', 'MainGain' as any);
      expect(result).toHaveProperty('result');
      expect((result as any).result).toEqual([]);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with existing Control.GetValues calls', async () => {
      const result = await adapter.sendCommand('Control.GetValues', {
        Controls: ['MainGain']
      });
      
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray).toHaveLength(1);
    });

    it('should maintain compatibility with existing Control.SetValues calls', async () => {
      const result = await adapter.sendCommand('Control.SetValues', {
        Controls: [{ Name: 'MainGain', Value: -10 }]
      });
      
      expect(result).toHaveProperty('result');
      const resultArray = (result as any).result;
      expect(resultArray).toHaveLength(1);
    });
  });
});