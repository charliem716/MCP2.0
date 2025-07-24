#!/usr/bin/env node

/**
 * BUG-036 Mock Verification Script
 *
 * This script shows what the current adapter implementation returns
 * for Component.GetComponents by using mock data.
 */

import { QRWCClientAdapter } from '../dist/src/mcp/qrwc/adapter.js';

// Create a mock official client that simulates the QRWC structure
const mockOfficialClient = {
  isConnected: () => true,

  getQrwc: () => ({
    components: {
      System: {
        state: {
          Type: 'system_manager',
          Properties: [
            { Name: 'version', Value: '9.0.0' },
            { Name: 'platform', Value: 'Core 110f' },
          ],
        },
        controls: {
          Status: { state: { Value: 0, String: 'OK' } },
          CPU_Usage: { state: { Value: 15.2, String: '15.2%' } },
        },
      },
      'My Delay Mixer': {
        state: {
          Type: 'delay_matrix',
          Properties: [
            { Name: 'n_inputs', Value: '8' },
            { Name: 'n_outputs', Value: '8' },
            { Name: 'max_delay', Value: '0.5' },
            { Name: 'delay_type', Value: '0' },
            { Name: 'linear_gain', Value: 'False' },
            { Name: 'multi_channel_type', Value: '1' },
            { Name: 'multi_channel_count', Value: '8' },
          ],
        },
        controls: {
          'gain.1': { state: { Value: 0, String: '0dB' } },
          'mute.1': { state: { Value: 0, String: 'false' } },
        },
      },
      'APM ABC': {
        state: {
          Type: 'apm',
          Properties: [],
        },
        controls: {
          gain: { state: { Value: -10, String: '-10dB' } },
        },
      },
      'Audio Player 1': {
        // Component without state metadata
        controls: {
          play: { state: { Value: 0, String: 'stopped' } },
          loop: { state: { Value: 1, String: 'enabled' } },
        },
      },
    },
  }),

  getComponent: name => {
    const qrwc = mockOfficialClient.getQrwc();
    return qrwc.components[name];
  },

  setControlValue: async () => {
    return true;
  },
  sendRawCommand: async () => {
    return { result: {} };
  },
};

// Create adapter with mock client
const adapter = new QRWCClientAdapter(mockOfficialClient);

async function verifyComponentFormat() {
  console.log(
    '\n=== BUG-036 Mock Component.GetComponents Format Verification ===\n'
  );

  try {
    // Get components using the adapter
    console.log('Calling adapter.sendCommand("Component.GetComponents")...\n');
    const response = await adapter.sendCommand('Component.GetComponents');

    // Check response structure
    console.log('=== Current Adapter Response ===\n');
    console.log(JSON.stringify(response, null, 2));

    if (!response || !response.result) {
      console.error('\n✗ Invalid response structure - missing result field');
      return;
    }

    const components = response.result;
    console.log(`\n✓ Received ${components.length} components\n`);

    // Analyze each component
    console.log('=== Component Analysis ===\n');

    components.forEach((comp, index) => {
      console.log(`Component ${index + 1}: ${comp.Name}`);
      console.log(`  Type: ${comp.Type || 'MISSING'}`);
      console.log(
        `  Properties: ${comp.Properties ? `Array(${comp.Properties.length})` : 'MISSING'}`
      );

      if (comp.Properties && comp.Properties.length > 0) {
        console.log('  Sample properties:');
        comp.Properties.slice(0, 2).forEach(prop => {
          console.log(`    - ${prop.Name}: ${prop.Value}`);
        });
      }
      console.log();
    });

    // Show expected format
    console.log('=== Expected Q-SYS API Format ===\n');
    console.log(
      JSON.stringify(
        {
          jsonrpc: '2.0',
          result: [
            {
              Name: 'APM ABC',
              Type: 'apm',
              Properties: [],
            },
            {
              Name: 'My Delay Mixer',
              Type: 'delay_matrix',
              Properties: [
                { Name: 'n_inputs', Value: '8' },
                { Name: 'n_outputs', Value: '8' },
                { Name: 'max_delay', Value: '0.5' },
              ],
            },
          ],
          id: 1234,
        },
        null,
        2
      )
    );

    // Compare formats
    console.log('\n=== Format Comparison ===\n');

    const firstComponent = components[0];
    console.log('Current format per component:');
    console.log(JSON.stringify(firstComponent, null, 2));

    console.log('\nExpected format per component:');
    console.log(
      JSON.stringify(
        {
          Name: 'Component Name',
          Type: 'specific_type',
          Properties: [{ Name: 'prop_name', Value: 'prop_value' }],
        },
        null,
        2
      )
    );

    // Check if current implementation matches spec
    const hasCorrectStructure = components.every(
      comp => comp.Name && comp.Type && Array.isArray(comp.Properties)
    );

    const hasSpecificTypes = components.every(
      comp => comp.Type !== 'Component' && comp.Type !== 'generic'
    );

    console.log('\n=== Verdict ===\n');
    if (hasCorrectStructure && hasSpecificTypes) {
      console.log(
        '✓ Current implementation appears to match Q-SYS API specification!'
      );
    } else {
      console.log(
        '✗ Current implementation does NOT match Q-SYS API specification'
      );
      if (!hasCorrectStructure) {
        console.log('  - Missing required fields (Name, Type, or Properties)');
      }
      if (!hasSpecificTypes) {
        console.log(
          '  - Using generic types instead of specific component types'
        );
      }
    }
  } catch (error) {
    console.error('\n✗ Error during verification:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run verification
verifyComponentFormat().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
