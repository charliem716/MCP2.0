import { z } from "zod";
import { BaseQSysTool, BaseToolParamsSchema } from "./base.js";
import type { ToolCallResult } from "../handlers/index.js";
import type { ToolExecutionContext } from "./base.js";

/**
 * Parameters for the list_controls tool
 */
export const ListControlsParamsSchema = BaseToolParamsSchema.extend({
  component: z.string().optional().describe("Specific component name to list controls for"),
  controlType: z.enum(['gain', 'mute', 'input_select', 'output_select', 'all']).optional()
    .describe("Filter by control type"),
  includeMetadata: z.boolean().optional().describe("Include control metadata like min/max values"),
});

export type ListControlsParams = z.infer<typeof ListControlsParamsSchema>;

/**
 * Parameters for the get_control_values tool
 */
export const GetControlValuesParamsSchema = BaseToolParamsSchema.extend({
  controls: z.array(z.string()).min(1).describe("Array of control names to get values for"),
});

export type GetControlValuesParams = z.infer<typeof GetControlValuesParamsSchema>;

/**
 * Parameters for the set_control_values tool
 */
export const SetControlValuesParamsSchema = BaseToolParamsSchema.extend({
  controls: z.array(z.object({
    name: z.string().describe("Control name"),
    value: z.union([z.number(), z.string(), z.boolean()]).describe("Control value"),
    ramp: z.number().positive().optional().describe("Ramp time in seconds"),
  })).min(1).describe("Array of controls to set with their values"),
});

export type SetControlValuesParams = z.infer<typeof SetControlValuesParamsSchema>;

/**
 * Tool to list all available controls in Q-SYS components
 */
export class ListControlsTool extends BaseQSysTool<ListControlsParams> {
  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      "list_controls", 
      "List controls (parameters like gain, mute, crosspoint levels) from Q-SYS components. Control names follow patterns like 'gain', 'mute', 'input.1.gain', 'crosspoint.1.3'. Specify component='Main Mixer' for one component or omit for all. Filter by controlType: 'gain', 'mute', 'position', 'string', 'trigger'. Returns control names and metadata.",
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
      const response = await this.qrwcClient.sendCommand(command, commandParams);

      const controls = this.parseControlsResponse(response, params);
      
      return {
        content: [{
          type: 'text',
          text: this.formatControlsResponse(controls, params)
        }],
        isError: false
      };

    } catch (error) {
      this.logger.error("Failed to list controls", { error, context });
      throw error;
    }
  }

  private parseControlsResponse(response: any, params: ListControlsParams): QSysControl[] {
    this.logger.debug("Parsing controls response", { response });
    
    // Parse actual response from Q-SYS
    if (!response?.result || !Array.isArray(response.result)) {
      this.logger.warn("No controls in response", { response });
      return [];
    }
    
    const controls = response.result.map((ctrl: any) => {
      // Extract control type from Name or Properties
      const controlType = this.inferControlType(ctrl);
      
      return {
        name: ctrl.Name || ctrl.name,
        component: ctrl.Component || this.extractComponentFromName(ctrl.Name || ctrl.name),
        type: controlType,
        value: ctrl.Value !== undefined ? ctrl.Value : ctrl.value,
        metadata: this.extractMetadata(ctrl)
      };
    });
    
    // Apply filters
    let filteredControls = controls;
    if (params.component) {
      filteredControls = filteredControls.filter((c: QSysControl) => c.component === params.component);
    }
    if (params.controlType && params.controlType !== 'all') {
      filteredControls = filteredControls.filter((c: QSysControl) => c.type === params.controlType);
    }
    
    return filteredControls;
  }

  private inferControlType(control: any): string {
    const name = control.Name || control.name || '';
    const lowerName = name.toLowerCase();
    
    // Infer type from control name patterns
    if (lowerName.includes('gain') || lowerName.includes('level')) return 'gain';
    if (lowerName.includes('mute')) return 'mute';
    if (lowerName.includes('input_select') || lowerName.includes('input.select')) return 'input_select';
    if (lowerName.includes('output_select') || lowerName.includes('output.select')) return 'output_select';
    
    // Check Properties for type hints
    if (control.Properties) {
      if (control.Properties.Type) return control.Properties.Type;
      if (control.Properties.ValueType === 'Boolean') return 'mute';
      if (control.Properties.ValueType === 'Float' && control.Properties.Units === 'dB') return 'gain';
    }
    
    return 'unknown';
  }

  private extractComponentFromName(name: string | undefined): string {
    // Extract component name from control name (e.g., "MainMixer.input.1.gain" -> "MainMixer")
    if (!name) return 'Unknown';
    const parts = name.split('.');
    return parts.length > 0 && parts[0] ? parts[0] : 'Unknown';
  }

  private extractMetadata(control: any): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    
    if (control.Properties) {
      // Extract relevant properties as metadata
      if (control.Properties.MinValue !== undefined) metadata['min'] = control.Properties.MinValue;
      if (control.Properties.MaxValue !== undefined) metadata['max'] = control.Properties.MaxValue;
      if (control.Properties.Units) metadata['units'] = control.Properties.Units;
      if (control.Properties.Step !== undefined) metadata['step'] = control.Properties.Step;
      if (control.Properties.Values) metadata['values'] = control.Properties.Values;
    }
    
    // Also check for direct properties on the control
    if (control.MinValue !== undefined) metadata['min'] = control.MinValue;
    if (control.MaxValue !== undefined) metadata['max'] = control.MaxValue;
    if (control.Units) metadata['units'] = control.Units;
    if (control.Step !== undefined) metadata['step'] = control.Step;
    
    return metadata;
  }

  private formatControlsResponse(controls: QSysControl[], params: ListControlsParams): string {
    // Return JSON string for MCP protocol compliance
    return JSON.stringify(controls);
  }
}

/**
 * Tool to get current values of specific controls
 */
export class GetControlValuesTool extends BaseQSysTool<GetControlValuesParams> {
  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      "get_control_values",
      "Get current values of Q-SYS controls. Specify full control paths like 'Main Mixer.gain', 'APM 1.input.mute', 'Delay.delay_ms'. Returns numeric values (e.g., -10.5 for gain in dB), booleans (mute), or strings. Use includeMetadata=true for min/max ranges and position info. Max 100 controls per request.",
      GetControlValuesParamsSchema
    );
  }

  protected async executeInternal(
    params: GetControlValuesParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      const response = await this.qrwcClient.sendCommand("Control.GetValues", {
        Names: params.controls
      });

      const values = this.parseControlValuesResponse(response, params.controls);
      
      return {
        content: [{
          type: 'text',
          text: this.formatControlValuesResponse(values)
        }],
        isError: false
      };

    } catch (error) {
      this.logger.error("Failed to get control values", { error, context });
      throw error;
    }
  }

  private parseControlValuesResponse(response: any, requestedControls: string[]): ControlValue[] {
    this.logger.debug("Parsing control values response", { response, requestedControls });

    // Handle different response formats from QRWC client
    let controls: any[] = [];
    
    if (response?.controls && Array.isArray(response.controls)) {
      controls = response.controls;
    } else if (response?.result && Array.isArray(response.result)) {
      controls = response.result;
    } else if (Array.isArray(response)) {
      controls = response;
    } else {
      this.logger.warn("No controls found in response, returning empty values", { response });
      // Return empty/fallback values for requested controls if no data available
      return requestedControls.map(controlName => ({
        name: controlName,
        value: "N/A",
        error: "Control not found",
        timestamp: new Date().toISOString()
      }));
    }

    // Map QRWC response to our format
    const controlMap = new Map<string, any>();
    controls.forEach((ctrl: any) => {
      const name = ctrl.Name || ctrl.name;
      if (name) {
        controlMap.set(name, ctrl);
      }
    });

    // Return values for requested controls
    return requestedControls.map(controlName => {
      const control = controlMap.get(controlName);
      if (control) {
        return {
          name: controlName,
          value: control.Value !== undefined ? control.Value : control.value,
          string: control.String || control.string,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          name: controlName,
          value: "N/A",
          error: "Control not found",
          timestamp: new Date().toISOString()
        };
      }
    });
  }

  private formatControlValuesResponse(values: ControlValue[]): string {
    // Return JSON string for MCP protocol compliance
    return JSON.stringify(values);
  }
}

/**
 * Tool to set values for specific controls
 */
export class SetControlValuesTool extends BaseQSysTool<SetControlValuesParams> {
  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      "set_control_values",
      "Set Q-SYS control values. Examples: {'Main Mixer.gain': -10} sets gain to -10dB, {'APM 1.input.mute': true} mutes input. Ramp creates smooth transitions - use 2.5 for 2.5-second fade. Values: gains in dB (-100 to 20), mutes as boolean, positions 0-1. Multiple controls supported. Changes are immediate unless ramp specified.",
      SetControlValuesParamsSchema
    );
  }

  protected async executeInternal(
    params: SetControlValuesParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
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
            ...control,
            name: controlName // Store just the control name part
          });
        } else {
          // This is a named control
          namedControls.push(control);
        }
      }

      // Execute all operations
      const allResults: Array<{ control: typeof params.controls[0], result: PromiseSettledResult<any> }> = [];

      // Set named controls individually
      for (const control of namedControls) {
        const result = await Promise.allSettled([this.setNamedControl(control)]);
        allResults.push({ control, result: result[0] });
      }

      // Set component controls grouped by component
      for (const [componentName, controls] of componentControlsMap) {
        const result = await Promise.allSettled([this.setComponentControls(componentName, controls)]);
        // Add results for each control in the component
        for (const control of controls) {
          allResults.push({ 
            control: { ...control, name: `${componentName}.${control.name}` }, 
            result: result[0] 
          });
        }
      }

      return {
        content: [{
          type: 'text',
          text: this.formatSetControlsResponseNew(allResults)
        }],
        isError: allResults.some(r => r.result.status === 'rejected')
      };

    } catch (error) {
      this.logger.error("Failed to set control values", { error, context });
      throw error;
    }
  }

  private async setNamedControl(control: { name: string; value: number | string | boolean; ramp?: number | undefined }) {
    // Convert boolean to 0/1 for Q-SYS
    let value = control.value;
    if (typeof value === 'boolean') {
      value = value ? 1 : 0;
    }
    
    const commandParams: any = {
      Name: control.name,
      Value: value
    };

    if (control.ramp !== undefined) {
      commandParams.Ramp = control.ramp;
    }

    return await this.qrwcClient.sendCommand("Control.Set", commandParams);
  }

  private async setComponentControls(componentName: string, controls: Array<{ name: string; value: number | string | boolean; ramp?: number | undefined }>) {
    const controlsArray = controls.map(control => {
      // Convert boolean to 0/1 for Q-SYS
      let value = control.value;
      if (typeof value === 'boolean') {
        value = value ? 1 : 0;
      }
      
      const controlParams: any = {
        Name: control.name,
        Value: value
      };
      
      if (control.ramp !== undefined) {
        controlParams.Ramp = control.ramp;
      }
      
      return controlParams;
    });

    return await this.qrwcClient.sendCommand("Component.Set", {
      Name: componentName,
      Controls: controlsArray
    });
  }

  private formatSetControlsResponseNew(
    results: Array<{ control: SetControlValuesParams['controls'][0], result: PromiseSettledResult<any> }>
  ): string {
    // Return JSON string for MCP protocol compliance
    const formattedResults = results.map(({ control, result }) => ({
      name: control.name,
      value: control.value,
      success: result.status === 'fulfilled',
      error: result.status === 'rejected' ? 
        (result.reason instanceof Error ? result.reason.message : String(result.reason)) : 
        undefined,
      rampTime: control.ramp
    }));
    
    return JSON.stringify(formattedResults);
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
export const createListControlsTool = (qrwcClient: any) => 
  new ListControlsTool(qrwcClient);

export const createGetControlValuesTool = (qrwcClient: any) => 
  new GetControlValuesTool(qrwcClient);

export const createSetControlValuesTool = (qrwcClient: any) => 
  new SetControlValuesTool(qrwcClient); 