import { describe, it, expect, jest } from '@jest/globals';
import { OfficialQRWCClient } from '../src/qrwc/officialClient';
import { ConnectionState } from '../src/shared/types/common';

describe('BUG-046: Final verification', () => {
  it('should handle disconnect correctly and reset shutdownInProgress flag', async () => {
    console.log('=== BUG-046 Final Verification Test ===\n');
    
    console.log('Test 1: Multiple disconnect calls should be handled gracefully');
    
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: false,
    });
    
    // Access internal state
    const clientAny = client as any;
    
    // Force connected state
    clientAny.connectionState = ConnectionState.CONNECTED;
    
    // Call disconnect 100 times
    let disconnectCount = 0;
    for (let i = 0; i < 100; i++) {
      const stateBeforeDisconnect = clientAny.connectionState;
      client.disconnect();
      if (stateBeforeDisconnect === ConnectionState.CONNECTED) {
        disconnectCount++;
      }
    }
    
    console.log(`- Disconnect executed: ${disconnectCount} time(s) (expected: 1)`);
    
    const test1Pass = disconnectCount === 1;
    console.log(`- Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);
    
    // Test 2: shutdownInProgress flag management
    console.log('\nTest 2: shutdownInProgress flag should be reset after disconnect');
    
    const client2 = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: false,
    });
    
    const client2Any = client2 as any;
    
    // Before disconnect
    const flagBeforeDisconnect = client2Any.shutdownInProgress;
    console.log(
      `- Flag before disconnect: ${flagBeforeDisconnect} (expected: false)`
    );
    
    // Set to connected to allow disconnect
    client2Any.connectionState = ConnectionState.CONNECTED;
    
    // After disconnect
    client2.disconnect();
    const flagAfterDisconnect = client2Any.shutdownInProgress;
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
    expect(disconnectCount).toBe(1);
    expect(flagBeforeDisconnect).toBe(false);
    expect(flagAfterDisconnect).toBe(false);
    expect(allPass).toBe(true);
  });
});