import { z } from "zod";
import { BaseQSysTool, BaseToolParamsSchema } from "./base.js";
import type { ToolCallResult } from "../handlers/index.js";
import type { ToolExecutionContext } from "./base.js";

/**
 * Parameters for the send_raw_command tool
 */
export const SendRawCommandParamsSchema = BaseToolParamsSchema.extend({
  method: z.string().describe("The Q-SYS method name to call (e.g., 'Status.Get', 'Component.Get', 'Logon')"),
  params: z.any().optional().describe("The parameters for the method call (can be object, array, or primitive)"),
  timeout: z.number().positive().max(30000).optional().describe("Command timeout in milliseconds (default: 5000, max: 30000)")
});

export type SendRawCommandParams = z.infer<typeof SendRawCommandParamsSchema>;

/**
 * Tool to send raw Q-SYS commands directly
 * 
 * This tool provides direct access to the Q-SYS Core JSON-RPC API,
 * allowing execution of any valid Q-SYS command. Use with caution.
 * 
 * IMPORTANT: Q-SYS uses INCONSISTENT naming conventions:
 * - Some methods use camelCase: StatusGet, NoOp, Logon, ComponentGetComponents
 * - Others use dot notation: Control.Get, Control.Set, Component.Get, Component.Set
 * 
 * See QSYS_API_REFERENCE.md for the complete command reference.
 * 
 * Common commands that work well:
 * - StatusGet: Get core status
 * - NoOp: No operation/ping test
 * - Control.Get: Get named control values
 * - Control.Set: Set named control value
 * - Component.Get: Get component control values
 * - Component.Set: Set component control values
 * - ComponentGetComponents: List all components
 * 
 * For simpler operations, prefer using the dedicated MCP tools:
 * - list_components, get_component_controls, get_control_values, set_control_values
 * 
 * @example
 * // Get status
 * { method: "StatusGet" }
 * 
 * @example
 * // Set a named control with ramp
 * {
 *   method: "Control.Set",
 *   params: {
 *     Name: "MainVolume",
 *     Value: -10,
 *     Ramp: 2.0
 *   }
 * }
 * 
 * @example
 * // Get component controls
 * {
 *   method: "Component.Get",
 *   params: {
 *     Name: "Mixer1",
 *     Controls: [{ Name: "gain" }, { Name: "mute" }]
 *   }
 * }
 */
export class SendRawCommandTool extends BaseQSysTool<SendRawCommandParams> {
  // Commands that should be blocked for safety
  private static readonly BLOCKED_METHODS = new Set([
    // Dot notation (legacy)
    'Design.Save',
    'Design.Delete',
    'Design.Deploy',
    'Core.Reboot',
    'Core.Shutdown',
    'Core.FactoryReset',
    'Network.Set',
    // CamelCase notation (Q-SYS standard)
    'DesignSave',
    'DesignDelete',
    'DesignDeploy',
    'CoreReboot',
    'CoreShutdown',
    'CoreFactoryReset',
    'NetworkSet'
  ]);

  // Commands that should log warnings
  private static readonly WARNING_METHODS = new Set([
    'Logon',
    'Logoff',
    'Design.Start',
    'Design.Stop'
  ]);

  constructor(qrwcClient: any) {
    super(
      qrwcClient,
      "send_raw_command",
      "Send raw Q-SYS JSON-RPC commands (advanced). IMPORTANT: Use query_qsys_api with query_type='raw_commands' for full documentation! Q-SYS uses BOTH camelCase (StatusGet, NoOp) AND dot notation (Control.Set, Component.Get). Common: StatusGet, NoOp, Control.Get/Set, Component.Get/Set. Example: query_qsys_api({query_type:'raw_commands'}) shows all commands, naming rules, examples. WARNING: Some commands blocked. Timeout: 5000ms default, 30000ms max.",
      SendRawCommandParamsSchema
    );
  }

  protected async executeInternal(
    params: SendRawCommandParams,
    context: ToolExecutionContext
  ): Promise<ToolCallResult> {
    const { method, params: commandParams, timeout = 5000 } = params;

    // Safety check - block dangerous commands
    if (SendRawCommandTool.BLOCKED_METHODS.has(method)) {
      throw new Error(`Command '${method}' is blocked for safety reasons`);
    }

    // Log warning for sensitive commands
    if (SendRawCommandTool.WARNING_METHODS.has(method)) {
      this.logger.warn(`Executing sensitive command: ${method}`, { context });
    }

    this.logger.info(`Sending raw command: ${method}`, { 
      method, 
      params: commandParams,
      timeout,
      context 
    });

    try {
      // Note: Raw commands go through the QRWC message queue which may add slight delays
      // but ensures proper sequencing with other QRWC operations
      
      // Try using sendCommand instead of sendRawCommand for better compatibility
      let response;
      try {
        // First try sendCommand which uses the adapter's retry logic
        response = await this.qrwcClient.sendCommand(method, commandParams);
      } catch (cmdError: any) {
        // If sendCommand fails, fall back to sendRawCommand with timeout
        this.logger.debug("sendCommand failed, trying sendRawCommand", { 
          method,
          error: cmdError.message,
          timeout 
        });
        response = await this.qrwcClient.sendRawCommand(method, commandParams, timeout);
      }
      
      this.logger.debug("Raw command response received", { 
        method,
        responseType: typeof response,
        hasResult: response?.result !== undefined
      });

      // Format the response
      const result = {
        method,
        success: true,
        response: response?.result !== undefined ? response.result : response,
        timestamp: new Date().toISOString()
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }],
        isError: false
      };

    } catch (error: any) {
      this.logger.error("Raw command failed", { 
        method,
        error: error.message,
        context 
      });

      // Format error response
      const errorResult = {
        method,
        success: false,
        error: {
          message: error.message || 'Unknown error',
          code: error.code || 'COMMAND_FAILED',
          details: error.details || {}
        },
        timestamp: new Date().toISOString()
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(errorResult, null, 2)
        }],
        isError: true
      };
    }
  }
}

/**
 * Factory function to create the tool
 */
export const createSendRawCommandTool = (qrwcClient: any) => 
  new SendRawCommandTool(qrwcClient);