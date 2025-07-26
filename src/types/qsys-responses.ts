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
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'Name' in obj &&
    typeof (obj as any).Name === 'string' &&
    'Type' in obj &&
    typeof (obj as any).Type === 'string'
  );
}

export function isQSysControl(obj: unknown): obj is QSysControl {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'Name' in obj &&
    typeof (obj as any).Name === 'string' &&
    'Value' in obj
  );
}

export function isQSysResponse(obj: unknown): obj is QSysResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'jsonrpc' in obj &&
    (obj as any).jsonrpc === '2.0' &&
    'id' in obj
  );
}

export function isQSysError(obj: unknown): obj is QSysError {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    typeof (obj as any).code === 'number' &&
    'message' in obj &&
    typeof (obj as any).message === 'string'
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
  if (typeof component === 'object' && component !== null) {
    const comp = component as any;
    return comp.Name ?? comp.name ?? 'Unknown';
  }
  return 'Unknown';
}

// Safe property access helpers
export function getSafeProperty<T>(
  obj: unknown,
  property: string,
  defaultValue: T
): T {
  if (typeof obj === 'object' && obj !== null && property in obj) {
    return (obj as any)[property] as T;
  }
  return defaultValue;
}

export function hasProperty(obj: unknown, property: string): boolean {
  return typeof obj === 'object' && obj !== null && property in obj;
}