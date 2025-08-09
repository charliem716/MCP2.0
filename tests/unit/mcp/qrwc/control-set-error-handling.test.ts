/**
 * Test to verify undefined variable fix in Control.Set
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the logger module
await jest.unstable_mockModule('../../../../src/shared/utils/logger', () => ({
  globalLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  })),
}));

// Import after mocking
const { globalLogger } = await import('../../../../src/shared/utils/logger');
const { QRWCClientAdapter } = await import('../../../../src/mcp/qrwc/adapter');
const { OfficialQRWCClient } = await import('../../../../src/qrwc/officialClient');

describe('Control.Set undefined variable fix', () => {
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
    
    // The result should have an error for the invalid control
    const resultArray = (result as any).result;
    expect(resultArray).toHaveLength(1);
    expect(resultArray[0]).toMatchObject({
      Name: '',
      Result: 'Error',
      Error: expect.stringContaining('Invalid control')
    });
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
    
    // The main goal was to ensure no ReferenceError occurs
    // and that the control name is properly included in the error response
    // which we've verified above
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
