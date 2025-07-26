import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  StateRepositoryError,
  StateUtils,
  ControlStateSchema,
  ChangeGroupSchema,
  type ControlState,
  type ChangeGroup,
} from '../../../../src/mcp/state/repository.js';

describe('StateRepositoryError', () => {
  it('should create error with message and code', () => {
    const error = new StateRepositoryError('Test error', 'TEST_ERROR');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StateRepositoryError);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.name).toBe('StateRepositoryError');
    expect(error.context).toBeUndefined();
  });

  it('should create error with context', () => {
    const context = { controlName: 'test.control', value: 42 };
    const error = new StateRepositoryError('Test error', 'TEST_ERROR', context);

    expect(error.context).toEqual(context);
  });

  it('should maintain Error prototype chain', () => {
    const error = new StateRepositoryError('Test error', 'TEST_ERROR');

    expect(error.stack).toBeDefined();
    expect(error.toString()).toContain('StateRepositoryError');
  });
});

describe('StateUtils', () => {
  describe('createState', () => {
    it('should create state with default values', () => {
      const state = StateUtils.createState('test.control', 42);

      expect(state.name).toBe('test.control');
      expect(state.value).toBe(42);
      expect(state.source).toBe('cache');
      expect(state.timestamp).toBeInstanceOf(Date);
      expect(state.metadata).toBeUndefined();
    });

    it('should create state with custom source', () => {
      const state = StateUtils.createState('test.control', 'ON', 'qsys');

      expect(state.source).toBe('qsys');
      expect(state.value).toBe('ON');
    });

    it('should create state with metadata', () => {
      const metadata = {
        type: 'gain',
        component: 'mixer',
        min: -100,
        max: 10,
        units: 'dB',
      };

      const state = StateUtils.createState('mixer.gain', -6, 'user', metadata);

      expect(state.metadata).toEqual(metadata);
    });

    it('should create state with boolean value', () => {
      const state = StateUtils.createState('mute', true, 'qsys');

      expect(state.value).toBe(true);
      expect(typeof state.value).toBe('boolean');
    });
  });

  describe('isExpired', () => {
    it('should return false for fresh state', () => {
      const state = StateUtils.createState('test', 42);
      const ttlMs = 60000; // 1 minute

      expect(StateUtils.isExpired(state, ttlMs)).toBe(false);
    });

    it('should return true for expired state', () => {
      const state = StateUtils.createState('test', 42);
      // Manually set timestamp to past
      state.timestamp = new Date(Date.now() - 120000); // 2 minutes ago
      const ttlMs = 60000; // 1 minute

      expect(StateUtils.isExpired(state, ttlMs)).toBe(true);
    });

    it('should handle exact TTL boundary', () => {
      const state = StateUtils.createState('test', 42);
      const ttlMs = 1000;
      state.timestamp = new Date(Date.now() - ttlMs);

      expect(StateUtils.isExpired(state, ttlMs)).toBe(false); // Exact boundary is not expired
    });
  });

  describe('calculateMemoryUsage', () => {
    it('should calculate basic state memory', () => {
      const state = StateUtils.createState('test', 42);
      const memory = StateUtils.calculateMemoryUsage(state);

      expect(memory).toBeGreaterThan(100); // Base overhead
      expect(memory).toBeLessThan(500); // Reasonable upper bound
    });

    it('should account for string value size', () => {
      const shortState = StateUtils.createState('test', 'a');
      const longState = StateUtils.createState('test', 'a'.repeat(100));

      const shortMemory = StateUtils.calculateMemoryUsage(shortState);
      const longMemory = StateUtils.calculateMemoryUsage(longState);

      expect(longMemory).toBeGreaterThan(shortMemory);
    });

    it('should account for name length', () => {
      const shortName = StateUtils.createState('a', 42);
      const longName = StateUtils.createState('a'.repeat(50), 42);

      const shortMemory = StateUtils.calculateMemoryUsage(shortName);
      const longMemory = StateUtils.calculateMemoryUsage(longName);

      expect(longMemory).toBeGreaterThan(shortMemory);
    });

    it('should include metadata size', () => {
      const withoutMetadata = StateUtils.createState('test', 42);
      const withMetadata = StateUtils.createState('test', 42, 'cache', {
        type: 'gain',
        component: 'mixer',
        min: -100,
        max: 10,
        units: 'dB',
      });

      const memoryWithout = StateUtils.calculateMemoryUsage(withoutMetadata);
      const memoryWith = StateUtils.calculateMemoryUsage(withMetadata);

      expect(memoryWith).toBeGreaterThan(memoryWithout);
    });
  });

  describe('areStatesEqual', () => {
    it('should return true for identical states', () => {
      const state1 = StateUtils.createState('test', 42, 'qsys');
      const state2 = StateUtils.createState('test', 42, 'qsys');

      expect(StateUtils.areStatesEqual(state1, state2)).toBe(true);
    });

    it('should return false for different names', () => {
      const state1 = StateUtils.createState('test1', 42, 'qsys');
      const state2 = StateUtils.createState('test2', 42, 'qsys');

      expect(StateUtils.areStatesEqual(state1, state2)).toBe(false);
    });

    it('should return false for different values', () => {
      const state1 = StateUtils.createState('test', 42, 'qsys');
      const state2 = StateUtils.createState('test', 43, 'qsys');

      expect(StateUtils.areStatesEqual(state1, state2)).toBe(false);
    });

    it('should return false for different sources', () => {
      const state1 = StateUtils.createState('test', 42, 'qsys');
      const state2 = StateUtils.createState('test', 42, 'cache');

      expect(StateUtils.areStatesEqual(state1, state2)).toBe(false);
    });

    it('should ignore timestamp differences', () => {
      const state1 = StateUtils.createState('test', 42, 'qsys');
      const state2 = StateUtils.createState('test', 42, 'qsys');
      state2.timestamp = new Date(Date.now() + 1000);

      expect(StateUtils.areStatesEqual(state1, state2)).toBe(true);
    });

    it('should ignore metadata differences', () => {
      const state1 = StateUtils.createState('test', 42, 'qsys');
      const state2 = StateUtils.createState('test', 42, 'qsys', {
        type: 'gain',
      });

      expect(StateUtils.areStatesEqual(state1, state2)).toBe(true);
    });
  });

  describe('areValuesEqual', () => {
    it('should compare number values', () => {
      expect(StateUtils.areValuesEqual(42, 42)).toBe(true);
      expect(StateUtils.areValuesEqual(42, 43)).toBe(false);
    });

    it('should compare string values', () => {
      expect(StateUtils.areValuesEqual('ON', 'ON')).toBe(true);
      expect(StateUtils.areValuesEqual('ON', 'OFF')).toBe(false);
    });

    it('should compare boolean values', () => {
      expect(StateUtils.areValuesEqual(true, true)).toBe(true);
      expect(StateUtils.areValuesEqual(true, false)).toBe(false);
    });

    it('should handle mixed types', () => {
      expect(StateUtils.areValuesEqual(42, '42')).toBe(false);
      expect(StateUtils.areValuesEqual(true, 1)).toBe(false);
      expect(StateUtils.areValuesEqual(false, 0)).toBe(false);
    });
  });

  describe('mergeMetadata', () => {
    it('should return undefined if both are undefined', () => {
      expect(StateUtils.mergeMetadata(undefined, undefined)).toBeUndefined();
    });

    it('should return updates if base is undefined', () => {
      const updates = { type: 'gain', min: -100 };
      expect(StateUtils.mergeMetadata(undefined, updates)).toEqual(updates);
    });

    it('should return base if updates is undefined', () => {
      const base = { type: 'gain', min: -100 };
      expect(StateUtils.mergeMetadata(base, undefined)).toEqual(base);
    });

    it('should merge metadata objects', () => {
      const base = { type: 'gain', min: -100, max: 10 };
      const updates = { min: -80, units: 'dB' };

      const merged = StateUtils.mergeMetadata(base, updates);

      expect(merged).toEqual({
        type: 'gain',
        min: -80, // Updated
        max: 10,
        units: 'dB', // Added
      });
    });

    it('should not mutate original objects', () => {
      const base = { type: 'gain', min: -100 };
      const updates = { min: -80 };

      const merged = StateUtils.mergeMetadata(base, updates);

      expect(base.min).toBe(-100);
      expect(updates.min).toBe(-80);
      expect(merged).not.toBe(base);
      expect(merged).not.toBe(updates);
    });
  });

  describe('validateValue', () => {
    it('should return valid for no metadata', () => {
      const result = StateUtils.validateValue(42, undefined);
      expect(result).toEqual({ valid: true });
    });

    it('should validate number within range', () => {
      const metadata = { min: -100, max: 10 };

      expect(StateUtils.validateValue(0, metadata)).toEqual({ valid: true });
      expect(StateUtils.validateValue(-100, metadata)).toEqual({ valid: true });
      expect(StateUtils.validateValue(10, metadata)).toEqual({ valid: true });
    });

    it('should fail for number below minimum', () => {
      const metadata = { min: -100, max: 10 };
      const result = StateUtils.validateValue(-101, metadata);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('below minimum');
      expect(result.error).toContain('-101');
      expect(result.error).toContain('-100');
    });

    it('should fail for number above maximum', () => {
      const metadata = { min: -100, max: 10 };
      const result = StateUtils.validateValue(11, metadata);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('above maximum');
      expect(result.error).toContain('11');
      expect(result.error).toContain('10');
    });

    it('should validate with only min constraint', () => {
      const metadata = { min: 0 };

      expect(StateUtils.validateValue(100, metadata)).toEqual({ valid: true });
      expect(StateUtils.validateValue(-1, metadata).valid).toBe(false);
    });

    it('should validate with only max constraint', () => {
      const metadata = { max: 100 };

      expect(StateUtils.validateValue(0, metadata)).toEqual({ valid: true });
      expect(StateUtils.validateValue(101, metadata).valid).toBe(false);
    });

    it('should not validate string or boolean values', () => {
      const metadata = { min: 0, max: 100 };

      expect(StateUtils.validateValue('ON', metadata)).toEqual({ valid: true });
      expect(StateUtils.validateValue(true, metadata)).toEqual({ valid: true });
    });
  });
});

describe('Zod Schemas', () => {
  describe('ControlStateSchema', () => {
    it('should validate correct control state', () => {
      const validState = {
        name: 'test.control',
        value: 42,
        timestamp: new Date(),
        source: 'qsys',
      };

      const result = ControlStateSchema.safeParse(validState);
      expect(result.success).toBe(true);
    });

    it('should accept different value types', () => {
      const states = [
        { name: 'test', value: 42, timestamp: new Date(), source: 'qsys' },
        { name: 'test', value: 'ON', timestamp: new Date(), source: 'cache' },
        { name: 'test', value: true, timestamp: new Date(), source: 'user' },
      ];

      states.forEach(state => {
        const result = ControlStateSchema.safeParse(state);
        expect(result.success).toBe(true);
      });
    });

    it('should validate with metadata', () => {
      const state = {
        name: 'mixer.gain',
        value: -6,
        timestamp: new Date(),
        source: 'qsys',
        metadata: {
          type: 'gain',
          component: 'mixer',
          min: -100,
          max: 10,
          step: 0.5,
          units: 'dB',
        },
      };

      const result = ControlStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    });

    it('should reject invalid source', () => {
      const state = {
        name: 'test',
        value: 42,
        timestamp: new Date(),
        source: 'invalid',
      };

      const result = ControlStateSchema.safeParse(state);
      expect(result.success).toBe(false);
    });
  });

  describe('ChangeGroupSchema', () => {
    it('should validate correct change group', () => {
      const changeGroup = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        controls: [
          { name: 'mixer.gain', value: -6 },
          { name: 'mixer.mute', value: false },
        ],
        timestamp: new Date(),
        status: 'pending',
        source: 'user-action',
      };

      const result = ChangeGroupSchema.safeParse(changeGroup);
      expect(result.success).toBe(true);
    });

    it('should validate with ramp times', () => {
      const changeGroup = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        controls: [{ name: 'mixer.gain', value: 0, ramp: 2.5 }],
        timestamp: new Date(),
        status: 'applying',
        source: 'automation',
      };

      const result = ChangeGroupSchema.safeParse(changeGroup);
      expect(result.success).toBe(true);
    });

    it('should reject empty controls array', () => {
      const changeGroup = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        controls: [],
        timestamp: new Date(),
        status: 'pending',
        source: 'test',
      };

      const result = ChangeGroupSchema.safeParse(changeGroup);
      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID', () => {
      const changeGroup = {
        id: 'not-a-uuid',
        controls: [{ name: 'test', value: 42 }],
        timestamp: new Date(),
        status: 'pending',
        source: 'test',
      };

      const result = ChangeGroupSchema.safeParse(changeGroup);
      expect(result.success).toBe(false);
    });

    it('should validate all status values', () => {
      const statuses = ['pending', 'applying', 'completed', 'failed'];

      statuses.forEach(status => {
        const changeGroup = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          controls: [{ name: 'test', value: 42 }],
          timestamp: new Date(),
          status,
          source: 'test',
        };

        const result = ChangeGroupSchema.safeParse(changeGroup);
        expect(result.success).toBe(true);
      });
    });
  });
});
