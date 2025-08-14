/**
 * Control System Interface
 * 
 * Defines the contract for any control system implementation (Q-SYS, Crestron, AMX, etc.)
 * This interface provides abstraction between the MCP layer and specific control systems.
 */

import type { 
  QSysApiResponse
} from '../types/qsys-api-responses.js';
import type {
  ConnectionEvent,
  ReconnectOptions,
  DiagnosticsResult,
  TestResult,
  ConnectionConfig,
  CoreTarget,
} from '../types/connection.js';
import type { ConnectionHealth } from '../../qrwc/connection/ConnectionManager.js';

/**
 * Command names supported by the control system
 * Using string type for flexibility across different control systems
 */
export type ControlSystemCommand = string;

/**
 * Connection management capabilities for control systems
 * Optional methods that enhance connection control and monitoring
 */
export interface IConnectionManageable {
  /**
   * Get current connection health and metrics
   */
  getConnectionHealth?(): ConnectionHealth;

  /**
   * Manually trigger reconnection with options
   */
  reconnect?(options?: ReconnectOptions): Promise<void>;

  /**
   * Get connection event history
   */
  getConnectionHistory?(limit?: number): ConnectionEvent[];

  /**
   * Run comprehensive connection diagnostics
   */
  runDiagnostics?(): Promise<DiagnosticsResult>;

  /**
   * Test connection quality
   */
  testConnection?(type: 'basic' | 'latency' | 'throughput' | 'comprehensive'): Promise<TestResult>;

  /**
   * Update connection configuration at runtime
   */
  updateConnectionConfig?(config: Partial<ConnectionConfig>): void;

  /**
   * Switch to a different core (future capability)
   */
  switchCore?(target: CoreTarget): Promise<void>;
}

/**
 * Control system interface that all implementations must follow
 * Now includes optional connection management capabilities
 */
export interface IControlSystem extends IConnectionManageable {
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