/**
 * Q-SYS Control Value Validators
 *
 * Provides validation logic for Q-SYS control values based on their types.
 * Extracted from adapter.ts to improve maintainability.
 */

import { globalLogger as logger } from '../../shared/utils/logger.js';

/**
 * Control validation result
 */
export interface ValidationResult {
  valid: boolean;
  value?: unknown;
  error?: string;
}

/**
 * Control info structure from Q-SYS
 */
export interface ControlInfo {
  type?: string;
  Type?: string;
  min?: number;
  max?: number;
  maxLength?: number;
}

/**
 * Validate a control value based on its type and constraints
 */
export function validateControlValue(
  controlName: string,
  value: unknown,
  controlInfo?: unknown
): ValidationResult {
  // If no control info provided, pass through (backwards compatibility)
  if (!controlInfo) {
    return { valid: true, value };
  }

  const info = controlInfo as ControlInfo;
  const type = info.type ?? info.Type;

  switch (type) {
    case 'Boolean':
      // Q-SYS expects 0/1 for boolean controls
      if (typeof value === 'boolean') {
        logger.debug('Boolean validation', { value, converted: value ? 1 : 0 });
        return { valid: true, value: value ? 1 : 0 };
      }
      if (value === 0 || value === 1 || value === '0' || value === '1') {
        return { valid: true, value: Number(value) };
      }
      // Also accept string representations
      if (value === 'true' || value === 'false') {
        return { valid: true, value: value === 'true' ? 1 : 0 };
      }
      return {
        valid: false,
        error: 'Boolean control expects true/false or 0/1',
      };

    case 'Number':
    case 'Float':
    case 'Integer':
      const num = Number(value);
      if (isNaN(num)) {
        return {
          valid: false,
          error: `Numeric control expects a number, got ${typeof value}`,
        };
      }
      // Check range if available
      if (info.min !== undefined && num < info.min) {
        return {
          valid: false,
          error: `Value ${num} below minimum ${info.min}`,
        };
      }
      if (info.max !== undefined && num > info.max) {
        return {
          valid: false,
          error: `Value ${num} above maximum ${info.max}`,
        };
      }
      return { valid: true, value: num };

    case 'String':
      // Convert to string if not already
      const stringValue = String(value);
      if (typeof value === 'object' && value !== null) {
        return {
          valid: false,
          error: `String control expects text, got ${typeof value}`,
        };
      }
      const maxLength = info.maxLength ?? 255;
      if (stringValue.length > maxLength) {
        return {
          valid: false,
          error: `String too long (${stringValue.length} > ${maxLength})`,
        };
      }
      return { valid: true, value: stringValue };

    default:
      // Unknown type - pass through
      return { valid: true, value };
  }
}

/**
 * Validate component name format
 */
export function validateComponentName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  // Component names should not be empty and should not contain certain characters
  return name.length > 0 && !name.includes('\0');
}

/**
 * Validate control ID format (component.control)
 */
export function validateControlId(controlId: string): {
  valid: boolean;
  componentName?: string;
  controlName?: string;
} {
  if (!controlId || typeof controlId !== 'string') {
    return { valid: false };
  }

  const parts = controlId.split('.');
  if (parts.length !== 2) {
    return { valid: false };
  }

  const [componentName, controlName] = parts;
  if (!componentName || !validateComponentName(componentName) || !controlName) {
    return { valid: false };
  }

  return {
    valid: true,
    componentName,
    controlName,
  };
}

/**
 * Type guard for Q-SYS error objects
 */
export function isQSYSError(
  error: unknown
): error is { code?: string; message?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('code' in error || 'message' in error)
  );
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // Type guard for error objects
  if (!isQSYSError(error)) return false;

  const err = error;

  // Network errors, timeouts, and specific Q-SYS errors
  const retryableCodes = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
  ];
  if (err.code && retryableCodes.includes(err.code)) {
    return true;
  }

  // Q-SYS specific transient errors
  if (err.message) {
    const retryableMessages = [
      'temporarily unavailable',
      'timeout',
      'connection reset',
    ];
    return retryableMessages.some(msg =>
      err.message!.toLowerCase().includes(msg)
    );
  }

  return false;
}
