import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter';
import { MCPToolRegistry } from '../../src/mcp/handlers/index';

// Load environment variables
config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Skip these tests if no Q-SYS config is available
// These tests work but have cleanup issues with QRWC library's change group polling
// Run manually with: npm test tests/integration/live-mcp-tools-test.test.ts -- --forceExit
describe.skip('Live MCP Tools Integration Tests', () => {
  jest.setTimeout(30000); // 30 second timeout for integration tests
  
  let officialClient: any;
  let adapter: QRWCClientAdapter;
  let registry: MCPToolRegistry;
  let qsysConfig: any;

  beforeAll(async () => {
    // Load configuration
    const configPath = join(__dirname, '../../qsys-core.config.json');
    try {
      const configData = JSON.parse(readFileSync(configPath, 'utf8'));
      qsysConfig = configData.qsysCore;
    } catch (error) {
      console.error('Failed to load qsys-core.config.json:', error.message);
      console.error('Please run ./setup-env.sh first');
      return;
    }

    // Create and connect the official client first with logger
    const { OfficialQRWCClient } = await import('../../src/qrwc/officialClient');
    const { createLogger } = await import('../../src/shared/utils/logger');
    officialClient = new OfficialQRWCClient({
      host: qsysConfig.host,
      port: qsysConfig.port,
      connectionTimeout: 10000,
      enableAutoReconnect: false,
      logger: createLogger('test-live-mcp-tools'),
    });

    // Connect client
    console.log('🔌 Connecting to Q-SYS Core...');
    try {
      await officialClient.connect();
      console.log('✅ Connected successfully');
    } catch (error) {
      console.error('❌ Connection failed:', error.message);
      throw error;
    }

    // Wait for initial data
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create adapter and registry
    adapter = new QRWCClientAdapter(officialClient);
    registry = new MCPToolRegistry(adapter);

    // Initialize registry
    await registry.initialize();
  });

  afterAll(async () => {
    if (officialClient) {
      console.log('🔌 Disconnecting from Q-SYS Core...');
      try {
        if (adapter) {
          await adapter.disconnect();
        }
        officialClient.disconnect();
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
  });

  describe('Component Discovery', () => {
    it('should list all components', async () => {
      const result = await registry.callTool('list_components', {});
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      
      const components = JSON.parse(result.content[0].text);
      expect(Array.isArray(components)).toBe(true);
      expect(components.length).toBeGreaterThan(0);
      
      console.log(`Found ${components.length} components`);
    });

    it('should list components with filter', async () => {
      const result = await registry.callTool('list_components', {
        nameFilter: 'Gain',
        includeProperties: true,
      });
      
      const components = JSON.parse(result.content[0].text);
      expect(Array.isArray(components)).toBe(true);
      
      if (components.length > 0) {
        expect(components[0]).toHaveProperty('Name');
        expect(components[0]).toHaveProperty('Type');
        expect(components[0].Name).toMatch(/Gain/i);
      }
      
      console.log(`Found ${components.length} components matching 'Gain'`);
    });
  });

  describe('Control Discovery', () => {
    it('should list all controls', async () => {
      const result = await registry.callTool('list_controls', {
        controlType: 'all',
        includeMetadata: true,
      });
      
      const controls = JSON.parse(result.content[0].text);
      expect(Array.isArray(controls)).toBe(true);
      expect(controls.length).toBeGreaterThan(0);
      
      // Count by type
      const typeCount: Record<string, number> = {};
      controls.forEach((ctrl: any) => {
        const type = ctrl.Type || 'unknown';
        typeCount[type] = (typeCount[type] || 0) + 1;
      });
      
      console.log(`Found ${controls.length} controls total`);
      console.log('Control types:', typeCount);
    });

    it('should list gain controls only', async () => {
      const result = await registry.callTool('list_controls', {
        controlType: 'gain',
      });
      
      const controls = JSON.parse(result.content[0].text);
      expect(Array.isArray(controls)).toBe(true);
      
      console.log(`Found ${controls.length} gain controls`);
    });
  });

  describe('Core Status', () => {
    it('should query core status', async () => {
      const result = await registry.callTool('query_core_status', {});
      
      const status = JSON.parse(result.content[0].text);
      expect(status).toHaveProperty('Platform');
      expect(status).toHaveProperty('Version');
      expect(status).toHaveProperty('DesignName');
      expect(status).toHaveProperty('IsConnected');
      expect(status.IsConnected).toBe(true);
      
      console.log('Core Status:');
      console.log(`  Platform: ${status.Platform}`);
      console.log(`  Version: ${status.Version}`);
      console.log(`  Design: ${status.DesignName}`);
    });
  });

  describe('Control Values', () => {
    it('should get control values', async () => {
      // First, get some control names
      const listResult = await registry.callTool('list_controls', {
        controlType: 'gain',
      });
      
      const controls = JSON.parse(listResult.content[0].text);
      if (controls.length === 0) {
        console.log('No gain controls found to test');
        return;
      }
      
      // Get values for first 3 controls
      const testControls = controls.slice(0, 3).map((c: any) => c.name);
      
      const result = await registry.callTool('get_control_values', {
        controls: testControls,
      });
      
      const values = JSON.parse(result.content[0].text);
      expect(Array.isArray(values)).toBe(true);
      expect(values.length).toBeLessThanOrEqual(3);
      
      values.forEach((val: any) => {
        expect(val).toHaveProperty('name');
        expect(val).toHaveProperty('value');
      });
    });

    it('should set and verify control value', async () => {
      // Find a safe control to test
      const listResult = await registry.callTool('list_controls', {
        controlType: 'gain',
        includeMetadata: true,
      });
      
      const controls = JSON.parse(listResult.content[0].text);
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
      
      // Get current value
      const currentResult = await registry.callTool('get_control_values', {
        controls: [testControl.name],
      });
      
      const currentValue = JSON.parse(currentResult.content[0].text)[0];
      const originalValue = currentValue.value;
      
      // Set to midpoint
      const midpoint = (testControl.metadata.Min + testControl.metadata.Max) / 2;
      
      const setResult = await registry.callTool('set_control_values', {
        controls: [
          {
            name: testControl.name,
            value: midpoint,
            rampTime: 0.5,
          },
        ],
      });
      
      expect(setResult.content[0].text).toContain('Set control values');
      
      // Wait for ramp
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Verify change
      const verifyResult = await registry.callTool('get_control_values', {
        controls: [testControl.name],
      });
      
      const newValue = JSON.parse(verifyResult.content[0].text)[0];
      expect(Math.abs(newValue.value - midpoint)).toBeLessThan(0.1); // Allow small tolerance
      
      // Restore original value
      await registry.callTool('set_control_values', {
        controls: [
          {
            name: testControl.name,
            value: originalValue,
          },
        ],
      });
    });
  });
});