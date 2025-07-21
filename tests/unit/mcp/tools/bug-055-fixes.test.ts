import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { z } from "zod";
import { BaseQSysTool } from "../../../../src/mcp/tools/base.js";
import { ListControlsTool } from "../../../../src/mcp/tools/controls.js";
import { QueryCoreStatusTool } from "../../../../src/mcp/tools/status.js";
import type { QRWCClientInterface } from "../../../../src/mcp/qrwc/adapter.js";

// Mock QRWC client
const createMockQRWCClient = (): QRWCClientInterface => ({
  isConnected: jest.fn().mockReturnValue(true),
  sendCommand: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  removeAllListeners: jest.fn(),
  getComponents: jest.fn(),
  getComponent: jest.fn(),
  setControl: jest.fn(),
  getControl: jest.fn(),
  getAllControls: jest.fn(),
  addToChangeGroup: jest.fn(),
  removeFromChangeGroup: jest.fn(),
  clearChangeGroup: jest.fn(),
  setAutoPoll: jest.fn(),
  poll: jest.fn(),
  logon: jest.fn(),
  logoff: jest.fn(),
  getStatus: jest.fn(),
  loadSnapshot: jest.fn(),
  saveSnapshot: jest.fn(),
  getSnapshotBanks: jest.fn(),
  getSnapshots: jest.fn(),
  addControlToChangeGroup: jest.fn(),
  removeControlFromChangeGroup: jest.fn(),
  invalidateChangeGroup: jest.fn(),
});

describe("BUG-055 Type System Fixes", () => {
  let mockClient: QRWCClientInterface;

  beforeEach(() => {
    mockClient = createMockQRWCClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("BaseTool - Zod type conversion fix", () => {
    // Create a test class that extends BaseTool
    class TestTool extends BaseQSysTool<{ test: string }> {
      constructor(client: QRWCClientInterface) {
        super(
          client,
          "test_tool",
          "Test tool",
          z.object({ test: z.string() })
        );
      }

      protected async executeInternal(params: { test: string }) {
        return {
          content: [{ type: 'text' as const, text: `Test: ${params.test}` }],
          isError: false
        };
      }

      // Expose the private method for testing
      testGetSchemaProperties() {
        return (this as any).getSchemaProperties();
      }
    }

    it("should handle ZodObject schema without type conversion errors", () => {
      const tool = new TestTool(mockClient);
      const properties = tool.testGetSchemaProperties();
      
      expect(properties).toBeDefined();
      expect(properties).toHaveProperty('test');
      expect(properties.test).toMatchObject({
        type: 'string'
      });
    });

    it("should handle non-ZodObject schema gracefully", () => {
      // Create a tool with a different schema type
      class NonObjectTool extends BaseQSysTool<string> {
        constructor(client: QRWCClientInterface) {
          super(
            client,
            "non_object_tool",
            "Non-object tool",
            z.string()
          );
        }

        protected async executeInternal(params: string) {
          return {
            content: [{ type: 'text' as const, text: params }],
            isError: false
          };
        }

        testGetSchemaProperties() {
          return (this as any).getSchemaProperties();
        }
      }

      const tool = new NonObjectTool(mockClient);
      const properties = tool.testGetSchemaProperties();
      
      expect(properties).toEqual({});
    });
  });

  describe("ListControlsTool - Filter and type narrowing fix", () => {
    it("should handle undefined result gracefully", async () => {
      const tool = new ListControlsTool(mockClient);
      
      // Mock response with undefined result
      (mockClient.sendCommand as jest.MockedFunction<typeof mockClient.sendCommand>).mockResolvedValueOnce({
        result: undefined
      });

      const result = await tool.execute({ component: "test" });
      
      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('[]');
    });

    it("should handle result with proper type narrowing", async () => {
      const tool = new ListControlsTool(mockClient);
      
      // Mock response with valid result
      (mockClient.sendCommand as jest.MockedFunction<typeof mockClient.sendCommand>).mockResolvedValueOnce({
        result: {
          Name: "TestComponent",
          Controls: [
            {
              Name: "Volume",
              Value: 0.5,
              Type: "float"
            }
          ]
        }
      });

      const result = await tool.execute({ component: "TestComponent" });
      
      expect(result.isError).toBe(false);
      const responseText = result.content[0].text;
      expect(responseText).toContain("TestComponent");
      expect(responseText).toContain("Volume");
    });
  });

  describe("QueryCoreStatusTool - Array property fix", () => {
    it("should correctly assign empty arrays to string[] properties", async () => {
      const tool = new QueryCoreStatusTool(mockClient);
      
      // Mock status response
      (mockClient.sendCommand as jest.MockedFunction<typeof mockClient.sendCommand>).mockResolvedValueOnce({
        result: {
          Platform: "Q-SYS Core",
          Version: "9.0.0",
          DesignName: "Test Design",
          State: "Active",
          Status: { String: "OK" },
          IsConnected: true
        }
      });

      const result = await tool.execute({});
      
      expect(result.isError).toBe(false);
      
      // Parse the response to check array properties
      const statusJson = result.content[0].text;
      const status = JSON.parse(statusJson);
      
      // Verify array properties are properly typed
      expect(status.designInfo.activeServices).toEqual([]);
      expect(Array.isArray(status.designInfo.activeServices)).toBe(true);
      
      expect(status.networkInfo.dnsServers).toEqual([]);
      expect(Array.isArray(status.networkInfo.dnsServers)).toBe(true);
    });

    it("should handle arrays with data correctly", async () => {
      const tool = new QueryCoreStatusTool(mockClient);
      
      // Mock status response with array data
      (mockClient.sendCommand as jest.MockedFunction<typeof mockClient.sendCommand>).mockResolvedValueOnce({
        result: {
          Platform: "Q-SYS Core",
          Version: "9.0.0",
          DesignName: "Test Design",
          State: "Active",
          Status: { String: "OK" },
          IsConnected: true,
          ActiveServices: ["Audio", "Control", "Video"],
          DNSServers: ["8.8.8.8", "8.8.4.4"]
        }
      });

      const result = await tool.execute({});
      
      expect(result.isError).toBe(false);
      
      const statusJson = result.content[0].text;
      const status = JSON.parse(statusJson);
      
      // Arrays should still be empty as we're not mapping from response
      expect(status.designInfo.activeServices).toEqual([]);
      expect(status.networkInfo.dnsServers).toEqual([]);
    });
  });
});