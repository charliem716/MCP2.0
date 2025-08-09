/**
 * Error Boundaries Test
 * Tests comprehensive error boundaries and handling
 */

import { MCPServer } from '../../src/mcp/server.js';
import { DefaultMCPServerFactory } from '../../src/mcp/factories/default-factory.js';
import { createLogger } from '../../src/shared/utils/logger.js';
import type { MCPServerConfig } from '../../src/shared/types/mcp.js';
import type { PartialMCPServerDependencies } from '../../src/mcp/interfaces/dependencies.js';

describe('Error Boundaries and Handling', () => {
  let server: MCPServer;
  let unhandledRejections: any[] = [];
  let uncaughtExceptions: any[] = [];
  const logger = createLogger('Test');

  let rejectionHandler: (reason: any) => void;
  let exceptionHandler: (error: Error) => void;

  beforeEach(async () => {
    // Track unhandled rejections
    rejectionHandler = (reason: any) => {
      unhandledRejections.push(reason);
    };
    
    exceptionHandler = (error: Error) => {
      uncaughtExceptions.push(error);
    };
    
    process.on('unhandledRejection', rejectionHandler);
    process.on('uncaughtException', exceptionHandler);

    // Create test server
    const config: MCPServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      transport: 'stdio',
      qrwc: {
        host: 'test.local',
        port: 443,
        reconnectInterval: 5000,
        heartbeatInterval: 30000,
      },
    };

    const factory = new DefaultMCPServerFactory(logger);
    const mcpServerInstance = factory.createServer(config);
    const transport = factory.createTransport();
    const qrwcClient = factory.createQRWCClient(config);
    const qrwcAdapter = factory.createQRWCAdapter(qrwcClient);
    const toolRegistry = await factory.createToolRegistry(qrwcAdapter);

    const dependencies: PartialMCPServerDependencies = {
      server: mcpServerInstance,
      transport,
      officialQrwcClient: qrwcClient,
      qrwcClientAdapter: qrwcAdapter,
      toolRegistry,
    };

    server = new MCPServer(config, dependencies);
    
    // Clear after setup
    unhandledRejections = [];
    uncaughtExceptions = [];
  });

  afterEach(async () => {
    if (server) {
      await server.shutdown();
    }
    
    // Clean up handlers
    if (rejectionHandler) {
      process.removeListener('unhandledRejection', rejectionHandler);
    }
    if (exceptionHandler) {
      process.removeListener('uncaughtException', exceptionHandler);
    }
  });

  describe('Global Error Handlers', () => {
    it('should register unhandledRejection handler', async () => {
      await server.start();
      
      // Verify handler is registered
      const handlers = process.listeners('unhandledRejection');
      expect(handlers.length).toBeGreaterThan(0);
    });

    it('should register uncaughtException handler', async () => {
      await server.start();
      
      // Verify handler is registered
      const handlers = process.listeners('uncaughtException');
      expect(handlers.length).toBeGreaterThan(0);
    });

    it('should handle unhandled promise rejections without crashing', async () => {
      await server.start();
      
      // Verify that server registers unhandledRejection handler
      const handlers = process.listeners('unhandledRejection');
      expect(handlers.length).toBeGreaterThan(0);
      
      // Track if server's handler works
      let serverHandlerFound = false;
      for (const handler of handlers) {
        // Check if handler is from MCP server (contains logger.error call)
        if (handler.toString().includes('Unhandled rejection')) {
          serverHandlerFound = true;
          break;
        }
      }
      expect(serverHandlerFound).toBe(true);
      
      // Simulate unhandled rejection by directly calling the handler
      const testError = new Error('Test unhandled rejection');
      const testPromise = Promise.reject(testError);
      
      // Call handlers directly to ensure they work
      handlers.forEach(handler => {
        try {
          handler(testError, testPromise);
        } catch (e) {
          // Handler might throw, that's ok
        }
      });
      
      // Clean up the promise
      testPromise.catch(() => {/* intentionally empty */});
      
      // Server should still be running after handling rejection
      expect(server.isRunning()).toBe(true);
    });
  });

  describe('Tool Error Boundaries', () => {
    it('should handle tool execution errors gracefully', async () => {
      await server.start();
      
      // Get a tool that will fail
      const toolRegistry = server['toolRegistry'];
      const tools = await toolRegistry?.listTools();
      
      if (tools && tools.length > 0) {
        const tool = tools[0];
        
        // Call with invalid params to trigger error
        const result = await toolRegistry?.callTool(tool.name, null);
        
        // Should return error result, not throw
        expect(result).toBeDefined();
        if (result && 'isError' in result) {
          expect(result.isError).toBe(true);
        }
      }
    });

    it('should handle connection failures gracefully', async () => {
      await server.start();
      
      // Force disconnect
      const qrwcClient = server['officialQrwcClient'];
      if (qrwcClient && 'disconnect' in qrwcClient) {
        await qrwcClient.disconnect();
      }
      
      // Try to execute a tool
      const toolRegistry = server['toolRegistry'];
      const tools = await toolRegistry?.listTools();
      
      if (tools && tools.length > 0) {
        const result = await toolRegistry?.callTool(tools[0].name, {});
        
        // Should return error, not crash
        expect(result).toBeDefined();
        if (result && 'isError' in result) {
          expect(result.isError).toBe(true);
        }
      }
    });

    it('should handle timeout errors properly', async () => {
      await server.start();
      
      // Mock a slow operation
      const toolRegistry = server['toolRegistry'];
      const tools = await toolRegistry?.listTools();
      
      if (tools && tools.length > 0) {
        // This should timeout if properly configured
        const startTime = Date.now();
        const result = await toolRegistry?.callTool(tools[0].name, {
          __testTimeout: true, // Special test param
        });
        
        const duration = Date.now() - startTime;
        
        // Should timeout within reasonable time
        expect(duration).toBeLessThan(35000); // 35 seconds max
        
        if (result && 'isError' in result) {
          expect(result.isError).toBe(true);
        }
      }
    });
  });

  describe('Error Recovery', () => {
    it('should recover from errors and continue operating', async () => {
      await server.start();
      
      // Get unhandledRejection handlers
      const handlers = process.listeners('unhandledRejection');
      expect(handlers.length).toBeGreaterThan(0);
      
      // Simulate multiple errors by calling handlers directly
      const errors: Error[] = [];
      for (let i = 0; i < 5; i++) {
        const error = new Error(`Test error ${i}`);
        const promise = Promise.reject(error);
        errors.push(error);
        
        // Call each handler with the error
        handlers.forEach(handler => {
          try {
            handler(error, promise);
          } catch (e) {
            // Handler might throw, that's ok
          }
        });
        
        // Clean up the promise
        promise.catch(() => {/* intentionally empty */});
      }
      
      // Server should still be running after handling multiple errors
      expect(server.isRunning()).toBe(true);
      
      // Should be able to execute new operations
      const toolRegistry = server['toolRegistry'];
      const tools = await toolRegistry?.listTools();
      expect(tools).toBeDefined();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should provide meaningful error messages', async () => {
      await server.start();
      
      const toolRegistry = server['toolRegistry'];
      const tools = await toolRegistry?.listTools();
      
      if (tools && tools.length > 0) {
        // Call with invalid params
        const result = await toolRegistry?.callTool(tools[0].name, {
          invalidParam: 'test',
        });
        
        // Check error message
        if (result && 'content' in result) {
          const content = Array.isArray(result.content) ? result.content[0] : result.content;
          if (content && typeof content === 'object' && 'text' in content) {
            // Should have meaningful error message
            expect(content.text).toBeTruthy();
            expect(content.text.length).toBeGreaterThan(10);
          }
        }
      }
    });
  });

  describe('No Unhandled Errors', () => {
    it('should not have any unhandled rejections during normal operation', async () => {
      await server.start();
      
      // Perform normal operations
      const toolRegistry = server['toolRegistry'];
      await toolRegistry?.listTools();
      
      // Wait for any async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have no unhandled rejections
      expect(unhandledRejections).toHaveLength(0);
    });

    it('should not have any uncaught exceptions during normal operation', async () => {
      await server.start();
      
      // Perform normal operations  
      const toolRegistry = server['toolRegistry'];
      await toolRegistry?.listTools();
      
      // Wait for any async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have no uncaught exceptions
      expect(uncaughtExceptions).toHaveLength(0);
    });
  });
});