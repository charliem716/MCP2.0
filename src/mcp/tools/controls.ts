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
      "List all available controls in Q-SYS components with optional filtering",
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
    // Mock realistic Q-SYS controls for Phase 2.2
    const allControls: QSysControl[] = [
      {
        name: "MainMixer.input.1.gain",
        component: "MainMixer",
        type: "gain",
        value: -12.5,
        metadata: { min: -100, max: 20, units: "dB", step: 0.1 }
      },
      {
        name: "MainMixer.input.1.mute",
        component: "MainMixer", 
        type: "mute",
        value: false,
        metadata: { values: ["false", "true"] }
      },
      {
        name: "ZoneAmpControl.output.1.gain",
        component: "ZoneAmpControl",
        type: "gain", 
        value: -6.0,
        metadata: { min: -80, max: 12, units: "dB", step: 0.5 }
      },
      {
        name: "AudioRouter.input_select",
        component: "AudioRouter",
        type: "input_select",
        value: 3,
        metadata: { min: 1, max: 16, step: 1 }
      },
      {
        name: "SystemGains.zone_1_gain",
        component: "SystemGains",
        type: "gain",
        value: 0.0,
        metadata: { min: -60, max: 12, units: "dB", step: 0.1 }
      }
    ];

    // Filter by component if specified
    let filteredControls = params.component
      ? allControls.filter(ctrl => ctrl.component === params.component)
      : allControls;

    // Filter by control type if specified
    if (params.controlType && params.controlType !== 'all') {
      filteredControls = filteredControls.filter(ctrl => ctrl.type === params.controlType);
    }

    return filteredControls;
  }

  private formatControlsResponse(controls: QSysControl[], params: ListControlsParams): string {
    if (controls.length === 0) {
      const filter = params.component ? ` for component "${params.component}"` : "";
      const typeFilter = params.controlType && params.controlType !== 'all' ? ` of type "${params.controlType}"` : "";
      return `No controls found${filter}${typeFilter}`;
    }

    const header = `Found ${controls.length} control${controls.length > 1 ? 's' : ''}:`;
    
    const controlsList = controls.map(ctrl => {
      let result = `• ${ctrl.name} (${ctrl.type}): ${ctrl.value}`;
      
      if ((params.includeMetadata ?? false) && ctrl.metadata) {
        const meta = Object.entries(ctrl.metadata)
          .map(([key, val]) => `${key}: ${val}`)
          .join(', ');
        result += `\n  Metadata: ${meta}`;
      }
      
      return result;
    }).join('\n');

    return `${header}\n\n${controlsList}`;
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
      "Get current values of specified Q-SYS controls",
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
    // Mock response for Phase 2.2
    return requestedControls.map(controlName => ({
      name: controlName,
      value: this.getMockControlValue(controlName),
      timestamp: new Date().toISOString()
    }));
  }

  private getMockControlValue(controlName: string): number | string | boolean {
    // Generate realistic mock values based on control name
    if (controlName.includes('gain')) return Math.round((Math.random() * 30 - 15) * 10) / 10;
    if (controlName.includes('mute')) return Math.random() > 0.5;
    if (controlName.includes('select')) return Math.floor(Math.random() * 8) + 1;
    return Math.round(Math.random() * 100);
  }

  private formatControlValuesResponse(values: ControlValue[]): string {
    const valuesList = values.map(cv => 
      `• ${cv.name}: ${cv.value}${cv.timestamp ? ` (updated: ${cv.timestamp})` : ''}`
    ).join('\n');

    return `Control Values:\n\n${valuesList}`;
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
      "Set values for specified Q-SYS controls with optional ramping",
      SetControlValuesParamsSchema
    );
  }

  protected async executeInternal(
    params: SetControlValuesParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      const results = await Promise.allSettled(
        params.controls.map(control => this.setIndividualControl(control))
      );

      return {
        content: [{
          type: 'text',
          text: this.formatSetControlsResponse(results, params.controls)
        }],
        isError: results.some(r => r.status === 'rejected')
      };

    } catch (error) {
      this.logger.error("Failed to set control values", { error, context });
      throw error;
    }
  }

  private async setIndividualControl(control: { name: string; value: number | string | boolean; ramp?: number | undefined }) {
    const commandParams: any = {
      Name: control.name,
      Value: control.value
    };

    if (control.ramp !== undefined) {
      commandParams.Ramp = control.ramp;
    }

    return await this.qrwcClient.sendCommand("Control.SetValue", commandParams);
  }

  private formatSetControlsResponse(
    results: PromiseSettledResult<any>[],
    controls: SetControlValuesParams['controls']
  ): string {
    const responses = results.map((result, index) => {
      const control = controls[index];
      if (!control) {
        return `✗ Unknown control: Index ${index} missing`;
      }
      
      if (result.status === 'fulfilled') {
        const rampText = control.ramp ? ` (ramped over ${control.ramp}s)` : '';
        return `✓ ${control.name}: ${control.value}${rampText}`;
      } else {
        return `✗ ${control.name}: Failed - ${result.reason}`;
      }
    });

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const totalCount = results.length;

    const header = `Set ${successCount}/${totalCount} controls successfully:`;
    return `${header}\n\n${responses.join('\n')}`;
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