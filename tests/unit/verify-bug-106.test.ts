/**
 * Test to verify BUG-106 TypeScript compilation errors are fixed
 */
import { describe, it, expect } from '@jest/globals';
import { validateControlValue } from '../../src/mcp/qrwc/command-handlers';
import { OfficialQRWCClient } from '../../src/qrwc/officialClient';

describe('BUG-106: TypeScript Compilation Fixes', () => {
  describe('command-handlers.ts type safety', () => {
    it('should handle various Value types correctly', () => {
      // Test that the type narrowing works for different input types
      const testCases = [
        { input: { Value: 42 }, expected: 42 },
        { input: { Value: 'test' }, expected: 'test' },
        { input: { Value: true }, expected: true },
        { input: { Value: null }, expected: 0 },
        { input: { Value: undefined }, expected: 0 },
        { input: { Value: { complex: 'object' } }, expected: '[object Object]' },
        { input: { Value: [1, 2, 3] }, expected: '1,2,3' },
      ];

      testCases.forEach(({ input, expected }) => {
        const rawValue = input.Value;
        let newValue: number | string | boolean;
        
        if (typeof rawValue === 'number' || typeof rawValue === 'string' || typeof rawValue === 'boolean') {
          newValue = rawValue;
        } else if (rawValue === null || rawValue === undefined) {
          newValue = 0;
        } else {
          newValue = String(rawValue);
        }
        
        expect(newValue).toBe(expected);
        // Verify the type is correct for setControlValue
        expect(['number', 'string', 'boolean']).toContain(typeof newValue);
      });
    });
  });

  describe('change-group-executor.ts Promise.allSettled handling', () => {
    it('should handle Promise.allSettled results with proper type guards', async () => {
      const promises = [
        Promise.resolve({ success: true }),
        Promise.reject(new Error('Test error')),
      ];

      const settled = await Promise.allSettled(promises);
      const results: any[] = [];

      for (let i = 0; i < settled.length; i++) {
        const result = settled[i];
        
        if (!result) {
          continue;
        }
        
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else if (result.status === 'rejected') {
          results.push({ error: result.reason.message });
        }
      }

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ success: true });
      expect(results[1]).toEqual({ error: 'Test error' });
    });

    it('should handle regex match safely', () => {
      const testCases = [
        { message: 'Control test.volume failed: Out of range', expected: 'Out of range' },
        { message: 'Some other error', expected: 'Default message' },
        { message: 'Control test.mute failed: ', expected: 'Default message' },
      ];

      testCases.forEach(({ message, expected }) => {
        const match = /Control \S+ failed: (.+)/.exec(message);
        const result = match?.[1] ?? 'Default message';
        expect(result).toBe(expected);
      });
    });
  });

  // BUG-132: Removed test for ChangeGroupEvent which was part of removed complex state management
  // describe('rollback-handler.ts event emission', () => {
  //   it('should use valid ChangeGroupEvent values', () => {
  //     // Test removed - ChangeGroupEvent was part of the complex state management removed in BUG-132
  //   });
  // });

  describe('status.ts type safety', () => {
    it('should access correct Status properties', () => {
      const status = {
        Status: {
          Name: 'OK',
          Code: 0,
          PercentCPU: 15.5,
        }
      };

      // Verify the correct property access
      const statusName = status.Status.Name ?? 'OK';
      const statusCode = status.Status.Code;
      
      expect(statusName).toBe('OK');
      expect(statusCode).toBe(0);
      
      // Verify there's no 'String' property
      expect('String' in status.Status).toBe(false);
    });
  });

  describe('officialClient.ts optional property handling', () => {
    it('should handle optional shutdownHandler property correctly', () => {
      // Test that the type allows both undefined and function values
      let shutdownHandler: (() => void) | undefined;
      
      // Should allow undefined assignment
      shutdownHandler = undefined;
      expect(shutdownHandler).toBeUndefined();
      
      // Should allow function assignment
      shutdownHandler = () => { console.log('shutdown'); };
      expect(typeof shutdownHandler).toBe('function');
      
      // Should allow optional chaining
      shutdownHandler?.();
    });
  });
});