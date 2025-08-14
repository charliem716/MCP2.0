import { describe, it, expect } from '@jest/globals';
import { BaseToolParamsSchema } from '../../../../src/mcp/tools/base.js';
import { GetAPIDocumentationParamsSchema } from '../../../../src/mcp/tools/qsys-api.js';

describe('BUG-206: RequestId Validation', () => {
  describe('BaseToolParamsSchema', () => {
    it('should accept non-UUID string for requestId', () => {
      const result = BaseToolParamsSchema.safeParse({
        requestId: 'test-1.2-001'
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requestId).toBe('test-1.2-001');
      }
    });

    it('should accept valid UUID for requestId', () => {
      const result = BaseToolParamsSchema.safeParse({
        requestId: '123e4567-e89b-12d3-a456-426614174000'
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requestId).toBe('123e4567-e89b-12d3-a456-426614174000');
      }
    });

    it('should accept missing requestId (optional)', () => {
      const result = BaseToolParamsSchema.safeParse({});
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requestId).toBeUndefined();
      }
    });

    it('should accept any string format for requestId', () => {
      const testCases = [
        'simple-id',
        'test_123',
        'req-2025-08-13',
        'UPPERCASE-ID',
        '12345',
        'special-chars!@#'
      ];

      for (const testId of testCases) {
        const result = BaseToolParamsSchema.safeParse({
          requestId: testId
        });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.requestId).toBe(testId);
        }
      }
    });
  });

  describe('GetAPIDocumentationParamsSchema', () => {
    it('should accept non-UUID string for requestId', () => {
      const result = GetAPIDocumentationParamsSchema.safeParse({
        requestId: 'test-api-001',
        query_type: 'tools'
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requestId).toBe('test-api-001');
      }
    });

    it('should work with valid parameters including non-UUID requestId', () => {
      const result = GetAPIDocumentationParamsSchema.safeParse({
        requestId: 'doc-request-123',
        query_type: 'components',
        search: 'mixer'
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requestId).toBe('doc-request-123');
        expect(result.data.query_type).toBe('components');
      }
    });
  });
});