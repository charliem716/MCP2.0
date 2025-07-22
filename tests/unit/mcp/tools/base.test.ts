import { describe, it, expect, beforeEach } from '@jest/globals';
import { z } from 'zod';
import { BaseQSysTool } from '../../../../src/mcp/tools/base.js';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/adapter.js';
import type { ToolCallResult, ToolExecutionContext } from '../../../../src/mcp/tools/base.js';

// Mock implementation of BaseQSysTool for testing
class TestTool extends BaseQSysTool<{ value: string }> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'test_tool',
      'Test tool for unit testing',
      z.object({ value: z.string() })
    );
  }

  protected async executeInternal(
    params: { value: string },
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    // Test implementation that uses formatResponse
    return {
      content: [{
        type: 'text',
        text: this.formatResponse({ result: params.value, processed: true })
      }],
      isError: false
    };
  }

  // Expose protected methods for testing
  public testFormatResponse(data: any): string {
    return this.formatResponse(data);
  }

  public testFormatErrorResponse(error: unknown): string {
    return this.formatErrorResponse(error);
  }
}

// Mock QRWC client
const mockQrwcClient: QRWCClientInterface = {
  isConnected: () => true,
  sendCommand: async () => ({ result: {} }),
  queryCore: async () => ({
    coreInfo: { name: 'test', version: '1.0', model: 'test', platform: 'test' },
    coreStatus: { Code: 0, IsConnected: true }
  }),
  snapshotSave: async () => {},
  snapshotRecall: async () => {}
};

describe('BaseQSysTool Response Formatting', () => {
  let tool: TestTool;

  beforeEach(() => {
    tool = new TestTool(mockQrwcClient);
  });

  describe('formatResponse', () => {
    it('should return JSON string for objects', () => {
      const data = { foo: 'bar', count: 42 };
      const result = tool.testFormatResponse(data);
      expect(result).toBe(JSON.stringify(data));
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should return JSON string for arrays', () => {
      const data = [1, 2, 3, 'test'];
      const result = tool.testFormatResponse(data);
      expect(result).toBe(JSON.stringify(data));
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should return JSON string for primitives', () => {
      expect(tool.testFormatResponse('test')).toBe('"test"');
      expect(tool.testFormatResponse(123)).toBe('123');
      expect(tool.testFormatResponse(true)).toBe('true');
      expect(tool.testFormatResponse(null)).toBe('null');
    });

    it('should handle complex nested structures', () => {
      const data = {
        components: [
          { name: 'comp1', controls: ['a', 'b'] },
          { name: 'comp2', controls: ['c', 'd'] }
        ],
        metadata: { version: 1, timestamp: new Date().toISOString() }
      };
      const result = tool.testFormatResponse(data);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(data);
    });
  });

  describe('formatErrorResponse', () => {
    it('should format Error objects correctly', () => {
      const error = new Error('Test error message');
      const result = tool.testFormatErrorResponse(error);
      const parsed = JSON.parse(result);
      
      expect(parsed).toMatchObject({
        error: true,
        toolName: 'test_tool',
        message: 'Test error message',
        code: 'UNKNOWN_ERROR'
      });
      expect(parsed.timestamp).toBeDefined();
    });

    it('should handle errors with custom codes', () => {
      const error = new Error('Connection failed') as any;
      error.code = 'ECONNREFUSED';
      
      const result = tool.testFormatErrorResponse(error);
      const parsed = JSON.parse(result);
      
      expect(parsed.code).toBe('ECONNREFUSED');
    });

    it('should handle non-Error objects', () => {
      const result = tool.testFormatErrorResponse('String error');
      const parsed = JSON.parse(result);
      
      expect(parsed).toMatchObject({
        error: true,
        toolName: 'test_tool',
        message: 'String error',
        code: 'UNKNOWN_ERROR'
      });
    });

    it('should handle null and undefined', () => {
      const nullResult = tool.testFormatErrorResponse(null);
      const nullParsed = JSON.parse(nullResult);
      expect(nullParsed.message).toBe('null');

      const undefinedResult = tool.testFormatErrorResponse(undefined);
      const undefinedParsed = JSON.parse(undefinedResult);
      expect(undefinedParsed.message).toBe('undefined');
    });
  });

  describe('execute method error handling', () => {
    it('should use formatErrorResponse for errors', async () => {
      const errorClient: QRWCClientInterface = {
        ...mockQrwcClient,
        isConnected: () => false
      };
      
      const errorTool = new TestTool(errorClient);
      const result = await errorTool.execute({ value: 'test' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      
      const errorData = JSON.parse(result.content[0].text);
      expect(errorData).toMatchObject({
        error: true,
        toolName: 'test_tool',
        message: 'Q-SYS Core not connected'
      });
    });
  });

  describe('successful execution', () => {
    it('should use formatResponse for successful results', async () => {
      const result = await tool.execute({ value: 'test-value' });
      
      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      
      const data = JSON.parse(result.content[0].text);
      expect(data).toEqual({
        result: 'test-value',
        processed: true
      });
    });
  });

  // Edge cases for 100% coverage
  describe('error handling edge cases', () => {
    it('should handle non-ZodError in validation', async () => {
      // Override the schema to throw a non-Zod error
      const brokenTool = new TestTool(mockQrwcClient);
      (brokenTool as any).paramsSchema = {
        parse: () => {
          throw new Error('Non-Zod validation error');
        }
      };

      const result = await brokenTool.execute({ value: 'test' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Non-Zod validation error');
    });

    it('should handle non-Error objects in formatErrorMessage', () => {
      // Test with string error
      const result1 = (testTool as any).formatErrorMessage('String error');
      expect(result1).toBe('test_tool failed: String error');

      // Test with number error
      const result2 = (testTool as any).formatErrorMessage(404);
      expect(result2).toBe('test_tool failed: 404');

      // Test with object error
      const result3 = (testTool as any).formatErrorMessage({ code: 'ERROR_CODE' });
      expect(result3).toBe('test_tool failed: [object Object]');
    });

    it('should handle null/undefined in extractRequestId', () => {
      // Test with null
      const result1 = (testTool as any).extractRequestId(null);
      expect(result1).toBeUndefined();

      // Test with non-object
      const result2 = (testTool as any).extractRequestId('string');
      expect(result2).toBeUndefined();

      // Test with object without requestId
      const result3 = (testTool as any).extractRequestId({ other: 'value' });
      expect(result3).toBeUndefined();

      // Test with non-string requestId
      const result4 = (testTool as any).extractRequestId({ requestId: 123 });
      expect(result4).toBeUndefined();
    });
  });

  // BUG-055 regression tests - Zod type conversion
  describe('BUG-055: Zod type conversion fixes', () => {
    it('should handle ZodObject schema without type conversion errors', () => {
      const properties = (testTool as any).getSchemaProperties();
      
      expect(properties).toBeDefined();
      expect(properties).toHaveProperty('value');
      expect(properties.value).toMatchObject({
        type: 'string'
      });
    });

    it('should handle non-ZodObject schema gracefully', () => {
      // Create a tool with a different schema type
      class NonObjectTool extends BaseQSysTool<string> {
        constructor(client: any) {
          super(
            client,
            'non_object_tool',
            'Non-object tool',
            z.string()
          );
        }

        protected async executeInternal(params: string) {
          return {
            content: [{ type: 'text' as const, text: params }],
            isError: false
          };
        }
      }

      const tool = new NonObjectTool(mockQrwcClient);
      const properties = (tool as any).getSchemaProperties();
      
      expect(properties).toEqual({});
    });
  });
});