import { ChangeGroupExecutor } from '../../../src/mcp/state/change-group/change-group-executor';
import { QSysSyncAdapter } from '../../../src/mcp/state/synchronizer/qsys-sync-adapter';
import { QueryCoreStatusTool } from '../../../src/mcp/tools/status';
import { ListControlsTool } from '../../../src/mcp/tools/controls';
import type { QRWCClientInterface } from '../../../src/mcp/qrwc/adapter';
import { EventEmitter } from 'events';

describe('BUG-053: Type Assignment Verification', () => {
  let mockQRWCClient: QRWCClientInterface;
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    eventEmitter = new EventEmitter();
    mockQRWCClient = {
      sendCommand: jest.fn(),
      getControlValues: jest.fn(),
      subscribeToEvents: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      disconnect: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      off: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
      setMaxListeners: jest.fn(),
      getMaxListeners: jest.fn().mockReturnValue(10),
      listeners: jest.fn().mockReturnValue([]),
      rawListeners: jest.fn().mockReturnValue([]),
      listenerCount: jest.fn().mockReturnValue(0),
      prependListener: jest.fn(),
      prependOnceListener: jest.fn(),
      eventNames: jest.fn().mockReturnValue([]),
      addListener: jest.fn(),
    } as any;
  });

  describe('ChangeGroupExecutor', () => {
    it('should handle unknown control values with proper type validation', async () => {
      const executor = new ChangeGroupExecutor(mockQRWCClient, eventEmitter);
      
      // Mock response with various types of values
      jest.mocked(mockQRWCClient.sendCommand).mockResolvedValue({
        controls: [
          { Value: 'string value' },
          { Value: 42 },
          { Value: true },
          { Value: {} }, // Invalid type
          { Value: null }, // Null value
          { Value: undefined }, // Undefined value
        ]
      });

      const changeGroup = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        controls: [
          { name: 'test.control', value: 10 }
        ],
        createdAt: new Date(),
        appliedAt: null
      };

      // This should not throw a type error
      const result = await executor.execute(changeGroup);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('QSysSyncAdapter', () => {
    it('should handle unknown control values in getControlValues', async () => {
      const adapter = new QSysSyncAdapter(mockQRWCClient);
      
      // Mock response with various types
      jest.mocked(mockQRWCClient.sendCommand).mockResolvedValue({
        controls: [
          { Name: 'control1', Value: 'string' },
          { Name: 'control2', Value: 123 },
          { Name: 'control3', Value: false },
          { Name: 'control4', Value: {} }, // Invalid - should be skipped
          { Name: 'control5', Value: null }, // Invalid - should be skipped
          { Name: 'control6', Value: [1, 2, 3] }, // Invalid - should be skipped
        ]
      });

      const result = await adapter.getControlValues(['control1', 'control2', 'control3', 'control4', 'control5', 'control6']);
      
      // Only valid types should be included
      expect(result.size).toBe(3);
      expect(result.get('control1')?.value).toBe('string');
      expect(result.get('control2')?.value).toBe(123);
      expect(result.get('control3')?.value).toBe(false);
      expect(result.has('control4')).toBe(false);
      expect(result.has('control5')).toBe(false);
      expect(result.has('control6')).toBe(false);
    });

    it('should handle unknown control values in getComponentControls', async () => {
      const adapter = new QSysSyncAdapter(mockQRWCClient);
      
      jest.mocked(mockQRWCClient.sendCommand).mockResolvedValue({
        result: [
          { Name: 'gain', Value: -10.5 },
          { Name: 'mute', Value: true },
          { Name: 'status', Value: 'OK' },
          { Name: 'invalid', Value: { nested: 'object' } }, // Invalid
          { Name: 'null', Value: null }, // Invalid
        ]
      });

      const result = await adapter.getComponentControls('TestComponent');
      
      // Only valid types should be included
      expect(result.size).toBe(3);
      expect(result.get('TestComponent.gain')?.value).toBe(-10.5);
      expect(result.get('TestComponent.mute')?.value).toBe(true);
      expect(result.get('TestComponent.status')?.value).toBe('OK');
    });
  });

  describe('ListControlsTool', () => {
    it('should handle unknown values in control responses', async () => {
      const tool = new ListControlsTool(mockQRWCClient);
      
      jest.mocked(mockQRWCClient.sendCommand).mockResolvedValue({
        result: [
          { Name: 'control1', Value: 50, Component: 'Comp1' },
          { Name: 'control2', Value: 'enabled', Component: 'Comp1' },
          { Name: 'control3', Value: true, Component: 'Comp2' },
          { Name: 'control4', Value: { complex: 'object' }, Component: 'Comp2' }, // Should convert to string
          { Name: 'control5', Value: null, Component: 'Comp3' }, // Should use empty string
          { Name: 'control6', Component: 'Comp3' }, // No value field
        ]
      });

      const result = await tool.execute({}, {} as any);
      
      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      
      expect(controls).toHaveLength(6);
      expect(controls[0].value).toBe(50);
      expect(controls[1].value).toBe('enabled');
      expect(controls[2].value).toBe(true);
      expect(controls[3].value).toBe('[object Object]'); // Converted to string
      expect(controls[4].value).toBe(''); // Null converted to empty string
      expect(controls[5].value).toBe(''); // Undefined converted to empty string
    });
  });

  describe('QueryCoreStatusTool', () => {
    it('should handle mixed types in status response', async () => {
      const tool = new QueryCoreStatusTool(mockQRWCClient);
      
      jest.mocked(mockQRWCClient.sendCommand).mockResolvedValue({
        name: 'Q-SYS Core',
        version: 9.8,  // Number instead of string
        model: null,   // Null value
        platform: {},  // Object instead of string
        connected: 'yes', // String instead of boolean
        temperature: '45.5', // String instead of number
        cpuUsage: null, // Null instead of number
        Status: {
          String: 123,  // Number instead of string
          Code: 'zero', // String instead of number
          PercentCPU: true // Boolean instead of number
        }
      });

      const result = await tool.execute({}, {} as any);
      
      expect(result.isError).toBe(false);
      const status = JSON.parse(result.content[0].text);
      
      // All values should be properly converted
      expect(status.coreInfo.name).toBe('Q-SYS Core');
      expect(status.coreInfo.version).toBe('9.8'); // Converted to string
      expect(status.coreInfo.model).toBe('Unknown'); // Null handled
      expect(status.coreInfo.platform).toBe('[object Object]'); // Object converted to string
      expect(status.connectionStatus.connected).toBe(true); // String converted to boolean
      expect(status.systemHealth.temperature).toBe(45.5); // String converted to number
      expect(status.performanceMetrics.cpuUsage).toBe(0); // Null converted to 0
      expect(status.Status.Name).toBe('123'); // Number converted to string
      expect(status.Status.Code).toBe(0); // String converted to number (NaN becomes 0)
      expect(status.Status.PercentCPU).toBe(1); // Boolean converted to number
    });
  });
});