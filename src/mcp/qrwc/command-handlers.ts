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
export async function handleGetComponents(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): Promise<{ result: ComponentInfo[] }> {
  // During SDK initialization, qrwc doesn't exist yet
  // We need to send the actual command to Q-SYS
  const qrwc = client.getQrwc();
  
  // If QRWC is available, return components from it
  if (qrwc) {
    const components = Object.entries(qrwc.components).map(([name, component]) => {
      // ESLint's no-unnecessary-condition rule is giving contradictory advice here
      // The state property is optional on QSYSComponent, so we need to handle it
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const type = component.state?.Type ?? 'Unknown';
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const properties = component.state?.Properties ?? [];
      
      return {
        Name: name,
        Type: type,
        Properties: properties,
      };
    });

    logger.info(`Returning ${components.length} components from Q-SYS Core`);
    return { result: components };
  }
  
  // If qrwc is not available, throw error
  throw new QSysError('QRWC instance not available', QSysErrorCode.NOT_INITIALIZED);
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
  
  // Check if component exists in QRWC SDK
  if (!qrwc?.components[componentName]) {
    // Component not in SDK - return empty controls list
    // This handles components like Table_Mic_Meter that aren't in qrwc.components
    logger.warn(`Component ${componentName} not found in QRWC SDK, returning empty controls`);
    return { 
      result: { 
        Name: componentName, 
        Controls: [] 
      } 
    };
  }

  const component = qrwc.components[componentName];

  const controls = Object.entries(component.controls).map(([name, control]) => {
    try {
      const { value, type } = extractControlValue(control);

      const result: ControlInfo = {
        Name: name,
        Type: type,
        Value: value,
        String: valueToString(value),
      };

      // Only add Position if it exists - safely check for the property
      if (control && typeof control === 'object' && 'Position' in control) {
        const pos = (control as any).Position;
        if (typeof pos === 'number') {
          result.Position = pos;
        }
      }

      return result;
    } catch (err) {
      // If we can't extract the control value due to circular reference or other issue,
      // return a placeholder control
      logger.warn(`Failed to extract control ${name} from component ${componentName}: ${err instanceof Error ? err.message : String(err)}`);
      return {
        Name: name,
        Type: 'Unknown',
        Value: 0,
        String: 'N/A',
      };
    }
  });

  logger.info(
    `Returning ${controls.length} controls for component ${componentName}`
  );
  return { result: { Name: componentName, Controls: controls } };
}

/**
 * Handle Component.Get command
 * Gets specific control values from a component
 */
export function handleComponentGet(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): { result: { Name: string; Controls: ControlInfo[] } } {
  const componentName = params?.['Name'] ?? params?.['name'];
  if (!componentName || typeof componentName !== 'string') {
    throw new ValidationError('Component name is required', 
      [{ field: 'Name', message: 'Component name is required', code: 'REQUIRED_FIELD' }]);
  }
  
  const controlsParam = params?.['Controls'];
  if (!Array.isArray(controlsParam)) {
    throw new ValidationError('Controls array is required',
      [{ field: 'Controls', message: 'Must be an array', code: 'INVALID_TYPE' }]);
  }
  
  const qrwc = client.getQrwc();
  const resultControls: ControlInfo[] = [];
  
  // Process each requested control
  for (const controlSpec of controlsParam) {
    let controlName: string;
    
    if (typeof controlSpec === 'string') {
      controlName = controlSpec;
    } else if (typeof controlSpec === 'object' && controlSpec !== null) {
      const spec = controlSpec as Record<string, unknown>;
      controlName = String(spec['Name'] ?? spec['name'] ?? '');
    } else {
      continue;
    }
    
    if (!controlName) continue;
    
    // Try to get control value from component
    const fullControlName = `${componentName}.${controlName}`;
    
    if (qrwc?.components[componentName]?.controls[controlName]) {
      const control = qrwc.components[componentName].controls[controlName];
      const { value, type } = extractControlValue(control);
      
      resultControls.push({
        Name: controlName,
        Type: type,
        Value: value,
        String: valueToString(value),
      });
    } else {
      // Control not found - add placeholder
      resultControls.push({
        Name: controlName,
        Type: 'Unknown',
        Value: 0,
        String: 'N/A',
      });
    }
  }
  
  logger.info(`Component.Get returning ${resultControls.length} controls for ${componentName}`);
  return { result: { Name: componentName, Controls: resultControls } };
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

    // Parse control name with enhanced support for complex names
    const parsed = parseControlNameEnhanced(fullName, qrwc);
    
    if (!parsed) {
      throw new ValidationError(`Invalid control name format: ${fullName}`,
        [{ field: 'controlName', message: 'Must be in format Component.Control, Complex.Component.Control, or a valid Code Name', code: 'INVALID_FORMAT' }]);
    }
    
    // Handle named controls (single word Code Names without dots)
    if (parsed.componentName === '__NAMED__') {
      // This is a named control - we need different handling
      // For now, return a placeholder since we can't access it without proper Code Name setup
      logger.warn(`Named control ${parsed.controlName} requested but not accessible via QRWC SDK`);
      return {
        Name: fullName,
        Type: 'Unknown',
        Value: 0,
        String: 'N/A',
      };
    }

    const { componentName, controlName } = parsed;
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
 * Handle Control.GetValues command - Optimized for bulk operations
 * Groups controls by component for efficient batch retrieval
 * 
 * OPTIMIZATION STRATEGY:
 * - Parses all control names first to group by component
 * - Processes all controls from the same component together
 * - Reduces redundant component lookups
 * - Maintains original order in results
 * 
 * For very large bulk operations (>50 controls), callers should consider:
 * 1. Getting all components first with Component.GetComponents
 * 2. Then getting full component state with Component.Get for each needed component
 * This avoids the overhead of parsing many individual control paths.
 */
export function handleControlGetValues(
  params: Record<string, unknown> | undefined,
  client: OfficialQRWCClient
): { result: ControlInfo[] } {
  const namesParam = params?.['Names'];
  if (!Array.isArray(namesParam)) {
    throw new ValidationError('Names array is required',
      [{ field: 'Names', message: 'Must be an array', code: 'INVALID_TYPE' }]);
  }
  const controlNames = namesParam;

  const qrwc = client.getQrwc();
  if (!qrwc) {
    throw new QSysError('QRWC instance not available', QSysErrorCode.CONNECTION_FAILED);
  }

  // Group controls by component for batch processing
  const controlsByComponent = new Map<string, string[]>();
  const namedControls: string[] = [];
  const resultOrder = new Map<string, number>();
  
  // Parse and group controls
  for (let index = 0; index < controlNames.length; index++) {
    const fullName = controlNames[index];
    resultOrder.set(fullName, index);
    
    if (typeof fullName !== 'string') {
      continue; // Skip invalid entries, handle them later
    }
    
    const parsed = parseControlNameEnhanced(fullName, qrwc);
    if (!parsed) {
      continue; // Skip unparseable entries
    }
    
    if (parsed.componentName === '__NAMED__') {
      namedControls.push(fullName);
    } else {
      // Group by component for batch retrieval
      if (!controlsByComponent.has(parsed.componentName)) {
        controlsByComponent.set(parsed.componentName, []);
      }
      controlsByComponent.get(parsed.componentName)!.push(parsed.controlName);
    }
  }
  
  // Process controls in batches by component for efficiency
  const resultsMap = new Map<string, ControlInfo>();
  
  // Process grouped controls by component
  for (const [componentName, controls] of controlsByComponent) {
    const component = qrwc.components[componentName];
    if (!component) {
      // Add error results for all controls in this component
      controls.forEach(controlName => {
        const fullName = `${componentName}.${controlName}`;
        resultsMap.set(fullName, {
          Name: fullName,
          Type: 'Unknown',
          Value: 0,
          String: 'Component not found',
        });
      });
      continue;
    }
    
    // Batch process all controls for this component
    controls.forEach(controlName => {
      const fullName = `${componentName}.${controlName}`;
      const control = component.controls[controlName];
      
      if (!control) {
        resultsMap.set(fullName, {
          Name: fullName,
          Type: 'Unknown',
          Value: 0,
          String: 'Control not found',
        });
      } else {
        const { value, type } = extractControlValue(control as unknown);
        let stringValue = valueToString(value);
        
        if (control && typeof control === 'object' && 'state' in control) {
          const state = (control as any).state;
          if (state && typeof state === 'object' && 'String' in state) {
            stringValue = state.String;
          }
        }
        
        resultsMap.set(fullName, {
          Name: fullName,
          Type: type,
          Value: value,
          String: stringValue,
        });
      }
    });
  }
  
  // Handle named controls
  namedControls.forEach(fullName => {
    logger.warn(`Named control ${fullName} requested but not accessible via QRWC SDK`);
    resultsMap.set(fullName, {
      Name: fullName,
      Type: 'Unknown',
      Value: 0,
      String: 'N/A',
    });
  });
  
  // Handle any invalid entries
  controlNames.forEach((fullName, index) => {
    if (typeof fullName !== 'string') {
      const name = String(fullName);
      resultsMap.set(name, {
        Name: name,
        Type: 'Unknown',
        Value: 0,
        String: 'Invalid control name type',
      });
    } else if (!resultsMap.has(fullName)) {
      // Handle any controls that weren't processed
      resultsMap.set(fullName, {
        Name: fullName,
        Type: 'Unknown',
        Value: 0,
        String: 'Invalid control format',
      });
    }
  });
  
  // Return results in original order
  const results = controlNames.map(name => {
    const key = typeof name === 'string' ? name : String(name);
    return resultsMap.get(key) || {
      Name: key,
      Type: 'Unknown',
      Value: 0,
      String: 'Processing error',
    };
  });
  
  return { result: results };
}

/**
 * Parse control name into component and control parts
 * Supports multiple formats:
 * - "Component.Control" - Standard format
 * - "Complex Component.Complex Control" - Components/controls with spaces
 * - "Component.with.dots.ControlName" - Complex nested naming
 * - "CodeName" - Single Code Name format
 */
function parseControlName(name: string): { componentName: string; controlName: string } | null {
  const parts = name.split('.');
  
  if (parts.length === 2) {
    // Standard Component.Control format
    const [componentName, controlName] = parts;
    if (!componentName || !controlName) {
      return null;
    }
    return { componentName, controlName };
  } else if (parts.length === 1 && name.length > 0) {
    // Single Code Name format (no dots) - treat as a standalone named control
    // Return special marker to indicate this is a named control
    return { componentName: '__NAMED__', controlName: name };
  } else if (parts.length > 2) {
    // Complex format - try different splitting strategies
    // Strategy 1: Last part is control, everything else is component
    // Example: "Zone.1.Audio.gain" -> component: "Zone.1.Audio", control: "gain"
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex > 0) {
      const componentName = name.substring(0, lastDotIndex);
      const controlName = name.substring(lastDotIndex + 1);
      if (componentName && controlName) {
        return { componentName, controlName };
      }
    }
  }
  
  return null;
}

/**
 * Enhanced control name parser with fallback strategies
 * Tries multiple approaches to find valid component.control combinations
 * 
 * STRATEGY:
 * 1. First tries standard parsing (Component.Control or CodeName)
 * 2. If QRWC available, validates the parse result exists
 * 3. For complex names (>2 dots), tries all possible split points
 * 4. Returns the first valid component.control combination found
 * 
 * This enables support for complex control paths like:
 * - "Zone.1.Audio.gain" -> finds Zone.1.Audio component with gain control
 * - "Building.Floor.2.temperature" -> finds correct component split
 * 
 * NOTE: This validation adds overhead. For bulk operations with known
 * control paths, consider getting full component states instead.
 */
function parseControlNameEnhanced(
  name: string,
  qrwc: NonNullable<ReturnType<OfficialQRWCClient['getQrwc']>> | null
): { componentName: string; controlName: string } | null {
  // First try the standard parser
  const parsed = parseControlName(name);
  
  // If we have a QRWC instance and the parsed result, verify it exists
  if (parsed && qrwc && parsed.componentName !== '__NAMED__') {
    // Check if this component.control combination exists
    if (qrwc.components[parsed.componentName]?.controls[parsed.controlName]) {
      return parsed;
    }
    
    // If not found with the default parse, try alternative strategies for complex names
    const parts = name.split('.');
    if (parts.length > 2) {
      // Try each possible split point to find a valid component.control combination
      for (let i = 1; i < parts.length; i++) {
        const possibleComponent = parts.slice(0, i).join('.');
        const possibleControl = parts.slice(i).join('.');
        
        if (qrwc.components[possibleComponent]?.controls[possibleControl]) {
          logger.debug(`Found complex control via search: ${possibleComponent}.${possibleControl}`);
          return { componentName: possibleComponent, controlName: possibleControl };
        }
      }
    }
  }
  
  return parsed;
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

  // Parse control name with enhanced support for complex names
  const parsed = parseControlNameEnhanced(name, qrwc);
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
