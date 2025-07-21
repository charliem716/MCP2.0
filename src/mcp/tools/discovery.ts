import { z } from "zod";
import { BaseQSysTool } from "./base.js";
import type { ToolCallResult } from "../handlers/index.js";
import type { ToolExecutionContext } from "./base.js";
import type { QRWCClientInterface } from "../qrwc/adapter.js";

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
  constructor(qrwcClient: QRWCClientInterface) {
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

      const result = response.result as unknown[];
      if (!Array.isArray(result)) {
        throw new Error("Invalid response format: expected array of controls");
      }

      let controls = result;

      // Apply component filter if provided
      if (params.componentFilter) {
        const regex = new RegExp(params.componentFilter, 'i');
        controls = controls.filter((ctrl: unknown) => {
          const control = ctrl as { Component?: string };
          return regex.test(control.Component || '');
        });
      }

      // Group by component for better organization
      const byComponent: Record<string, unknown[]> = {};
      controls.forEach((ctrl: unknown) => {
        const control = ctrl as { Component?: string; Name?: string; Value?: unknown; String?: string; Type?: string };
        const componentName = control.Component || 'Unknown';
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
          controls: params.includeValues !== false ? ctrls.map((c: unknown) => {
            const ctrl = c as { Name?: string; Value?: unknown; String?: string; Type?: string };
            return {
              name: ctrl.Name,
              value: ctrl.Value,
              string: ctrl.String,
              type: ctrl.Type
            };
          }) : ctrls.map((c: unknown) => {
            const ctrl = c as { Name?: string };
            return { name: ctrl.Name };
          })
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
export const createGetAllControlsTool = (qrwcClient: QRWCClientInterface) => 
  new GetAllControlsTool(qrwcClient);