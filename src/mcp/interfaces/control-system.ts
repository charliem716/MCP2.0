/**
 * Control System Interface
 * 
 * Defines the contract for any control system implementation (Q-SYS, Crestron, AMX, etc.)
 * This interface provides abstraction between the MCP layer and specific control systems.
 */

import type { 
  QSysApiResponse
} from '../types/qsys-api-responses.js';

/**
 * Command names supported by the control system
 * Using string type for flexibility across different control systems
 */
export type ControlSystemCommand = string;

/**
 * Control system interface that all implementations must follow
 */
export interface IControlSystem {
  /**
   * Check if the control system is connected
   */
  isConnected(): boolean;

  /**
   * Send a command to the control system
   */
  sendCommand<T = unknown>(
    command: ControlSystemCommand,
    params?: Record<string, unknown>
  ): Promise<QSysApiResponse<T>>;
}

/**
 * Extended interface for Q-SYS specific functionality
 * Other control systems can have their own extended interfaces
 * Note: Currently using IControlSystem directly. When Q-SYS specific
 * methods are needed, create IQSysControlSystem extending IControlSystem.
 */
export type IQSysControlSystem = IControlSystem;

/**
 * Factory function type for creating control system instances
 */
export type ControlSystemFactory = () => IControlSystem;