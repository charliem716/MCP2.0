/**
 * BUG-044 Verification Test
 * Ensures that query_core_status returns complete data instead of undefined fields
 */

import { randomUUID } from 'crypto';
import { QueryCoreStatusTool } from '../../dist/src/mcp/tools/status.js';

// Mock QRWC client with proper Status.Get response
const mockQrwcClient = {
  isConnected: () => true,
  sendCommand: async (command) => {
    if (command === 'Status.Get') {
      // Return mock response matching Q-SYS StatusGet format
      return {
        result: {
          Platform: "Core 510i",
          Version: "9.5.0",
          State: "Active",
          DesignName: "Conference_Room_v2",
          DesignCode: "ABCD1234",
          IsRedundant: false,
          IsEmulator: false,
          Status: {
            String: "OK",
            Code: 0,
            PercentCPU: 23.5,
            PercentMemory: 45.2
          },
          Uptime: 864000,
          Network: {
            IP: "192.168.50.150",
            MAC: "00:11:22:33:44:55"
          }
        }
      };
    }
    throw new Error(`Unknown command: ${command}`);
  }
};

// Mock context
const mockContext = {
  requestId: randomUUID(),
  repository: {
    upsertComponent: () => {},
    getComponent: () => null
  }
};

async function runVerificationTest() {
  console.log('BUG-044 Verification Test');
  console.log('========================\n');

  try {
    const tool = new QueryCoreStatusTool(mockQrwcClient);
    
    // Execute the tool
    const result = await tool.execute({
      requestId: randomUUID()
    }, mockContext);

    if (result.isError) {
      console.error('❌ Tool execution failed:', result.content[0]?.text);
      process.exit(1);
    }

    // Parse the JSON response
    const status = JSON.parse(result.content[0].text);
    
    console.log('Received status response:');
    console.log(JSON.stringify(status, null, 2));
    console.log('\n');

    // Verify critical fields are not undefined or "Unknown"
    const criticalChecks = [
      { field: 'Platform', value: status.Platform, expected: 'Core 510i' },
      { field: 'Version', value: status.Version, expected: '9.5.0' },
      { field: 'DesignName', value: status.DesignName, expected: 'Conference_Room_v2' },
      { field: 'DesignCode', value: status.DesignCode, expected: 'ABCD1234' },
      { field: 'Status.Name', value: status.Status?.Name, expected: 'OK' },
      { field: 'Status.Code', value: status.Status?.Code, expected: 0 },
      { field: 'Status.PercentCPU', value: status.Status?.PercentCPU, expected: 23.5 },
      { field: 'IsConnected', value: status.IsConnected, expected: true }
    ];

    let allPassed = true;
    
    console.log('Field Verification:');
    console.log('------------------');
    
    for (const check of criticalChecks) {
      const passed = check.value !== undefined && 
                     check.value !== 'undefined' && 
                     check.value !== 'Unknown' &&
                     check.value !== 'N/A';
      
      if (passed) {
        console.log(`✅ ${check.field}: ${check.value}`);
      } else {
        console.log(`❌ ${check.field}: ${check.value} (expected: ${check.expected})`);
        allPassed = false;
      }
    }

    // Check for network info if available
    if (status.Network) {
      console.log(`\n✅ Network info present: IP=${status.Network.IP}, MAC=${status.Network.MAC}`);
    }

    console.log('\n------------------');
    
    if (allPassed) {
      console.log('✅ BUG-044 FIXED: All critical fields contain valid data');
      process.exit(0);
    } else {
      console.log('❌ BUG-044 NOT FIXED: Some fields still contain undefined/unknown values');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test
runVerificationTest();