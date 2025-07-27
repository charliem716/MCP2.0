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
    if (control.Position !== undefined) {
      result.Position = control.Position;
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

    const controlState = control as Record<string, unknown>;
    const { value, type } = extractControlValue(controlState);

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
 * Handle Control.Set command
 */
export async function handleControlSet(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): Promise<{ result: Array<{ Name: string; Result: string; Error?: string }> }> {
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

  const results: Array<{ Name: string; Result: string; Error?: string }> = [];

  for (const controlObj of controls) {
    // Initialize name variable to avoid ReferenceError in catch block (BUG-060 fix)
    let name = '';
    
    try {
      if (typeof controlObj !== 'object' || !controlObj) {
        // For invalid control objects, add error result
        results.push({
          Name: '',
          Result: 'Error',
          Error: 'Invalid control object'
        });
        
        // Log error with empty name
        logger.error('Failed to set control value', {
          control: '',
          error: new Error('Invalid control object')
        });
        continue;
      }

      const obj = controlObj as Record<string, unknown>;
      name = obj['Name'] != null ? valueToString(obj['Name']) : obj['name'] != null ? valueToString(obj['name']) : '';
      const [componentName, controlName] = name.split('.');

      if (!componentName || !controlName) {
        results.push({
          Name: name,
          Result: 'Error',
          Error: `Invalid control name format: ${name}`
        });
        continue;
      }

      const component = qrwc.components[componentName];
      if (!component) {
        results.push({
          Name: name,
          Result: 'Error',
          Error: `Component not found: ${componentName}`
        });
        continue;
      }

      const rawValue = obj['Value'];
      let newValue: number | string | boolean;
      
      // Ensure the value is of the correct type
      if (typeof rawValue === 'number' || typeof rawValue === 'string' || typeof rawValue === 'boolean') {
        newValue = rawValue;
      } else if (rawValue === null || rawValue === undefined) {
        newValue = 0; // Default value
      } else {
        // Convert complex types to string
        newValue = valueToString(rawValue);
      }
      
      // Get control info for validation
      const controlInfo = component.controls[controlName];
      const validation = validateControlValue(name, newValue, controlInfo);

      if (!validation.valid) {
        results.push({
          Name: name,
          Result: 'Error',
          Error: validation.error ?? 'Invalid value'
        });
        
        // Log error with control name
        logger.error('Failed to set control value', {
          control: name,
          error: new Error(validation.error ?? 'Invalid value')
        });
        continue;
      }

      // Update through official client
      await client.setControlValue(componentName, controlName, newValue);
      
      // Update local state
      const control = component.controls[controlName];
      if (control && 'Value' in control) {
        (control as { Value?: unknown }).Value = newValue;
      }
      
      results.push({
        Name: name,
        Result: 'Success'
      });
    } catch (error) {
      // This catch block now has access to the name variable (BUG-060 fix)
      logger.error('Failed to set control value', {
        control: name, // No longer undefined
        error
      });
      
      results.push({
        Name: name,
        Result: 'Error',
        Error: error instanceof Error ? error.message : String(error)
      });
    }
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
    const component = comp as Component | undefined;
    if (!component || !component.controls) return count;
    return count + Object.keys(component.controls).length;
  }, 0);

  const hasAudio = Object.values(qrwc.components).some(comp => {
    const component = comp as Component;
    return component.state.Type.includes('Audio');
  });

  const hasVideo = Object.values(qrwc.components).some(comp => {
    const component = comp as Component;
    return component.state.Type.includes('Video');
  });

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
    const comp = component as Component;
    if (!comp.controls) continue;

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
  if (!component || !component.controls) {
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

  if (!component.controls || !controlName || !(controlName in component.controls)) {
    throw new QSysError(`Control not found: ${componentName}.${controlName}`, 
      QSysErrorCode.INVALID_CONTROL, { componentName, controlName });
  }

  const control = component.controls[controlName];

  if (operation === 'get') {
    const { value } = extractControlValue(control);
    return { result: value };
  } else if (operation === 'set' && params?.['value'] !== undefined) {
    // For direct control operations, we need to use the official client's setControlValue
    await client.setControlValue(componentName, controlName, params['value']);
    return { result: 'Control updated successfully' };
  } else {
    throw new ValidationError(`Unknown operation: ${operation}`,
      [{ field: 'operation', message: 'Must be get or set', code: 'INVALID_VALUE' }]);
  }
}
