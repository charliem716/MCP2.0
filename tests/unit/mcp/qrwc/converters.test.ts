/**
 * Tests for Q-SYS converters
 */

import {
  extractControlValue,
  qsysToMcpComponent,
  qsysToMcpControl,
  mcpToQsysControlValue,
  parseControlId,
  formatControlId
} from '../../../../src/mcp/qrwc/converters';

describe('Q-SYS Converters', () => {
  describe('extractControlValue', () => {
    it('should extract value from standard format', () => {
      const state = { Value: 50, Type: 'Number' };
      const result = extractControlValue(state);
      expect(result).toEqual({ value: 50, type: 'Number' });
    });

    it('should extract value from string format', () => {
      const state = { String: '75', Type: 'Float' };
      const result = extractControlValue(state);
      expect(result).toEqual({ value: 75, type: 'Number' });
    });

    it('should handle boolean string format', () => {
      const state = { String: 'true', Type: 'Boolean' };
      const result = extractControlValue(state);
      expect(result).toEqual({ value: 1, type: 'Boolean' });
    });

    it('should handle simple value types', () => {
      expect(extractControlValue(42)).toEqual({ value: 42, type: 'Number' });
      expect(extractControlValue('hello')).toEqual({ value: 'hello', type: 'String' });
      expect(extractControlValue(true)).toEqual({ value: true, type: 'Boolean' });
    });

    it('should handle null and undefined', () => {
      expect(extractControlValue(null)).toEqual({ value: null, type: 'String' });
      expect(extractControlValue(undefined)).toEqual({ value: undefined, type: 'String' });
    });
  });

  describe('qsysToMcpComponent', () => {
    it('should convert Q-SYS component to MCP format', () => {
      const component = {
        state: {
          Type: 'Gain',
          Properties: ['Level', 'Mute']
        }
      };
      const result = qsysToMcpComponent('Gain1', component);
      expect(result).toEqual({
        Name: 'Gain1',
        Type: 'Gain',
        Properties: ['Level', 'Mute']
      });
    });

    it('should handle component without state', () => {
      const result = qsysToMcpComponent('Unknown', {});
      expect(result).toEqual({
        Name: 'Unknown',
        Type: 'Component',
        Properties: []
      });
    });
  });

  describe('qsysToMcpControl', () => {
    it('should convert Q-SYS control to MCP format', () => {
      const state = { Value: 0.5, Type: 'Float' };
      const result = qsysToMcpControl('Gain1', 'Level', state);
      expect(result).toEqual({
        Name: 'Level',
        ID: 'Gain1.Level',
        Value: 0.5,
        String: '0.5',
        Type: 'Float'
      });
    });

    it('should handle boolean controls', () => {
      const state = { Value: 1, Type: 'Boolean' };
      const result = qsysToMcpControl('Gain1', 'Mute', state);
      expect(result).toEqual({
        Name: 'Mute',
        ID: 'Gain1.Mute',
        Value: 1,
        String: '1',
        Type: 'Boolean'
      });
    });
  });

  describe('mcpToQsysControlValue', () => {
    it('should convert boolean values to 0/1', () => {
      expect(mcpToQsysControlValue(true, 'Boolean')).toBe(1);
      expect(mcpToQsysControlValue(false, 'Boolean')).toBe(0);
      expect(mcpToQsysControlValue('true', 'Boolean')).toBe(1);
      expect(mcpToQsysControlValue('false', 'Boolean')).toBe(0);
    });

    it('should convert to numbers', () => {
      expect(mcpToQsysControlValue('42', 'Number')).toBe(42);
      expect(mcpToQsysControlValue(42, 'Float')).toBe(42);
    });

    it('should convert to strings', () => {
      expect(mcpToQsysControlValue(123, 'String')).toBe('123');
      expect(mcpToQsysControlValue(true, 'Text')).toBe('true');
    });

    it('should pass through unknown types', () => {
      expect(mcpToQsysControlValue({ custom: 'value' }, 'Custom')).toEqual({ custom: 'value' });
    });
  });

  describe('parseControlId', () => {
    it('should parse valid control IDs', () => {
      const result = parseControlId('Gain1.Level');
      expect(result).toEqual({
        componentName: 'Gain1',
        controlName: 'Level'
      });
    });

    it('should handle invalid control IDs', () => {
      expect(parseControlId('invalid')).toBeNull();
      expect(parseControlId('')).toBeNull();
    });
  });

  describe('formatControlId', () => {
    it('should format control ID correctly', () => {
      expect(formatControlId('Gain1', 'Level')).toBe('Gain1.Level');
      expect(formatControlId('Main Mixer', 'Output')).toBe('Main Mixer.Output');
    });
  });
});