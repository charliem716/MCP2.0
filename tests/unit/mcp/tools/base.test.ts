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
});