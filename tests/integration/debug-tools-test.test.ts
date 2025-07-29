import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { OfficialQRWCClient } from '../../src/qrwc/officialClient';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter';
import { createListComponentsTool } from '../../src/mcp/tools/components';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Debug MCP Tools Test', () => {
  jest.setTimeout(30000); // 30 second timeout for integration tests
  let config: any;
  
  beforeAll(() => {
    // Load configuration
    const configPath = join(__dirname, '../../qsys-core.config.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf8'));
    config = configData.qsysCore;
  });

  it('should list components and return valid JSON', async () => {
    console.log('🧪 Debug MCP Tools Test');
    console.log(`📍 Target: ${config.host}:${config.port}`);

    // Create and connect client
    const officialClient = new OfficialQRWCClient({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      secure: config.secure ?? true,
      rejectUnauthorized: config.rejectUnauthorized ?? false,
      connectionTimeout: 10000,
    });

    try {
      console.log('\n🔌 Connecting...');
      await officialClient.connect();
      console.log('✅ Connected');

      // Wait for sync
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create adapter and tool
      const adapter = new QRWCClientAdapter(officialClient);
      const listComponentsTool = createListComponentsTool(adapter);

      // Test list_components
      console.log('\n📋 Testing list_components...');
      const ctx = {
        requestId: randomUUID(),
        toolName: 'list_components',
        startTime: Date.now(),
      };

      const result = await listComponentsTool.execute(
        {
          requestId: ctx.requestId,
        },
        ctx
      );

      // Verify result structure
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      console.log('\n📄 Content type:', typeof result.content[0].text);
      console.log('📏 Content length:', result.content[0].text.length);
      console.log(
        '🔤 First 200 chars:',
        result.content[0].text.substring(0, 200)
      );

      // Parse and verify JSON
      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      console.log('\n✅ Successfully parsed as JSON');
      console.log('🔢 Component count:', parsed.length);
      
      if (parsed.length > 0) {
        console.log('📋 First component:', JSON.stringify(parsed[0], null, 2));
        
        // Verify component structure
        expect(parsed[0]).toHaveProperty('Name');
        expect(parsed[0]).toHaveProperty('Type');
        expect(parsed[0]).toHaveProperty('Properties');
        // Properties can be either an array or an object
        expect(parsed[0].Properties).toBeDefined();
      }
    } finally {
      console.log('\n🔌 Disconnecting...');
      await officialClient.disconnect();
      console.log('✅ Disconnected');
    }
  }, 30000); // 30 second timeout
});