import { describe, it, expect } from '@jest/globals';
import { StateUtils, ControlState } from '../../../../src/mcp/state/repository.js';

describe('StateUtils', () => {
  describe('createState', () => {
    it('should create a control state with default values', () => {
      const state = StateUtils.createState('test-control', 42);
      
      expect(state.name).toBe('test-control');
      expect(state.value).toBe(42);
      expect(state.source).toBe('cache');
      expect(state.timestamp).toBeInstanceOf(Date);
      expect(state.metadata).toBeUndefined();
    });

    it('should create a control state with custom source', () => {
      const state = StateUtils.createState('test-control', 'value', 'qsys');
      
      expect(state.source).toBe('qsys');
    });

    it('should create a control state with metadata', () => {
      const metadata = {
        type: 'gain',
        component: 'mixer',
        min: -100,
        max: 10,
        step: 0.5,
        units: 'dB'
      };
      
      const state = StateUtils.createState('test-control', 0, 'user', metadata);
      
      expect(state.metadata).toEqual(metadata);
    });

    it('should handle different value types', () => {
      const stringState = StateUtils.createState('string-control', 'test');
      expect(stringState.value).toBe('test');

      const numberState = StateUtils.createState('number-control', 123.45);
      expect(numberState.value).toBe(123.45);

      const booleanState = StateUtils.createState('boolean-control', true);
      expect(booleanState.value).toBe(true);
    });
  });

  describe('isExpired', () => {
    it('should return false for fresh state', () => {
      const state = StateUtils.createState('test', 'value');
      const ttlMs = 1000;
      
      expect(StateUtils.isExpired(state, ttlMs)).toBe(false);
    });

    it('should return true for expired state', () => {
      const state = StateUtils.createState('test', 'value');
      // Manually set timestamp to past
      state.timestamp = new Date(Date.now() - 2000);
      const ttlMs = 1000;
      
      expect(StateUtils.isExpired(state, ttlMs)).toBe(true);
    });

    it('should handle edge case of exact TTL', () => {
      const state = StateUtils.createState('test', 'value');
      state.timestamp = new Date(Date.now() - 1000);
      const ttlMs = 1000;
      
      // Edge case: exactly at TTL boundary (now - stateTime = ttlMs)
      // The implementation uses > not >=, so this is NOT expired
      expect(StateUtils.isExpired(state, ttlMs)).toBe(false);
    });
  });

  describe('calculateMemoryUsage', () => {
    it('should calculate memory for simple string state', () => {
      const state = StateUtils.createState('test', 'value');
      const memory = StateUtils.calculateMemoryUsage(state);
      
      // Base (100) + name (8) + value (10) = 118
      expect(memory).toBeGreaterThan(100);
      expect(memory).toBeLessThan(200);
    });

    it('should calculate memory for number state', () => {
      const state = StateUtils.createState('test', 42);
      const memory = StateUtils.calculateMemoryUsage(state);
      
      // Base (100) + name (8) + value (8) = 116
      expect(memory).toBeGreaterThan(100);
      expect(memory).toBeLessThan(150);
    });

    it('should calculate memory for state with metadata', () => {
      const stateWithoutMeta = StateUtils.createState('test', 'value');
      const stateWithMeta = StateUtils.createState('test', 'value', 'cache', {
        type: 'gain',
        min: -100,
        max: 10
      });
      
      const memoryWithout = StateUtils.calculateMemoryUsage(stateWithoutMeta);
      const memoryWith = StateUtils.calculateMemoryUsage(stateWithMeta);
      
      expect(memoryWith).toBeGreaterThan(memoryWithout);
    });

    it('should handle long string values', () => {
      const longString = 'a'.repeat(1000);
      const state = StateUtils.createState('test', longString);
      const memory = StateUtils.calculateMemoryUsage(state);
      
      // Should account for string length
      expect(memory).toBeGreaterThan(2000); // At least 2 bytes per char
    });
  });

  describe('areStatesEqual', () => {
    it('should return true for identical states', () => {
      const state1 = StateUtils.createState('control', 'value', 'qsys');
      const state2 = StateUtils.createState('control', 'value', 'qsys');
      
      expect(StateUtils.areStatesEqual(state1, state2)).toBe(true);
    });

    it('should return false for different names', () => {
      const state1 = StateUtils.createState('control1', 'value', 'qsys');
      const state2 = StateUtils.createState('control2', 'value', 'qsys');
      
      expect(StateUtils.areStatesEqual(state1, state2)).toBe(false);
    });

    it('should return false for different values', () => {
      const state1 = StateUtils.createState('control', 'value1', 'qsys');
      const state2 = StateUtils.createState('control', 'value2', 'qsys');
      
      expect(StateUtils.areStatesEqual(state1, state2)).toBe(false);
    });

    it('should return false for different sources', () => {
      const state1 = StateUtils.createState('control', 'value', 'qsys');
      const state2 = StateUtils.createState('control', 'value', 'cache');
      
      expect(StateUtils.areStatesEqual(state1, state2)).toBe(false);
    });

    it('should ignore timestamp differences', () => {
      const state1 = StateUtils.createState('control', 'value', 'qsys');
      // Wait a bit to ensure different timestamp
      const state2 = StateUtils.createState('control', 'value', 'qsys');
      state2.timestamp = new Date(state1.timestamp.getTime() + 1000);
      
      expect(StateUtils.areStatesEqual(state1, state2)).toBe(true);
    });

    it('should ignore metadata differences', () => {
      const state1 = StateUtils.createState('control', 'value', 'qsys', { type: 'gain' });
      const state2 = StateUtils.createState('control', 'value', 'qsys', { type: 'mute' });
      
      expect(StateUtils.areStatesEqual(state1, state2)).toBe(true);
    });
  });

  describe('areValuesEqual', () => {
    it('should compare string values', () => {
      expect(StateUtils.areValuesEqual('test', 'test')).toBe(true);
      expect(StateUtils.areValuesEqual('test1', 'test2')).toBe(false);
    });

    it('should compare number values', () => {
      expect(StateUtils.areValuesEqual(42, 42)).toBe(true);
      expect(StateUtils.areValuesEqual(42, 43)).toBe(false);
      expect(StateUtils.areValuesEqual(0.1 + 0.2, 0.3)).toBe(false); // Floating point
    });

    it('should compare boolean values', () => {
      expect(StateUtils.areValuesEqual(true, true)).toBe(true);
      expect(StateUtils.areValuesEqual(true, false)).toBe(false);
    });

    it('should handle type mismatches', () => {
      expect(StateUtils.areValuesEqual('42', 42)).toBe(false);
      expect(StateUtils.areValuesEqual('true', true)).toBe(false);
      expect(StateUtils.areValuesEqual('', 0)).toBe(false);
    });
  });

  describe('mergeMetadata', () => {
    it('should return undefined when both are undefined', () => {
      expect(StateUtils.mergeMetadata(undefined, undefined)).toBeUndefined();
    });

    it('should return updates when base is undefined', () => {
      const updates = { type: 'gain', min: -100 };
      expect(StateUtils.mergeMetadata(undefined, updates)).toEqual(updates);
    });

    it('should return base when updates is undefined', () => {
      const base = { type: 'gain', max: 10 };
      expect(StateUtils.mergeMetadata(base, undefined)).toEqual(base);
    });

    it('should merge metadata objects', () => {
      const base = { type: 'gain', min: -100, max: 10 };
      const updates = { type: 'mute', step: 1 };
      const result = StateUtils.mergeMetadata(base, updates);
      
      expect(result).toEqual({
        type: 'mute', // Updated
        min: -100,    // From base
        max: 10,      // From base
        step: 1       // New from updates
      });
    });

    it('should handle partial updates', () => {
      const base = { type: 'gain', min: -100, max: 10, units: 'dB' };
      const updates = { max: 20 };
      const result = StateUtils.mergeMetadata(base, updates);
      
      expect(result).toEqual({
        type: 'gain',
        min: -100,
        max: 20,      // Updated
        units: 'dB'
      });
    });
  });

  describe('validateValue', () => {
    it('should validate without metadata', () => {
      const result = StateUtils.validateValue(42, undefined);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate number within range', () => {
      const metadata = { min: -100, max: 10 };
      const result = StateUtils.validateValue(0, metadata);
      expect(result.valid).toBe(true);
    });

    it('should fail validation for number below minimum', () => {
      const metadata = { min: -100, max: 10 };
      const result = StateUtils.validateValue(-101, metadata);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('below minimum');
    });

    it('should fail validation for number above maximum', () => {
      const metadata = { min: -100, max: 10 };
      const result = StateUtils.validateValue(11, metadata);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('above maximum');
    });

    it('should validate string values (no constraints)', () => {
      const metadata = { type: 'string' };
      const result = StateUtils.validateValue('any string', metadata);
      expect(result.valid).toBe(true);
    });

    it('should validate boolean values (no constraints)', () => {
      const metadata = { type: 'boolean' };
      const result = StateUtils.validateValue(true, metadata);
      expect(result.valid).toBe(true);
    });

    it('should handle edge cases', () => {
      const metadata = { min: 0, max: 100 };
      
      // Boundary values
      expect(StateUtils.validateValue(0, metadata).valid).toBe(true);
      expect(StateUtils.validateValue(100, metadata).valid).toBe(true);
      
      // Just outside boundaries
      expect(StateUtils.validateValue(-0.001, metadata).valid).toBe(false);
      expect(StateUtils.validateValue(100.001, metadata).valid).toBe(false);
    });

    it('should validate with only min constraint', () => {
      const metadata = { min: 0 };
      expect(StateUtils.validateValue(-1, metadata).valid).toBe(false);
      expect(StateUtils.validateValue(1000000, metadata).valid).toBe(true);
    });

    it('should validate with only max constraint', () => {
      const metadata = { max: 100 };
      expect(StateUtils.validateValue(-1000000, metadata).valid).toBe(true);
      expect(StateUtils.validateValue(101, metadata).valid).toBe(false);
    });
  });
});
