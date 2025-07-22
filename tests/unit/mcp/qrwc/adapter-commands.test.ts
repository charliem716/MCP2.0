import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import { OfficialQRWCClient } from '../../../../src/qrwc/officialClient.js';
import { createLogger } from '../../../../src/shared/utils/logger.js';
import type { QSysStatusGetResponse } from '../../../../src/mcp/types/qsys-api-responses.js';

// Mock the logger
jest.mock('../../../../src/shared/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })),
  globalLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

/**
 * Q-SYS command implementation tests
 * Combines: adapter-get-components.test.ts, adapter-component-methods.test.ts, adapter-status.test.ts
 */
describe('QRWCClientAdapter - Q-SYS Commands', () => {
  let mockOfficialClient: jest.Mocked<OfficialQRWCClient>;
  let adapter: QRWCClientAdapter;

  beforeEach(() => {
    mockOfficialClient = {
      isConnected: jest.fn().mockReturnValue(true),
      getQrwc: jest.fn(),
      getComponent: jest.fn(),
      setControlValue: jest.fn()
    } as any;

    adapter = new QRWCClientAdapter(mockOfficialClient);
  });

  describe('Component.GetComponents', () => {
    it('should implement Component.GetComponents command', async () => {
      // Mock the QRC object with components
      const mockComponents = {
        'Main Mixer': {
          controls: {
            'gain': { state: -10 },
            'mute': { state: false }
          }
        },
        'Output Gain': {
          controls: {
            'level': { state: 0 },
            'mute': { state: true }
          }
        },
        'APM 1': {
          controls: {
            'input.1.gain': { state: -5 },
            'input.1.mute': { state: false }
          }
        }
      };

      mockOfficialClient.getQrwc.mockReturnValue({
        components: mockComponents
      });

      const result = await adapter.sendCommand('Component.GetComponents', {});

      expect(result).toHaveProperty('result');
      expect(result.result).toBeInstanceOf(Array);
      expect(result.result).toHaveLength(3);
      
      // Verify component structure
      const mainMixer = result.result.find((c: any) => c.Name === 'Main Mixer');
      expect(mainMixer).toBeDefined();
      expect(mainMixer).toHaveProperty('Type', 'Unknown');
      expect(mainMixer).toHaveProperty('Controls');
      expect(mainMixer.Controls).toBeInstanceOf(Array);
    });

    it('should handle empty components list', async () => {
      mockOfficialClient.getQrwc.mockReturnValue({
        components: {}
      });

      const result = await adapter.sendCommand('Component.GetComponents', {});

      expect(result.result).toEqual([]);
    });

    it('should throw error when QRC is not available', async () => {
      mockOfficialClient.getQrwc.mockReturnValue(null);

      await expect(adapter.sendCommand('Component.GetComponents', {}))
        .rejects.toThrow('QRC object not available');
    });

    it('should throw error when components property is missing', async () => {
      mockOfficialClient.getQrwc.mockReturnValue({});

      await expect(adapter.sendCommand('Component.GetComponents', {}))
        .rejects.toThrow('No components data available');
    });
  });

  describe('Component Methods', () => {
    describe('Component.Get', () => {
      beforeEach(() => {
        mockOfficialClient.getComponent = jest.fn();
      });

      it('should retrieve component with all controls', async () => {
        const mockComponent = {
          Name: 'Main Mixer',
          Type: 'Mixer',
          Controls: [
            { Name: 'gain', Value: -10, Type: 'Float' },
            { Name: 'mute', Value: false, Type: 'Boolean' }
          ]
        };

        mockOfficialClient.getComponent.mockResolvedValue(mockComponent);

        const result = await adapter.sendCommand('Component.Get', { 
          Name: 'Main Mixer' 
        });

        expect(mockOfficialClient.getComponent).toHaveBeenCalledWith('Main Mixer');
        expect(result.result).toEqual(mockComponent);
      });

      it('should filter controls when Controls array is provided', async () => {
        const mockComponent = {
          Name: 'Main Mixer',
          Type: 'Mixer',
          Controls: [
            { Name: 'gain', Value: -10, Type: 'Float' },
            { Name: 'mute', Value: false, Type: 'Boolean' },
            { Name: 'solo', Value: true, Type: 'Boolean' }
          ]
        };

        mockOfficialClient.getComponent.mockResolvedValue(mockComponent);

        const result = await adapter.sendCommand('Component.Get', { 
          Name: 'Main Mixer',
          Controls: ['gain', 'mute']
        });

        expect(result.result.Controls).toHaveLength(2);
        expect(result.result.Controls.map((c: any) => c.Name)).toEqual(['gain', 'mute']);
      });

      it('should handle missing component', async () => {
        mockOfficialClient.getComponent.mockResolvedValue(null);

        await expect(adapter.sendCommand('Component.Get', { 
          Name: 'NonExistent' 
        })).rejects.toThrow('Component not found: NonExistent');
      });

      it('should validate component name parameter', async () => {
        await expect(adapter.sendCommand('Component.Get', {}))
          .rejects.toThrow('Missing required parameter: Name');
      });
    });

    describe('Component.Set', () => {
      beforeEach(() => {
        mockOfficialClient.setComponentControls = jest.fn();
      });

      it('should set multiple component controls', async () => {
        mockOfficialClient.setComponentControls.mockResolvedValue({
          Name: 'Main Mixer',
          Controls: [
            { Name: 'gain', Value: -5, Success: true },
            { Name: 'mute', Value: true, Success: true }
          ]
        });

        const result = await adapter.sendCommand('Component.Set', {
          Name: 'Main Mixer',
          Controls: [
            { Name: 'gain', Value: -5 },
            { Name: 'mute', Value: true }
          ]
        });

        expect(mockOfficialClient.setComponentControls).toHaveBeenCalledWith(
          'Main Mixer',
          [
            { Name: 'gain', Value: -5 },
            { Name: 'mute', Value: true }
          ]
        );
        expect(result.result).toHaveProperty('Name', 'Main Mixer');
      });

      it('should handle control with ramp time', async () => {
        mockOfficialClient.setComponentControls.mockResolvedValue({});

        await adapter.sendCommand('Component.Set', {
          Name: 'Fader Bank',
          Controls: [
            { Name: 'fader1', Value: 0, Ramp: 2.5 }
          ]
        });

        expect(mockOfficialClient.setComponentControls).toHaveBeenCalledWith(
          'Fader Bank',
          [{ Name: 'fader1', Value: 0, Ramp: 2.5 }]
        );
      });

      it('should validate required parameters', async () => {
        await expect(adapter.sendCommand('Component.Set', {
          Controls: [{ Name: 'test', Value: 0 }]
        })).rejects.toThrow('Missing required parameter: Name');

        await expect(adapter.sendCommand('Component.Set', {
          Name: 'Test'
        })).rejects.toThrow('Missing required parameter: Controls');
      });

      it('should validate controls array is not empty', async () => {
        await expect(adapter.sendCommand('Component.Set', {
          Name: 'Test',
          Controls: []
        })).rejects.toThrow('Controls array cannot be empty');
      });
    });

    describe('Component.GetControls', () => {
      it('should get controls for a specific component', async () => {
        const mockControls = [
          { Name: 'gain', Value: -10, Type: 'Float' },
          { Name: 'mute', Value: false, Type: 'Boolean' }
        ];

        mockOfficialClient.getComponentControls = jest.fn().mockResolvedValue(mockControls);

        const result = await adapter.sendCommand('Component.GetControls', {
          Name: 'Main Mixer'
        });

        expect(mockOfficialClient.getComponentControls).toHaveBeenCalledWith('Main Mixer');
        expect(result.result).toEqual(mockControls);
      });

      it('should handle component with no controls', async () => {
        mockOfficialClient.getComponentControls = jest.fn().mockResolvedValue([]);

        const result = await adapter.sendCommand('Component.GetControls', {
          Name: 'Empty Component'
        });

        expect(result.result).toEqual([]);
      });
    });

    describe('Component.GetAllControls', () => {
      it('should get all controls from all components', async () => {
        const mockComponents = {
          'Mixer1': {
            controls: {
              'gain': { state: -10, type: 'Float' },
              'mute': { state: false, type: 'Boolean' }
            }
          },
          'Gain1': {
            controls: {
              'level': { state: 0, type: 'Float' }
            }
          }
        };

        mockOfficialClient.getQrwc.mockReturnValue({
          components: mockComponents
        });

        const result = await adapter.sendCommand('Component.GetAllControls', {});

        expect(result.result).toBeInstanceOf(Array);
        expect(result.result).toHaveLength(3); // 2 from Mixer1, 1 from Gain1
        
        // Verify control structure
        const gainControl = result.result.find((c: any) => 
          c.Name === 'Mixer1.gain'
        );
        expect(gainControl).toBeDefined();
        expect(gainControl.Value).toBe(-10);
        expect(gainControl.Component).toBe('Mixer1');
      });

      it('should handle regex filter parameter', async () => {
        const mockComponents = {
          'Main Mixer': { controls: { 'gain': { state: -10 } } },
          'Sub Mixer': { controls: { 'gain': { state: -5 } } },
          'Output Gain': { controls: { 'level': { state: 0 } } }
        };

        mockOfficialClient.getQrwc.mockReturnValue({
          components: mockComponents
        });

        const result = await adapter.sendCommand('Component.GetAllControls', {
          Filter: 'Mixer'
        });

        // Should only include controls from components matching "Mixer"
        expect(result.result).toHaveLength(2);
        expect(result.result.every((c: any) => c.Component.includes('Mixer'))).toBe(true);
      });
    });
  });

  describe('Status.Get command', () => {
    it('should return simplified status when connected', async () => {
      mockOfficialClient.isConnected.mockReturnValue(true);

      const result = await adapter.sendCommand('Status.Get');

      // Verify the response structure
      expect(result).toEqual({
        result: {
          Platform: "Q-SYS Core",
          Version: "Unknown",
          DesignName: "Unknown",
          DesignCode: "",
          Status: {
            Name: "OK",
            Code: 0,
            PercentCPU: 0,
            PercentMemory: 0
          },
          IsConnected: true,
          IsRedundant: false,
          IsEmulator: false,
          State: "Active",
          name: "Q-SYS-Core-Connected",
          version: "Unknown",
          uptime: "Unknown",
          status: "OK",
          connected: true,
          client: "official-qrwc",
          note: "Limited status information available without raw command access"
        }
      });
    });

    it('should handle StatusGet alias', async () => {
      mockOfficialClient.isConnected.mockReturnValue(true);

      const result = await adapter.sendCommand('StatusGet');

      expect(result).toHaveProperty('result.Platform', 'Q-SYS Core');
      expect(result).toHaveProperty('result.Status.Name', 'OK');
      expect(result).toHaveProperty('result.IsConnected', true);
    });

    it('should reflect disconnected state', async () => {
      mockOfficialClient.isConnected.mockReturnValue(false);

      const result = await adapter.sendCommand('Status.Get');

      expect(result).toHaveProperty('result.IsConnected', false);
      expect(result).toHaveProperty('result.name', 'Q-SYS-Core-Disconnected');
      expect(result).toHaveProperty('result.Status.Name', 'Disconnected');
      expect(result).toHaveProperty('result.Status.Code', -1);
      expect(result).toHaveProperty('result.State', 'Disconnected');
    });

    // BUG-056 regression tests - actual Q-SYS Core data
    describe('BUG-056: Status.Get returns actual Q-SYS Core data', () => {
      let mockSendRawCommand: jest.Mock;

      beforeEach(() => {
        mockSendRawCommand = jest.fn();
        mockOfficialClient.sendRawCommand = mockSendRawCommand;
      });

      it('should return actual Q-SYS Core status data when available', async () => {
        // Mock actual Q-SYS Status.Get response
        const mockStatusResponse: QSysStatusGetResponse = {
          Platform: "Core 510i",
          State: "Active",
          DesignName: "Conference Room Audio",
          DesignCode: "qALFilm6IcAz",
          IsRedundant: false,
          IsEmulator: false,
          Status: {
            Code: 0,
            String: "OK"
          },
          Version: "9.4.1",
          IsConnected: true
        };

        mockSendRawCommand.mockResolvedValue(mockStatusResponse);

        // Execute Status.Get command
        const result = await adapter.sendCommand("Status.Get", {});

        // Verify raw command was called
        expect(mockSendRawCommand).toHaveBeenCalledWith("Status.Get", {});

        // Verify actual data is returned
        expect(result).toEqual({ result: mockStatusResponse });
        expect(result.result).toMatchObject({
          Platform: "Core 510i",
          Version: "9.4.1",
          DesignName: "Conference Room Audio",
          DesignCode: "qALFilm6IcAz",
          State: "Active",
          Status: {
            Code: 0,
            String: "OK"
          }
        });
      });

      it('should handle different Q-SYS Core models correctly', async () => {
        const mockStatusResponse: QSysStatusGetResponse = {
          Platform: "Core Nano",
          State: "Active",
          DesignName: "Small Meeting Room",
          DesignCode: "xyz123",
          IsRedundant: true,
          IsEmulator: false,
          Status: {
            Code: 0,
            String: "OK"
          },
          Version: "9.5.0"
        };

        mockSendRawCommand.mockResolvedValue(mockStatusResponse);

        const result = await adapter.sendCommand("Status.Get", {});

        expect(result.result).toMatchObject({
          Platform: "Core Nano",
          Version: "9.5.0",
          IsRedundant: true
        });
      });

      it('should throw error when raw command fails', async () => {
        // Mock raw command failure
        mockSendRawCommand.mockRejectedValue(new Error('Raw command not supported'));

        // Execute Status.Get command and expect it to throw
        await expect(adapter.sendCommand("Status.Get", {})).rejects.toThrow(
          'Unable to retrieve Q-SYS Core status: Raw command not supported. The Status.Get command may not be supported by your Q-SYS Core firmware version.'
        );
      });

      it('should handle StatusGet alias with raw command', async () => {
        const mockStatusResponse: QSysStatusGetResponse = {
          Platform: "Core 110f",
          State: "Active",
          DesignName: "Theater System",
          DesignCode: "abc789",
          IsRedundant: false,
          IsEmulator: false,
          Status: {
            Code: 0,
            String: "OK"
          }
        };

        mockSendRawCommand.mockResolvedValue(mockStatusResponse);

        // Test with StatusGet alias
        const result = await adapter.sendCommand("StatusGet", {});

        expect(mockSendRawCommand).toHaveBeenCalledWith("Status.Get", {});
        expect(result.result).toMatchObject({
          Platform: "Core 110f",
          DesignName: "Theater System"
        });
      });

      it('should throw error when disconnected and raw command fails', async () => {
        mockSendRawCommand.mockRejectedValue(new Error('Not connected'));
        mockOfficialClient.isConnected.mockReturnValue(false);

        await expect(adapter.sendCommand("Status.Get", {})).rejects.toThrow(
          'Unable to retrieve Q-SYS Core status: Not connected'
        );
      });
    });
  });
});