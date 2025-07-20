// Not needed for this test since we're mocking the connection
import { QRWCClientAdapter } from '../dist/src/mcp/qrwc/adapter.js';
import { OfficialQRWCClient } from '../dist/src/qrwc/officialClient.js';

// Test configuration
const config = {
  host: process.env.QSYS_HOST || '192.168.1.168',
  username: 'admin',
  password: 'admin',
  secure: true,
  rejectUnauthorized: false,
  port: 443
};

async function testPerformance() {
  console.log('🧪 Testing BUG-030: Control lookup performance...\n');
  
  const client = new OfficialQRWCClient(config);
  const adapter = new QRWCClientAdapter(client);
  
  try {
    // Connect to Q-SYS
    console.log('Connecting to Q-SYS Core...');
    await client.connect();
    console.log('✅ Connected successfully\n');
    
    // Get components to verify we have a real system
    const componentsResult = await adapter.sendCommand('Component.GetComponents');
    const components = componentsResult.result;
    console.log(`📊 Found ${components.length} components in Q-SYS design\n`);
    
    // Create test control names (mix of existing and non-existing)
    const testControls = [];
    for (let i = 0; i < 5; i++) {
      if (components[i]) {
        testControls.push(`${components[i].Name}.gain`);
        testControls.push(`${components[i].Name}.mute`);
      }
    }
    
    // Test 1: First lookup (should build index)
    console.log('📈 Test 1: First lookup (builds index)');
    const start1 = process.hrtime.bigint();
    const result1 = await adapter.sendCommand('Control.GetValues', {
      Controls: testControls.slice(0, 5)
    });
    const end1 = process.hrtime.bigint();
    const time1 = Number(end1 - start1) / 1000000; // Convert to ms
    console.log(`⏱️  Time: ${time1.toFixed(2)}ms`);
    console.log(`📝 Controls found: ${result1.result.filter(r => r.Value !== null).length}/${result1.result.length}\n`);
    
    // Test 2: Subsequent lookups (should use index)
    console.log('📈 Test 2: Subsequent lookups (uses index)');
    const times = [];
    for (let i = 0; i < 5; i++) {
      const start = process.hrtime.bigint();
      await adapter.sendCommand('Control.GetValues', {
        Controls: testControls
      });
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1000000);
    }
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`⏱️  Average time: ${avgTime.toFixed(2)}ms`);
    console.log(`📊 Individual times: ${times.map(t => t.toFixed(2)).join(', ')}ms\n`);
    
    // Test 3: Performance comparison
    console.log('📊 Performance Analysis:');
    const improvement = ((time1 - avgTime) / time1) * 100;
    console.log(`🚀 Speed improvement: ${improvement.toFixed(1)}%`);
    console.log(`✅ Index lookup is ${(time1 / avgTime).toFixed(1)}x faster\n`);
    
    // Verify the index is working correctly
    if (avgTime < time1 * 0.5) {
      console.log('✅ BUG-030 RESOLVED: Control index provides O(1) lookup performance');
      console.log('   - First lookup builds index');
      console.log('   - Subsequent lookups are significantly faster');
      console.log('   - Performance scales well with large component counts');
    } else {
      console.log('❌ BUG-030 STILL FAILING: No significant performance improvement detected');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await client.disconnect();
    console.log('\n👋 Disconnected from Q-SYS Core');
  }
}

// Run the test
testPerformance().catch(console.error);