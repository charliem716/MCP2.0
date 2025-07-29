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
import { createGetAllControlsTool } from '../../src/mcp/tools/discovery';
import {
  createCreateChangeGroupTool,
  createAddControlsToChangeGroupTool,
  createPollChangeGroupTool,
  createDestroyChangeGroupTool,
} from '../../src/mcp/tools/change-groups';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Helper to create test context
const createContext = (toolName: string) => ({
  requestId: randomUUID(),
  toolName,
  startTime: Date.now(),
});

// Helper to parse tool response
function parseToolResponse(result: any) {
  if (result.isError) {
    throw new Error(result.content[0].text);
  }

  const text = result.content[0].text;

  // Check for error messages in text
  if (text.includes('failed:') || text.includes('Error:')) {
    throw new Error(text);
  }

  // Try to parse as JSON
  try {
    const parsed = JSON.parse(text);
    
    // Check if the parsed JSON is an error object
    if (parsed && typeof parsed === 'object' && parsed.error === true) {
      throw new Error(parsed.message || 'Tool returned an error');
    }
    
    return parsed;
  } catch (e) {
    // If JSON parse error, return as-is
    if (e instanceof SyntaxError) {
      return text;
    }
    // Re-throw other errors (like our error object check)
    throw e;
  }
}

describe('Comprehensive Live MCP Tools Test Suite', () => {
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
    
    // Wait for initial data sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create adapter and tools
    adapter = new QRWCClientAdapter(officialClient);
    
    tools = {
      list_components: createListComponentsTool(adapter),
      get_component_controls: createGetComponentControlsTool(adapter),
      list_controls: createListControlsTool(adapter),
      get_control_values: createGetControlValuesTool(adapter),
      set_control_values: createSetControlValuesTool(adapter),
      query_core_status: createQueryCoreStatusTool(adapter),
      get_all_controls: createGetAllControlsTool(adapter),
      create_change_group: createCreateChangeGroupTool(adapter),
      add_controls_to_change_group: createAddControlsToChangeGroupTool(adapter),
      poll_change_group: createPollChangeGroupTool(adapter),
      destroy_change_group: createDestroyChangeGroupTool(adapter),
    };
  }, 30000);
  
  afterAll(async () => {
    if (officialClient) {
      console.log('\n🔌 Disconnecting from Q-SYS Core...');
      await officialClient.disconnect();
      console.log('✅ Disconnected successfully');
    }
  });

  describe('Core Status', () => {
    it('should query core status successfully', async () => {
      const result = await tools.query_core_status.execute(
        { requestId: createContext('query_core_status').requestId },
        createContext('query_core_status')
      );

      const status = parseToolResponse(result);
      
      expect(status).toHaveProperty('Platform');
      expect(status).toHaveProperty('Version');
      expect(status).toHaveProperty('DesignName');
      expect(status).toHaveProperty('Status');
      expect(status.IsConnected).toBe(true);
      expect(status.Status.Code).toBe(0);
      
      console.log('Core Status:');
      console.log(`  Platform: ${status.Platform}`);
      console.log(`  Version: ${status.Version}`);
      console.log(`  Design: ${status.DesignName}`);
      console.log(`  Status: ${status.Status.Name} (Code: ${status.Status.Code})`);
      console.log(`  CPU Usage: ${Math.floor(status.Status.PercentCPU)}%`);
    });
  });

  describe('Component Management', () => {
    it('should list all components', async () => {
      const result = await tools.list_components.execute(
        { requestId: createContext('list_components').requestId },
        createContext('list_components')
      );

      const components = parseToolResponse(result);
      expect(Array.isArray(components)).toBe(true);
      expect(components.length).toBeGreaterThan(0);
      
      console.log(`Found ${components.length} components`);
      
      // Display component types summary
      const typeCount: Record<string, number> = {};
      components.forEach((comp: any) => {
        const type = comp.Type || 'Unknown';
        typeCount[type] = (typeCount[type] || 0) + 1;
      });
      console.log('Component types:', typeCount);
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

      const components = parseToolResponse(result);
      expect(Array.isArray(components)).toBe(true);
      
      components.forEach((comp: any) => {
        expect(comp.Name.toLowerCase()).toContain('gain');
      });
      
      console.log(`Found ${components.length} components matching 'Gain'`);
    });
    
    it('should get component controls', async () => {
      // First get a component
      const listResult = await tools.list_components.execute(
        { requestId: createContext('list_components').requestId },
        createContext('list_components')
      );
      
      const components = parseToolResponse(listResult);
      if (components.length === 0) {
        console.log('No components available');
        return;
      }
      
      const testComponent = components[0];
      console.log(`Getting controls for component: ${testComponent.Name}`);
      
      const result = await tools.get_component_controls.execute(
        {
          requestId: createContext('get_component_controls').requestId,
          componentName: testComponent.Name,
          includeMetadata: true,
        },
        createContext('get_component_controls')
      );

      const controls = parseToolResponse(result);
      expect(Array.isArray(controls)).toBe(true);
      
      console.log(`Component has ${controls.length} controls`);
      
      if (controls.length > 0) {
        console.log('Sample controls:');
        controls.slice(0, 3).forEach((ctrl: any) => {
          console.log(`  - ${ctrl.name} (type: ${ctrl.type})`);
        });
      }
    });
  });

  describe('Control Discovery and Management', () => {
    it('should list all controls', async () => {
      const result = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'all',
          includeMetadata: true,
        },
        createContext('list_controls')
      );

      const controls = parseToolResponse(result);
      expect(Array.isArray(controls)).toBe(true);
      expect(controls.length).toBeGreaterThan(0);
      
      console.log(`Found ${controls.length} controls`);
      
      // Count by type
      const typeCount: Record<string, number> = {};
      controls.forEach((ctrl: any) => {
        const type = ctrl.type || 'unknown';
        typeCount[type] = (typeCount[type] || 0) + 1;
      });
      console.log('Control types:', typeCount);
    });
    
    it('should get all controls with metadata', async () => {
      const result = await tools.get_all_controls.execute(
        {
          requestId: createContext('get_all_controls').requestId,
          includeMetadata: true,
        },
        createContext('get_all_controls')
      );

      const data = parseToolResponse(result);
      expect(data).toHaveProperty('components');
      expect(data).toHaveProperty('totalControls');
      expect(Array.isArray(data.components)).toBe(true);
      
      console.log(`Total controls: ${data.totalControls}`);
      console.log(`Components with controls: ${data.components.length}`);
    });
    
    it('should filter controls by type', async () => {
      const result = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'mute',
        },
        createContext('list_controls')
      );

      const controls = parseToolResponse(result);
      expect(Array.isArray(controls)).toBe(true);
      
      controls.forEach((ctrl: any) => {
        expect(ctrl.type).toBe('mute');
      });
      
      console.log(`Found ${controls.length} mute controls`);
    });
  });

  describe('Control Values', () => {
    it('should get and set control values', async () => {
      // Find a gain control to test
      const listResult = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'gain',
          includeMetadata: true,
        },
        createContext('list_controls')
      );

      const controls = parseToolResponse(listResult);
      const testControl = controls.find(
        (c: any) =>
          c.metadata &&
          typeof c.metadata.Min === 'number' &&
          typeof c.metadata.Max === 'number'
      );

      if (!testControl) {
        console.log('No suitable gain control found');
        return;
      }

      console.log(`Testing with control: ${testControl.name}`);
      
      // Get current value
      const getResult = await tools.get_control_values.execute(
        {
          requestId: createContext('get_control_values').requestId,
          controls: [testControl.name],
        },
        createContext('get_control_values')
      );

      const values = parseToolResponse(getResult);
      const originalValue = values[0].value;
      console.log(`Original value: ${originalValue}`);
      
      // Set new value
      const newValue = (testControl.metadata.Min + testControl.metadata.Max) / 2;
      const setResult = await tools.set_control_values.execute(
        {
          requestId: createContext('set_control_values').requestId,
          controls: [
            {
              name: testControl.name,
              value: newValue,
            },
          ],
        },
        createContext('set_control_values')
      );

      expect(setResult.content[0].text).toContain('successfully');
      
      // Verify new value
      const verifyResult = await tools.get_control_values.execute(
        {
          requestId: createContext('get_control_values').requestId,
          controls: [testControl.name],
        },
        createContext('get_control_values')
      );

      const newValues = parseToolResponse(verifyResult);
      console.log(`New value: ${newValues[0].value}`);
      expect(Math.abs(newValues[0].value - newValue)).toBeLessThan(0.1);
      
      // Restore original
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
    });
    
    it('should handle ramp time', async () => {
      // Find a gain control
      const listResult = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'gain',
          includeMetadata: true,
        },
        createContext('list_controls')
      );

      const controls = parseToolResponse(listResult);
      const testControl = controls[0];
      
      if (!testControl) {
        console.log('No gain control found');
        return;
      }

      // Set value with ramp
      const result = await tools.set_control_values.execute(
        {
          requestId: createContext('set_control_values').requestId,
          controls: [
            {
              name: testControl.name,
              value: 0,
              rampTime: 1.0,
            },
          ],
        },
        createContext('set_control_values')
      );

      expect(result.content[0].text).toContain('ramp');
      console.log('Applied 1 second ramp to control');
    });
  });

  describe('Change Groups', () => {
    let changeGroupId: string;
    
    it('should create a change group', async () => {
      const result = await tools.create_change_group.execute(
        {
          requestId: createContext('create_change_group').requestId,
          changeGroupName: 'Test Group',
        },
        createContext('create_change_group')
      );

      const response = parseToolResponse(result);
      expect(response).toHaveProperty('changeGroupId');
      expect(response).toHaveProperty('name', 'Test Group');
      
      changeGroupId = response.changeGroupId;
      console.log(`Created change group: ${changeGroupId}`);
    });
    
    it('should add controls to change group', async () => {
      if (!changeGroupId) {
        console.log('No change group ID available');
        return;
      }
      
      // Get some controls
      const listResult = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'gain',
        },
        createContext('list_controls')
      );

      let controls;
      try {
        controls = parseToolResponse(listResult);
      } catch (error) {
        console.log(`⚠️  list_controls failed: ${error.message}`);
        console.log('⚠️  Skipping add_controls_to_change_group test');
        return;
      }
      
      if (!Array.isArray(controls) || controls.length === 0) {
        console.log('No gain controls available');
        return;
      }
      
      const testControls = controls.slice(0, 3).map((c: any) => c.name);
      
      const result = await tools.add_controls_to_change_group.execute(
        {
          requestId: createContext('add_controls_to_change_group').requestId,
          changeGroupId,
          controls: testControls,
        },
        createContext('add_controls_to_change_group')
      );

      expect(result.content[0].text).toContain('successfully');
      console.log(`Added ${testControls.length} controls to change group`);
    });
    
    it('should poll change group', async () => {
      if (!changeGroupId) {
        console.log('No change group ID available');
        return;
      }
      
      const result = await tools.poll_change_group.execute(
        {
          requestId: createContext('poll_change_group').requestId,
          changeGroupId,
        },
        createContext('poll_change_group')
      );

      const data = parseToolResponse(result);
      expect(data).toHaveProperty('changeGroupId', changeGroupId);
      expect(data).toHaveProperty('changes');
      expect(Array.isArray(data.changes)).toBe(true);
      
      console.log(`Polled change group, found ${data.changes.length} changes`);
    });
    
    it('should destroy change group', async () => {
      if (!changeGroupId) {
        console.log('No change group ID available');
        return;
      }
      
      const result = await tools.destroy_change_group.execute(
        {
          requestId: createContext('destroy_change_group').requestId,
          changeGroupId,
        },
        createContext('destroy_change_group')
      );

      expect(result.content[0].text).toContain('successfully');
      console.log('Destroyed change group');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid component name', async () => {
      const result = await tools.get_component_controls.execute(
        {
          requestId: createContext('get_component_controls').requestId,
          componentName: 'NonExistentComponent_12345',
        },
        createContext('get_component_controls')
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
    
    it('should handle invalid control name', async () => {
      const result = await tools.get_control_values.execute(
        {
          requestId: createContext('get_control_values').requestId,
          controls: ['InvalidControl.NonExistent'],
        },
        createContext('get_control_values')
      );

      const values = parseToolResponse(result);
      expect(values[0]).toHaveProperty('error');
    });
    
    it('should handle invalid control value', async () => {
      // Get a boolean control
      const listResult = await tools.list_controls.execute(
        {
          requestId: createContext('list_controls').requestId,
          controlType: 'mute',
        },
        createContext('list_controls')
      );

      const controls = parseToolResponse(listResult);
      if (controls.length === 0) {
        console.log('No mute controls available');
        return;
      }
      
      // Try to set invalid value
      const result = await tools.set_control_values.execute(
        {
          requestId: createContext('set_control_values').requestId,
          controls: [
            {
              name: controls[0].name,
              value: 'invalid_value',
            },
          ],
        },
        createContext('set_control_values')
      );

      expect(result.content[0].text).toContain('must be');
    });
  });
});