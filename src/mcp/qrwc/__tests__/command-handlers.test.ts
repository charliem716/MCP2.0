// Mock logger must be before imports
jest.mock('../../../shared/utils/logger', () => ({
  globalLogger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock validators must be before imports
const mockValidateControlValue = jest.fn();
jest.mock('../validators.js', () => ({
  validateControlValue: mockValidateControlValue,
}));

import { handleControlSet } from '../command-handlers.js';
import type { OfficialQRWCClient } from '../officialClient.js';
import { ValidationError } from '../../../shared/types/errors.js';
import { QSysError, QSysErrorCode } from '../../../shared/types/errors.js';

describe('command-handlers', () => {
  describe('handleControlSet', () => {
    let mockClient: jest.Mocked<OfficialQRWCClient>;
    let mockQrwc: any;

    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();
      
      // Setup default mock behavior for validateControlValue
      mockValidateControlValue.mockImplementation((name, value, controlInfo) => {
        // Basic validation logic
        if (controlInfo && 'ValueMin' in controlInfo && 'ValueMax' in controlInfo) {
          const min = controlInfo.ValueMin as number;
          const max = controlInfo.ValueMax as number;
          if (typeof value === 'number' && (value < min || value > max)) {
            return {
              valid: false,
              error: `Value ${value} is ${value < min ? 'below minimum' : 'above maximum'} ${value < min ? min : max}`
            };
          }
        }
        return { valid: true };
      });

      // Create mock QRWC structure
      mockQrwc = {
        components: {
          'TestComponent': {
            controls: {
              'gain': {
                Name: 'gain',
                Value: 0,
                Type: 'Float',
                ValueMin: -100,
                ValueMax: 10,
              },
              'mute': {
                Name: 'mute',
                Value: false,
                Type: 'Boolean',
              },
            },
          },
        },
      };

      // Create mock client
      mockClient = {
        getQrwc: jest.fn().mockReturnValue(mockQrwc),
        setControlValue: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<OfficialQRWCClient>;
    });

    it('should validate Controls parameter is an array', async () => {
      await expect(handleControlSet({ Controls: 'not-an-array' }, mockClient))
        .rejects.toThrow(ValidationError);

      await expect(handleControlSet({}, mockClient))
        .rejects.toThrow(ValidationError);

      await expect(handleControlSet(undefined, mockClient))
        .rejects.toThrow(ValidationError);
    });

    it('should throw error if QRWC instance is not available', async () => {
      mockClient.getQrwc.mockReturnValue(null);

      await expect(handleControlSet({ Controls: [] }, mockClient))
        .rejects.toThrow(QSysError);
    });

    it('should handle empty controls array', async () => {
      const result = await handleControlSet({ Controls: [] }, mockClient);
      expect(result).toEqual({ result: [] });
    });

    it('should process valid control updates', async () => {
      const controls = [
        { Name: 'TestComponent.gain', Value: -10 },
        { Name: 'TestComponent.mute', Value: true },
      ];

      const result = await handleControlSet({ Controls: controls }, mockClient);

      expect(mockClient.setControlValue).toHaveBeenCalledTimes(2);
      expect(mockClient.setControlValue).toHaveBeenCalledWith('TestComponent', 'gain', -10);
      expect(mockClient.setControlValue).toHaveBeenCalledWith('TestComponent', 'mute', true);

      expect(result).toEqual({
        result: [
          { Name: 'TestComponent.gain', Result: 'Success' },
          { Name: 'TestComponent.mute', Result: 'Success' },
        ],
      });
    });

    it('should handle invalid control object', async () => {
      const controls = [
        null,
        'not-an-object',
        { Name: 'TestComponent.gain', Value: 0 },
      ];

      const result = await handleControlSet({ Controls: controls }, mockClient);

      expect(result.result).toHaveLength(3);
      expect(result.result[0]).toEqual({
        Name: '',
        Result: 'Error',
        Error: 'Invalid control object',
      });
      expect(result.result[1]).toEqual({
        Name: '',
        Result: 'Error',
        Error: 'Invalid control object',
      });
      expect(result.result[2]).toEqual({
        Name: 'TestComponent.gain',
        Result: 'Success',
      });
    });

    it('should handle invalid control name format', async () => {
      const controls = [
        { Name: 'InvalidFormat', Value: 0 },
        { name: 'AlsoInvalid', Value: 0 },
        { Value: 0 }, // No name
      ];

      const result = await handleControlSet({ Controls: controls }, mockClient);

      expect(result.result).toHaveLength(3);
      expect(result.result[0]).toEqual({
        Name: 'InvalidFormat',
        Result: 'Error',
        Error: 'Invalid control name format: InvalidFormat',
      });
      expect(result.result[1]).toEqual({
        Name: 'AlsoInvalid',
        Result: 'Error',
        Error: 'Invalid control name format: AlsoInvalid',
      });
      expect(result.result[2]).toEqual({
        Name: '',
        Result: 'Error',
        Error: 'Invalid control object',
      });
    });

    it('should handle component not found', async () => {
      const controls = [
        { Name: 'NonExistent.gain', Value: 0 },
      ];

      const result = await handleControlSet({ Controls: controls }, mockClient);

      expect(result.result).toHaveLength(1);
      expect(result.result[0]).toEqual({
        Name: 'NonExistent.gain',
        Result: 'Error',
        Error: 'Component not found: NonExistent',
      });
    });

    it('should handle various value types', async () => {
      const controls = [
        { Name: 'TestComponent.gain', Value: null },      // null -> 0
        { Name: 'TestComponent.gain', Value: undefined }, // undefined -> 0
        { Name: 'TestComponent.gain', Value: '5' },       // string
        { Name: 'TestComponent.gain', Value: { complex: 'object' } }, // object -> string
      ];

      const result = await handleControlSet({ Controls: controls }, mockClient);

      expect(mockClient.setControlValue).toHaveBeenCalledTimes(4);
      expect(mockClient.setControlValue).toHaveBeenNthCalledWith(1, 'TestComponent', 'gain', 0);
      expect(mockClient.setControlValue).toHaveBeenNthCalledWith(2, 'TestComponent', 'gain', 0);
      expect(mockClient.setControlValue).toHaveBeenNthCalledWith(3, 'TestComponent', 'gain', '5');
      expect(mockClient.setControlValue).toHaveBeenNthCalledWith(4, 'TestComponent', 'gain', '{"complex":"object"}');
    });

    it('should handle control value validation failure', async () => {
      // Mock validation to fail for values outside range
      const controls = [
        { Name: 'TestComponent.gain', Value: -200 }, // Below min
      ];

      const result = await handleControlSet({ Controls: controls }, mockClient);

      expect(result.result).toHaveLength(1);
      expect(result.result[0]).toMatchObject({
        Name: 'TestComponent.gain',
        Result: 'Error',
        Error: expect.stringContaining('Value -200 is below minimum'),
      });
    });

    it('should handle client.setControlValue errors', async () => {
      mockClient.setControlValue.mockRejectedValueOnce(new Error('Network error'));

      const controls = [
        { Name: 'TestComponent.gain', Value: 0 },
      ];

      const result = await handleControlSet({ Controls: controls }, mockClient);

      expect(result.result).toHaveLength(1);
      expect(result.result[0]).toEqual({
        Name: 'TestComponent.gain',
        Result: 'Error',
        Error: 'Network error',
      });
    });

    it('should update local state after successful control update', async () => {
      const controls = [
        { Name: 'TestComponent.gain', Value: -5 },
        { Name: 'TestComponent.mute', Value: true },
      ];

      await handleControlSet({ Controls: controls }, mockClient);

      // Check that local state was updated
      expect(mockQrwc.components.TestComponent.controls.gain.Value).toBe(-5);
      expect(mockQrwc.components.TestComponent.controls.mute.Value).toBe(true);
    });

    it('should process controls sequentially', async () => {
      const callOrder: string[] = [];
      mockClient.setControlValue.mockImplementation(async (component, control) => {
        callOrder.push(`${component}.${control}`);
      });

      const controls = [
        { Name: 'TestComponent.gain', Value: 1 },
        { Name: 'TestComponent.mute', Value: false },
        { Name: 'TestComponent.gain', Value: 2 },
      ];

      await handleControlSet({ Controls: controls }, mockClient);

      expect(callOrder).toEqual([
        'TestComponent.gain',
        'TestComponent.mute',
        'TestComponent.gain',
      ]);
    });
  });
});