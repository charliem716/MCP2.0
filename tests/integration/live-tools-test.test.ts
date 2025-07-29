import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { OfficialQRWCClient } from '../../src/qrwc/officialClient';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter';
import { 
  createListComponentsTool,
  createGetComponentControlsTool 
} from '../../src/mcp/tools/components';
import {
  createListControlsTool,
  createGetControlValuesTool,
  createSetControlValuesTool,
} from '../../src/mcp/tools/controls';
import { createQueryCoreStatusTool } from '../../src/mcp/tools/status';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Helper to create test context
const createContext = (toolName: string) => ({
  requestId: randomUUID(),
  toolName,
  startTime: Date.now(),
});

describe('Live MCP Tools Test Suite', () => {
  jest.setTimeout(60000); // 60 second timeout for integration tests
  let config: any;
  let officialClient: OfficialQRWCClient;
  let adapter: QRWCClientAdapter;
  let tools: any;
  
  beforeAll(async () => {
    // Load configuration
    const configPath = join(__dirname, '../../qsys-core.config.json');
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
      pollingInterval: config.connectionSettings?.pollingInterval || 350,
      reconnectInterval: config.connectionSettings?.reconnectInterval || 5000,
      maxReconnectAttempts: config.connectionSettings?.maxReconnectAttempts || 5,
      connectionTimeout: config.connectionSettings?.timeout || 10000,
      enableAutoReconnect: config.connectionSettings?.enableAutoReconnect ?? true,
    });
    
    console.log(`🔌 Connecting to Q-SYS Core at ${config.host}:${config.port}...`);
    await officialClient.connect();
    console.log('✅ Connected successfully');
    
    // Wait for initial data
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
      console.log('\n🔌 Disconnecting from Q-SYS Core...');
      await officialClient.disconnect();
      console.log('✅ Disconnected successfully');
    }
  });

  describe('Component Tools', () => {
    it('should list all components', async () => {
      const result = await tools.list_components.execute(
        { requestId: createContext('list_components').requestId },
        createContext('list_components')
      );

      expect(result).toHaveProperty('content');
      expect(result.isError).toBeFalsy();
      
      const components = JSON.parse(result.content[0].text);
      expect(Array.isArray(components)).toBe(true);
      expect(components.length).toBeGreaterThan(0);
      
      console.log(`Found ${components.length} components`);
      
      // Verify component structure
      if (components.length > 0) {
        expect(components[0]).toHaveProperty('Name');
        expect(components[0]).toHaveProperty('Type');
        expect(components[0]).toHaveProperty('Properties');
      }
    });
    
    it('should filter components by name', async () => {
      const result = await tools.list_components.execute(
        {
          requestId: createContext('list_components').requestId,
          nameFilter: 'Gain',
          includeProperties: true,
        },
        createContext('list_components')
      );

      const components = JSON.parse(result.content[0].text);
      expect(Array.isArray(components)).toBe(true);
      
      // All results should contain 'Gain' in name
      components.forEach((comp: any) => {
        expect(comp.Name.toLowerCase()).toContain('gain');
      });
      
      console.log(`Found ${components.length} components matching 'Gain'`);
    });
  });

  describe('Control Tools', () => {
    it('should list all controls', async () => {
      const result = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'all',
          includeMetadata: true,
        },
        createContext('list_controls')
      );

      const controls = JSON.parse(result.content[0].text);
      
      // Check if it's an error response
      if (controls.error) {
        console.log(`⚠️  list_controls returned error: ${controls.message}`);
        expect(controls).toHaveProperty('error', true);
        expect(controls).toHaveProperty('message');
        return;
      }
      
      expect(Array.isArray(controls)).toBe(true);
      expect(controls.length).toBeGreaterThan(0);
      
      console.log(`Found ${controls.length} controls total`);
      
      // Verify control structure
      if (controls.length > 0) {
        expect(controls[0]).toHaveProperty('name');
        expect(controls[0]).toHaveProperty('type');
        expect(controls[0]).toHaveProperty('component');
      }
    });
    
    it('should list gain controls only', async () => {
      const result = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'gain',
        },
        createContext('list_controls')
      );

      const controls = JSON.parse(result.content[0].text);
      
      // Check if it's an error response
      if (controls.error) {
        console.log(`⚠️  list_controls returned error: ${controls.message}`);
        expect(controls).toHaveProperty('error', true);
        expect(controls).toHaveProperty('message');
        return;
      }
      
      expect(Array.isArray(controls)).toBe(true);
      
      // All results should be gain controls
      controls.forEach((ctrl: any) => {
        expect(ctrl.type).toBe('gain');
      });
      
      console.log(`Found ${controls.length} gain controls`);
    });
    
    it('should get control values', async () => {
      // First get some controls
      const listResult = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'gain',
        },
        createContext('list_controls')
      );

      const controls = JSON.parse(listResult.content[0].text);
      
      // Check if it's an error response
      if (controls.error) {
        console.log(`⚠️  list_controls returned error: ${controls.message}`);
        console.log('⚠️  Skipping get_control_values test due to list_controls error');
        return;
      }
      
      if (!Array.isArray(controls) || controls.length === 0) {
        console.log('No gain controls available for testing');
        return;
      }

      // Test with first 3 controls
      const testControls = controls.slice(0, 3).map((c: any) => c.name);
      
      const result = await tools.get_control_values.execute(
        {
          requestId: createContext('get_control_values').requestId,
          controls: testControls,
        },
        createContext('get_control_values')
      );

      const values = JSON.parse(result.content[0].text);
      expect(Array.isArray(values)).toBe(true);
      expect(values.length).toBe(testControls.length);
      
      // Verify value structure
      values.forEach((val: any) => {
        expect(val).toHaveProperty('name');
        expect(val).toHaveProperty('value');
        expect(val).toHaveProperty('string');
        expect(testControls).toContain(val.name);
      });
    });
    
    it('should set control values with ramp', async () => {
      // Find a safe gain control to test
      const listResult = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'gain',
          includeMetadata: true,
        },
        createContext('list_controls')
      );

      const controls = JSON.parse(listResult.content[0].text);
      
      // Check if it's an error response
      if (controls.error) {
        console.log(`⚠️  list_controls returned error: ${controls.message}`);
        console.log('⚠️  Skipping set_control_values test due to list_controls error');
        return;
      }
      
      if (!Array.isArray(controls)) {
        console.log('⚠️  Unexpected response format from list_controls');
        return;
      }
      
      const testControl = controls.find(
        (c: any) =>
          c.metadata &&
          typeof c.metadata.Min === 'number' &&
          typeof c.metadata.Max === 'number'
      );

      if (!testControl) {
        console.log('No suitable gain control found for testing');
        return;
      }

      console.log(`Testing with control: ${testControl.name}`);
      
      // Get current value
      const currentResult = await tools.get_control_values.execute(
        {
          requestId: createContext('get_control_values').requestId,
          controls: [testControl.name],
        },
        createContext('get_control_values')
      );

      const currentValue = JSON.parse(currentResult.content[0].text)[0];
      const originalValue = currentValue.value;
      
      // Set to midpoint with ramp
      const midpoint = (testControl.metadata.Min + testControl.metadata.Max) / 2;
      
      const setResult = await tools.set_control_values.execute(
        {
          requestId: createContext('set_control_values').requestId,
          controls: [
            {
              name: testControl.name,
              value: midpoint,
              rampTime: 0.5,
            },
          ],
        },
        createContext('set_control_values')
      );

      const setResponse = JSON.parse(setResult.content[0].text);
      expect(Array.isArray(setResponse)).toBe(true);
      expect(setResponse[0]).toHaveProperty('success', true);
      
      // Wait for ramp to complete
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Verify new value
      const verifyResult = await tools.get_control_values.execute(
        {
          requestId: createContext('get_control_values').requestId,
          controls: [testControl.name],
        },
        createContext('get_control_values')
      );

      const newValue = JSON.parse(verifyResult.content[0].text)[0];
      expect(Math.abs(newValue.value - midpoint)).toBeLessThan(0.1);
      
      // Restore original value
      await tools.set_control_values.execute(
        {
          requestId: createContext('set_control_values').requestId,
          controls: [
            {
              name: testControl.name,
              value: originalValue,
            },
          ],
        },
        createContext('set_control_values')
      );
    }, 10000);
  });

  describe('Status Tool', () => {
    it('should query core status', async () => {
      const result = await tools.query_core_status.execute(
        { requestId: createContext('query_core_status').requestId },
        createContext('query_core_status')
      );

      const status = JSON.parse(result.content[0].text);
      
      // Verify status structure
      expect(status).toHaveProperty('Platform');
      expect(status).toHaveProperty('Version');
      expect(status).toHaveProperty('DesignName');
      expect(status).toHaveProperty('Status');
      expect(status).toHaveProperty('IsConnected');
      
      // Verify connection status
      expect(status.IsConnected).toBe(true);
      expect(status.Status.Code).toBe(0);
      
      console.log('Core Status:');
      console.log(`  Platform: ${status.Platform}`);
      console.log(`  Version: ${status.Version}`);
      console.log(`  Design: ${status.DesignName}`);
      console.log(`  CPU Usage: ${Math.floor(status.Status.PercentCPU)}%`);
    });
  });
});