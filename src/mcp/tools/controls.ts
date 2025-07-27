import { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema, type ToolExecutionContext } from './base.js';
import { config as envConfig } from '../../shared/utils/env.js';
import type { ToolCallResult } from '../handlers/index.js';
import type { QRWCClientInterface } from '../qrwc/adapter.js';
import {
  type QSysComponentControlsResponse,
  type QSysControlGetResponse,
  type QSysApiResponse,
  isQSysApiResponse,
  isComponentControlsResponse,
  isControlsArrayResponse,
} from '../types/qsys-api-responses.js';

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
    .optional()
    .describe('Specific component name to list controls for'),
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
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'list_controls',
      "List controls with optional filtering by component/type. Set includeMetadata=true for direction (Read/Write), values, ranges, and normalized position (0-1). Filter by controlType: 'gain', 'mute', 'input_select', 'output_select'. Examples: {component:'Main Mixer'} for specific component, {controlType:'gain',includeMetadata:true} for all system gains with metadata.",
      ListControlsParamsSchema
    );
  }

  protected async executeInternal(
    params: ListControlsParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      const command = params.component
        ? `Component.GetControls`
        : `Component.GetAllControls`;

      const commandParams = params.component ? { Name: params.component } : {};
      const response = await this.qrwcClient.sendCommand(
        command,
        commandParams
      );

      const controls = this.parseControlsResponse(response, params);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(controls),
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.error('Failed to list controls', { error, context });
      throw error;
    }
  }

  private parseControlsResponse(
    response: unknown,
    params: ListControlsParams
  ): QSysControl[] {
    this.logger.debug('Parsing controls response', { response });

    // Handle different response formats from Component.GetControls vs Component.GetAllControls
    if (!isQSysApiResponse<QSysComponentControlsResponse | QSysControlInfo[]>(response)) {
      this.logger.warn('Invalid response format', { response });
      return [];
    }

    // Check for error response
    if (response.error) {
      throw new Error(`Q-SYS API error: ${response.error.message}`);
    }

    // Component.GetAllControls returns { result: [...] } directly
    // Component.GetControls returns { result: { Name: "...", Controls: [...] } }
    let controls: QSysControlInfo[] = [];
    let componentName = 'unknown';

    if (response.result) {
      if (Array.isArray(response.result)) {
        // Component.GetAllControls format
        controls = response.result;
      } else if (typeof response.result === 'object' && 
                 'Controls' in response.result && 
                 isComponentControlsResponse(response.result)) {
        // Component.GetControls format  
        const componentResponse = response.result;
        controls = componentResponse.Controls;
        componentName = componentResponse.Name ?? 'unknown';
      }
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
      } else if (ctrl.Value !== null && ctrl.Value !== undefined) {
        // Convert to string if it's some other type
        value = String(ctrl.Value);
      }

      return {
        name: ctrl.Name,
        component:
          ctrl.Component ??
          componentName ??
          this.extractComponentFromName(ctrl.Name),
        type: controlType ?? ctrl.Type ?? 'unknown',
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
      // Component.GetAllControls was used with a component filter
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
    const name = control.Name ?? '';
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
    if (control.Type === 'Float' && control.String?.includes('dB'))
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
    if (control.Direction) metadata['direction'] = control.Direction;
    if (control.Position !== undefined) metadata['position'] = control.Position;

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
          result += `    ${key}: ${value}\n`;
        }
      }
      
      result += '\n';
    }
    
    return result.trim();
  }
}

/**
 * Tool to get current values of specific controls
 */
export class GetControlValuesTool extends BaseQSysTool<GetControlValuesParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'get_control_values',
      "Get current values of Q-SYS controls. Specify full control paths like 'Main Mixer.gain', 'APM 1.input.mute', 'Delay.delay_ms'. Returns current values with precise timestamps for each control across multiple components. Use includeMetadata=true for min/max ranges and position info. Max 100 controls per request.",
      GetControlValuesParamsSchema
    );
  }

  protected async executeInternal(
    params: GetControlValuesParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      const response = await this.qrwcClient.sendCommand('Control.GetValues', {
        Names: params.controls,
      });

      const values = this.parseControlValuesResponse(response, params.controls);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(values),
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.error('Failed to get control values', { error, context });
      throw error;
    }
  }

  private parseControlValuesResponse(
    response: unknown,
    requestedControls: string[]
  ): ControlValue[] {
    this.logger.debug('Parsing control values response', {
      response,
      requestedControls,
    });

    // Handle different response formats from QRWC client
    let controls: unknown[] = [];
    const resp = response as { controls?: unknown[]; result?: unknown[] };

    if (resp?.controls && Array.isArray(resp.controls)) {
      controls = resp.controls;
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
        } else if (control.Value !== null && control.Value !== undefined) {
          value = String(control.Value);
        }

        const result: ControlValue = {
          name: controlName,
          value,
          timestamp: new Date().toISOString(),
        };

        if (control.String) {
          result.string = control.String;
        }

        return result;
      } else {
        const result: ControlValue = {
          name: controlName,
          value: 'N/A',
          error: 'Control not found',
          timestamp: new Date().toISOString(),
        };

        return result;
      }
    });
  }

  private formatControlValuesResponse(values: ControlValue[]): string {
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
 */
export class SetControlValuesTool extends BaseQSysTool<SetControlValuesParams> {
  // Validation cache with TTL (30 seconds)
  private validationCache = new Map<
    string,
    { valid: boolean; timestamp: number }
  >();
  private readonly CACHE_TTL = envConfig.timeouts.validationCacheTtlMs;

  constructor(qrwcClient: QRWCClientInterface) {
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

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(errorResults),
              },
            ],
            isError: true,
          };
        }
      }

      // Separate controls into named controls and component controls
      const namedControls: typeof params.controls = [];
      const componentControlsMap = new Map<string, typeof params.controls>();

      for (const control of params.controls) {
        if (control.name.includes('.')) {
          // This is a component control (e.g., "Main Output Gain.mute")
          const parts = control.name.split('.');
          const componentName = parts[0];
          const controlName = parts.slice(1).join('.');

          if (!componentName) {
            // Invalid control name format, treat as named control
            namedControls.push(control);
            continue;
          }

          if (!componentControlsMap.has(componentName)) {
            componentControlsMap.set(componentName, []);
          }

          const controls = componentControlsMap.get(componentName)!;
          controls.push({
            name: controlName, // Store just the control name part
            value: control.value,
            ramp: control.ramp,
          });
        } else {
          // This is a named control
          namedControls.push(control);
        }
      }

      // Execute all operations
      const allResults: Array<{
        control: (typeof params.controls)[0];
        result: PromiseSettledResult<unknown>;
      }> = [];

      // Set named controls individually
      for (const control of namedControls) {
        const result = await Promise.allSettled([
          this.setNamedControl(control),
        ]);
        allResults.push({ control, result: result[0] });
      }

      // Set component controls grouped by component
      for (const [componentName, controls] of componentControlsMap) {
        const result = await Promise.allSettled([
          this.setComponentControls(componentName, controls),
        ]);
        // Add results for each control in the component
        for (const control of controls) {
          allResults.push({
            control: { ...control, name: `${componentName}.${control.name}` },
            result: result[0],
          });
        }
      }

      // Convert results to the expected JSON format
      const jsonResults = allResults.map(({ control, result }) => {
        if (result.status === 'fulfilled') {
          const response: ControlSetResponse = {
            name: control.name,
            value: control.value,
            success: true,
          };
          if (control.ramp !== undefined) {
            response.rampTime = control.ramp;
          }
          return response;
        } else {
          const errorResponse: ControlSetResponse = {
            name: control.name,
            value: control.value,
            success: false,
            error: result.reason instanceof Error 
              ? result.reason.message 
              : String(result.reason),
          };
          return errorResponse;
        }
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(jsonResults),
          },
        ],
        isError: allResults.some(r => r.result.status === 'rejected'),
      };
    } catch (error) {
      this.logger.error('Failed to set control values', { error, context });
      throw error;
    }
  }

  /**
   * Optimized validation that uses batching, caching, and parallelization
   */
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
          componentValidations.get(componentName)!.push({
            controlName,
            fullName: control.name,
            value: control.value,
          });
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
      const response = await this.qrwcClient.sendCommand('Component.Get', {
        Name: componentName,
        Controls: controlInfos.map(info => ({ Name: info.controlName })),
      });

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
              response.error.message ??
              `Failed to access component '${componentName}'`,
          });
        }
        return errors;
      }

      // Check which controls were returned
      if (isComponentControlsResponse(response)) {
        const returnedControlNames = new Set(
          response.Controls.map((c) => c.Name)
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
        const response = await this.qrwcClient.sendCommand('Control.Get', {
          Name: control.name,
        });

        if (isQSysApiResponse(response) && response.error) {
          this.cacheResult(control.name, false);
          return {
            controlName: control.name,
            value: control.value,
            message:
              response.error.message ??
              `Control '${control.name}' not found`,
          };
        } else {
          this.cacheResult(control.name, true);
          return null;
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

  private async setNamedControl(control: {
    name: string;
    value: number | string | boolean;
    ramp?: number | undefined;
  }) {
    // Convert boolean to 0/1 for Q-SYS
    let value = control.value;
    if (typeof value === 'boolean') {
      value = value ? 1 : 0;
    }

    interface ControlSetParams {
      Name: string;
      Value: number | string | boolean;
      Ramp?: number;
    }

    const commandParams: ControlSetParams = {
      Name: control.name,
      Value: value,
    };

    if (control.ramp !== undefined) {
      commandParams.Ramp = control.ramp;
    }

    return await this.qrwcClient.sendCommand(
      'Control.Set',
      commandParams
    );
  }

  private async setComponentControls(
    componentName: string,
    controls: Array<{
      name: string;
      value: number | string | boolean;
      ramp?: number | undefined;
    }>
  ) {
    const controlsArray = controls.map(control => {
      // Convert boolean to 0/1 for Q-SYS
      let value = control.value;
      if (typeof value === 'boolean') {
        value = value ? 1 : 0;
      }

      interface ComponentControlParams {
        Name: string;
        Value: number | string;
        Ramp?: number;
      }

      const controlParams: ComponentControlParams = {
        Name: control.name,
        Value: value,
      };

      if (control.ramp !== undefined) {
        controlParams.Ramp = control.ramp;
      }

      return controlParams;
    });

    return await this.qrwcClient.sendCommand('Component.Set', {
      Name: componentName,
      Controls: controlsArray,
    });
  }

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

interface ControlValue {
  name: string;
  value: number | string | boolean;
  string?: string;
  error?: string;
  timestamp?: string;
}

/**
 * Export tool factory functions for registration
 */
export const createListControlsTool = (qrwcClient: QRWCClientInterface) =>
  new ListControlsTool(qrwcClient);

export const createGetControlValuesTool = (qrwcClient: QRWCClientInterface) =>
  new GetControlValuesTool(qrwcClient);

export const createSetControlValuesTool = (qrwcClient: QRWCClientInterface) =>
  new SetControlValuesTool(qrwcClient);
