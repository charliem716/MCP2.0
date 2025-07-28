/**
 * Command handlers for QRWC adapter
 * Extracts complex switch cases into separate functions
 */

import { globalLogger as logger } from '../../shared/utils/logger.js';
import type { OfficialQRWCClient } from '../../qrwc/officialClient.js';
import type { Component } from '@q-sys/qrwc';
import { extractControlValue } from './converters.js';
import { validateControlValue } from './validators.js';
import { QSysError, QSysErrorCode, ValidationError } from '../../shared/types/errors.js';

export type CommandHandler = (
  params?: Record<string, unknown>,
  client?: OfficialQRWCClient
) => unknown;

/**
 * Convert any value to a string representation
 */
function valueToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value as string | number | boolean);
}

interface ComponentInfo {
  Name: string;
  Type: string;
  Properties: unknown[];
}

interface ControlInfo {
  Name: string;
  Type: string;
  Value: unknown;
  String: string;
  Position?: number;
}

/**
 * Handle Component.GetComponents command
 */
export function handleGetComponents(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): { result: ComponentInfo[] } {
  const qrwc = client.getQrwc();
  if (!qrwc) {
    throw new QSysError('QRWC instance not available', QSysErrorCode.CONNECTION_FAILED);
  }

  const componentNames = Object.keys(qrwc.components);
  const components = componentNames.map(name => {
    const component = qrwc.components[name];
    if (!component) {
      return {
        Name: name,
        Type: 'Unknown',
        Properties: [],
      };
    }

    return {
      Name: name,
      Type: component.state.Type,
      Properties: component.state.Properties,
    };
  });

  logger.info(`Returning ${components.length} components from Q-SYS Core`);
  return { result: components };
}

/**
 * Handle Component.GetControls command
 */
export function handleGetControls(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): { result: { Name: string; Controls: ControlInfo[] } } {
  const componentName = params?.['Name'] ?? params?.['name'];
  if (!componentName || typeof componentName !== 'string') {
    throw new ValidationError('Component name is required', 
      [{ field: 'Name', message: 'Component name is required', code: 'REQUIRED_FIELD' }]);
  }

  const qrwc = client.getQrwc();
  if (!qrwc?.components[componentName]) {
    throw new QSysError(`Component not found: ${componentName}`, QSysErrorCode.INVALID_COMPONENT,
      { componentName });
  }

  const component = qrwc.components[componentName];

  const controls = Object.entries(component.controls).map(([name, control]) => {
    const { value, type } = extractControlValue(control);

    const result: ControlInfo = {
      Name: name,
      Type: type,
      Value: value,
      String: valueToString(value),
    };

    // Only add Position if it exists
    if ('Position' in control && control.Position !== undefined) {
      result.Position = control.Position as number;
    }

    return result;
  });

  logger.info(
    `Returning ${controls.length} controls for component ${componentName}`
  );
  return { result: { Name: componentName, Controls: controls } };
}

/**
 * Handle Control.Get command
 */
export function handleControlGet(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): { result: ControlInfo[] } {
  const controlsParam = params?.['Controls'];
  if (!Array.isArray(controlsParam)) {
    throw new ValidationError('Controls array is required',
      [{ field: 'Controls', message: 'Must be an array', code: 'INVALID_TYPE' }]);
  }
  const controls = controlsParam;

  const qrwc = client.getQrwc();
  if (!qrwc) {
    throw new QSysError('QRWC instance not available', QSysErrorCode.CONNECTION_FAILED);
  }

  const results = controls.map(controlObj => {
    let fullName: string;
    
    // Handle both string and object formats
    if (typeof controlObj === 'string') {
      fullName = controlObj;
    } else if (typeof controlObj === 'object' && controlObj !== null) {
      const obj = controlObj as Record<string, unknown>;
      fullName = obj['Name'] != null ? valueToString(obj['Name']) : obj['name'] != null ? valueToString(obj['name']) : '';
    } else {
      throw new ValidationError('Invalid control format',
        [{ field: 'control', message: 'Control must be a string or object', code: 'INVALID_FORMAT' }]);
    }

    const [componentName, controlName] = fullName.split('.');

    if (!componentName || !controlName) {
      throw new ValidationError(`Invalid control name format: ${fullName}`,
        [{ field: 'controlName', message: 'Must be in format Component.Control', code: 'INVALID_FORMAT' }]);
    }

    const component = qrwc.components[componentName];
    if (!component) {
      throw new QSysError(`Component not found: ${componentName}`, QSysErrorCode.INVALID_COMPONENT,
        { componentName });
    }

    const control = component.controls[controlName];
    if (!control) {
      throw new QSysError(`Control not found: ${fullName}`, QSysErrorCode.INVALID_CONTROL,
        { controlName: fullName });
    }

    const { value, type } = extractControlValue(control as unknown);

    return {
      Name: fullName,
      Type: type,
      Value: value,
      String: valueToString(value),
    };
  });

  return { result: results };
}

/**
 * Parse control name into component and control parts
 */
function parseControlName(name: string): { componentName: string; controlName: string } | null {
  const [componentName, controlName] = name.split('.');
  if (!componentName || !controlName) {
    return null;
  }
  return { componentName, controlName };
}

/**
 * Extract control name from control object
 */
function extractControlName(controlObj: unknown): string {
  if (typeof controlObj !== 'object' || !controlObj) {
    return '';
  }
  const obj = controlObj as Record<string, unknown>;
  return obj['Name'] != null ? valueToString(obj['Name']) : 
         obj['name'] != null ? valueToString(obj['name']) : '';
}

/**
 * Convert raw value to appropriate type for Q-SYS
 */
function convertControlValue(rawValue: unknown): number | string | boolean {
  if (typeof rawValue === 'number' || typeof rawValue === 'string' || typeof rawValue === 'boolean') {
    return rawValue;
  } else if (rawValue === null || rawValue === undefined) {
    return 0; // Default value
  } else {
    // Convert complex types to string
    return valueToString(rawValue);
  }
}

/**
 * Extract and validate control update parameters
 */
function extractControlUpdateParams(
  controlObj: unknown,
  qrwc: NonNullable<ReturnType<OfficialQRWCClient['getQrwc']>>
): { name: string; componentName: string; controlName: string; newValue: number | string | boolean; error?: string } | null {
  // Extract control name
  const name = extractControlName(controlObj);
  if (!name) {
    logger.error('Failed to set control value', { control: '', error: new Error('Invalid control object') });
    return null;
  }

  // Parse control name
  const parsed = parseControlName(name);
  if (!parsed) {
    return { name, componentName: '', controlName: '', newValue: 0, error: `Invalid control name format: ${name}` };
  }

  // Check component exists
  const component = qrwc.components[parsed.componentName];
  if (!component) {
    return { name, ...parsed, newValue: 0, error: `Component not found: ${parsed.componentName}` };
  }

  // Extract and convert value
  const obj = controlObj as Record<string, unknown>;
  const newValue = convertControlValue(obj['Value']);

  return { name, ...parsed, newValue };
}

/**
 * Process a single control update
 */
async function processSingleControl(
  controlObj: unknown,
  client: OfficialQRWCClient,
  qrwc: NonNullable<ReturnType<OfficialQRWCClient['getQrwc']>>
): Promise<{ Name: string; Result: string; Error?: string }> {
  const params = extractControlUpdateParams(controlObj, qrwc);
  if (!params) {
    return { Name: '', Result: 'Error', Error: 'Invalid control object' };
  }
  if (params.error) {
    return { Name: params.name, Result: 'Error', Error: params.error };
  }

  const { name, componentName, controlName, newValue } = params;
  const component = qrwc.components[componentName];
  if (!component) {
    return { Name: name, Result: 'Error', Error: `Component '${componentName}' not found` };
  }

  // Validate control value
  const controlInfo = component.controls[controlName];
  const validation = validateControlValue(name, newValue, controlInfo);
  if (!validation.valid) {
    logger.error('Failed to set control value', { control: name, error: new Error(validation.error ?? 'Invalid value') });
    return { Name: name, Result: 'Error', Error: validation.error ?? 'Invalid value' };
  }

  try {
    // Update through official client
    await client.setControlValue(componentName, controlName, newValue);
    
    // Update local state
    const control = component.controls[controlName];
    if (control && 'Value' in control) {
      (control as { Value?: unknown }).Value = newValue;
    }
    
    return { Name: name, Result: 'Success' };
  } catch (error) {
    logger.error('Failed to set control value', { control: name, error });
    return { Name: name, Result: 'Error', Error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Handle Control.Set command
 */
export async function handleControlSet(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): Promise<{ result: Array<{ Name: string; Result: string; Error?: string }> }> {
  // Validate parameters
  const controlsParam = params?.['Controls'];
  if (!Array.isArray(controlsParam)) {
    throw new ValidationError('Controls array is required',
      [{ field: 'Controls', message: 'Must be an array', code: 'INVALID_TYPE' }]);
  }

  // Get QRWC instance
  const qrwc = client.getQrwc();
  if (!qrwc) {
    throw new QSysError('QRWC instance not available', QSysErrorCode.CONNECTION_FAILED);
  }

  // Process each control sequentially to maintain order and avoid race conditions
  const results: Array<{ Name: string; Result: string; Error?: string }> = [];
  for (const controlObj of controlsParam) {
    const result = await processSingleControl(controlObj, client, qrwc);
    results.push(result);
  }

  return { result: results };
}

/**
 * Handle Status.Get command
 */
export function handleStatusGet(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): { result: Record<string, unknown> } {
  const qrwc = client.getQrwc();

  if (!qrwc || !client.isConnected()) {
    return {
      result: {
        Platform: 'Q-SYS Designer',
        State: 'Disconnected',
        DesignName: 'Unknown',
        DesignCode: '',
        IsRedundant: false,
        IsEmulator: false,
        Status: {
          Code: 5,
          String: 'Not connected to Q-SYS Core',
        },
      },
    };
  }

  const componentCount = Object.keys(qrwc.components).length;
  const controlCount = Object.values(qrwc.components).reduce((count, comp) => {
    return count + Object.keys(comp.controls).length;
  }, 0);

  const hasAudio = Object.values(qrwc.components).some(comp => 
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime safety: Type may be undefined
    comp.state?.Type?.includes('Audio') ?? false
  );

  const hasVideo = Object.values(qrwc.components).some(comp => 
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime safety: Type may be undefined
    comp.state?.Type?.includes('Video') ?? false
  );

  return {
    result: {
      Platform: 'Q-SYS Designer',
      State: 'Active',
      DesignName: `MCP-Demo-${componentCount}-Components`,
      DesignCode: 'MCP001',
      IsRedundant: false,
      IsEmulator: false,
      Status: {
        Code: 0,
        String: 'OK',
      },
      ComponentCount: componentCount,
      ControlCount: controlCount,
      HasAudioComponents: hasAudio,
      HasVideoComponents: hasVideo,
      ConnectionInfo: {
        Host: 'Unknown', // Options are private in OfficialQRWCClient
        Port: 443, // Default Q-SYS port
      },
    },
  };
}

/**
 * Handle Component.GetAllControls command
 */
export function handleGetAllControls(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): { result: ControlInfo[] } {
  const qrwc = client.getQrwc();
  if (!qrwc) {
    throw new QSysError('QRWC instance not available', QSysErrorCode.CONNECTION_FAILED);
  }

  const allControls: ControlInfo[] = [];

  for (const [componentName, component] of Object.entries(qrwc.components)) {
    const comp = component;
    
    for (const [controlName, control] of Object.entries(comp.controls)) {
      const fullName = `${componentName}.${controlName}`;
      const { value, type } = extractControlValue(control);

      allControls.push({
        Name: fullName,
        Type: type,
        Value: value,
        String: valueToString(value),
      });
    }
  }

  logger.info(`Retrieved ${allControls.length} controls from all components`);
  return { result: allControls };
}

/**
 * Handle Component.GetAllControlValues command
 */
export function handleGetAllControlValues(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): { result: Record<string, { Value: unknown; String: string }> } {
  const componentName = params?.['Name'] ?? params?.['name'];
  if (!componentName || typeof componentName !== 'string') {
    throw new ValidationError('Component name is required', 
      [{ field: 'Name', message: 'Component name is required', code: 'REQUIRED_FIELD' }]);
  }

  const qrwc = client.getQrwc();
  if (!qrwc?.components[componentName]) {
    throw new QSysError(`Component not found: ${componentName}`, QSysErrorCode.INVALID_COMPONENT,
      { componentName });
  }

  const component = qrwc.components[componentName] as Component | undefined;
  if (!component) {
    return { result: {} };
  }

  const controlValues: Record<string, { Value: unknown; String: string }> = {};

  for (const [name, control] of Object.entries(component.controls)) {
    const fullName = `${componentName}.${name}`;
    const { value } = extractControlValue(control);

    controlValues[fullName] = {
      Value: value,
      String: valueToString(value),
    };
  }

  return { result: controlValues };
}

/**
 * Handle direct control operations
 */
// eslint-disable-next-line max-statements -- Direct control operations require multiple validation steps
export async function handleDirectControl(
  command: string,
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): Promise<unknown> {
  const qrwc = client.getQrwc();
  if (!qrwc) {
    throw new QSysError('QRWC instance not available', QSysErrorCode.CONNECTION_FAILED);
  }

  // Extract component and control names from the command
  const parts = command.split('.');
  if (parts.length < 3) {
    throw new ValidationError(`Invalid direct control command format: ${command}`,
      [{ field: 'command', message: 'Must be in format Component.Control.operation', code: 'INVALID_FORMAT' }]);
  }

  const componentName = parts[0];
  const controlName = parts.slice(1, -1).join('.');
  const operation = parts[parts.length - 1];

  if (!componentName) {
    throw new ValidationError(`Invalid direct control command format: ${command}`,
      [{ field: 'command', message: 'Component name is required', code: 'INVALID_FORMAT' }]);
  }

  const component = qrwc.components[componentName];
  if (!component) {
    throw new QSysError(`Component not found: ${componentName}`, QSysErrorCode.INVALID_COMPONENT,
      { componentName });
  }

  if (!controlName || !(controlName in component.controls)) {
    throw new QSysError(`Control not found: ${componentName}.${controlName}`, 
      QSysErrorCode.INVALID_CONTROL, { componentName, controlName });
  }

  const control = component.controls[controlName];

  if (operation === 'get') {
    const { value } = extractControlValue(control);
    return { result: value };
  } else if (operation === 'set' && params?.['value'] !== undefined) {
    // For direct control operations, we need to use the official client's setControlValue
    const value = params['value'];
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new ValidationError(`Invalid value type for control ${controlName}`,
        [{ field: 'value', message: 'Must be string, number, or boolean', code: 'INVALID_TYPE' }]);
    }
    await client.setControlValue(componentName, controlName, value);
    return { result: 'Control updated successfully' };
  } else {
    throw new ValidationError(`Unknown operation: ${operation}`,
      [{ field: 'operation', message: 'Must be get or set', code: 'INVALID_VALUE' }]);
  }
}
