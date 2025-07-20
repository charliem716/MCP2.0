import { z } from "zod";
import { BaseQSysTool } from "./base.js";
import type { ToolCallResult } from "../handlers/index.js";
import type { ToolExecutionContext } from "./base.js";

/**
 * Parameters for the qsys_get_all_controls tool
 */
export const GetAllControlsParamsSchema = z.object({
  requestId: z.string().uuid().optional().describe("Optional request ID for tracking"),
  includeValues: z.boolean().optional()
    .describe("Include current control values (default: true)"),
  componentFilter: z.string().optional()
    .describe("Optional regex pattern to filter components")
});

export type GetAllControlsParams = z.infer<typeof GetAllControlsParamsSchema>;

/**
 * Tool to get all controls from all components in the Q-SYS system
 * 
 * Retrieves all controls system-wide in a single request, useful for:
 * - System-wide monitoring and diagnostics
 * - Building complete control maps
 * - Discovery of available controls
 * 
 * @example
 * // Get all controls with values
 * { includeValues: true }
 * 
 * @example
 * // Get only controls from APM components
 * { includeValues: true, componentFilter: "APM" }
 */
export class GetAllControlsTool extends BaseQSysTool<GetAllControlsParams> {
  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      "qsys_get_all_controls",
      "Get all controls from all components in the Q-SYS system. Supports regex filtering by component name (case-insensitive). Examples: 'APM' matches any component with APM in name, '^Mix' matches components starting with Mix, 'APM|Mixer' matches APM or Mixer components",
      GetAllControlsParamsSchema
    );
  }

  protected async executeInternal(
    params: GetAllControlsParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    try {
      const response = await this.qrwcClient.sendCommand("Component.GetAllControls");

      if (!response || typeof response !== 'object' || !('result' in response)) {
        throw new Error("Invalid response from Component.GetAllControls");
      }

      const result = response.result as any;
      if (!Array.isArray(result)) {
        throw new Error("Invalid response format: expected array of controls");
      }

      let controls = result;

      // Apply component filter if provided
      if (params.componentFilter) {
        const regex = new RegExp(params.componentFilter, 'i');
        controls = controls.filter((ctrl: any) => 
          regex.test(ctrl.Component)
        );
      }

      // Group by component for better organization
      const byComponent: Record<string, any[]> = {};
      controls.forEach((ctrl: any) => {
        const componentName = ctrl.Component || 'Unknown';
        if (!byComponent[componentName]) {
          byComponent[componentName] = [];
        }
        byComponent[componentName].push(ctrl);
      });

      // Format response as JSON for MCP protocol compliance
      const formattedResponse = {
        totalControls: controls.length,
        componentCount: Object.keys(byComponent).length,
        components: Object.entries(byComponent).map(([name, ctrls]) => ({
          name,
          controlCount: ctrls.length,
          controls: params.includeValues !== false ? ctrls.map(c => ({
            name: c.Name,
            value: c.Value,
            string: c.String,
            type: c.Type
          })) : ctrls.map(c => ({ name: c.Name }))
        }))
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(formattedResponse)
        }],
        isError: false
      };
    } catch (error) {
      this.logger.error("Failed to get all controls", { 
        error, 
        componentFilter: params.componentFilter,
        context 
      });
      throw new Error(
        `Failed to get all controls: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Export the tool factory function for registration
 */
export const createGetAllControlsTool = (qrwcClient: any) => 
  new GetAllControlsTool(qrwcClient);