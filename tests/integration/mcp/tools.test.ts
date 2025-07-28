import { MCPToolRegistry } from '../../../src/mcp/handlers/index.js';
import type { QRWCClientInterface } from '../../../src/mcp/qrwc/adapter.js';
import { globalLogger } from '../../../src/shared/utils/logger.js';

jest.mock('../../../src/shared/utils/logger.js', () => ({
  globalLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('MCP Tools Integration Tests', () => {
  let mockQrwcClient: jest.Mocked<QRWCClientInterface>;
  let registry: MCPToolRegistry;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
    };

    registry = new MCPToolRegistry(mockQrwcClient);
    await registry.initialize();
  });

  describe('Component and Control Discovery Workflow', () => {
    it('should discover components and their controls', async () => {
      // Step 1: List all components
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          {
            Name: 'MainGain',
            Type: 'gain',
            Properties: [
              { Name: 'gain', Value: '0' },
              { Name: 'mute', Value: 'false' },
            ],
          },
          {
            Name: 'OutputMixer',
            Type: 'mixer',
            Properties: [
              { Name: 'levels', Value: '[0, -6, -12]' },
            ],
          },
        ],
      });

      const componentsResult = await registry.callTool('list_components', {
        includeProperties: true,
      });

      if (componentsResult.isError) {
        console.error('Component result error:', componentsResult.content[0].text);
      }
      expect(componentsResult.isError).toBe(false);
      const components = JSON.parse(componentsResult.content[0].text!);
      expect(components).toHaveLength(2);
      expect(components[0].Name).toBe('MainGain');
      expect(components[1].Name).toBe('OutputMixer');

      // Step 2: List controls for a specific component
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Name: 'MainGain',
          Controls: [
            { Name: 'gain', Value: 0, String: '0.0 dB', Position: 0.5 },
            {
              Name: 'mute',
              Value: false,
              String: 'unmuted',
              Position: 0,
            },
          ],
        },
      });

      const controlsResult = await registry.callTool('list_controls', {
        component: 'MainGain',
        includeMetadata: true,
      });

      expect(controlsResult.isError).toBe(false);
      const controls = JSON.parse(controlsResult.content[0].text!);
      expect(controls).toHaveLength(2);
      expect(controls[0].name).toBe('gain');
      expect(controls[0].component).toBe('MainGain');
      expect(controls[1].name).toBe('mute');
      expect(controls[1].component).toBe('MainGain');
    });
  });

  describe('Control Manipulation Workflow', () => {
    it('should get and set control values in sequence', async () => {
      // Step 1: Get current control values
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          {
            Name: 'MainGain.gain',
            Value: -10,
            String: '-10.0 dB',
            Position: 0.3,
          },
          {
            Name: 'MainGain.mute',
            Value: false,
            String: 'unmuted',
            Position: 0,
          },
        ],
      });

      const getResult = await registry.callTool('get_control_values', {
        controls: ['MainGain.gain', 'MainGain.mute'],
      });

      expect(getResult.isError).toBe(false);
      const values = JSON.parse(getResult.content[0].text!);
      expect(values[0].name).toBe('MainGain.gain');
      expect(values[0].value).toBe(-10);

      // Step 2: Set new control values
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ id: 'control-1' }) // For gain
        .mockResolvedValueOnce({ id: 'control-2' }); // For mute

      const setResult = await registry.callTool('set_control_values', {
        controls: [
          { name: 'MainGain.gain', value: 0 },
          { name: 'MainGain.mute', value: true },
        ],
      });

      expect(setResult.isError).toBe(false);
      const setResults = JSON.parse(setResult.content[0].text!);
      expect(setResults).toHaveLength(2);
      expect(setResults.filter((r: any) => r.success).length).toBe(2);

      // Verify correct QRWC commands were sent
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.objectContaining({
          Name: 'MainGain',
          Controls: expect.arrayContaining([
            expect.objectContaining({ Name: 'gain', Value: 0 }),
            expect.objectContaining({ Name: 'mute', Value: 1 }), // Q-SYS expects 0/1 for booleans
          ]),
        })
      );

      // Step 3: Verify the changes
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'MainGain.gain', Value: 0, String: '0.0 dB', Position: 0.5 },
          { Name: 'MainGain.mute', Value: true, String: 'muted', Position: 1 },
        ],
      });

      const verifyResult = await registry.callTool('get_control_values', {
        controls: ['MainGain.gain', 'MainGain.mute'],
      });

      expect(verifyResult.isError).toBe(false);
      const verifiedValues = JSON.parse(verifyResult.content[0].text!);
      expect(verifiedValues[0].name).toBe('MainGain.gain');
      expect(verifiedValues[0].value).toBe(0);
      expect(verifiedValues[1].name).toBe('MainGain.mute');
      expect(verifiedValues[1].value).toBe(true);
    });

    it('should handle control ramping', async () => {
      // Set control with ramp time
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ id: 'ramp-1' });

      const result = await registry.callTool('set_control_values', {
        controls: [{ name: 'MainGain.gain', value: -20, ramp: 2.5 }],
      });

      expect(result.isError).toBe(false);
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.objectContaining({
          Name: 'MainGain',
          Controls: [{ Name: 'gain', Value: -20, Ramp: 2.5 }],
        })
      );
    });
  });

  describe('System Status Monitoring', () => {
    it('should query core status with all details', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          DesignName: 'Main Theater',
          IsRedundant: false,
          IsEmulator: false,
          Status: {
            Code: 0,
            String: 'OK',
          },
          Platform: 'Core 110f',
          DesignCode: 'ABCD1234',
          Network: {
            LAN_A: {
              IP: '192.168.1.100',
              Netmask: '255.255.255.0',
              Gateway: '192.168.1.1',
            },
          },
          Performance: {
            CPU: 45.2,
            Memory: 62.8,
            Temperature: 55.3,
          },
        },
      });

      const result = await registry.callTool('query_core_status', {
        includeDetails: true,
        includeNetworkInfo: true,
        includePerformance: true,
      });

      expect(result.isError).toBe(false);
      const statusText = result.content[0].text!;
      
      // Parse the JSON response
      const status = JSON.parse(statusText);
      
      // Check for expected values in the JSON structure
      expect(status.DesignName).toBe('Main Theater');
      expect(status.Platform).toBe('Core 110f');
      expect(status.networkInfo.ipAddress).toBe('192.168.1.100');
      expect(status.performanceMetrics.cpuUsage).toBe(45.2);
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should handle disconnected client gracefully', async () => {
      mockQrwcClient.isConnected.mockReturnValue(false);

      const result = await registry.callTool('list_components', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not connected');
    });

    it('should handle partial failures in batch operations', async () => {
      // First control succeeds, second fails
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ id: 'success-1' })
        .mockRejectedValueOnce(new Error('Control not found'));

      const result = await registry.callTool('set_control_values', {
        controls: [
          { name: 'MainGain.gain', value: 0 },
          { name: 'InvalidControl', value: 1 },
        ],
        validate: false, // Disable validation to test partial failures
      });

      expect(result.isError).toBe(true);
      const partialResults = JSON.parse(result.content[0].text!);
      expect(partialResults).toHaveLength(2);
      expect(partialResults.filter((r: any) => r.success).length).toBe(1);
      expect(partialResults.filter((r: any) => !r.success).length).toBe(1);
    });

    it('should validate parameters before execution', async () => {
      // Invalid control type
      const result = await registry.callTool('list_controls', {
        controlType: 'invalid_type',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid');
    });
  });

  describe('Complex Workflow Integration', () => {
    it('should handle a complete audio setup workflow', async () => {
      // Step 1: Query system status
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Platform: 'Q-SYS Core',
          Version: '1.0.0',
          DesignName: 'Conference Room A',
          Status: { Code: 0, String: 'OK' },
          State: 'Active',
          IsConnected: true
        },
      });

      const statusResult = await registry.callTool('query_core_status', {});
      const statusData = JSON.parse(statusResult.content[0].text!);
      expect(statusData.coreInfo.designName).toBe('Conference Room A');

      // Step 2: Find all gain components
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'MicGain1', Type: 'gain', Properties: [] },
          { Name: 'MicGain2', Type: 'gain', Properties: [] },
          { Name: 'ProgramGain', Type: 'gain', Properties: [] },
          { Name: 'Compressor1', Type: 'compressor', Properties: [] },
        ],
      });

      const componentsResult = await registry.callTool('list_components', {
        filter: 'Gain',
      });
      const filteredComponents = JSON.parse(componentsResult.content[0].text!);
      expect(filteredComponents).toHaveLength(3); // Filtered

      // Step 3: Mute all microphones
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ id: 'mute-1' })
        .mockResolvedValueOnce({ id: 'mute-2' });

      const muteResult = await registry.callTool('set_control_values', {
        controls: [
          { name: 'MicGain1.mute', value: true },
          { name: 'MicGain2.mute', value: true },
        ],
      });
      const muteResults = JSON.parse(muteResult.content[0].text!);
      expect(muteResults).toHaveLength(2);
      expect(muteResults.filter((r: any) => r.success).length).toBe(2);

      // Step 4: Set program level with ramp
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ id: 'program-1' });

      const levelResult = await registry.callTool('set_control_values', {
        controls: [{ name: 'ProgramGain.gain', value: -6, ramp: 1.0 }],
      });
      const levelResults = JSON.parse(levelResult.content[0].text!);
      expect(levelResults).toHaveLength(1);
      expect(levelResults[0].success).toBe(true);
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent tool calls', async () => {
      // Setup different responses for concurrent calls
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ result: [] }) // components
        .mockResolvedValueOnce({ result: [] }) // controls
        .mockResolvedValueOnce({ 
          result: { 
            Platform: 'Q-SYS Core',
            Version: '1.0.0',
            DesignName: 'Test Design',
            Status: { Code: 0, String: 'OK' },
            State: 'Active',
            IsConnected: true
          } 
        }); // status

      const [components, controls, status] = await Promise.all([
        registry.callTool('list_components', {}),
        registry.callTool('list_controls', {}),
        registry.callTool('query_core_status', {}),
      ]);

      expect(components.isError).toBe(false);
      expect(controls.isError).toBe(false);
      expect(status.isError).toBe(false);
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid sequential calls', async () => {
      const controlNames = Array.from({ length: 10 }, (_, i) => `Control${i}`);

      // Mock responses for all calls
      mockQrwcClient.sendCommand.mockImplementation(method => {
        if (method === 'Control.Get') {
          return Promise.resolve({
            result: controlNames.map(name => ({
              Name: name,
              Value: Math.random(),
              String: 'test',
            })),
          });
        }
        return Promise.resolve({});
      });

      // Make rapid sequential calls
      const results = [];
      for (const name of controlNames) {
        const result = await registry.callTool('get_control_values', {
          controls: [name],
        });
        results.push(result);
      }

      expect(results).toHaveLength(10);
      expect(results.every(r => !r.isError)).toBe(true);
    });
  });
});
