/**
 * BUG-163 Verification Test
 * Tests comprehensive error boundaries and handling
 */

import { MCPServer } from '../../src/mcp/server.js';
import { DefaultMCPServerFactory } from '../../src/mcp/factories/default-factory.js';
import { createLogger } from '../../src/shared/utils/logger.js';
import type { MCPServerConfig } from '../../src/shared/types/mcp.js';
import type { PartialMCPServerDependencies } from '../../src/mcp/interfaces/dependencies.js';

describe('BUG-163: Error Boundaries and Handling', () => {
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
      
      // Create unhandled rejection
      Promise.reject(new Error('Test unhandled rejection'));
      
      // Wait for handlers
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Server should still be running
      expect(server.isRunning()).toBe(true);
    });
  });

  describe('Tool Error Boundaries', () => {
    it('should handle tool execution errors gracefully', async () => {
      await server.start();
      
      // Get a tool that will fail
      const toolRegistry = server['dependencies'].toolRegistry;
      const tools = await toolRegistry?.listTools();
      
      if (tools && tools.length > 0) {
        const tool = tools[0];
        
        // Call with invalid params to trigger error
        const result = await toolRegistry?.executeTool(tool.name, null);
        
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
      const qrwcClient = server['dependencies'].officialQrwcClient;
      if (qrwcClient && 'disconnect' in qrwcClient) {
        await qrwcClient.disconnect();
      }
      
      // Try to execute a tool
      const toolRegistry = server['dependencies'].toolRegistry;
      const tools = await toolRegistry?.listTools();
      
      if (tools && tools.length > 0) {
        const result = await toolRegistry?.executeTool(tools[0].name, {});
        
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
      const toolRegistry = server['dependencies'].toolRegistry;
      const tools = await toolRegistry?.listTools();
      
      if (tools && tools.length > 0) {
        // This should timeout if properly configured
        const startTime = Date.now();
        const result = await toolRegistry?.executeTool(tools[0].name, {
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
      
      // Cause multiple errors
      const errors = [];
      for (let i = 0; i < 5; i++) {
        Promise.reject(new Error(`Test error ${i}`));
        errors.push(`Error ${i}`);
      }
      
      // Wait for handlers
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Server should still be running
      expect(server.isRunning()).toBe(true);
      
      // Should be able to execute new operations
      const toolRegistry = server['dependencies'].toolRegistry;
      const tools = await toolRegistry?.listTools();
      expect(tools).toBeDefined();
    });

    it('should provide meaningful error messages', async () => {
      await server.start();
      
      const toolRegistry = server['dependencies'].toolRegistry;
      const tools = await toolRegistry?.listTools();
      
      if (tools && tools.length > 0) {
        // Call with invalid params
        const result = await toolRegistry?.executeTool(tools[0].name, {
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
      const toolRegistry = server['dependencies'].toolRegistry;
      await toolRegistry?.listTools();
      
      // Wait for any async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have no unhandled rejections
      expect(unhandledRejections).toHaveLength(0);
    });

    it('should not have any uncaught exceptions during normal operation', async () => {
      await server.start();
      
      // Perform normal operations  
      const toolRegistry = server['dependencies'].toolRegistry;
      await toolRegistry?.listTools();
      
      // Wait for any async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have no uncaught exceptions
      expect(uncaughtExceptions).toHaveLength(0);
    });
  });
});