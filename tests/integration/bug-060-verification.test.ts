/**
 * BUG-060 Integration Test: Verify control setting works without ReferenceError
 */

import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { OfficialQRWCClient } from '../../src/qrwc/officialClient.js';

describe('BUG-060: Control setting integration test', () => {
  let adapter: QRWCClientAdapter;
  let mockOfficialClient: any;

  beforeEach(() => {
    // Create a mock that simulates various error conditions
    mockOfficialClient = {
      isConnected: jest.fn().mockReturnValue(true),
      setControlValue: jest.fn(),
      getQrwc: jest.fn().mockReturnValue({
        components: {
          TestComponent: {
            controls: {
              Volume: { type: 'Float', min: 0, max: 100 }
            }
          }
        }
      }),
      sendRawCommand: jest.fn()
    };

    adapter = new QRWCClientAdapter(mockOfficialClient);
  });

  it('should handle multiple control setting errors without ReferenceError', async () => {
    // The key test here is that we don't get ReferenceError
    // The actual success/failure of individual controls is secondary
    const testControls = [
      null, // Will cause error before name assignment
      { Name: '', Value: 50 }, // Empty name error
      { Name: 'Invalid.Control', Value: 'bad' }, // Validation error
      { Name: 'Test.Volume', Value: 150 }, // Out of range error
      { Name: 'Good.Control', Value: 50 } // Valid control
    ];

    // Mock different scenarios
    mockOfficialClient.setControlValue
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(undefined);

    const result = await adapter.sendCommand('Control.Set', {
      Controls: testControls
    });

    // Verify we got results for all controls
    expect(result).toHaveProperty('result');
    const results = (result as any).result;
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(5);

    // Check each result
    expect(results[0]).toMatchObject({
      Name: '',
      Result: 'Error',
      Error: expect.any(String)
    });

    expect(results[1]).toMatchObject({
      Name: '',
      Result: 'Error',
      Error: 'Control name is required'
    });

    // The critical test: all controls have names (no undefined from ReferenceError)
    results.forEach((result: any, index: number) => {
      expect(result).toHaveProperty('Name');
      expect(result).toHaveProperty('Result');
      expect(typeof result.Name).toBe('string');
      expect(['Success', 'Error']).toContain(result.Result);
      
      // Verify no ReferenceError messages
      if (result.Error) {
        expect(result.Error).not.toContain('ReferenceError');
        expect(result.Error).not.toContain('is not defined');
      }
    });
  });

  it('should handle concurrent control operations without ReferenceError', async () => {
    const controls = Array.from({ length: 10 }, (_, i) => ({
      Name: `Control${i}`,
      Value: i * 10
    }));

    // Simulate some failing
    mockOfficialClient.setControlValue
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Invalid'))
      .mockResolvedValue(undefined);

    const result = await adapter.sendCommand('Control.Set', {
      Controls: controls
    });

    const results = (result as any).result;
    expect(results.length).toBe(10);
    
    // Count successes and failures
    const successes = results.filter((r: any) => r.Result === 'Success').length;
    const failures = results.filter((r: any) => r.Result === 'Error').length;
    
    expect(successes).toBeGreaterThan(0);
    expect(failures).toBeGreaterThan(0);
    
    // All should have names (no undefined)
    results.forEach((r: any) => {
      expect(r.Name).toBeDefined();
      expect(typeof r.Name).toBe('string');
    });
  });
});