import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OfficialQRWCClient } from '../../../src/qrwc/officialClient';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe.skip('Q-SYS Status.Get Test - requires live Q-SYS connection', () => {
  jest.setTimeout(60000); // 60 second timeout for integration tests
  let client: OfficialQRWCClient;
  let config: any;

  beforeAll(async () => {
    // Load configuration
    const configPath = join(__dirname, '../../../qsys-core.config.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf8'));
    config = configData.qsysCore;

    // Create and connect client
    client = new OfficialQRWCClient({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      secure: config.secure ?? true,
      rejectUnauthorized: config.rejectUnauthorized ?? false,
      connectionTimeout: 10000,
    });

    console.log(`🔌 Connecting to Q-SYS Core at ${config.host}:${config.port}...`);
    await client.connect();
    console.log('✅ Connected');
  }, 30000);

  afterAll(async () => {
    if (client) {
      console.log('🔌 Disconnecting...');
      await client.disconnect();
      console.log('✅ Disconnected');
    }
  });

  it('should get status from Q-SYS Core', async () => {
    console.log('🧪 Testing Status.Get Command');
    console.log('==================================================');
    
    try {
      console.log('\n📡 Sending Status.Get command...');
      const response = await client.sendRawCommand('Status.Get', {});
    
      console.log('\n📊 Raw Response:');
      console.log(JSON.stringify(response, null, 2));
    
      console.log('\n🔍 Response Type:', typeof response);
      console.log('\n🔍 Response Keys:', Object.keys(response || {}));
    
      // Check if it matches expected format
      expect(response).toBeDefined();
      expect(typeof response).toBe('object');
      
      if (response && typeof response === 'object') {
        console.log('\n✅ Response structure:');
        console.log('  - Platform:', response.Platform || 'NOT FOUND');
        console.log('  - State:', response.State || 'NOT FOUND');
        console.log('  - DesignName:', response.DesignName || 'NOT FOUND');
        console.log('  - Status:', response.Status || 'NOT FOUND');
        
        // Add assertions
        expect(response).toHaveProperty('Platform');
        expect(response).toHaveProperty('DesignName');
        expect(response).toHaveProperty('Status');
      }
    } catch (error: any) {
      console.error('\n❌ Error executing Status.Get:', error.message);
      console.error('Full error:', error);
      throw error;
    }
  });
});