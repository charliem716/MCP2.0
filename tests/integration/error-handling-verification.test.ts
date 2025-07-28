/**
 * BUG-043 Error Handling Verification Tests
 */

import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { DiscoveryTool } from '../../src/mcp/tools/discovery.js';
import { ChangeGroupExecutor } from '../../src/mcp/state/change-group/change-group-executor.js';
import { QSysError, MCPError, ValidationError, NetworkError } from '../../src/shared/types/errors.js';
import { EventEmitter } from 'events';

describe('BUG-043: Error Handling Consistency', () => {
  describe('QRWCClientAdapter Error Handling', () => {
    it('should throw QSysError for connection failures', async () => {
      const mockClient = {
        isConnected: jest.fn().mockReturnValue(false),
        _qrwc: null,
      };
      
      const adapter = new QRWCClientAdapter(mockClient as any);
      
      await expect(adapter.sendCommand('Test.Command')).rejects.toThrow(QSysError);
      await expect(adapter.sendCommand('Test.Command')).rejects.toThrow('QRWC client not connected');
    });

    it('should throw NetworkError after max retries', async () => {
      // Create a mock that will cause the adapter to retry and eventually throw NetworkError
      const mockClient = {
        isConnected: jest.fn().mockReturnValue(true),
        getQrwc: jest.fn()
          // Make it throw a retryable error with proper code property
          .mockImplementation(() => {
            const error = new Error('Connection reset') as any;
            error.code = 'ECONNRESET';
            throw error;
          }),
      };
      
      const adapter = new QRWCClientAdapter(mockClient as any);
      
      await expect(
        adapter.sendCommand('Control.Get', { Controls: ['test'] }, { maxRetries: 1, retryDelay: 10 })
      ).rejects.toThrow(NetworkError);
    });

    it('should throw QSysError for unknown commands', async () => {
      const mockClient = {
        isConnected: jest.fn().mockReturnValue(true),
        _qrwc: {},
      };
      
      const adapter = new QRWCClientAdapter(mockClient as any);
      
      await expect(adapter.sendCommand('Unknown.Command')).rejects.toThrow(QSysError);
      await expect(adapter.sendCommand('Unknown.Command')).rejects.toThrow(/Unknown QRWC command/);
    });
  });

  describe('DiscoveryTool Error Handling', () => {
    it('should return error for invalid filter mode', async () => {
      const mockClient = { 
        sendCommand: jest.fn(),
        isConnected: jest.fn().mockReturnValue(true),
      };
      const tool = new DiscoveryTool(mockClient as any);
      
      const result = await tool.execute({ mode: 'filtered' }, {} as any);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Filter required when using');
    });

    it('should return error for invalid responses', async () => {
      const mockClient = {
        sendCommand: jest.fn().mockResolvedValue({ invalid: 'response' }),
        isConnected: jest.fn().mockReturnValue(true),
      };
      const tool = new DiscoveryTool(mockClient as any);
      
      const result = await tool.execute({ mode: 'summary' }, {} as any);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid response');
    });
  });

  describe('ChangeGroupExecutor Error Handling', () => {
    it('should throw ValidationError for invalid change groups', async () => {
      const mockClient = { sendCommand: jest.fn() };
      const eventEmitter = new EventEmitter();
      const executor = new ChangeGroupExecutor(mockClient as any, eventEmitter);
      
      // Missing ID
      expect(() => {
        executor.validateChangeGroup({ controls: [] } as any);
      }).toThrow(ValidationError);
      
      // Missing controls
      expect(() => {
        executor.validateChangeGroup({ id: 'test' } as any);
      }).toThrow(ValidationError);
    });
  });

  describe('Error Context and Information', () => {
    it('should include proper context in errors', async () => {
      const mockClient = {
        isConnected: jest.fn().mockReturnValue(false),
      };
      
      const adapter = new QRWCClientAdapter(mockClient as any);
      
      try {
        await adapter.sendCommand('Test.Command', { param: 'value' });
      } catch (error) {
        expect(error).toBeInstanceOf(QSysError);
        expect((error as QSysError).code).toBe('QSYS_CONNECTION_FAILED');
      }
    });
  });
});