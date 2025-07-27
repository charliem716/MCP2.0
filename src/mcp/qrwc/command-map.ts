/**
 * Type-safe command mapping for Q-SYS QRWC API
 * Maps command names to their parameter and response types
 */

import type { 
  QSysComponentInfo, 
  QSysControl,
  QSysStatusGetResponse,
  QSysApiResponse,
  QSysControlGetResponse,
  QSysComponentGetResponse
} from '../types/qsys-api-responses.js';
import type { QSysEngineStatus } from '../../types/qsys-responses.js';
import type { IControlState } from '@q-sys/qrwc';

/**
 * Control change result from setting values
 */
export interface ControlChangeResult {
  Name: string;
  Value: number | string | boolean;
  String: string;
  Position?: number;
  Color?: string;
}

/**
 * Change group operation result
 */
export interface ChangeGroupResult {
  success: boolean;
  groupId?: string;
  message?: string;
}

/**
 * Control value result for bulk operations
 */
export interface ControlValuesResult {
  Controls: Array<{
    Name: string;
    Value: number | string | boolean;
    String: string;
    Position?: number;
  }>;
}

/**
 * Command parameter and response type mapping
 */
export interface CommandMap {
  // Component Commands
  'Component.GetComponents': {
    params?: never;
    result: QSysComponentInfo[];
  };
  
  'Component.Get': {
    params: { Name: string };
    result: QSysComponentGetResponse;
  };
  
  'Component.GetControls': {
    params: { Name: string };
    result: { Controls: QSysControl[] };
  };
  
  'Component.GetAllControls': {
    params?: never;
    result: { Controls: QSysControl[] };
  };
  
  'Component.Set': {
    params: {
      Name: string;
      Controls: Array<{
        Name: string;
        Value?: number | string | boolean;
        Position?: number;
        Ramp?: number;
      }>;
    };
    result: Array<{ Name: string; Result: string; Error?: string }>;
  };
  
  // Control Commands
  'Control.Get': {
    params: { 
      Controls?: string[];
      Name?: string;
    };
    result: QSysControlGetResponse;
  };
  
  'Control.GetValues': {
    params: { Names: string[] };
    result: ControlValuesResult;
  };
  
  'Control.Set': {
    params: {
      Name: string;
      Value?: number | string | boolean;
      Position?: number;
      Ramp?: number;
    };
    result: ControlChangeResult[];
  };
  
  'Control.SetValues': {
    params: {
      Controls: Array<{
        Name: string;
        Value?: number | string | boolean;
        Position?: number;
        Ramp?: number;
      }>;
    };
    result: ControlChangeResult[];
  };
  
  'Control.SetRamp': {
    params: {
      Name: string;
      Value: number;
      RampTime: number;
    };
    result: ControlChangeResult[];
  };
  
  // Status Commands
  'Status.Get': {
    params?: never;
    result: QSysStatusGetResponse;
  };
  
  'EngineStatus': {
    params?: never;
    result: QSysEngineStatus;
  };
  
  // Change Group Commands
  'ChangeGroup.AddControl': {
    params: {
      Id: string;
      Controls: Array<{
        Name: string;
        Value?: number | string | boolean;
        Position?: number;
        Ramp?: number;
      }>;
    };
    result: ChangeGroupResult;
  };
  
  'ChangeGroup.Poll': {
    params: { Id: string };
    result: {
      Changes: Array<{
        Name: string;
        Value: number | string | boolean;
        String: string;
        Position?: number;
      }>;
    };
  };
  
  'ChangeGroup.Destroy': {
    params: { Id: string };
    result: ChangeGroupResult;
  };
  
  'ChangeGroup.Remove': {
    params: {
      Id: string;
      Controls: string[];
    };
    result: ChangeGroupResult;
  };
  
  'ChangeGroup.Clear': {
    params: { Id: string };
    result: ChangeGroupResult;
  };
  
  'ChangeGroup.AutoPoll': {
    params: {
      Id: string;
      Rate?: number;
    };
    result: ChangeGroupResult;
  };
}

/**
 * Extract command names as a union type
 */
export type CommandName = keyof CommandMap;

/**
 * Extract parameters for a specific command
 */
export type CommandParams<T extends CommandName> = CommandMap[T]['params'];

/**
 * Extract result type for a specific command
 */
export type CommandResult<T extends CommandName> = CommandMap[T]['result'];

/**
 * Type guard to check if a command is valid
 */
export function isValidCommand(command: string): command is CommandName {
  const validCommands: CommandName[] = [
    'Component.GetComponents',
    'Component.Get',
    'Component.GetControls',
    'Component.GetAllControls',
    'Component.Set',
    'Control.Get',
    'Control.GetValues',
    'Control.Set',
    'Control.SetValues',
    'Status.Get',
    'EngineStatus',
    'ChangeGroup.AddControl',
    'ChangeGroup.Poll',
    'ChangeGroup.Destroy',
    'ChangeGroup.Remove',
    'ChangeGroup.Clear',
    'ChangeGroup.AutoPoll'
  ];
  
  return validCommands.includes(command as CommandName);
}