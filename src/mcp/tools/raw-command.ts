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
 * Common commands:
 * - Status.Get: Get core status
 * - Component.Get: Get component info
 * - Component.Set: Set component controls
 * - Mixer.Set: Set mixer controls
 * - Design.Get: Get design info
 * - Logon: Authenticate with core
 * 
 * @example
 * // Get status
 * { method: "Status.Get" }
 * 
 * @example
 * // Set component control
 * {
 *   method: "Component.Set",
 *   params: {
 *     Name: "MyGain",
 *     Controls: [{ Name: "gain", Value: -10 }]
 *   }
 * }
 */
export class SendRawCommandTool extends BaseQSysTool<SendRawCommandParams> {
  // Commands that should be blocked for safety
  private static readonly BLOCKED_METHODS = new Set([
    'Design.Save',
    'Design.Delete',
    'Design.Deploy',
    'Core.Reboot',
    'Core.Shutdown',
    'Core.FactoryReset',
    'Network.Set'
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
      "Send raw Q-SYS commands directly to the Core (advanced use only)",
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
      // Send the raw command
      const response = await this.qrwcClient.sendRawCommand(method, commandParams);
      
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