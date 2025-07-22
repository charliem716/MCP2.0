/**
 * Tests for Q-SYS validators
 */

import { 
  validateControlValue, 
  validateComponentName, 
  validateControlId,
  isQSYSError,
  isRetryableError
} from '../../../../src/mcp/qrwc/validators';

describe('Q-SYS Validators', () => {
  describe('validateControlValue', () => {
    it('should pass through when no control info provided', () => {
      const result = validateControlValue('test.control', 'any value');
      expect(result).toEqual({ valid: true, value: 'any value' });
    });

    describe('Boolean controls', () => {
      const booleanInfo = { Type: 'Boolean' };

      it('should convert boolean true to 1', () => {
        const result = validateControlValue('test.bool', true, booleanInfo);
        expect(result).toEqual({ valid: true, value: 1 });
      });

      it('should convert boolean false to 0', () => {
        const result = validateControlValue('test.bool', false, booleanInfo);
        expect(result).toEqual({ valid: true, value: 0 });
      });

      it('should accept 0 and 1 directly', () => {
        expect(validateControlValue('test.bool', 1, booleanInfo)).toEqual({ valid: true, value: 1 });
        expect(validateControlValue('test.bool', 0, booleanInfo)).toEqual({ valid: true, value: 0 });
      });

      it('should convert string "true" to 1', () => {
        const result = validateControlValue('test.bool', 'true', booleanInfo);
        expect(result).toEqual({ valid: true, value: 1 });
      });

      it('should convert string "false" to 0', () => {
        const result = validateControlValue('test.bool', 'false', booleanInfo);
        expect(result).toEqual({ valid: true, value: 0 });
      });

      it('should reject invalid boolean values', () => {
        const result = validateControlValue('test.bool', 'invalid', booleanInfo);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Boolean control expects');
      });
    });

    describe('Number controls', () => {
      const numberInfo = { Type: 'Number', min: 0, max: 100 };

      it('should accept valid numbers', () => {
        const result = validateControlValue('test.num', 50, numberInfo);
        expect(result).toEqual({ valid: true, value: 50 });
      });

      it('should convert string numbers', () => {
        const result = validateControlValue('test.num', '75', numberInfo);
        expect(result).toEqual({ valid: true, value: 75 });
      });

      it('should reject values below minimum', () => {
        const result = validateControlValue('test.num', -10, numberInfo);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('below minimum');
      });

      it('should reject values above maximum', () => {
        const result = validateControlValue('test.num', 150, numberInfo);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('above maximum');
      });

      it('should reject non-numeric values', () => {
        const result = validateControlValue('test.num', 'not a number', numberInfo);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('expects a number');
      });
    });

    describe('String controls', () => {
      const stringInfo = { Type: 'String', maxLength: 10 };

      it('should accept valid strings', () => {
        const result = validateControlValue('test.str', 'hello', stringInfo);
        expect(result).toEqual({ valid: true, value: 'hello' });
      });

      it('should convert numbers to strings', () => {
        const result = validateControlValue('test.str', 123, stringInfo);
        expect(result).toEqual({ valid: true, value: '123' });
      });

      it('should reject strings that are too long', () => {
        const result = validateControlValue('test.str', 'this is too long', stringInfo);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('too long');
      });

      it('should reject objects', () => {
        const result = validateControlValue('test.str', { key: 'value' }, stringInfo);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('expects text');
      });
    });
  });

  describe('validateComponentName', () => {
    it('should accept valid component names', () => {
      expect(validateComponentName('Gain1')).toBe(true);
      expect(validateComponentName('Main Mixer')).toBe(true);
    });

    it('should reject invalid component names', () => {
      expect(validateComponentName('')).toBe(false);
      expect(validateComponentName(null as any)).toBe(false);
      expect(validateComponentName(undefined as any)).toBe(false);
    });
  });

  describe('validateControlId', () => {
    it('should parse valid control IDs', () => {
      const result = validateControlId('Gain1.Level');
      expect(result).toEqual({
        valid: true,
        componentName: 'Gain1',
        controlName: 'Level'
      });
    });

    it('should reject invalid control IDs', () => {
      expect(validateControlId('invalid')).toEqual({ valid: false });
      expect(validateControlId('')).toEqual({ valid: false });
      expect(validateControlId(null as any)).toEqual({ valid: false });
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable network errors', () => {
      expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
      expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
    });

    it('should identify retryable error messages', () => {
      expect(isRetryableError({ message: 'Connection timeout' })).toBe(true);
      expect(isRetryableError({ message: 'temporarily unavailable' })).toBe(true);
    });

    it('should reject non-retryable errors', () => {
      expect(isRetryableError({ code: 'INVALID_PARAM' })).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError('string error')).toBe(false);
    });
  });
});