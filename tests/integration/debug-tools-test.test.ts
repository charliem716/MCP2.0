import { describe, it, expect, jest, beforeAll, afterEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { OfficialQRWCClient } from '../../src/qrwc/officialClient';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter';
import { createListComponentsTool } from '../../src/mcp/tools/components';

const __dirname = dirname(fileURLToPath(import.meta.url));

// This test works but has cleanup issues with QRWC library's change group polling
// Run manually with: npm test tests/integration/debug-tools-test.test.ts -- --forceExit
describe.skip('Debug MCP Tools Test', () => {
  jest.setTimeout(30000); // 30 second timeout for integration tests
  let config: any;
  let officialClient: OfficialQRWCClient | null = null;
  let adapter: QRWCClientAdapter | null = null;
  
  beforeAll(() => {
    // Load configuration
    const configPath = join(__dirname, '../../qsys-core.config.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf8'));
    config = configData.qsysCore;
  });

  afterEach(async () => {
    // Clean up any connections
    if (adapter) {
      try {
        await adapter.disconnect();
      } catch (error) {
        console.error('Adapter disconnect error:', error);
      }
      adapter = null;
    }
    
    if (officialClient) {
      try {
        officialClient.disconnect();
      } catch (error) {
        console.error('Client disconnect error:', error);
      }
      officialClient = null;
    }
    
    // Force exit any hanging operations
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  it('should list components and return valid JSON', async () => {
    console.log('🧪 Debug MCP Tools Test');
    console.log(`📍 Target: ${config.host}:${config.port}`);

    // Create and connect client with test logger
    const { createLogger } = await import('../../src/shared/utils/logger');
    officialClient = new OfficialQRWCClient({
      host: config.host,
      port: config.port,
      connectionTimeout: 10000,
      enableAutoReconnect: false, // Disable auto-reconnect for tests
      logger: createLogger('test-debug-tools'),
    });

    console.log('\n🔌 Connecting...');
    await officialClient.connect();
    console.log('✅ Connected');

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create adapter with specific test config
    adapter = new QRWCClientAdapter(officialClient);
    
    // Create tool WITHOUT the adapter to avoid change group creation
    const listComponentsTool = createListComponentsTool({
      isConnected: () => true,
      sendCommand: async (command: string, params?: any) => {
        // Direct command execution without change groups
        return officialClient.sendCommand(command, params);
      }
    } as any);

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

    console.log('\n✅ Test completed successfully');
  });
});