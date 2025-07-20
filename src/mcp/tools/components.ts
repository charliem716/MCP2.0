import { z } from "zod";
import { BaseQSysTool, BaseToolParamsSchema } from "./base.js";
import type { ToolCallResult } from "../handlers/index.js";
import type { ToolExecutionContext } from "./base.js";

/**
 * Parameters for the list_components tool
 */
export const ListComponentsParamsSchema = BaseToolParamsSchema.extend({
  filter: z.string().optional().describe("Optional filter pattern for component names"),
  includeProperties: z.boolean().optional().describe("Include detailed component properties"),
});

export type ListComponentsParams = z.infer<typeof ListComponentsParamsSchema>;

/**
 * Tool to list all components in the Q-SYS design
 * 
 * Returns information about all components available in the current Q-SYS design,
 * optionally filtered by name pattern. Useful for discovering available controls
 * and understanding the system architecture.
 */
export class ListComponentsTool extends BaseQSysTool<ListComponentsParams> {
  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      "list_components",
      "List all Q-SYS components (devices like mixers, gains, delays, etc). Components have names like 'Main Mixer', 'Output Gain 1', 'APM 1'. Filter uses regex: 'Mixer' finds all mixers, '^Main' finds components starting with 'Main', 'Gain|Delay' finds gains or delays. Use includeProperties=true for control counts and metadata.",
      ListComponentsParamsSchema
    );
  }

  protected async executeInternal(
    params: ListComponentsParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      // Send QRC command to get component list
      const response = await this.qrwcClient.sendCommand("Component.GetComponents");
      
      if (!response || typeof response !== 'object') {
        throw new Error("Invalid response from Q-SYS Core");
      }

      const components = this.parseComponentsResponse(response);
      const filteredComponents = params.filter 
        ? this.filterComponents(components, params.filter)
        : components;

      return {
        content: [{
          type: 'text',
          text: this.formatComponentsResponse(filteredComponents, params)
        }],
        isError: false
      };

    } catch (error) {
      this.logger.error("Failed to list components", { error, context });
      throw error;
    }
  }

  /**
   * Parse the QRWC response for components
   */
  private parseComponentsResponse(response: any): QSysComponent[] {
    this.logger.debug("Parsing components response", { response });

    // Handle different response formats from QRWC client
    let components: any[] = [];
    
    if (response?.result && Array.isArray(response.result)) {
      components = response.result;
    } else if (Array.isArray(response)) {
      components = response;
    } else if (response?.components && Array.isArray(response.components)) {
      components = response.components;
    } else {
      this.logger.warn("No components found in response", { response });
      return [];
    }

    return components.map((comp: any) => ({
      Name: comp.name || comp.Name || "Unknown Component",
      Type: comp.type || comp.Type || "unknown",
      Properties: {
        controls: comp.controls || comp.Controls || 0,
        location: comp.location || "Unknown",
        ...comp.Properties
      }
    }));
  }

  /**
   * Filter components by name pattern
   */
  private filterComponents(components: QSysComponent[], filter: string): QSysComponent[] {
    const pattern = new RegExp(filter, 'i'); // Case-insensitive regex
    return components.filter(comp => 
      pattern.test(comp.Name) || pattern.test(comp.Type)
    );
  }

  /**
   * Format components for display
   */
  private formatComponentsResponse(
    components: QSysComponent[], 
    params: ListComponentsParams
  ): string {
    // Return JSON string for MCP protocol compliance
    return JSON.stringify(components);
  }
}

/**
 * Q-SYS Component interface
 */
interface QSysComponent {
  Name: string;
  Type: string;
  Properties?: Record<string, unknown>;
}

/**
 * Export the tool factory function for registration
 */
export const createListComponentsTool = (qrwcClient: any) => 
  new ListComponentsTool(qrwcClient);

/**
 * Parameters for the qsys_component_get tool
 */
export const GetComponentControlsParamsSchema = BaseToolParamsSchema.extend({
  component: z.string().describe("The name of the component"),
  controls: z.array(z.string()).describe("List of control names to retrieve")
});

export type GetComponentControlsParams = z.infer<typeof GetComponentControlsParamsSchema>;

/**
 * Tool to get specific control values from a named component
 * 
 * More efficient than listing all controls then getting values,
 * this allows getting specific controls from a component in a single request.
 */
export class GetComponentControlsTool extends BaseQSysTool<GetComponentControlsParams> {
  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      "qsys_component_get",
      "Get specific controls from one component efficiently. Example: component='Main Mixer', controls=['gain', 'mute', 'input.1.level'] retrieves just those controls. More efficient than listing all controls when you know what you need. Control names are relative to component (use 'gain' not 'Main Mixer.gain').",
      GetComponentControlsParamsSchema
    );
  }

  protected async executeInternal(
    params: GetComponentControlsParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      const response = await this.qrwcClient.sendCommand("Component.Get", {
        Name: params.component,
        Controls: params.controls.map(name => ({ Name: name }))
      });

      if (!response || typeof response !== 'object' || !('result' in response)) {
        throw new Error("Invalid response from Component.Get");
      }

      const result = response.result as any;
      if (!result?.Controls || !Array.isArray(result.Controls)) {
        throw new Error("Invalid response format: missing Controls array");
      }

      const controls = result.Controls;
      
      // Format as JSON for consistent MCP protocol compliance
      const formattedControls = controls.map((ctrl: any) => ({
        name: ctrl.Name,
        value: ctrl.Value,
        string: ctrl.String,
        position: ctrl.Position,
        error: ctrl.Error
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            component: params.component,
            controls: formattedControls
          })
        }],
        isError: false
      };
    } catch (error) {
      this.logger.error("Failed to get component controls", { 
        error, 
        component: params.component,
        controls: params.controls,
        context 
      });
      throw new Error(
        `Failed to get component controls: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Export the tool factory function for registration
 */
export const createGetComponentControlsTool = (qrwcClient: any) => 
  new GetComponentControlsTool(qrwcClient); 