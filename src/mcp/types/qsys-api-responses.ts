/**
 * Q-SYS API Response Types
 * 
 * These interfaces match the exact response formats from the Q-SYS QRWC API
 * as documented in qrc-reference.md
 */

/**
 * StatusGet method response
 * Example from API:
 * {
 *   "Platform": "Core 500i",
 *   "State": "Active",
 *   "DesignName": "SAF-MainPA",
 *   "DesignCode": "qALFilm6IcAz",
 *   "IsRedundant": false,
 *   "IsEmulator": true,
 *   "Status": {
 *     "Code": 0,
 *     "String": "OK"
 *   }
 * }
 */
export interface QSysStatusGetResponse {
  Platform: string;
  State: 'Idle' | 'Active' | 'Standby';
  DesignName: string;
  DesignCode: string;
  IsRedundant: boolean;
  IsEmulator: boolean;
  Status: {
    Code: number;
    String: string;
  };
  // Additional fields that may be included
  Version?: string;
  IsConnected?: boolean;
}

/**
 * Component.GetComponents response
 * Returns array of components with their properties
 */
export interface QSysComponentInfo {
  Name: string;
  Type: string;
  Properties: Array<{
    Name: string;
    Value: string;
  }>;
}

/**
 * Component.GetControls response
 */
export interface QSysComponentControlsResponse {
  Name: string;
  Controls: Array<{
    Name: string;
    Type: 'Boolean' | 'Float' | 'Integer' | 'String';
    Value: number | string | boolean;
    String: string;
    Position: number;
    Direction: 'Read' | 'Write' | 'Read/Write';
    ValueMin?: number;
    ValueMax?: number;
    StringMin?: string;
    StringMax?: string;
    Component?: string;  // Component name (added by adapter for GetAllControls)
  }>;
}

/**
 * Control.Get response
 */
export interface QSysControlGetResponse {
  Name: string;
  Value: number | string | boolean;
  String?: string;
  Position?: number;
}

/**
 * Component.Get response
 */
export interface QSysComponentGetResponse {
  Name: string;
  Controls: Array<{
    Name: string;
    Value: number | string | boolean;
    String: string;
    Position: number;
  }>;
}

/**
 * ChangeGroup.Poll response
 */
export interface QSysChangeGroupPollResponse {
  Id: string;
  Changes: Array<{
    Name?: string;  // For named controls
    Component?: string;  // For component controls
    Value: number | string | boolean;
    String: string;
  }>;
}

/**
 * EngineStatus notification (automatically sent)
 */
export interface QSysEngineStatusNotification {
  State: 'Idle' | 'Active' | 'Standby';
  DesignName: string;
  DesignCode: string;
  IsRedundant: boolean;
  IsEmulator: boolean;
}

/**
 * Generic Q-SYS method result wrapper
 */
export interface QSysMethodResult<T> {
  jsonrpc: '2.0';
  id: string | number;
  result: T;
}

/**
 * Generic Q-SYS error response
 */
export interface QSysErrorResponse {
  jsonrpc: '2.0';
  id: string | number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Type guard to check if response is an error
 */
export function isQSysError(response: unknown): response is QSysErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    !('result' in response)
  );
}

/**
 * Type guard to check if response has a result
 */
export function isQSysResult<T>(response: unknown): response is QSysMethodResult<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'result' in response &&
    !('error' in response)
  );
}