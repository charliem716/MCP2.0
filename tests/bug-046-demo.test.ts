import { describe, it, expect } from '@jest/globals';
import { OfficialQRWCClient } from '../src/qrwc/officialClient';

describe('BUG-046: Disconnect logging demonstration', () => {
  it('should not log excessively when disconnect is called multiple times', async () => {
    // Set environment to allow logging
    const originalNodeEnv = process.env.NODE_ENV;
    const originalLogLevel = process.env.LOG_LEVEL;
    delete process.env.NODE_ENV;
    process.env.LOG_LEVEL = 'info';
    
    let logCount = 0;
    const originalWrite = process.stdout.write.bind(process.stdout);
    
    // Mock stdout to count disconnect log messages
    process.stdout.write = function (chunk: any, encoding?: any, callback?: any): boolean {
      const str = chunk.toString();
      if (
        str.includes('Disconnecting from Q-SYS Core') ||
        str.includes('Disconnected successfully')
      ) {
        logCount++;
      }
      return originalWrite(chunk, encoding, callback);
    };

    try {
      console.log('Creating client and calling disconnect 100 times...\n');

      const client = new OfficialQRWCClient({
        host: 'demo.local',
        port: 443,
        enableAutoReconnect: false,
      });

      // Force connected state using reflection
      const keys = Object.getOwnPropertyNames(client);
      const stateKey = keys.find(k => k.includes('connectionState'));
      if (stateKey) {
        (client as any)[stateKey] = 2; // CONNECTED
      }

      // Reset counter
      logCount = 0;

      // Call disconnect multiple times
      for (let i = 0; i < 100; i++) {
        client.disconnect();
      }

      // Wait for any async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log(`\nResults:`);
      console.log(`- Disconnect log messages: ${logCount}`);
      console.log(`- Expected: 2 or less`);
      console.log(
        `- Result: ${logCount <= 2 ? '✅ PASS - No excessive logging!' : '❌ FAIL - Excessive logging detected'}`
      );

      // Test the flag reset
      console.log(`\nChecking shutdownInProgress flag...`);
      const flagKey = keys.find(k => k.includes('shutdownInProgress'));
      let shutdownFlag = false;
      if (flagKey) {
        shutdownFlag = (client as any)[flagKey];
        console.log(`- shutdownInProgress after disconnect: ${shutdownFlag}`);
        console.log(`- Expected: false`);
        console.log(
          `- Result: ${!shutdownFlag ? '✅ PASS - Flag properly reset!' : '❌ FAIL - Flag not reset'}`
        );
      }

      // Jest assertions
      expect(logCount).toBeLessThanOrEqual(2);
      expect(shutdownFlag).toBe(false);
    } finally {
      // Restore stdout and environment
      process.stdout.write = originalWrite;
      if (originalNodeEnv !== undefined) {
        process.env.NODE_ENV = originalNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (originalLogLevel !== undefined) {
        process.env.LOG_LEVEL = originalLogLevel;
      } else {
        delete process.env.LOG_LEVEL;
      }
    }
  });
});