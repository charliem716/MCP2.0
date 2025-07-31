/**
 * Tests for Q-SYS response type definitions and type guards
 */

import { describe, it, expect } from '@jest/globals';
import {
  isQSysComponent,
  isQSysControl,
  isQSysResponse,
  isQSysError,
  extractControlValue,
  getComponentName,
  getSafeProperty,
  hasProperty,
  type QSysComponent,
  type QSysControl,
  type QSysResponse,
  type QSysError,
} from '../../../src/types/qsys-responses.js';

describe('Q-SYS Response Types', () => {
  describe('isQSysComponent', () => {
    it('should return true for valid component', () => {
      const component: QSysComponent = {
        Name: 'TestComponent',
        Type: 'gain',
      };
      expect(isQSysComponent(component)).toBe(true);
    });

    it('should return true for component with optional fields', () => {
      const component: QSysComponent = {
        Name: 'TestComponent',
        Type: 'gain',
        ID: '123',
        Controls: [],
        Properties: { volume: 0.5 },
      };
      expect(isQSysComponent(component)).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(isQSysComponent(null)).toBe(false);
      expect(isQSysComponent(undefined)).toBe(false);
      expect(isQSysComponent(42)).toBe(false);
      expect(isQSysComponent('string')).toBe(false);
      expect(isQSysComponent({})).toBe(false);
      expect(isQSysComponent({ Name: 'test' })).toBe(false);
      expect(isQSysComponent({ Type: 'gain' })).toBe(false);
      expect(isQSysComponent({ Name: 42, Type: 'gain' })).toBe(false);
      expect(isQSysComponent({ Name: 'test', Type: 42 })).toBe(false);
    });
  });

  describe('isQSysControl', () => {
    it('should return true for valid control with number value', () => {
      const control: QSysControl = {
        Name: 'Volume',
        Value: 0.5,
      };
      expect(isQSysControl(control)).toBe(true);
    });

    it('should return true for valid control with string value', () => {
      const control: QSysControl = {
        Name: 'Status',
        Value: 'OK',
      };
      expect(isQSysControl(control)).toBe(true);
    });

    it('should return true for valid control with boolean value', () => {
      const control: QSysControl = {
        Name: 'Mute',
        Value: true,
      };
      expect(isQSysControl(control)).toBe(true);
    });

    it('should return true for control with all optional fields', () => {
      const control: QSysControl = {
        Name: 'Volume',
        ID: '456',
        Value: 0.5,
        String: '50%',
        Position: 0.5,
        Type: 'Float',
        ValueType: 'Float',
        Direction: 'Read/Write',
        Minimum: 0,
        Maximum: 1,
        Color: '#FF0000',
      };
      expect(isQSysControl(control)).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(isQSysControl(null)).toBe(false);
      expect(isQSysControl(undefined)).toBe(false);
      expect(isQSysControl(42)).toBe(false);
      expect(isQSysControl('string')).toBe(false);
      expect(isQSysControl({})).toBe(false);
      expect(isQSysControl({ Name: 'test' })).toBe(false);
      expect(isQSysControl({ Value: 42 })).toBe(false);
      expect(isQSysControl({ Name: 42, Value: 42 })).toBe(false);
      expect(isQSysControl({ Name: 'test', Value: null })).toBe(false);
    });
  });

  describe('isQSysResponse', () => {
    it('should return true for valid response with string id', () => {
      const response: QSysResponse = {
        jsonrpc: '2.0',
        id: 'test-123',
      };
      expect(isQSysResponse(response)).toBe(true);
    });

    it('should return true for valid response with number id', () => {
      const response: QSysResponse = {
        jsonrpc: '2.0',
        id: 123,
      };
      expect(isQSysResponse(response)).toBe(true);
    });

    it('should return true for response with result', () => {
      const response: QSysResponse = {
        jsonrpc: '2.0',
        id: 'test-123',
        result: { status: 'ok' },
      };
      expect(isQSysResponse(response)).toBe(true);
    });

    it('should return true for response with error', () => {
      const response: QSysResponse = {
        jsonrpc: '2.0',
        id: 'test-123',
        error: { code: -32600, message: 'Invalid Request' },
      };
      expect(isQSysResponse(response)).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(isQSysResponse(null)).toBe(false);
      expect(isQSysResponse(undefined)).toBe(false);
      expect(isQSysResponse(42)).toBe(false);
      expect(isQSysResponse('string')).toBe(false);
      expect(isQSysResponse({})).toBe(false);
      expect(isQSysResponse({ jsonrpc: '2.0' })).toBe(false);
      expect(isQSysResponse({ id: '123' })).toBe(false);
      expect(isQSysResponse({ jsonrpc: '1.0', id: '123' })).toBe(false);
      expect(isQSysResponse({ jsonrpc: '2.0', id: null })).toBe(false);
    });
  });

  describe('isQSysError', () => {
    it('should return true for valid error', () => {
      const error: QSysError = {
        code: -32600,
        message: 'Invalid Request',
      };
      expect(isQSysError(error)).toBe(true);
    });

    it('should return true for error with data', () => {
      const error: QSysError = {
        code: -32600,
        message: 'Invalid Request',
        data: { details: 'Missing parameter' },
      };
      expect(isQSysError(error)).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(isQSysError(null)).toBe(false);
      expect(isQSysError(undefined)).toBe(false);
      expect(isQSysError(42)).toBe(false);
      expect(isQSysError('string')).toBe(false);
      expect(isQSysError({})).toBe(false);
      expect(isQSysError({ code: -32600 })).toBe(false);
      expect(isQSysError({ message: 'Error' })).toBe(false);
      expect(isQSysError({ code: '-32600', message: 'Error' })).toBe(false);
      expect(isQSysError({ code: -32600, message: 42 })).toBe(false);
    });
  });

  describe('extractControlValue', () => {
    it('should extract value from valid control', () => {
      const control: QSysControl = {
        Name: 'Volume',
        Value: 0.5,
        String: '50%',
      };
      const result = extractControlValue(control);
      expect(result.value).toBe(0.5);
      expect(result.string).toBe('50%');
    });

    it('should use Value as string if String is not provided', () => {
      const control: QSysControl = {
        Name: 'Volume',
        Value: 0.75,
      };
      const result = extractControlValue(control);
      expect(result.value).toBe(0.75);
      expect(result.string).toBe('0.75');
    });

    it('should handle boolean values', () => {
      const control: QSysControl = {
        Name: 'Mute',
        Value: true,
      };
      const result = extractControlValue(control);
      expect(result.value).toBe(true);
      expect(result.string).toBe('true');
    });

    it('should return null and empty string for invalid control', () => {
      const result = extractControlValue('not a control');
      expect(result.value).toBe(null);
      expect(result.string).toBe('');
    });
  });

  describe('getComponentName', () => {
    it('should get Name from component', () => {
      const component = { Name: 'TestComponent' };
      expect(getComponentName(component)).toBe('TestComponent');
    });

    it('should get name (lowercase) from component', () => {
      const component = { name: 'TestComponent' };
      expect(getComponentName(component)).toBe('TestComponent');
    });

    it('should return Unknown for invalid objects', () => {
      expect(getComponentName(null)).toBe('Unknown');
      expect(getComponentName(undefined)).toBe('Unknown');
      expect(getComponentName(42)).toBe('Unknown');
      expect(getComponentName('string')).toBe('Unknown');
      expect(getComponentName({})).toBe('Unknown');
      expect(getComponentName({ Name: 42 })).toBe('Unknown');
      expect(getComponentName({ name: 42 })).toBe('Unknown');
    });
  });

  describe('getSafeProperty', () => {
    it('should get property value', () => {
      const obj = { test: 'value', count: 42 };
      expect(getSafeProperty(obj, 'test', 'default')).toBe('value');
      expect(getSafeProperty(obj, 'count', 0)).toBe(42);
    });

    it('should return default for missing property', () => {
      const obj = { test: 'value' };
      expect(getSafeProperty(obj, 'missing', 'default')).toBe('default');
      expect(getSafeProperty(obj, 'count', 0)).toBe(0);
    });

    it('should return default for invalid objects', () => {
      expect(getSafeProperty(null, 'test', 'default')).toBe('default');
      expect(getSafeProperty(undefined, 'test', 'default')).toBe('default');
      expect(getSafeProperty(42, 'test', 'default')).toBe('default');
      expect(getSafeProperty('string', 'test', 'default')).toBe('default');
    });
  });

  describe('hasProperty', () => {
    it('should return true for existing property', () => {
      const obj = { test: 'value', count: 42 };
      expect(hasProperty(obj, 'test')).toBe(true);
      expect(hasProperty(obj, 'count')).toBe(true);
    });

    it('should return false for missing property', () => {
      const obj = { test: 'value' };
      expect(hasProperty(obj, 'missing')).toBe(false);
    });

    it('should return false for invalid objects', () => {
      expect(hasProperty(null, 'test')).toBe(false);
      expect(hasProperty(undefined, 'test')).toBe(false);
      expect(hasProperty(42, 'test')).toBe(false);
      expect(hasProperty('string', 'test')).toBe(false);
    });
  });
});