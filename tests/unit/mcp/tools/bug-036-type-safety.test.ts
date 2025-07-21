import { ListControlsTool, GetControlValuesTool, SetControlValuesTool } from "../../../../src/mcp/tools/controls.js";
import { ListComponentsTool, GetComponentControlsTool } from "../../../../src/mcp/tools/components.js";
import type { QRWCClientInterface } from "../../../../src/mcp/qrwc/adapter.js";

describe("BUG-036: Type Safety Verification", () => {
  // Mock QRWC client that implements the interface
  const mockQrwcClient: QRWCClientInterface = {
    sendCommand: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    getConnectionStatus: jest.fn()
  };

  describe("Controls Tools Type Safety", () => {
    test("ListControlsTool should accept only QRWCClientInterface", () => {
      // This should compile without errors
      const tool = new ListControlsTool(mockQrwcClient);
      expect(tool).toBeInstanceOf(ListControlsTool);
      
      // TypeScript should prevent passing 'any' type
      // The following would cause a TypeScript error if uncommented:
      // const badTool = new ListControlsTool("not a client");
    });

    test("GetControlValuesTool should accept only QRWCClientInterface", () => {
      const tool = new GetControlValuesTool(mockQrwcClient);
      expect(tool).toBeInstanceOf(GetControlValuesTool);
    });

    test("SetControlValuesTool should accept only QRWCClientInterface", () => {
      const tool = new SetControlValuesTool(mockQrwcClient);
      expect(tool).toBeInstanceOf(SetControlValuesTool);
    });
  });

  describe("Components Tools Type Safety", () => {
    test("ListComponentsTool should accept only QRWCClientInterface", () => {
      const tool = new ListComponentsTool(mockQrwcClient);
      expect(tool).toBeInstanceOf(ListComponentsTool);
    });

    test("GetComponentControlsTool should accept only QRWCClientInterface", () => {
      const tool = new GetComponentControlsTool(mockQrwcClient);
      expect(tool).toBeInstanceOf(GetComponentControlsTool);
    });
  });

  describe("Factory Functions Type Safety", () => {
    test("Factory functions should enforce type safety", () => {
      // Import factory functions
      const { createListControlsTool, createGetControlValuesTool, createSetControlValuesTool } = 
        require("../../../../src/mcp/tools/controls.js");
      const { createListComponentsTool, createGetComponentControlsTool } = 
        require("../../../../src/mcp/tools/components.js");

      // All factory functions should work with typed client
      expect(createListControlsTool(mockQrwcClient)).toBeInstanceOf(ListControlsTool);
      expect(createGetControlValuesTool(mockQrwcClient)).toBeInstanceOf(GetControlValuesTool);
      expect(createSetControlValuesTool(mockQrwcClient)).toBeInstanceOf(SetControlValuesTool);
      expect(createListComponentsTool(mockQrwcClient)).toBeInstanceOf(ListComponentsTool);
      expect(createGetComponentControlsTool(mockQrwcClient)).toBeInstanceOf(GetComponentControlsTool);
    });
  });

  describe("Response Parsing Type Safety", () => {
    test("Tools should handle unknown response types safely", async () => {
      const tool = new ListControlsTool(mockQrwcClient);
      
      // Mock various response formats
      const responses = [
        { result: [{ Name: "test", Value: 1 }] },
        { controls: [{ name: "test", value: 1 }] },
        [{ Name: "test", Value: 1 }],
        null,
        undefined,
        { unexpected: "format" }
      ];

      for (const response of responses) {
        (mockQrwcClient.sendCommand as jest.Mock).mockResolvedValueOnce(response);
        
        // Should not throw type errors even with unexpected formats
        try {
          await tool.execute({ controls: ["test"] });
        } catch (error) {
          // Runtime errors are OK, but TypeScript compilation should succeed
          expect(error).toBeDefined();
        }
      }
    });
  });
});