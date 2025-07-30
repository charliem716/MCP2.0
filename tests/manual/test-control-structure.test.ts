import { describe, it, expect } from '@jest/globals';

describe('test control structure', () => {
  it('should run without errors', async () => {
    // Original code wrapped in test
    const runTest = async () => {
      #!/usr/bin/env node
      
      /**
       * Test to understand Q-SYS control structure
       */
      
      import { OfficialQRWCClient } from './dist/qrwc/officialClient';
      import { getQSysConfig } from './dist/config/index';
      
      // BUG-138 FIX: Use ConfigManager instead of direct file read
      const qsysConfig = getQSysConfig();
      const { host, port, username, password } = qsysConfig;
      
      async function inspectControls() {
        const client = new OfficialQRWCClient({
          host,
          port,
          username,
          password,
          secure: port === 443,
        });
      
        try {
          await client.connect();
          console.log('✅ Connected to Q-SYS Core\n');
      
          const qrwc = client.getQrwc();
          if (!qrwc) {
            throw new Error('No QRWC instance');
          }
      
          // Find a component with controls
          const componentNames = Object.keys(qrwc.components);
          console.log(`Found ${componentNames.length} components\n`);
      
          // Look for a simple component with controls
          for (const compName of componentNames) {
            const component = qrwc.components[compName];
            if (
              component &&
              component.controls &&
              Object.keys(component.controls).length > 0
            ) {
              console.log(`📦 Component: ${compName}`);
              console.log(`   Controls: ${Object.keys(component.controls).length}`);
      
              // Inspect first few controls
              const controlNames = Object.keys(component.controls).slice(0, 3);
              for (const ctrlName of controlNames) {
                const control = component.controls[ctrlName];
                console.log(`\n   🎛️  Control: ${ctrlName}`);
                console.log(`      Type: ${typeof control}`);
                console.log(`      Constructor: ${control.constructor.name}`);
      
                // Try different ways to access the value
                console.log(`      Direct: ${control}`);
                console.log(`      .state: ${control.state}`);
                console.log(`      .value: ${control.value}`);
                console.log(
                  `      .getValue(): ${typeof control.getValue === 'function' ? control.getValue() : 'N/A'}`
                );
                console.log(
                  `      .get(): ${typeof control.get === 'function' ? control.get() : 'N/A'}`
                );
      
                // Check all properties
                console.log(`      Properties:`, Object.keys(control));
      
                // If it's an object, show its structure
                if (control.state && typeof control.state === 'object') {
                  console.log(`      State structure:`, control.state);
                }
              }
      
              // Only inspect first component with controls
              break;
            }
          }
        } catch (error) {
          console.error('❌ Error:', error.message);
        } finally {
          await client.disconnect();
        }
      }
      
      inspectControls();
      
    };

    // Run test and expect no errors
    await expect(runTest()).resolves.not.toThrow();
  });
});