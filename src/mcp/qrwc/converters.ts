/**
 * Q-SYS to MCP Type Converters
 *
 * Provides conversion logic between Q-SYS and MCP data formats.
 * Extracted from adapter.ts to improve maintainability.
 */

import { globalLogger as logger } from '../../shared/utils/logger.js';

/**
 * Q-SYS control state object
 */
export interface QSYSControlState {
  Value?: number;
  String?: string;
  Type?: string;
  Position?: number;
  [key: string]: unknown;
}

/**
 * MCP component representation
 */
export interface MCPComponent {
  Name: string;
  Type: string;
  Properties: unknown[];
}

/**
 * MCP control representation
 */
export interface MCPControl {
  Name: string;
  ID: string;
  Value: number;
  String: string;
  Position?: number;
  Type: string;
}

/**
 * Extract value from Q-SYS control state object
 */
export function extractControlValue(state: unknown): {
  value: unknown;
  type: string;
} {
  let value = state;
  let type = 'String';

  if (state && typeof state === 'object') {
    const stateObj = state as QSYSControlState;

    // Handle different state object formats
    if ('Value' in stateObj) {
      // Standard format with Value property
      value = stateObj.Value;
      type = stateObj.Type ?? 'Number';
    } else if ('String' in stateObj && 'Type' in stateObj) {
      // Alternative format with String property
      if (stateObj.Type === 'Boolean' || stateObj.Type === 'Bool') {
        value = stateObj.String === 'true' || stateObj.String === '1' ? 1 : 0;
        type = 'Boolean';
      } else if (stateObj.Type === 'Text' || stateObj.Type === 'String') {
        value = stateObj.String;
        type = 'String';
      } else if (stateObj.Type === 'Float' || stateObj.Type === 'Number') {
        value = parseFloat(stateObj.String || '0');
        type = 'Number';
      } else {
        // Default to String value
        value = stateObj.String;
        type = stateObj.Type || 'String';
      }
    }
  } else if (
    typeof state === 'number' ||
    typeof state === 'boolean' ||
    typeof state === 'string'
  ) {
    // Simple value types
    value = state;
    type =
      typeof state === 'number'
        ? 'Number'
        : typeof state === 'boolean'
          ? 'Boolean'
          : 'String';
  }

  return { value, type };
}

/**
 * Convert Q-SYS component to MCP format
 */
export function qsysToMcpComponent(
  name: string,
  component: { state?: { Type?: string; Properties?: unknown[] } }
): MCPComponent {
  // Extract component type from state
  const componentType = component?.state?.Type ?? 'Component';

  // Extract properties from state
  const properties = component?.state?.Properties ?? [];

  return {
    Name: name,
    Type: componentType,
    Properties: properties,
  };
}

/**
 * Convert Q-SYS control to MCP format
 */
export function qsysToMcpControl(
  componentName: string,
  controlName: string,
  controlState: unknown
): MCPControl {
  const fullName = `${componentName}.${controlName}`;
  const { value, type } = extractControlValue(controlState);

  // Convert value to appropriate format
  const numValue =
    type === 'Number' || type === 'Float' || type === 'Integer'
      ? Number(value)
      : type === 'Boolean'
        ? value
          ? 1
          : 0
        : 0;

  const strValue = String(value || '');

  return {
    Name: controlName,
    ID: fullName,
    Value: numValue,
    String: strValue,
    Type: type,
  };
}

/**
 * Convert MCP control value to Q-SYS format
 */
export function mcpToQsysControlValue(value: unknown, type?: string): unknown {
  if (type === 'Boolean') {
    // Q-SYS expects 0/1 for boolean controls
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === 'true' || value === '1' || value === 1) {
      return 1;
    }
    if (value === 'false' || value === '0' || value === 0) {
      return 0;
    }
    return 0;
  }

  if (type === 'Number' || type === 'Float' || type === 'Integer') {
    return Number(value);
  }

  if (type === 'String' || type === 'Text') {
    return String(value);
  }

  // Pass through for unknown types
  return value;
}

/**
 * Parse control ID into component and control names
 */
export function parseControlId(
  controlId: string
): { componentName: string; controlName: string } | null {
  const parts = controlId.split('.');
  if (parts.length !== 2) {
    logger.warn(`Invalid control ID format: ${controlId}`);
    return null;
  }

  return {
    componentName: parts[0]!,
    controlName: parts[1]!,
  };
}

/**
 * Format control ID from component and control names
 */
export function formatControlId(
  componentName: string,
  controlName: string
): string {
  return `${componentName}.${controlName}`;
}
