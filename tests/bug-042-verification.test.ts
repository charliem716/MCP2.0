import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { OfficialQRWCClient } from '../src/qrwc/officialClient';
import { QRWCClientAdapter } from '../src/mcp/qrwc/adapter';
import { createListComponentsTool } from '../src/mcp/tools/components';
import {
  createListControlsTool,
  createGetControlValuesTool,
  createSetControlValuesTool,
} from '../src/mcp/tools/controls';
import { createQueryCoreStatusTool } from '../src/mcp/tools/status';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe.skip('BUG-042: MCP tools return JSON verification - needs Q-SYS connection', () => {
  let config: any;
  let officialClient: OfficialQRWCClient;
  let adapter: QRWCClientAdapter;
  let tools: any;

  beforeAll(async () => {
    // Load configuration
    const configPath = join(__dirname, '../qsys-core.config.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf8'));
    config = configData.qsysCore;

    // Create and connect client
    officialClient = new OfficialQRWCClient({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      secure: config.secure ?? true,
      rejectUnauthorized: config.rejectUnauthorized ?? false,
      connectionTimeout: 10000,
    });

    console.log(`🔌 Connecting to Q-SYS Core at ${config.host}:${config.port}...`);
    await officialClient.connect();
    console.log('✅ Connected');

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create adapter and tools
    adapter = new QRWCClientAdapter(officialClient);
    tools = {
      list_components: createListComponentsTool(adapter),
      list_controls: createListControlsTool(adapter),
      get_control_values: createGetControlValuesTool(adapter),
      set_control_values: createSetControlValuesTool(adapter),
      query_core_status: createQueryCoreStatusTool(adapter),
    };
  }, 30000);

  afterAll(async () => {
    if (officialClient) {
      console.log('🔌 Disconnecting...');
      await officialClient.disconnect();
      console.log('✅ Disconnected');
    }
  });

  it('should return valid JSON from list_components', async () => {
    const ctx = {
      requestId: randomUUID(),
      toolName: 'list_components',
      startTime: Date.now(),
    };

    const result = await tools.list_components.execute(
      { requestId: ctx.requestId },
      ctx
    );

    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('text');

    const text = result.content[0].text;
    
    // Should parse as JSON without throwing
    const parsed = JSON.parse(text);
    
    // Should be an array
    expect(Array.isArray(parsed)).toBe(true);
    console.log(`✅ list_components returns valid JSON array with ${parsed.length} items`);
  });

  it('should return valid JSON from list_controls', async () => {
    const ctx = {
      requestId: randomUUID(),
      toolName: 'list_controls',
      startTime: Date.now(),
    };

    const result = await tools.list_controls.execute(
      { requestId: ctx.requestId, controlType: 'all' },
      ctx
    );

    const text = result.content[0].text;
    
    // Debug the response
    console.log('list_controls response:', text);
    
    const parsed = JSON.parse(text);
    
    // Check if it's an error response
    if (parsed.error) {
      console.log(`⚠️  list_controls returned error: ${parsed.message}`);
      expect(parsed).toHaveProperty('error', true);
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('toolName', 'list_controls');
    } else {
      expect(Array.isArray(parsed)).toBe(true);
      console.log(`✅ list_controls returns valid JSON array with ${parsed.length} items`);
    }
  });

  it('should return valid JSON from query_core_status', async () => {
    const ctx = {
      requestId: randomUUID(),
      toolName: 'query_core_status',
      startTime: Date.now(),
    };

    const result = await tools.query_core_status.execute(
      { requestId: ctx.requestId },
      ctx
    );

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBe(null);
    expect(parsed).toHaveProperty('Platform');
    expect(parsed).toHaveProperty('Version');
    console.log(`✅ query_core_status returns valid JSON object`);
  });

  it('should return valid JSON from get_control_values', async () => {
    // First get some controls
    const listCtx = {
      requestId: randomUUID(),
      toolName: 'list_controls',
      startTime: Date.now(),
    };

    const listResult = await tools.list_controls.execute(
      { requestId: listCtx.requestId, controlType: 'gain' },
      listCtx
    );

    const controls = JSON.parse(listResult.content[0].text);
    
    // Check if it's an error response
    if (controls.error) {
      console.log(`⚠️  list_controls returned error: ${controls.message}`);
      console.log('⚠️  Skipping get_control_values test due to list_controls error');
      return;
    }
    
    if (!Array.isArray(controls) || controls.length === 0) {
      console.log('⚠️  No gain controls available for get_control_values test');
      return;
    }

    const testControls = controls.slice(0, 3).map((c: any) => c.name || c.Name);

    const ctx = {
      requestId: randomUUID(),
      toolName: 'get_control_values',
      startTime: Date.now(),
    };

    const result = await tools.get_control_values.execute(
      { requestId: ctx.requestId, controls: testControls },
      ctx
    );

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    
    expect(Array.isArray(parsed)).toBe(true);
    console.log(`✅ get_control_values returns valid JSON array`);
  });

  it('should return valid JSON from set_control_values', async () => {
    // First get a control
    const listCtx = {
      requestId: randomUUID(),
      toolName: 'list_controls',
      startTime: Date.now(),
    };

    const listResult = await tools.list_controls.execute(
      { requestId: listCtx.requestId, controlType: 'gain' },
      listCtx
    );

    const controls = JSON.parse(listResult.content[0].text);
    
    // Check if it's an error response
    if (controls.error) {
      console.log(`⚠️  list_controls returned error: ${controls.message}`);
      console.log('⚠️  Skipping set_control_values test due to list_controls error');
      return;
    }
    
    if (!Array.isArray(controls) || controls.length === 0) {
      console.log('⚠️  No gain controls available for set_control_values test');
      return;
    }

    const testControl = controls[0].name || controls[0].Name;

    const ctx = {
      requestId: randomUUID(),
      toolName: 'set_control_values',
      startTime: Date.now(),
    };

    const result = await tools.set_control_values.execute(
      {
        requestId: ctx.requestId,
        controls: [{ name: testControl, value: 0 }],
      },
      ctx
    );

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    
    expect(Array.isArray(parsed)).toBe(true);
    console.log(`✅ set_control_values returns valid JSON array`);
  });
});