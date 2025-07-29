import { describe, it, expect, jest } from '@jest/globals';
import { OfficialQRWCClient } from '../src/qrwc/officialClient';
import { ConnectionState } from '../src/shared/types/common';

describe('BUG-046: Final verification', () => {
  it('should handle disconnect correctly and reset shutdownInProgress flag', async () => {
    console.log('=== BUG-046 Final Verification Test ===\n');
    
    // Create a custom logger to capture logs
    const capturedLogs: Array<{ level: string; message: string }> = [];
    const testLogger = {
      info: jest.fn((message: string) => {
        capturedLogs.push({ level: 'info', message });
      }),
      error: jest.fn((message: string) => {
        capturedLogs.push({ level: 'error', message });
      }),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    
    // Create a testable client that exposes private properties
    class TestableClient extends OfficialQRWCClient {
      private _connectionState: ConnectionState = ConnectionState.CONNECTED;
      public shutdownInProgress = false;
      
      constructor(options: any) {
        super(options);
        (this as any).logger = testLogger;
      }
    
      get connectionState() {
        return this._connectionState;
      }
    
      set connectionState(value: ConnectionState) {
        this._connectionState = value;
      }
    }

    console.log('Test 1: Multiple disconnect calls should only log once');
    
    const client = new TestableClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: false,
    });
    
    // Reset logs
    capturedLogs.length = 0;
    
    // Force connected state
    client.connectionState = ConnectionState.CONNECTED;
    
    // Call disconnect 100 times
    for (let i = 0; i < 100; i++) {
      await client.disconnect();
    }
    
    // Count disconnect logs
    const disconnectLogs = capturedLogs.filter(log =>
      log.message.includes('Disconnecting from Q-SYS Core')
    );
    const successLogs = capturedLogs.filter(log =>
      log.message.includes('Disconnected from Q-SYS Core')
    );
    
    console.log(`- Disconnect logs: ${disconnectLogs.length} (expected: 1)`);
    console.log(`- Success logs: ${successLogs.length} (expected: 1)`);
    
    const test1Pass = disconnectLogs.length === 1 && successLogs.length === 1;
    console.log(`- Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 2: shutdownInProgress flag management
    console.log('\nTest 2: shutdownInProgress flag should be reset after disconnect');
    
    const client2 = new TestableClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: false,
    });
    
    // Before disconnect
    const flagBeforeDisconnect = client2.shutdownInProgress;
    console.log(
      `- Flag before disconnect: ${flagBeforeDisconnect} (expected: false)`
    );
    
    // After disconnect
    await client2.disconnect();
    const flagAfterDisconnect = client2.shutdownInProgress;
    console.log(
      `- Flag after disconnect: ${flagAfterDisconnect} (expected: false)`
    );
    
    const test2Pass = !flagBeforeDisconnect && !flagAfterDisconnect;
    console.log(`- Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);
    
    // Overall result
    const allPass = test1Pass && test2Pass;
    console.log(`\n${allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log(`BUG-046 is ${allPass ? 'FIXED' : 'NOT FULLY FIXED'}`);
    
    // Jest assertions
    expect(disconnectLogs.length).toBe(1);
    expect(successLogs.length).toBe(1);
    expect(flagBeforeDisconnect).toBe(false);
    expect(flagAfterDisconnect).toBe(false);
    expect(allPass).toBe(true);
  });
});