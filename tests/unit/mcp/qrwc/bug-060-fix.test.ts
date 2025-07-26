/**
 * BUG-060: Test to verify undefined variable fix in Control.Set
 */

import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';
import { globalLogger } from '../../../../src/shared/utils/logger.js';

// Mock the logger
jest.mock('../../../../src/shared/utils/logger.js', () => ({
  globalLogger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('BUG-060: Control.Set undefined variable fix', () => {
  let adapter: QRWCClientAdapter;
  let mockOfficialClient: jest.Mocked<OfficialQRWCClient>;

  beforeEach(() => {
    mockOfficialClient = {
      isConnected: jest.fn().mockReturnValue(true),
      setControlValue: jest.fn(),
      getQrwc: jest.fn().mockReturnValue({
        components: {},
      }),
      sendRawCommand: jest.fn(),
    } as any;

    adapter = new QRWCClientAdapter(mockOfficialClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle error in Control.Set without ReferenceError when control object is invalid', async () => {
    // This test verifies that when an error occurs before the name variable is assigned,
    // we don't get a ReferenceError in the catch block

    const invalidControl = null; // This will cause an error in the try block

    const result = await adapter.sendCommand('Control.Set', {
      Controls: [invalidControl],
    });

    // The important part is that we don't get a ReferenceError
    // Instead, we should get a proper error response
    expect(result).toHaveProperty('result');
    expect(Array.isArray((result as any).result)).toBe(true);

    // Check that logger.error was called with empty name (not undefined)
    expect(globalLogger.error).toHaveBeenCalledWith(
      'Failed to set control value',
      expect.objectContaining({
        control: '', // Should be empty string, not undefined
        error: expect.any(Error),
      })
    );
  });

  it('should handle error in Control.Set with proper name when validation fails', async () => {
    const testControl = {
      Name: 'TestControl.Volume',
      Value: 'invalid-value',
    };

    // Mock validation to fail
    mockOfficialClient.getQrwc.mockReturnValue({
      components: {
        TestControl: {
          controls: {
            Volume: { type: 'Float', min: 0, max: 100 },
          },
        },
      },
    } as any);

    const result = await adapter.sendCommand('Control.Set', {
      Controls: [testControl],
    });

    // Check that the error includes the control name
    const resultArray = (result as any).result;
    expect(resultArray[0]).toMatchObject({
      Name: 'TestControl.Volume',
      Result: 'Error',
      Error: expect.stringContaining('Numeric control expects'),
    });

    // Check that logger.error was called with the correct name
    expect(globalLogger.error).toHaveBeenCalledWith(
      'Failed to set control value',
      expect.objectContaining({
        control: 'TestControl.Volume',
        error: expect.any(Error),
      })
    );
  });

  it('should successfully set control when valid', async () => {
    const testControl = {
      Name: 'TestControl.Volume',
      Value: 50,
    };

    mockOfficialClient.setControlValue.mockResolvedValue(undefined);
    mockOfficialClient.getQrwc.mockReturnValue({
      components: {
        TestControl: {
          controls: {
            Volume: { type: 'Float', min: 0, max: 100 },
          },
        },
      },
    } as any);

    const result = await adapter.sendCommand('Control.Set', {
      Controls: [testControl],
    });

    const resultArray = (result as any).result;
    expect(resultArray[0]).toMatchObject({
      Name: 'TestControl.Volume',
      Result: 'Success',
    });

    expect(mockOfficialClient.setControlValue).toHaveBeenCalledWith(
      'TestControl',
      'Volume',
      50
    );
  });
});
