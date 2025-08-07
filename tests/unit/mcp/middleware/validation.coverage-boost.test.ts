/**
 * Coverage boost tests for validation middleware
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { z } from 'zod';
import type { RequestContext } from '../../../../src/mcp/types/context.js';

// Mock logger
jest.mock('../../../../src/shared/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
}));

// Import after mocking
import { InputValidator } from '../../../../src/mcp/middleware/validation.js';

describe('InputValidator - Coverage Boost', () => {
  let validator: InputValidator;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };
    validator = new InputValidator(mockLogger);
  });

  describe('validate', () => {
    it('should validate params against schema', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0),
      });

      const params = {
        name: 'John',
        age: 25,
      };

      const result = await validator.validate(params, schema);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(params);
    });

    it('should reject invalid params', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0),
      });

      const params = {
        name: 'John',
        age: -5, // Invalid age
      };

      const result = await validator.validate(params, schema);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('age');
    });

    it('should handle missing required fields', async () => {
      const schema = z.object({
        name: z.string(),
        email: z.string().email(),
      });

      const params = {
        name: 'John',
        // email is missing
      };

      const result = await validator.validate(params, schema);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Required');
    });

    it('should handle extra fields with strict schema', async () => {
      const schema = z.object({
        name: z.string(),
      }).strict();

      const params = {
        name: 'John',
        extra: 'field', // Extra field
      };

      const result = await validator.validate(params, schema);
      expect(result.valid).toBe(false);
    });

    it('should allow extra fields with passthrough schema', async () => {
      const schema = z.object({
        name: z.string(),
      }).passthrough();

      const params = {
        name: 'John',
        extra: 'field',
      };

      const result = await validator.validate(params, schema);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(params);
    });

    it('should handle nested validation', async () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
        settings: z.object({
          theme: z.enum(['light', 'dark']),
        }),
      });

      const params = {
        user: {
          name: 'John',
          email: 'john@example.com',
        },
        settings: {
          theme: 'light',
        },
      };

      const result = await validator.validate(params, schema);
      expect(result.valid).toBe(true);
    });

    it('should handle array validation', async () => {
      const schema = z.object({
        tags: z.array(z.string()),
        scores: z.array(z.number()).min(1),
      });

      const params = {
        tags: ['test', 'validation'],
        scores: [90, 85, 88],
      };

      const result = await validator.validate(params, schema);
      expect(result.valid).toBe(true);
    });

    it('should handle union types', async () => {
      const schema = z.object({
        value: z.union([z.string(), z.number()]),
      });

      const stringParams = { value: 'test' };
      const numberParams = { value: 42 };

      const stringResult = await validator.validate(stringParams, schema);
      expect(stringResult.valid).toBe(true);

      const numberResult = await validator.validate(numberParams, schema);
      expect(numberResult.valid).toBe(true);
    });

    it('should handle optional fields', async () => {
      const schema = z.object({
        name: z.string(),
        nickname: z.string().optional(),
      });

      const withNickname = { name: 'John', nickname: 'Johnny' };
      const withoutNickname = { name: 'John' };

      const result1 = await validator.validate(withNickname, schema);
      expect(result1.valid).toBe(true);

      const result2 = await validator.validate(withoutNickname, schema);
      expect(result2.valid).toBe(true);
    });

    it('should handle nullable fields', async () => {
      const schema = z.object({
        name: z.string(),
        middleName: z.string().nullable(),
      });

      const withMiddle = { name: 'John', middleName: 'James' };
      const withNull = { name: 'John', middleName: null };

      const result1 = await validator.validate(withMiddle, schema);
      expect(result1.valid).toBe(true);

      const result2 = await validator.validate(withNull, schema);
      expect(result2.valid).toBe(true);
    });
  });

  describe('middleware', () => {
    it('should create middleware with schema map', () => {
      const schemas = {
        'test/method': z.object({
          name: z.string(),
        }),
      };

      const middleware = validator.middleware(schemas);
      expect(typeof middleware).toBe('function');
    });

    it('should validate known methods', async () => {
      const schemas = {
        'test/method': z.object({
          name: z.string(),
        }),
      };

      const middleware = validator.middleware(schemas);
      
      const context: RequestContext = {
        method: 'test/method',
        params: { name: 'John' },
        requestId: 'test-123',
      };

      const next = jest.fn().mockResolvedValue({ result: 'success' });

      const result = await middleware(context, next);
      expect(next).toHaveBeenCalled();
      expect(result).toEqual({ result: 'success' });
    });

    it('should reject invalid params for known methods', async () => {
      const schemas = {
        'test/method': z.object({
          name: z.string(),
        }),
      };

      const middleware = validator.middleware(schemas);
      
      const context: RequestContext = {
        method: 'test/method',
        params: { name: 123 }, // Invalid - should be string
        requestId: 'test-123',
      };

      const next = jest.fn();

      await expect(middleware(context, next)).rejects.toThrow();
      expect(next).not.toHaveBeenCalled();
    });

    it('should skip validation for unknown methods', async () => {
      const schemas = {
        'test/method': z.object({
          name: z.string(),
        }),
      };

      const middleware = validator.middleware(schemas);
      
      const context: RequestContext = {
        method: 'unknown/method',
        params: { anything: 'goes' },
        requestId: 'test-123',
      };

      const next = jest.fn().mockResolvedValue({ result: 'success' });

      const result = await middleware(context, next);
      expect(next).toHaveBeenCalled();
      expect(result).toEqual({ result: 'success' });
    });

    it('should handle validation with transformations', async () => {
      const schemas = {
        'test/transform': z.object({
          age: z.string().transform((val) => parseInt(val, 10)),
          email: z.string().email().toLowerCase(),
        }),
      };

      const middleware = validator.middleware(schemas);
      
      const context: RequestContext = {
        method: 'test/transform',
        params: {
          age: '25',
          email: 'JOHN@EXAMPLE.COM',
        },
        requestId: 'test-123',
      };

      const next = jest.fn().mockResolvedValue({ result: 'success' });

      // Middleware validates but doesn't transform in place
      await middleware(context, next);
      
      // Check that validation passed and next was called
      expect(next).toHaveBeenCalled();
    });
  });
});