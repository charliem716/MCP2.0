/**
 * Command handlers for QRWC adapter
 * Extracts complex switch cases into separate functions
 */

import { globalLogger as logger } from '../../shared/utils/logger.js';
import type { OfficialQRWCClient } from '../../qrwc/officialClient.js';
import { extractControlValue } from './converters.js';
import { validateControlValue } from './validators.js';
import { QSysError, QSysErrorCode, ValidationError } from '../../shared/types/errors.js';

export type CommandHandler = (
  params?: Record<string, unknown>,
  client?: OfficialQRWCClient
) => unknown;

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
    const component = qrwc.components[name] as {
      state?: { Type?: string; Properties?: unknown[] };
    };

    return {
      Name: name,
      Type: component?.state?.Type ?? 'Component',
      Properties: component?.state?.Properties ?? [],
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

  const component = qrwc.components[componentName] as {
    controls?: Record<
      string,
      { Position?: number; String?: string; Value?: unknown }
    >;
  };

  if (!component.controls) {
    return { result: { Name: componentName, Controls: [] } };
  }

  const controls = Object.entries(component.controls).map(([name, control]) => {
    const { value, type } = extractControlValue(control);

    const result: ControlInfo = {
      Name: name,
      Type: type,
      Value: value,
      String: String(value ?? ''),
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
  const controls = params?.['Controls'] as unknown[];
  if (!Array.isArray(controls)) {
    throw new ValidationError('Controls array is required',
      [{ field: 'Controls', message: 'Must be an array', code: 'INVALID_TYPE' }]);
  }

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
      fullName = String(obj['Name'] ?? obj['name'] ?? '');
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

    const control = (component as { controls?: Record<string, unknown> })
      .controls?.[controlName];
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
      String: String(value ?? ''),
    };
  });

  return { result: results };
}

/**
 * Handle Control.Set command
 */
export function handleControlSet(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): { result: string } {
  const controls = params?.['Controls'] as unknown[];
  if (!Array.isArray(controls)) {
    throw new ValidationError('Controls array is required',
      [{ field: 'Controls', message: 'Must be an array', code: 'INVALID_TYPE' }]);
  }

  const qrwc = client.getQrwc();
  if (!qrwc) {
    throw new QSysError('QRWC instance not available', QSysErrorCode.CONNECTION_FAILED);
  }

  for (const controlObj of controls) {
    if (typeof controlObj !== 'object' || !controlObj) {
      throw new ValidationError('Invalid control object',
        [{ field: 'control', message: 'Each control must be an object', code: 'INVALID_TYPE' }]);
    }

    const obj = controlObj as Record<string, unknown>;
    const fullName = String(obj['Name'] ?? obj['name'] ?? '');
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

    const newValue = obj['Value'] ?? 0;
    const validation = validateControlValue(fullName, newValue, {
      Type: 'Number',
    });

    if (!validation.valid) {
      throw new ValidationError(`Invalid value for ${fullName}: ${validation.error}`,
        [{ field: fullName, message: validation.error || 'Invalid value', code: 'INVALID_VALUE' }]);
    }

    // Update through official client
    if ('controls' in component && component.controls) {
      const controls = component.controls as Record<
        string,
        { Value?: unknown }
      >;
      if (controls[controlName]) {
        controls[controlName].Value = newValue;
      }
    }
  }

  return { result: 'Controls updated successfully' };
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
    const controls = (comp as { controls?: Record<string, unknown> }).controls;
    return count + (controls ? Object.keys(controls).length : 0);
  }, 0);

  const hasAudio = Object.values(qrwc.components).some(comp => {
    const type = (comp as { state?: { Type?: string } }).state?.Type;
    return type?.includes('Audio') ?? false;
  });

  const hasVideo = Object.values(qrwc.components).some(comp => {
    const type = (comp as { state?: { Type?: string } }).state?.Type;
    return type?.includes('Video') ?? false;
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
    const comp = component as { controls?: Record<string, unknown> };
    if (!comp.controls) continue;

    for (const [controlName, control] of Object.entries(comp.controls)) {
      const fullName = `${componentName}.${controlName}`;
      const state = control as Record<string, unknown>;
      const { value, type } = extractControlValue(state);

      allControls.push({
        Name: fullName,
        Type: type,
        Value: value,
        String: String(value ?? ''),
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

  const component = qrwc.components[componentName] as {
    controls?: Record<string, unknown>;
  };
  if (!component.controls) {
    return { result: {} };
  }

  const controlValues: Record<string, { Value: unknown; String: string }> = {};

  for (const [name, control] of Object.entries(component.controls)) {
    const fullName = `${componentName}.${name}`;
    const state = control as Record<string, unknown>;
    const { value } = extractControlValue(state);

    controlValues[fullName] = {
      Value: value,
      String: String(value ?? ''),
    };
  }

  return { result: controlValues };
}

/**
 * Handle direct control operations
 */
export function handleDirectControl(
  command: string,
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): unknown {
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

  const controls = (component as { controls?: Record<string, unknown> })
    .controls;
  if (!controls || !controlName || !(controlName in controls)) {
    throw new QSysError(`Control not found: ${componentName}.${controlName}`, 
      QSysErrorCode.INVALID_CONTROL, { componentName, controlName });
  }

  const control = controls[controlName] as Record<string, unknown>;

  if (operation === 'get') {
    const { value } = extractControlValue(control);
    return { result: value };
  } else if (operation === 'set' && params?.['value'] !== undefined) {
    control['Value'] = params['value'];
    return { result: 'Control updated successfully' };
  } else {
    throw new ValidationError(`Unknown operation: ${operation}`,
      [{ field: 'operation', message: 'Must be get or set', code: 'INVALID_VALUE' }]);
  }
}
