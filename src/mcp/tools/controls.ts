import { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema, type ToolExecutionContext } from './base.js';
import { config as envConfig } from '../../shared/utils/env.js';
import type { ToolCallResult } from '../handlers/index.js';
import type { IControlSystem } from '../interfaces/control-system.js';
import { ValidationError } from '../../shared/types/errors.js';
import {
  type QSysComponentControlsResponse,
  type QSysControlGetResponse,
  type QSysApiResponse,
  isQSysApiResponse,
  isComponentControlsResponse,
  isControlsArrayResponse,
} from '../types/qsys-api-responses.js';

/**
 * Safe JSON stringify that handles circular references
 */
function safeJsonStringify(obj: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(obj, (key, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
    }
    return value;
  });
}

// Extract the control type from the existing interface
type QSysControlInfo = QSysComponentControlsResponse['Controls'][0];

// Type for control values (matches the Zod schema)
type ControlValue = number | string | boolean;

// Type for control set response
interface ControlSetResponse {
  name: string;
  value: ControlValue;
  success: boolean;
  rampTime?: number;
  error?: string;
}

/**
 * Parameters for the list_controls tool
 */
export const ListControlsParamsSchema = BaseToolParamsSchema.extend({
  component: z
    .string()
    .describe('Component name to list controls for (required)'),
  controlType: z
    .enum(['gain', 'mute', 'input_select', 'output_select', 'all'])
    .optional()
    .describe('Filter by control type'),
  includeMetadata: z
    .boolean()
    .optional()
    .describe('Include control metadata like min/max values'),
});

export type ListControlsParams = z.infer<typeof ListControlsParamsSchema>;

/**
 * Parameters for the get_control_values tool
 */
export const GetControlValuesParamsSchema = BaseToolParamsSchema.extend({
  controls: z
    .array(z.string())
    .min(1)
    .describe('Array of control names to get values for'),
});

export type GetControlValuesParams = z.infer<
  typeof GetControlValuesParamsSchema
>;

/**
 * Parameters for the set_control_values tool
 */
export const SetControlValuesParamsSchema = BaseToolParamsSchema.extend({
  controls: z
    .array(
      z.object({
        name: z.string().describe('Control name'),
        value: z
          .union([z.number(), z.string(), z.boolean()])
          .describe('Control value'),
        ramp: z.number().positive().optional().describe('Ramp time in seconds'),
      })
    )
    .min(1)
    .describe('Array of controls to set with their values'),
  validate: z
    .boolean()
    .optional()
    .describe('Validate controls exist before setting (default: true)'),
});

export type SetControlValuesParams = z.infer<
  typeof SetControlValuesParamsSchema
>;

/**
 * Tool to list all available controls in Q-SYS components
 */
export class ListControlsTool extends BaseQSysTool<ListControlsParams> {
  constructor(qrwcClient: IControlSystem) {
    super(
      qrwcClient,
      'list_controls',
      "List controls for a specific component with optional filtering. Component parameter is required. Use includeMetadata=true for values/ranges/positions. Example: {component:'Main Mixer',includeMetadata:true}.",
      ListControlsParamsSchema
    );
  }

  protected async executeInternal(
    params: ListControlsParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      // Component is now required
      if (!params.component) {
        throw new ValidationError(
          'Component parameter is required. For system-wide discovery, use list_components then iterate with list_controls for each component.',
          [{ field: 'component', message: 'Required parameter', code: 'REQUIRED_FIELD' }]
        );
      }
      
      const response = await this.controlSystem.sendCommand('Component.GetControls', { Name: params.component });

      const controls = this.parseControlsResponse(response, params);

      // Try to serialize the controls with proper error handling
      let serializedControls: string;
      try {
        serializedControls = safeJsonStringify(controls);
      } catch (jsonError) {
        this.logger.error('Failed to serialize controls - circular reference detected', { 
          error: jsonError, 
          context,
          controlsCount: controls.length 
        });
        
        // Return a formatted error response instead of throwing
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'JSON_SERIALIZATION_ERROR',
                message: 'Failed to serialize controls due to circular reference',
                details: {
                  controlsFound: controls.length,
                  hint: 'The controls response contains circular references that cannot be serialized. This may be due to self-referencing objects in the Q-SYS API response.'
                }
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: serializedControls,
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.error('Failed to list controls', { error, context });
      
      // Return formatted error instead of throwing
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'CONTROLS_LIST_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error occurred',
              details: {
                component: params.component ?? 'all',
                controlType: params.controlType ?? 'all'
              }
            }),
          },
        ],
        isError: true,
      };
    }
  }

  private parseControlsResponse(
    response: unknown,
    params: ListControlsParams
  ): QSysControl[] {
    this.logger.debug('Parsing controls response', { response });

    // Handle response format from Component.GetControls
    if (!isQSysApiResponse<QSysComponentControlsResponse | QSysControlInfo[]>(response)) {
      this.logger.warn('Invalid response format', { response });
      return [];
    }

    // Check for error response
    if (response.error) {
      throw new Error(`Q-SYS API error: ${response.error.message}`);
    }

    // Component.GetControls returns { result: { Name: "...", Controls: [...] } }
    let controls: QSysControlInfo[] = [];
    let componentName = 'unknown';

    if (response.result && typeof response.result === 'object' && 
        'Controls' in response.result && 
        Array.isArray(response.result.Controls)) {
      const componentResponse = response.result;
      controls = componentResponse.Controls;
      componentName = componentResponse.Name;
    }

    if (controls.length === 0) {
      this.logger.warn('No controls in response', { response });
      return [];
    }

    const parsedControls = controls.map(ctrl => {
      // Extract control type from Name or Properties
      const controlType = this.inferControlType(ctrl);

      // Get and validate the value
      let value: number | string | boolean = '';

      if (
        typeof ctrl.Value === 'string' ||
        typeof ctrl.Value === 'number' ||
        typeof ctrl.Value === 'boolean'
      ) {
        value = ctrl.Value;
      } else {
        // Convert to string if it's some other type or undefined/null
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Value can be null/undefined
        value = ctrl.Value == null ? '' : String(ctrl.Value);
      }

      return {
        name: ctrl.Name,
        component:
          ctrl.Component ??
          (componentName !== 'unknown' ? componentName : this.extractComponentFromName(ctrl.Name)),
        type: controlType,
        value,
        metadata: this.extractMetadata(ctrl),
      };
    });

    // Apply filters
    let filteredControls = parsedControls;

    // When using Component.GetControls with a specific component,
    // all returned controls belong to that component
    if (params.component && response.result && !Array.isArray(response.result)) {
      // Component.GetControls was used, so all controls are from the requested component
      // Don't filter by component name
    } else if (params.component) {
      // Component filter was specified
      filteredControls = filteredControls.filter(
        (c: QSysControl) => c.component === params.component
      );
    }

    if (params.controlType && params.controlType !== 'all') {
      filteredControls = filteredControls.filter(
        (c: QSysControl) => c.type === params.controlType
      );
    }

    return filteredControls;
  }

  private inferControlType(control: QSysControlInfo): string {
    const name = control.Name;
    if (!name) return 'unknown';
    const lowerName = name.toLowerCase();

    // Infer type from control name patterns
    if (lowerName.includes('gain') || lowerName.includes('level'))
      return 'gain';
    if (lowerName.includes('mute')) return 'mute';
    if (
      lowerName.includes('input_select') ||
      lowerName.includes('input.select')
    )
      return 'input_select';
    if (
      lowerName.includes('output_select') ||
      lowerName.includes('output.select')
    )
      return 'output_select';

    // Check control Type
    if (control.Type === 'Boolean') return 'mute';
    if (control.Type === 'Float' && control.String.includes('dB'))
      return 'gain';

    return 'unknown';
  }

  private extractComponentFromName(name: string | undefined): string {
    // Extract component name from control name (e.g., "MainMixer.input.1.gain" -> "MainMixer")
    if (!name) return 'Unknown';
    const parts = name.split('.');
    return parts.length > 0 && parts[0] ? parts[0] : 'Unknown';
  }

  private extractMetadata(control: QSysControlInfo): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    // Extract from Q-SYS API response format
    if (control.ValueMin !== undefined) metadata['min'] = control.ValueMin;
    if (control.ValueMax !== undefined) metadata['max'] = control.ValueMax;
    if (control.StringMin) metadata['stringMin'] = control.StringMin;
    if (control.StringMax) metadata['stringMax'] = control.StringMax;
    metadata['direction'] = control.Direction;
    metadata['position'] = control.Position;

    // Also check Properties object for legacy format
    const controlWithProps = control as QSysControlInfo & { 
      Properties?: {
        MinValue?: number;
        MaxValue?: number;
        Units?: string;
        Step?: number;
        ValueType?: string;
      }
    };
    
    if (controlWithProps.Properties) {
      const props = controlWithProps.Properties;
      if (props.MinValue !== undefined) metadata['min'] = props.MinValue;
      if (props.MaxValue !== undefined) metadata['max'] = props.MaxValue;
      if (props.Units) metadata['units'] = props.Units;
      if (props.Step !== undefined) metadata['step'] = props.Step;
      if (props.ValueType) metadata['valueType'] = props.ValueType;
    }

    return metadata;
  }

  private formatControlsResponse(
    controls: QSysControl[],
    params: ListControlsParams
  ): string {
    if (controls.length === 0) {
      return 'No controls found';
    }

    let result = `Found ${controls.length} controls\n\n`;
    
    for (const control of controls) {
      result += `${control.name} (${control.type})`;
      result += ` - Component: ${control.component}`;
      result += ` - Value: ${control.value}`;
      
      if (params.includeMetadata && control.metadata) {
        result += '\n  Metadata:\n';
        for (const [key, value] of Object.entries(control.metadata)) {
          result += `    ${key}: ${String(value)}\n`;
        }
      }
      
      result += '\n';
    }
    
    return result.trim();
  }
}

/**
 * Tool to get current values of specific controls
 * 
 * IMPORTANT BULK OPERATIONS NOTE:
 * This tool now supports complex control naming (e.g., 'Zone.1.Audio.gain') and optimizes
 * bulk requests by grouping controls by component. However, for LARGE bulk operations
 * (>20 controls across many components), consider this more efficient pattern:
 * 
 * 1. Use 'list_components' to get all components
 * 2. Use 'get_component_controls' for each component you need
 * 3. This avoids the overhead of parsing complex control names and provides full component state
 * 
 * The get_control_values tool is best for:
 * - Getting specific known controls (1-20 controls)
 * - Mixed controls from different components
 * - When you know exact control paths
 */
export class GetControlValuesTool extends BaseQSysTool<GetControlValuesParams> {
  constructor(qrwcClient: IControlSystem) {
    super(
      qrwcClient,
      'get_control_values',
      "Get current values of Q-SYS controls. Supports complex naming: 'Zone.1.Audio.gain', 'Main Mixer.gain'. BULK TIP: For many controls (>20), use list_components then get_component_controls for each component instead - it's more efficient. This tool is optimized for getting specific known controls (1-20). Returns values with timestamps. Max 100 controls per request.",
      GetControlValuesParamsSchema
    );
  }

  protected async executeInternal(
    params: GetControlValuesParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      const response = await this.controlSystem.sendCommand('Control.GetValues', {
        Names: params.controls,
      });

      const values = this.parseControlValuesResponse(response, params.controls);

      // Try to serialize the values with proper error handling
      let serializedValues: string;
      try {
        serializedValues = safeJsonStringify(values);
      } catch (jsonError) {
        this.logger.error('Failed to serialize control values - circular reference detected', { 
          error: jsonError, 
          context,
          controlsCount: values.length 
        });
        
        // Return a formatted error response instead of throwing
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'JSON_SERIALIZATION_ERROR',
                message: 'Failed to serialize control values due to circular reference',
                details: {
                  controlsRequested: params.controls.length,
                  hint: 'The control values response contains circular references that cannot be serialized.'
                }
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: serializedValues,
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.error('Failed to get control values', { error, context });
      
      // Return formatted error instead of throwing
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'CONTROL_VALUES_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error occurred',
              details: {
                controls: params.controls
              }
            }),
          },
        ],
        isError: true,
      };
    }
  }

  private parseControlValuesResponse(
    response: unknown,
    requestedControls: string[]
  ): ControlValueResult[] {
    this.logger.debug('Parsing control values response', {
      response,
      requestedControls,
    });

    // Handle different response formats from QRWC client
    let controls: unknown[] = [];
    const resp = response as { controls?: unknown[]; result?: unknown[] };

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime safety for unknown API response
    if (resp?.controls && Array.isArray(resp.controls)) {
      controls = resp.controls;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime safety for unknown API response  
    } else if (resp?.result && Array.isArray(resp.result)) {
      controls = resp.result;
    } else if (Array.isArray(response)) {
      controls = response;
    } else {
      this.logger.warn(
        'No controls found in response, returning empty values',
        { response }
      );
      // Return empty/fallback values for requested controls if no data available
      return requestedControls.map(controlName => ({
        name: controlName,
        value: 'N/A',
        error: 'Control not found',
        timestamp: new Date().toISOString(),
      }));
    }

    // Map QRWC response to our format
    const controlMap = new Map<string, QSysControlGetResponse>();
    controls.forEach((ctrl: unknown) => {
      const ctrlObj = ctrl as QSysControlGetResponse;
      if (ctrlObj.Name) {
        controlMap.set(ctrlObj.Name, ctrlObj);
      }
    });

    // Return values for requested controls
    return requestedControls.map(controlName => {
      const control = controlMap.get(controlName);
      if (control) {
        // Validate and convert the value to the expected type
        let value: number | string | boolean = '';
        if (
          typeof control.Value === 'string' ||
          typeof control.Value === 'number' ||
          typeof control.Value === 'boolean'
        ) {
          value = control.Value;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime safety for API response
          value = control.Value == null ? '' : String(control.Value);
        }

        const result: ControlValueResult = {
          name: controlName,
          value,
          timestamp: new Date().toISOString(),
        };

        if (control.String) {
          result.string = control.String;
        }

        return result;
      } else {
        const result: ControlValueResult = {
          name: controlName,
          value: 'N/A',
          error: 'Control not found',
          timestamp: new Date().toISOString(),
        };

        return result;
      }
    });
  }

  private formatControlValuesResponse(values: ControlValueResult[]): string {
    if (values.length === 0) {
      return 'No control values found';
    }

    let result = 'Control Values:\n\n';
    
    for (const control of values) {
      if (control.error) {
        result += `${control.name}: Error - ${control.error}\n`;
      } else {
        result += `${control.name}: ${control.value}`;
        if (control.string) {
          result += ` (${control.string})`;
        }
        result += '\n';
      }
    }
    
    return result.trim();
  }
}

/**
 * Tool to set values for specific controls
 * 
 * BULK OPERATIONS NOTE:
 * This tool processes controls individually for safety and validation.
 * For bulk updates across many controls:
 * 1. Group controls by component when possible
 * 2. Consider using change groups for atomic updates
 * 3. For >20 controls, batch them in smaller groups to avoid timeouts
 */
export class SetControlValuesTool extends BaseQSysTool<SetControlValuesParams> {
  // Validation cache with TTL (30 seconds)
  private validationCache = new Map<
    string,
    { valid: boolean; timestamp: number }
  >();
  private readonly CACHE_TTL = envConfig.timeouts.validationCacheTtlMs;

  constructor(qrwcClient: IControlSystem) {
    super(
      qrwcClient,
      'set_control_values',
      "Set Q-SYS control values. Supports multiple controls with optional ramp time for smooth transitions. Values: gains in dB (-100 to 20), mutes as boolean, positions 0-1. Example: [{name:'Main.gain',value:-10,ramp:2.5}] for 2.5s fade. Set validate:false to skip validation for performance.",
      SetControlValuesParamsSchema
    );
  }

  /**
   * Clear expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, value] of this.validationCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.validationCache.delete(key);
      }
    }
  }

  /**
   * Check if a control is in the validation cache
   */
  private checkCache(controlName: string): boolean | null {
    this.cleanCache();
    const cached = this.validationCache.get(controlName);
    if (cached && Date.now() - cached.timestamp <= this.CACHE_TTL) {
      return cached.valid;
    }
    return null;
  }

  /**
   * Add a control validation result to cache
   */
  private cacheResult(controlName: string, valid: boolean): void {
    this.validationCache.set(controlName, {
      valid,
      timestamp: Date.now(),
    });
  }

  /**
   * Process Q-SYS control set response with reduced nesting
   */
  private processControlSetResponse(
    qsysResponse: {
      error?: { code: number; message: string };
      result?: Array<{ Name: string; Result: string; Error?: string }>;
    },
    controls: Array<{ name: string; value: ControlValue; ramp?: number }>,
    isComponentResponse = false,
    componentName?: string
  ): ControlSetResponse[] {
    const jsonResults: ControlSetResponse[] = [];
    
    // Handle top-level error - all controls failed
    if (qsysResponse?.error) {
      return controls.map(control => ({
        name: control.name,
        value: control.value,
        success: false,
        error: qsysResponse.error!.message ?? 'Q-SYS error',
      }));
    }
    
    // Handle unexpected response format
    if (!qsysResponse?.result || !Array.isArray(qsysResponse.result)) {
      return controls.map(control => ({
        name: control.name,
        value: control.value,
        success: false,
        error: 'Unexpected response format from Q-SYS',
      }));
    }
    
    // Process individual control results
    for (const control of controls) {
      // For component responses, the result has control names without component prefix
      const searchName = isComponentResponse && componentName 
        ? control.name.substring(componentName.length + 1) // Remove "ComponentName." prefix
        : control.name;
      
      const controlResult = qsysResponse.result.find(r => r.Name === searchName);
      const response = this.createControlResponse(control, controlResult);
      jsonResults.push(response);
    }
    
    return jsonResults;
  }

  /**
   * Create response for a single control with reduced nesting
   */
  private createControlResponse(
    control: { name: string; value: ControlValue; ramp?: number },
    controlResult?: { Name: string; Result: string; Error?: string }
  ): ControlSetResponse {
    // Control failed
    if (controlResult?.Result === 'Error') {
      return {
        name: control.name,
        value: control.value,
        success: false,
        error: controlResult.Error ?? 'Control set failed',
      };
    }
    
    // Control succeeded (either explicit success or not found in response)
    const response: ControlSetResponse = {
      name: control.name,
      value: control.value,
      success: true,
    };
    
    // Add ramp time if specified
    if (control.ramp !== undefined) {
      response.rampTime = control.ramp;
    }
    
    return response;
  }

  /**
   * Convert value to Q-SYS format (booleans to 0/1)
   */
  private convertToQSysValue(value: ControlValue): number | string {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === 'yes' || lowerValue === 'on') {
        return 1;
      }
      if (lowerValue === 'false' || lowerValue === 'no' || lowerValue === 'off') {
        return 0;
      }
    }
    
    return value;
  }

  /**
   * Separate controls into named and component groups
   */
  private separateControls(controls: Array<{ name: string; value: ControlValue; ramp?: number }>): {
    namedControls: Array<{ Name: string; Value: number | string; Ramp?: number }>;
    componentGroups: Map<string, Array<{ Name: string; Value: number | string; Ramp?: number }>>;
  } {
    const namedControls: Array<{ Name: string; Value: number | string; Ramp?: number }> = [];
    const componentGroups = new Map<string, Array<{ Name: string; Value: number | string; Ramp?: number }>>();
    
    for (const control of controls) {
      const value = this.convertToQSysValue(control.value);
      const dotIndex = control.name.indexOf('.');
      
      if (dotIndex > 0) {
        // Component control: "ComponentName.controlName"
        const componentName = control.name.substring(0, dotIndex);
        const controlName = control.name.substring(dotIndex + 1);
        
        if (!componentGroups.has(componentName)) {
          componentGroups.set(componentName, []);
        }
        
        const controlCmd: { Name: string; Value: string | number; Ramp?: number } = { 
          Name: controlName, 
          Value: value 
        };
        if (control.ramp !== undefined) {
          controlCmd.Ramp = control.ramp;
        }
        
        componentGroups.get(componentName)!.push(controlCmd);
      } else {
        // Named control: "ControlName"
        const controlCmd: { Name: string; Value: string | number; Ramp?: number } = { 
          Name: control.name, 
          Value: value 
        };
        if (control.ramp !== undefined) {
          controlCmd.Ramp = control.ramp;
        }
        
        namedControls.push(controlCmd);
      }
    }
    
    return { namedControls, componentGroups };
  }

  // eslint-disable-next-line max-statements -- Complex control value setting with validation and error handling
  protected async executeInternal(
    params: SetControlValuesParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      // Only validate if requested (default is true for safety)
      if (params.validate !== false) {
        const validationErrors = await this.validateControlsExistOptimized(
          params.controls
        );
        if (validationErrors.length > 0) {
          // Return error response with validation failures
          const errorResults = validationErrors.map(error => ({
            name: error.controlName,
            value: error.value,
            success: false,
            error: error.message,
          }));

          // Try to serialize error results with proper error handling
          let serializedErrors: string;
          try {
            serializedErrors = safeJsonStringify(errorResults);
          } catch (jsonError) {
            this.logger.error('Failed to serialize validation errors', { error: jsonError, context });
            serializedErrors = JSON.stringify({
              error: 'VALIDATION_SERIALIZATION_ERROR',
              message: 'Failed to serialize validation errors',
              errorCount: errorResults.length
            });
          }

          return {
            content: [
              {
                type: 'text',
                text: serializedErrors,
              },
            ],
            isError: true,
          };
        }
      }

      // Separate controls into named and component groups
      const { namedControls, componentGroups } = this.separateControls(params.controls as any);
      
      // Collect all results
      const allResults: ControlSetResponse[] = [];
      
      // Send named controls via Control.Set if any exist
      if (namedControls.length > 0) {
        const response = await this.controlSystem.sendCommand('Control.Set', {
          Controls: namedControls,
        });
        
        const qsysResponse = response as {
          error?: { code: number; message: string };
          result?: Array<{ Name: string; Result: string; Error?: string }>;
        };
        
        // Process named control results  
        const namedControlsOriginal = params.controls.filter(c => !c.name.includes('.'));
        const namedResults = this.processControlSetResponse(qsysResponse, namedControlsOriginal as any, false);
        allResults.push(...namedResults);
      }
      
      // Send component controls via Component.Set for each component
      for (const [componentName, controls] of componentGroups) {
        const response = await this.controlSystem.sendCommand('Component.Set', {
          Name: componentName,
          Controls: controls,
        });
        
        const qsysResponse = response as {
          error?: { code: number; message: string };
          result?: Array<{ Name: string; Result: string; Error?: string }>;
        };
        
        // Process component control results, restoring full control names
        const componentControlsOriginal = params.controls.filter(c => 
          c.name.startsWith(`${componentName}.`)
        );
        const componentResults = this.processControlSetResponse(
          qsysResponse, 
          componentControlsOriginal as any, 
          true, 
          componentName
        );
        allResults.push(...componentResults);
      }
      
      const jsonResults = allResults;

      // Try to serialize results with proper error handling
      let serializedResults: string;
      try {
        serializedResults = safeJsonStringify(jsonResults);
      } catch (jsonError) {
        this.logger.error('Failed to serialize control set results - circular reference detected', { 
          error: jsonError, 
          context,
          resultsCount: jsonResults.length 
        });
        
        // Return a formatted error response with summary
        const successCount = jsonResults.filter(r => r.success).length;
        const failureCount = jsonResults.filter(r => !r.success).length;
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'JSON_SERIALIZATION_ERROR',
                message: 'Failed to serialize control set results due to circular reference',
                summary: {
                  total: jsonResults.length,
                  successful: successCount,
                  failed: failureCount
                },
                hint: 'The control set response contains circular references that cannot be serialized.'
              }),
            },
          ],
          isError: true,
        };
      }

      // Return success even if individual controls failed
      // The results array contains the detailed success/failure for each control
      
      return {
        content: [
          {
            type: 'text',
            text: serializedResults,
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.error('Failed to set control values', { error, context });
      
      // When an error occurs, return an array of failed results for each control
      // This maintains consistency with partial failure scenarios
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedResults = params.controls.map(control => ({
        name: control.name,
        value: control.value,
        success: false,
        error: errorMessage
      }));
      
      // Return the array of results, not an error object
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(failedResults),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Optimized validation that uses batching, caching, and parallelization
   */
  // eslint-disable-next-line max-statements -- Batch control validation with optimized queries
  private async validateControlsExistOptimized(
    controls: SetControlValuesParams['controls']
  ): Promise<
    Array<{
      controlName: string;
      value: number | string | boolean;
      message: string;
    }>
  > {
    const errors: Array<{
      controlName: string;
      value: number | string | boolean;
      message: string;
    }> = [];

    // Group controls by validation strategy
    const componentValidations = new Map<
      string,
      Array<{ controlName: string; fullName: string; value: ControlValue }>
    >();
    const namedControls: Array<{ name: string; value: ControlValue }> = [];

    // First pass: check cache and group uncached controls
    for (const control of controls) {
      // Check cache first
      const cached = this.checkCache(control.name);
      if (cached === false) {
        errors.push({
          controlName: control.name,
          value: control.value,
          message: `Control '${control.name}' not found (cached)`,
        });
        continue;
      } else if (cached === true) {
        // Control is valid in cache, skip validation
        continue;
      }

      // Not in cache, needs validation
      if (control.name.includes('.')) {
        const parts = control.name.split('.');
        const componentName = parts[0];
        const controlName = parts.slice(1).join('.');

        if (componentName) {
          if (!componentValidations.has(componentName)) {
            componentValidations.set(componentName, []);
          }
          const validations = componentValidations.get(componentName);
          if (validations) {
            validations.push({
              controlName,
              fullName: control.name,
              value: control.value,
            });
          }
        }
      } else {
        namedControls.push({ name: control.name, value: control.value });
      }
    }

    // Parallel validation for all components
    const componentPromises: Array<Promise<void>> = [];

    for (const [componentName, controlInfos] of componentValidations) {
      const promise = this.validateComponentControls(
        componentName,
        controlInfos
      ).then(componentErrors => {
        errors.push(...componentErrors);
      });
      componentPromises.push(promise);
    }

    // Parallel validation for named controls (batch into groups of 10)
    const namedBatches: Array<Array<{ name: string; value: ControlValue }>> = [];
    for (let i = 0; i < namedControls.length; i += 10) {
      namedBatches.push(namedControls.slice(i, i + 10));
    }

    const namedPromises = namedBatches.map(async batch =>
      this.validateNamedControlsBatch(batch).then(batchErrors => {
        errors.push(...batchErrors);
      })
    );

    // Wait for all validations to complete
    await Promise.all([...componentPromises, ...namedPromises]);

    return errors;
  }

  /**
   * Validate controls for a single component
   */
  private async validateComponentControls(
    componentName: string,
    controlInfos: Array<{ controlName: string; fullName: string; value: ControlValue }>
  ): Promise<
    Array<{
      controlName: string;
      value: number | string | boolean;
      message: string;
    }>
  > {
    const errors: Array<{
      controlName: string;
      value: number | string | boolean;
      message: string;
    }> = [];

    try {
      const response = await this.controlSystem.sendCommand('Component.GetControls', {
        Name: componentName,
      });

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime safety for API response
      if (!response || typeof response !== 'object') {
        // Component doesn't exist
        for (const info of controlInfos) {
          this.cacheResult(info.fullName, false);
          errors.push({
            controlName: info.fullName,
            value: info.value,
            message: `Component '${componentName}' not found`,
          });
        }
        return errors;
      }

      if (isQSysApiResponse(response) && response.error) {
        // Error accessing component
        for (const info of controlInfos) {
          this.cacheResult(info.fullName, false);
          errors.push({
            controlName: info.fullName,
            value: info.value,
            message:
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- API response may not have error.message
              response.error.message ??
              `Failed to access component '${componentName}'`,
          });
        }
        return errors;
      }

      // Check which controls were returned
      if (isComponentControlsResponse(response) && !response.error && response.result) {
        const returnedControlNames = new Set(
          response.result.Controls.map((c: { Name: string }) => c.Name)
        );

        for (const info of controlInfos) {
          if (returnedControlNames.has(info.controlName)) {
            this.cacheResult(info.fullName, true);
          } else {
            this.cacheResult(info.fullName, false);
            errors.push({
              controlName: info.fullName,
              value: info.value,
              message: `Control '${info.controlName}' not found on component '${componentName}'`,
            });
          }
        }
      }
    } catch (error) {
      // Component doesn't exist or other error
      for (const info of controlInfos) {
        this.cacheResult(info.fullName, false);
        errors.push({
          controlName: info.fullName,
          value: info.value,
          message:
            error instanceof Error
              ? error.message
              : `Failed to validate component '${componentName}'`,
        });
      }
    }

    return errors;
  }

  /**
   * Validate a batch of named controls
   */
  private async validateNamedControlsBatch(
    batch: Array<{ name: string; value: ControlValue }>
  ): Promise<
    Array<{
      controlName: string;
      value: number | string | boolean;
      message: string;
    }>
  > {
    const errors: Array<{
      controlName: string;
      value: number | string | boolean;
      message: string;
    }> = [];

    // For named controls, we need to validate individually
    // But we can do them in parallel within the batch
    const promises = batch.map(async control => {
      try {
        const response = await this.controlSystem.sendCommand('Control.Get', {
          Name: control.name,
        });

        if (isQSysApiResponse(response) && response.error) {
          this.cacheResult(control.name, false);
          return {
            controlName: control.name,
            value: control.value,
            message:
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- API response may not have error.message
              response.error.message ??
              `Control '${control.name}' not found`,
          };
        } else if (isQSysApiResponse(response) && response.result) {
          // For Control.Get, result should be an object with Name property
          if (typeof response.result === 'object' && response.result !== null && 'Name' in response.result) {
            // Control exists - validation passed
            this.cacheResult(control.name, true);
            return null;
          } else {
            // Invalid result format
            this.cacheResult(control.name, false);
            return {
              controlName: control.name,
              value: control.value,
              message: `Control '${control.name}' not found`,
            };
          }
        } else {
          // No result means control not found
          this.cacheResult(control.name, false);
          return {
            controlName: control.name,
            value: control.value,
            message: `Control '${control.name}' not found`,
          };
        }
      } catch (error) {
        this.cacheResult(control.name, false);
        return {
          controlName: control.name,
          value: control.value,
          message:
            error instanceof Error
              ? error.message
              : `Control '${control.name}' not found`,
        };
      }
    });

    const results = await Promise.all(promises);
    for (const result of results) {
      if (result) {
        errors.push(result);
      }
    }

    return errors;
  }

  // Removed setNamedControl and setComponentControls methods
  // Now using unified Control.Set with enhanced parsing in command-handlers.ts

  private formatSetControlsResponseNew(
    results: Array<{
      control: SetControlValuesParams['controls'][0];
      result: PromiseSettledResult<unknown>;
    }>
  ): string {
    const successful = results.filter(r => r.result.status === 'fulfilled').length;
    const failed = results.filter(r => r.result.status === 'rejected').length;
    const total = results.length;
    
    let response = `Set ${successful}/${total} controls successfully`;
    
    if (failed > 0) {
      response += '\n\nFailed controls:\n';
      for (const { control, result } of results) {
        if (result.status === 'rejected') {
          const error = result.reason instanceof Error 
            ? result.reason.message 
            : String(result.reason);
          response += `  ${control.name}: ${error}\n`;
        }
      }
    }
    
    return response.trim();
  }
}

/**
 * Interfaces for Q-SYS data structures
 */
interface QSysControl {
  name: string;
  component: string;
  type: string;
  value: number | string | boolean;
  metadata?: Record<string, unknown>;
}

interface ControlValueResult {
  name: string;
  value: number | string | boolean;
  string?: string;
  error?: string;
  timestamp?: string;
}

/**
 * Export tool factory functions for registration
 */
export const createListControlsTool = (qrwcClient: IControlSystem) =>
  new ListControlsTool(qrwcClient);

export const createGetControlValuesTool = (qrwcClient: IControlSystem) =>
  new GetControlValuesTool(qrwcClient);

export const createSetControlValuesTool = (qrwcClient: IControlSystem) =>
  new SetControlValuesTool(qrwcClient);
