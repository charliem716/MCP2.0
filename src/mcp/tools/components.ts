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