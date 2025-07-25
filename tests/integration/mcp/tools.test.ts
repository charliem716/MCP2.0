import { MCPToolRegistry } from '../../../src/mcp/handlers/index.js';
import type { QRWCClientInterface } from '../../../src/mcp/qrwc/adapter.js';
import { globalLogger } from '../../../src/shared/utils/logger.js';

jest.mock('../../../src/shared/utils/logger.js', () => ({
  globalLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

describe('MCP Tools Integration Tests', () => {
  let mockQrwcClient: jest.Mocked<QRWCClientInterface>;
  let registry: MCPToolRegistry;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn()
    };

    registry = new MCPToolRegistry(mockQrwcClient);
    await registry.initialize();
  });

  describe('Component and Control Discovery Workflow', () => {
    it('should discover components and their controls', async () => {
      // Step 1: List all components
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'MainGain', Type: 'gain', Properties: { gain: 0, mute: false } },
          { Name: 'OutputMixer', Type: 'mixer', Properties: { levels: [0, -6, -12] } }
        ]
      });

      const componentsResult = await registry.callTool('list_components', {
        includeProperties: true
      });

      expect(componentsResult.isError).toBe(false);
      expect(componentsResult.content[0].text).toContain('Found 2 components');
      expect(componentsResult.content[0].text).toContain('MainGain');
      expect(componentsResult.content[0].text).toContain('OutputMixer');

      // Step 2: List controls for a specific component
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'MainGain.gain', Value: 0, String: '0.0 dB', Position: 0.5 },
          { Name: 'MainGain.mute', Value: false, String: 'unmuted', Position: 0 }
        ]
      });

      const controlsResult = await registry.callTool('list_controls', {
        component: 'MainGain',
        includeMetadata: true
      });

      expect(controlsResult.isError).toBe(false);
      expect(controlsResult.content[0].text).toContain('Found 2 controls');
      expect(controlsResult.content[0].text).toContain('MainGain.gain');
      expect(controlsResult.content[0].text).toContain('MainGain.mute');
    });
  });

  describe('Control Manipulation Workflow', () => {
    it('should get and set control values in sequence', async () => {
      // Step 1: Get current control values
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'MainGain.gain', Value: -10, String: '-10.0 dB', Position: 0.3 },
          { Name: 'MainGain.mute', Value: false, String: 'unmuted', Position: 0 }
        ]
      });

      const getResult = await registry.callTool('get_control_values', {
        controls: ['MainGain.gain', 'MainGain.mute']
      });

      expect(getResult.isError).toBe(false);
      expect(getResult.content[0].text).toContain('MainGain.gain');
      expect(getResult.content[0].text).toContain('MainGain.gain: -10');

      // Step 2: Set new control values
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ id: 'control-1' }) // For gain
        .mockResolvedValueOnce({ id: 'control-2' }); // For mute

      const setResult = await registry.callTool('set_control_values', {
        controls: [
          { name: 'MainGain.gain', value: 0 },
          { name: 'MainGain.mute', value: true }
        ]
      });

      expect(setResult.isError).toBe(false);
      expect(setResult.content[0].text).toContain('Set 2/2 controls successfully');

      // Verify correct QRWC commands were sent
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.objectContaining({
          Name: 'MainGain',
          Controls: expect.arrayContaining([
            expect.objectContaining({ Name: 'gain', Value: 0 }),
            expect.objectContaining({ Name: 'mute', Value: true })
          ])
        })
      );

      // Step 3: Verify the changes
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'MainGain.gain', Value: 0, String: '0.0 dB', Position: 0.5 },
          { Name: 'MainGain.mute', Value: true, String: 'muted', Position: 1 }
        ]
      });

      const verifyResult = await registry.callTool('get_control_values', {
        controls: ['MainGain.gain', 'MainGain.mute']
      });

      expect(verifyResult.isError).toBe(false);
      expect(verifyResult.content[0].text).toContain('Control Values');
      expect(verifyResult.content[0].text).toContain('MainGain.gain');
      expect(verifyResult.content[0].text).toContain('MainGain.mute');
    });

    it('should handle control ramping', async () => {
      // Set control with ramp time
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ id: 'ramp-1' });

      const result = await registry.callTool('set_control_values', {
        controls: [
          { name: 'MainGain.gain', value: -20, ramp: 2.5 }
        ]
      });

      expect(result.isError).toBe(false);
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.objectContaining({
          Name: 'MainGain',
          Controls: [
            { Name: 'gain', Value: -20, Ramp: 2.5 }
          ]
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
            String: 'OK'
          },
          Platform: 'Core 110f',
          DesignCode: 'ABCD1234',
          Network: {
            LAN_A: {
              IP: '192.168.1.100',
              Netmask: '255.255.255.0',
              Gateway: '192.168.1.1'
            }
          },
          Performance: {
            CPU: 45.2,
            Memory: 62.8,
            Temperature: 55.3
          }
        }
      });

      const result = await registry.callTool('query_core_status', {
        includeDetails: true,
        includeNetworkInfo: true,
        includePerformance: true
      });

      expect(result.isError).toBe(false);
      const statusText = result.content[0].text!;
      expect(statusText).toContain('Main Theater');
      expect(statusText).toContain('Core 110f');
      expect(statusText).toContain('IP Address:');
      expect(statusText).toContain('CPU Usage:');
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
          { name: 'InvalidControl', value: 1 }
        ]
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Set 1/2 controls successfully');
    });

    it('should validate parameters before execution', async () => {
      // Invalid control type
      const result = await registry.callTool('list_controls', {
        controlType: 'invalid_type'
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
          DesignName: 'Conference Room A',
          Status: { Code: 0, String: 'OK' }
        }
      });

      const statusResult = await registry.callTool('query_core_status', {});
      expect(statusResult.content[0].text).toContain('Conference Room A');

      // Step 2: Find all gain components
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'MicGain1', Type: 'gain' },
          { Name: 'MicGain2', Type: 'gain' },
          { Name: 'ProgramGain', Type: 'gain' },
          { Name: 'Compressor1', Type: 'compressor' }
        ]
      });

      const componentsResult = await registry.callTool('list_components', {
        filter: 'Gain'
      });
      expect(componentsResult.content[0].text).toContain('3 components'); // Filtered

      // Step 3: Mute all microphones
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ id: 'mute-1' })
        .mockResolvedValueOnce({ id: 'mute-2' });

      const muteResult = await registry.callTool('set_control_values', {
        controls: [
          { name: 'MicGain1.mute', value: true },
          { name: 'MicGain2.mute', value: true }
        ]
      });
      expect(muteResult.content[0].text).toContain('Set 2/2 controls successfully');

      // Step 4: Set program level with ramp
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ id: 'program-1' });

      const levelResult = await registry.callTool('set_control_values', {
        controls: [
          { name: 'ProgramGain.gain', value: -6, ramp: 1.0 }
        ]
      });
      expect(levelResult.content[0].text).toContain('Set 1/1 controls successfully');
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent tool calls', async () => {
      // Setup different responses for concurrent calls
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ result: [] }) // components
        .mockResolvedValueOnce({ result: [] }) // controls
        .mockResolvedValueOnce({ result: { Status: { Code: 0 } } }); // status

      const [components, controls, status] = await Promise.all([
        registry.callTool('list_components', {}),
        registry.callTool('list_controls', {}),
        registry.callTool('query_core_status', {})
      ]);

      expect(components.isError).toBe(false);
      expect(controls.isError).toBe(false);
      expect(status.isError).toBe(false);
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid sequential calls', async () => {
      const controlNames = Array.from({ length: 10 }, (_, i) => `Control${i}`);
      
      // Mock responses for all calls
      mockQrwcClient.sendCommand.mockImplementation((method) => {
        if (method === 'Control.Get') {
          return Promise.resolve({
            result: controlNames.map(name => ({
              Name: name,
              Value: Math.random(),
              String: 'test'
            }))
          });
        }
        return Promise.resolve({});
      });

      // Make rapid sequential calls
      const results = [];
      for (const name of controlNames) {
        const result = await registry.callTool('get_control_values', {
          controls: [name]
        });
        results.push(result);
      }

      expect(results).toHaveLength(10);
      expect(results.every(r => !r.isError)).toBe(true);
    });
  });
});