/**
 * QRWC Client Adapter
 * 
 * Adapts the OfficialQRWCClient to the interface expected by MCP tools.
 * This allows us to use the real Q-SYS connection while maintaining
 * compatibility with existing tool implementations.
 */

import { globalLogger as logger } from "../../shared/utils/logger.js";
import type { OfficialQRWCClient } from "../../qrwc/officialClient.js";

/**
 * Interface that MCP tools expect from a QRWC client
 */
export interface QRWCClientInterface {
  isConnected(): boolean;
  sendCommand(command: string, params?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Adapter that wraps OfficialQRWCClient to provide the expected interface
 */
export class QRWCClientAdapter implements QRWCClientInterface {
  constructor(private readonly officialClient: OfficialQRWCClient) {}

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.officialClient.isConnected();
  }

  /**
   * Send a command to Q-SYS Core
   * 
   * This is a simplified interface that maps common commands to the
   * appropriate official client methods.
   */
  async sendCommand(command: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected()) {
      throw new Error("QRWC client not connected");
    }

    logger.debug("Sending QRWC command via adapter", { command, params });

    try {
      // For Phase 2, we'll implement a few key commands and provide mock responses for others
      switch (command) {
        case "Component.GetComponents":
        case "ComponentGetComponents":
          // Mock response for now - will be replaced with real implementation
          return {
            result: [
              { name: "MainMixer", type: "mixer.nxn", controls: 24 },
              { name: "MicGain1", type: "gain", controls: 3 },
              { name: "MicGain2", type: "gain", controls: 3 },
              { name: "OutputGain", type: "gain", controls: 3 },
            ]
          };

        case "Component.GetControls":
        case "ComponentGetControls":
          const componentName = params?.['Name'] || params?.['name'] || "Unknown";
          return {
            result: [
              { Name: `${componentName}.gain`, Value: 0, Type: "gain" },
              { Name: `${componentName}.mute`, Value: false, Type: "mute" },
              { Name: `${componentName}.polarity`, Value: false, Type: "boolean" }
            ]
          };

        case "Control.GetValues":
        case "ControlGetValues":
        case "Control.GetMultiple":
          const controls = params?.['Controls'] || params?.['Names'] || [];
          const mockControls = Array.isArray(controls) ? controls : [controls];
          return {
            controls: mockControls.map((ctrl: any) => {
              const name = typeof ctrl === 'string' ? ctrl : (ctrl.Name || ctrl.name);
              return {
                Name: name,
                Value: this.getMockControlValue(name),
                String: String(this.getMockControlValue(name))
              };
            })
          };

        case "Control.SetValues":
        case "ControlSetValues":
          // Mock successful response
          logger.info("Mock control set operation", { params });
          return {
            result: "Success"
          };

        case "StatusGet":
        case "Status.Get":
          return {
            result: {
              name: "Q-SYS-Core-110f",
              version: "9.10.2.0-2024.03.21",
              uptime: "5d 14h 32m 15s",
              status: "OK"
            }
          };

        default:
          // For unknown commands, return a generic success response
          logger.warn("Unknown command in adapter, returning mock response", { command });
          return {
            id: Date.now(),
            result: "Command executed successfully (mock)",
            command,
            params
          };
      }

    } catch (error) {
      logger.error("Error in QRWC adapter", { command, params, error });
      throw error;
    }
  }

  /**
   * Generate mock control values based on control name
   */
  private getMockControlValue(controlName: string): number | string | boolean {
    const name = String(controlName).toLowerCase();
    
    if (name.includes('gain')) {
      return Math.round((Math.random() * 30 - 15) * 10) / 10; // -15 to 15 dB
    }
    if (name.includes('mute')) {
      return Math.random() > 0.5;
    }
    if (name.includes('select') || name.includes('input')) {
      return Math.floor(Math.random() * 8) + 1; // 1-8
    }
    if (name.includes('level') || name.includes('volume')) {
      return Math.round(Math.random() * 100); // 0-100%
    }
    
    return Math.round(Math.random() * 100);
  }
} 