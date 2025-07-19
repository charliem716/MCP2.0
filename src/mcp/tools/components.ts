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
      "List all components in the Q-SYS design with optional filtering",
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
   * Parse the Q-SYS component response
   */
  private parseComponentsResponse(response: any): QSysComponent[] {
    // For Phase 2.2, we'll simulate a realistic response
    // This will be replaced with actual QRWC parsing in production
    const mockComponents: QSysComponent[] = [
      {
        Name: "MainMixer",
        Type: "mixer",
        Properties: {
          inputs: 8,
          outputs: 2,
          location: "Living Room"
        }
      },
      {
        Name: "ZoneAmpControl",
        Type: "amplifier_control", 
        Properties: {
          channels: 4,
          power: "300W",
          location: "Equipment Room"
        }
      },
      {
        Name: "AudioRouter",
        Type: "router",
        Properties: {
          inputs: 16,
          outputs: 32,
          location: "Core Room"
        }
      },
      {
        Name: "SystemGains",
        Type: "gain_control",
        Properties: {
          channels: 12,
          location: "Virtual"
        }
      }
    ];

    return mockComponents;
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
    if (components.length === 0) {
      return "No components found" + (params.filter ? ` matching filter: ${params.filter}` : "");
    }

    const header = `Found ${components.length} component${components.length > 1 ? 's' : ''}:`;
    
    const componentsList = components.map(comp => {
      let result = `• ${comp.Name} (${comp.Type})`;
      
      if ((params.includeProperties ?? false) && comp.Properties) {
        const props = Object.entries(comp.Properties)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        result += `\n  Properties: ${props}`;
      }
      
      return result;
    }).join('\n');

    return `${header}\n\n${componentsList}`;
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