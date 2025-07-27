/**
 * Type definitions for Q-SYS responses and data structures
 * These types help eliminate unsafe 'any' usage throughout the codebase
 */

// Base types for Q-SYS components and controls
export interface QSysComponent {
  Name: string;
  Type: string;
  ID?: string;
  Controls?: QSysControl[];
  Properties?: Record<string, unknown>;
}

export interface QSysControl {
  Name: string;
  ID?: string;
  Value: number | string | boolean;
  String?: string;
  Position?: number;
  Type?: string;
  ValueType?: 'Integer' | 'Float' | 'String' | 'Boolean';
  Direction?: 'Read' | 'Write' | 'Read/Write';
  Minimum?: number;
  Maximum?: number;
  Color?: string;
}

// Change event types
export interface QSysChangeResult {
  Name: string;
  Component?: string;
  Value: number | string | boolean;
  String?: string;
  Position?: number;
}

// Command response types
export interface QSysResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: QSysError;
}

export interface QSysError {
  code: number;
  message: string;
  data?: unknown;
}

export interface QSysEngineStatus {
  State: string;
  DesignName: string;
  DesignCode: string;
  IsRedundant: boolean;
  IsEmulator: boolean;
  Platform: string;
}

// Type guards for runtime validation
export function isQSysComponent(obj: unknown): obj is QSysComponent {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const record = obj as Record<string, unknown>;
  return (
    'Name' in record &&
    typeof record['Name'] === 'string' &&
    'Type' in record &&
    typeof record['Type'] === 'string'
  );
}

export function isQSysControl(obj: unknown): obj is QSysControl {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const record = obj as Record<string, unknown>;
  return (
    'Name' in record &&
    typeof record['Name'] === 'string' &&
    'Value' in record &&
    (typeof record['Value'] === 'number' ||
     typeof record['Value'] === 'string' ||
     typeof record['Value'] === 'boolean')
  );
}

export function isQSysResponse(obj: unknown): obj is QSysResponse {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const record = obj as Record<string, unknown>;
  return (
    'jsonrpc' in record &&
    record['jsonrpc'] === '2.0' &&
    'id' in record &&
    (typeof record['id'] === 'string' || typeof record['id'] === 'number')
  );
}

export function isQSysError(obj: unknown): obj is QSysError {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const record = obj as Record<string, unknown>;
  return (
    'code' in record &&
    typeof record['code'] === 'number' &&
    'message' in record &&
    typeof record['message'] === 'string'
  );
}

// Helper to safely extract control value
export function extractControlValue(control: unknown): {
  value: number | string | boolean | null;
  string: string;
} {
  if (!isQSysControl(control)) {
    return { value: null, string: '' };
  }

  return {
    value: control.Value,
    string: control.String ?? String(control.Value)
  };
}

// Helper to safely get component name
export function getComponentName(component: unknown): string {
  if (typeof component !== 'object' || component === null) {
    return 'Unknown';
  }
  
  const record = component as Record<string, unknown>;
  
  if ('Name' in record && typeof record['Name'] === 'string') {
    return record['Name'];
  }
  
  if ('name' in record && typeof record['name'] === 'string') {
    return record['name'];
  }
  
  return 'Unknown';
}

// Safe property access helpers
export function getSafeProperty<T>(
  obj: unknown,
  property: string,
  defaultValue: T
): T {
  if (typeof obj !== 'object' || obj === null) {
    return defaultValue;
  }
  
  const record = obj as Record<string, unknown>;
  
  if (property in record) {
    const value = record[property];
    // Type assertion is safe here because caller knows the expected type
    // and provides a default value of the same type
    return value as T;
  }
  
  return defaultValue;
}

export function hasProperty(obj: unknown, property: string): boolean {
  return typeof obj === 'object' && obj !== null && property in obj;
}