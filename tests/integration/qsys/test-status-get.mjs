#!/usr/bin/env node

import { testConnection } from '../../../tests/integration/qsys/qsys-connection.mjs';

console.log('🧪 Testing Status.Get Command');
console.log('==================================================');

const { client } = await testConnection();

try {
  console.log('\n📡 Sending Status.Get command...');
  const response = await client.sendRawCommand('Status.Get', {});

  console.log('\n📊 Raw Response:');
  console.log(JSON.stringify(response, null, 2));

  console.log('\n🔍 Response Type:', typeof response);
  console.log('\n🔍 Response Keys:', Object.keys(response || {}));

  // Check if it matches expected format
  if (response && typeof response === 'object') {
    console.log('\n✅ Response structure:');
    console.log('  - Platform:', response.Platform || 'NOT FOUND');
    console.log('  - State:', response.State || 'NOT FOUND');
    console.log('  - DesignName:', response.DesignName || 'NOT FOUND');
    console.log('  - Status:', response.Status || 'NOT FOUND');
  }
} catch (error) {
  console.error('\n❌ Error executing Status.Get:', error.message);
  console.error('Full error:', error);
} finally {
  console.log('\n🧹 Closing connection...');
  client.disconnect();
  console.log('✅ Test complete');
}
