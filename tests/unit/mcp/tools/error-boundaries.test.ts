/**
 * Test error boundaries and comprehensive error handling in MCP tools
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { BaseQSysTool } from '../../../../src/mcp/tools/base.js';
import { z } from 'zod';
import type { IControlSystem } from '../../../../src/mcp/interfaces/control-system.js';
import type { ToolCallResult } from '../../../../src/mcp/handlers/index.js';
import { QSysError, QSysErrorCode, ValidationError } from '../../../../src/shared/types/errors.js';
import { withTimeout, safeAsyncOperation, CircuitBreaker } from '../../../../src/shared/utils/error-boundaries.js';

// Mock control system
class MockControlSystem implements IControlSystem {
  private connected = true;
  
  async connect(): Promise<void> {
    this.connected = true;
  }
  
  async disconnect(): Promise<void> {
    this.connected = false;
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  setConnected(value: boolean): void {
    this.connected = value;
  }
  
  async sendCommand(): Promise<any> {
    return { success: true };
  }
  
  async getComponentControls(): Promise<any> {
    return { controls: [] };
  }
  
  async getControlValue(): Promise<any> {
    return { value: 0 };
  }
  
  async setControlValue(): Promise<any> {
    return { success: true };
  }
  
  async createChangeGroup(): Promise<any> {
    return { id: 'test-group' };
  }
  
  async destroyChangeGroup(): Promise<void> {}
  
  async subscribeChangeGroup(): Promise<void> {}
  
  async unsubscribeChangeGroup(): Promise<void> {}
  
  async startChangeGroupAutoPoll(): Promise<void> {}
  
  async stopChangeGroupAutoPoll(): Promise<void> {}
  
  on(): void {}
  off(): void {}
  emit(): boolean { return true; }
}

// Test tool implementation
const TestToolSchema = z.object({
  testParam: z.string(),
  shouldFail: z.boolean().optional(),
  shouldTimeout: z.boolean().optional(),
  throwType: z.enum(['error', 'qsys', 'validation', 'string']).optional(),
});

class TestTool extends BaseQSysTool<z.infer<typeof TestToolSchema>> {
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'test_tool',
      'Test tool for error handling',
      TestToolSchema
    );
  }
  
  protected async executeInternal(
    params: z.infer<typeof TestToolSchema>
  ): Promise<ToolCallResult> {
    if (params.shouldTimeout) {
      // Simulate a hanging operation
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }
    
    if (params.shouldFail) {
      switch (params.throwType) {
        case 'qsys':
          throw new QSysError('Test Q-SYS error', QSysErrorCode.CONNECTION_FAILED);
        case 'validation':
          throw new ValidationError('Test validation error', [
            { field: 'testParam', message: 'Invalid value', code: 'INVALID' }
          ]);
        case 'string':
          throw 'String error';
        default:
          throw new Error('Test error');
      }
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, param: params.testParam }),
        },
      ],
      isError: false,
    };
  }
}

describe('MCP Tool Error Boundaries', () => {
  let mockControlSystem: MockControlSystem;
  let testTool: TestTool;
  
  beforeEach(() => {
    mockControlSystem = new MockControlSystem();
    testTool = new TestTool(mockControlSystem);
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('Parameter Validation', () => {
    it('should handle invalid parameters gracefully', async () => {
      const result = await testTool.execute({
        // Missing required testParam
        shouldFail: true,
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error).toBe(true);
      expect(errorResponse.code).toBe('VALIDATION_ERROR');
      expect(errorResponse.hint).toBe('Please check the parameter requirements and try again');
    });
    
    it('should handle null parameters', async () => {
      const result = await testTool.execute(null);
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.code).toBe('VALIDATION_ERROR');
    });
    
    it('should handle undefined parameters', async () => {
      const result = await testTool.execute(undefined);
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.code).toBe('VALIDATION_ERROR');
    });
  });
  
  describe('Connection Errors', () => {
    it('should handle disconnected state gracefully', async () => {
      mockControlSystem.setConnected(false);
      
      const result = await testTool.execute({
        testParam: 'test',
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.message).toContain('not connected');
      expect(errorResponse.hint).toBe('Check Q-SYS Core connection and ensure the system is accessible');
    });
  });
  
  describe('Execution Errors', () => {
    it('should handle standard errors', async () => {
      const result = await testTool.execute({
        testParam: 'test',
        shouldFail: true,
        throwType: 'error',
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.message).toContain('Test error');
    });
    
    it('should handle Q-SYS errors with proper codes', async () => {
      const result = await testTool.execute({
        testParam: 'test',
        shouldFail: true,
        throwType: 'qsys',
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.code).toBe(QSysErrorCode.CONNECTION_FAILED);
      expect(errorResponse.hint).toBe('Check Q-SYS Core connection and ensure the system is accessible');
    });
    
    it('should handle validation errors with field details', async () => {
      const result = await testTool.execute({
        testParam: 'test',
        shouldFail: true,
        throwType: 'validation',
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.code).toBe('VALIDATION_ERROR');
      expect(errorResponse.fields).toBeDefined();
      expect(errorResponse.fields[0].field).toBe('testParam');
    });
    
    it('should handle non-Error throws', async () => {
      const result = await testTool.execute({
        testParam: 'test',
        shouldFail: true,
        throwType: 'string',
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.message).toContain('String error');
    });
  });
  
  describe('Timeout Handling', () => {
    it('should timeout long-running operations', async () => {
      const result = await testTool.execute({
        testParam: 'test',
        shouldTimeout: true,
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.message).toContain('timed out');
      expect(errorResponse.hint).toContain('too long');
    }, 35000); // Increase test timeout since tool has 30s timeout
  });
  
  describe('Execution Context', () => {
    it('should include execution time in results', async () => {
      const result = await testTool.execute({
        testParam: 'test',
      });
      
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.context).toBeDefined();
      expect(result.context.toolName).toBe('test_tool');
    });
    
    it('should include request ID when provided', async () => {
      const requestId = '550e8400-e29b-41d4-a716-446655440000';
      const result = await testTool.execute({
        testParam: 'test',
        requestId,
      });
      
      expect(result.context.requestId).toBe(requestId);
    });
  });
});

describe('Error Boundary Utilities', () => {
  describe('withTimeout', () => {
    it('should resolve if operation completes in time', async () => {
      const result = await withTimeout(
        Promise.resolve('success'),
        1000,
        'Test operation'
      );
      
      expect(result).toBe('success');
    });
    
    it('should reject if operation times out', async () => {
      await expect(
        withTimeout(
          new Promise((resolve) => setTimeout(resolve, 2000)),
          100,
          'Test operation'
        )
      ).rejects.toThrow('Test operation timed out after 100ms');
    });
  });
  
  describe('safeAsyncOperation', () => {
    it('should return result on success', async () => {
      const result = await safeAsyncOperation(
        async () => 'success',
        { operationName: 'test' }
      );
      
      expect(result).toBe('success');
    });
    
    it('should use fallback value on error', async () => {
      const result = await safeAsyncOperation(
        async () => { throw new Error('test error'); },
        { 
          operationName: 'test',
          fallbackValue: 'fallback',
          logError: false,
        }
      );
      
      expect(result).toBe('fallback');
    });
    
    it('should throw if no fallback provided', async () => {
      await expect(
        safeAsyncOperation(
          async () => { throw new Error('test error'); },
          { operationName: 'test', logError: false }
        )
      ).rejects.toThrow('test error');
    });
  });
  
  describe('CircuitBreaker', () => {
    it('should allow operations when closed', async () => {
      const breaker = new CircuitBreaker(3, 1000, 'test');
      const result = await breaker.execute(async () => 'success');
      
      expect(result).toBe('success');
    });
    
    it('should open after threshold failures', async () => {
      const breaker = new CircuitBreaker(3, 1000, 'test');
      
      // Fail 3 times to open the breaker
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute(async () => { throw new Error('fail'); })
        ).rejects.toThrow('fail');
      }
      
      // Should now be open
      await expect(
        breaker.execute(async () => 'success')
      ).rejects.toThrow('Circuit breaker for test is open');
    });
    
    it('should enter half-open state after timeout', async () => {
      const breaker = new CircuitBreaker(2, 100, 'test');
      
      // Open the breaker
      for (let i = 0; i < 2; i++) {
        await expect(
          breaker.execute(async () => { throw new Error('fail'); })
        ).rejects.toThrow('fail');
      }
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should succeed and close the breaker
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
      
      // Should stay closed
      const result2 = await breaker.execute(async () => 'success2');
      expect(result2).toBe('success2');
    });
  });
});