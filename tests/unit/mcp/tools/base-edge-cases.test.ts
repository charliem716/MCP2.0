import { BaseQSysTool } from '../../../../src/mcp/tools/base.js';
import { z } from 'zod';
import type { ToolCallResult, ToolExecutionContext } from '../../../../src/mcp/tools/base.js';

// Create a concrete implementation for testing
class TestTool extends BaseQSysTool<{ value: string }> {
  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      'test_tool',
      'Test tool for edge cases',
      z.object({ value: z.string() })
    );
  }

  protected async executeInternal(
    params: { value: string },
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    return {
      content: [{
        type: 'text',
        text: `Value: ${params.value}`
      }]
    };
  }
}

describe('BaseQSysTool - Edge Cases for 100% Coverage', () => {
  let mockQrwcClient: any;
  let testTool: TestTool;

  beforeEach(() => {
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn()
    };
    testTool = new TestTool(mockQrwcClient);
  });

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
});