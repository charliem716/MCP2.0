/**
 * QRWC Client Adapter
 *
 * Adapts the OfficialQRWCClient to the interface expected by MCP tools.
 * This allows us to use the real Q-SYS connection while maintaining
 * compatibility with existing tool implementations.
 */

import { EventEmitter } from 'events';
import { globalLogger as logger } from '../../shared/utils/logger.js';
import type { OfficialQRWCClient } from '../../qrwc/officialClient.js';
import {
  validateControlValue,
  isRetryableError as isRetryableErrorValidator,
} from './validators.js';
import { QSysError, QSysErrorCode, NetworkError } from '../../shared/types/errors.js';
import { withErrorRecovery } from '../../shared/utils/error-recovery.js';
// Import removed - extractControlValue is now in command-handlers.js
import {
  handleGetComponents,
  handleGetControls,
  handleControlGet,
  handleControlSet,
  handleStatusGet,
  handleGetAllControls,
  handleGetAllControlValues,
  handleDirectControl,
} from './command-handlers.js';

/**
 * Interface that MCP tools expect from a QRWC client
 */
export interface QRWCClientInterface {
  isConnected(): boolean;
  sendCommand(
    command: string,
    params?: Record<string, unknown>
  ): Promise<unknown>;
}

/**
 * Retry options for sendCommand
 */
export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  retryBackoff?: number;
}

/**
 * Event emitted when change group polling detects changes
 */
export interface ChangeGroupEvent {
  groupId: string;
  changes: Array<{
    Name: string;
    Value: unknown;
    String: string;
  }>;
  timestamp: bigint;
  timestampMs: number;
  sequenceNumber: number;
}

/**
 * Q-SYS component structure from QRWC
 */
interface QSYSComponent {
  controls?: Record<string, QSYSControl>;
  state?: {
    Type?: string;
    Properties?: unknown[];
  };
}

/**
 * Q-SYS control structure from QRWC
 */
interface QSYSControl {
  Value?: unknown;
  String?: string;
  Position?: number;
  Type?: string;
  [key: string]: unknown;
}

/**
 * QRWC instance structure
 */
interface QRWCInstance {
  components: Record<string, QSYSComponent>;
}

/**
 * Control.Get result structure
 */
interface ControlGetResult {
  result?: Array<{
    Value: unknown;
    String?: string;
  }>;
}

/**
 * Adapter that wraps OfficialQRWCClient to provide the expected interface
 */
interface SimpleChangeGroup {
  id: string;
  controls: string[];
}

export class QRWCClientAdapter
  extends EventEmitter
  implements QRWCClientInterface
{
  private controlIndex = new Map<
    string,
    { componentName: string; controlName: string }
  >();
  private indexBuilt = false;
  private changeGroups = new Map<string, SimpleChangeGroup>();
  private autoPollTimers = new Map<string, NodeJS.Timeout>();
  private changeGroupLastValues = new Map<string, Map<string, unknown>>();
  private autoPollFailureCounts = new Map<string, number>();
  private readonly MAX_AUTOPOLL_FAILURES = 10; // Configurable threshold
  private globalSequenceNumber = 0;

  constructor(private readonly officialClient: OfficialQRWCClient) {
    super();
    // Extract host and port from the official client if possible
    // We'll initialize the raw command client lazily when needed
  }

  // ===== Connection Management =====

  /**
   * Build control index for O(1) lookups
   */
  private buildControlIndex(): void {
    try {
      const qrwc = this.officialClient.getQrwc() as QRWCInstance | undefined;
      if (!qrwc) {
        logger.warn('Cannot build control index: QRWC instance not available');
        return;
      }

      this.controlIndex.clear();
      let controlCount = 0;

      for (const [componentName, component] of Object.entries(
        qrwc.components
      )) {
        if (component.controls) {
          for (const controlName of Object.keys(component.controls)) {
            const fullName = `${componentName}.${controlName}`;
            this.controlIndex.set(fullName, { componentName, controlName });
            controlCount++;
          }
        }
      }

      this.indexBuilt = true;
      logger.debug(
        `Built control index with ${controlCount} controls from ${Object.keys(qrwc.components).length} components`
      );
    } catch (error) {
      logger.error('Failed to build control index', { error });
      this.indexBuilt = false;
    }
  }

  /**
   * Invalidate control index (call when components change)
   */
  invalidateControlIndex(): void {
    this.indexBuilt = false;
    this.controlIndex.clear();
    logger.debug('Control index invalidated');
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.officialClient.isConnected();
  }

  /**
   * Count all controls across all components
   */
  private countAllControls(qrwc: QRWCInstance | undefined): number {
    if (!qrwc || !qrwc.components) return 0;

    let count = 0;
    for (const component of Object.values(qrwc.components)) {
      if (component?.controls) {
        count += Object.keys(component.controls).length;
      }
    }
    return count;
  }

  // ===== Control Methods =====

  /**
   * Send a command to Q-SYS Core
   *
   * Delegates to the official QRWC client instead of providing mock responses.
   * This eliminates code duplication and provides real Q-SYS data.
   * Includes retry logic for transient failures.
   */
  async sendCommand(
    command: string,
    params?: Record<string, unknown>,
    options: RetryOptions = {}
  ): Promise<unknown> {
    const { maxRetries = 3, retryDelay = 1000, retryBackoff = 2 } = options;

    let lastError: Error = new QSysError('Unknown error', QSysErrorCode.COMMAND_FAILED);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Allow Status.Get to work even when disconnected
        if (
          !this.isConnected() &&
          command !== 'Status.Get' &&
          command !== 'StatusGet'
        ) {
          throw new QSysError('QRWC client not connected', QSysErrorCode.CONNECTION_FAILED);
        }

        logger.debug('Sending QRWC command via adapter', {
          command,
          params,
          attempt,
        });

        return await this.executeCommand(command, params, options);
      } catch (error) {
        lastError = error as Error;

        // Don't retry non-transient errors
        if (!this.isRetryableError(error)) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(retryBackoff, attempt);
          logger.warn(`Command failed, retrying in ${delay}ms`, {
            command,
            attempt: attempt + 1,
            error: lastError.message,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new NetworkError(
      `Command failed after ${maxRetries + 1} attempts: ${lastError.message}`,
      { originalError: lastError, command, params }
    );
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    return isRetryableErrorValidator(error);
  }

  /**
   * Execute the actual command (extracted for retry logic)
   */
  private async executeCommand(
    command: string,
    params?: Record<string, unknown>,
    _options: RetryOptions = {}
  ): Promise<unknown> {
    // Get the appropriate handler based on command
    const handler = this.getCommandHandler(command, params);
    if (handler) {
      return handler();
    }

    // Check for direct control operations
    if (
      command.includes('.') &&
      (command.endsWith('.get') || command.endsWith('.set'))
    ) {
      return handleDirectControl(command, params, this.officialClient);
    }

    // Fallback to raw command execution
    return this.executeRawCommand(command, params);
  }

  /**
   * Get the appropriate handler for a command
   */
  private getCommandHandler(
    command: string,
    params?: Record<string, unknown>
  ): (() => unknown) | null {
    switch (command) {
      case 'Component.GetComponents':
      case 'ComponentGetComponents':
        return () => handleGetComponents(params, this.officialClient);
      case 'Component.GetControls':
      case 'ComponentGetControls':
        return () => handleGetControls(params, this.officialClient);
      case 'Control.Get':
      case 'ControlGet':
        return () => handleControlGet(params, this.officialClient);
      case 'Control.Set':
      case 'ControlSet':
        return () => handleControlSet(params, this.officialClient);
      case 'Status.Get':
      case 'StatusGet':
        return () => handleStatusGet(params, this.officialClient);
      case 'Component.GetAllControls':
      case 'ComponentGetAllControls':
        return () => handleGetAllControls(params, this.officialClient);
      case 'Component.GetAllControlValues':
      case 'ComponentGetAllControlValues':
        return () => handleGetAllControlValues(params, this.officialClient);
      default:
        return null;
    }
  }

  /**
   * Execute raw command as fallback
   */
  private executeRawCommand(
    command: string,
    _params?: Record<string, unknown>
  ): unknown {
    // For unknown commands, throw an error
    throw new QSysError(
      `Unknown QRWC command: ${command}. Please implement this command in the adapter or official client.`,
      QSysErrorCode.COMMAND_FAILED,
      { command }
    );
  }

  /**
   * Get control value by name
   */
  private async getControlValue(
    controlName: string
  ): Promise<{ Value: unknown; String?: string } | null> {
    return withErrorRecovery(
      async () => {
        const result = (await this.sendCommand('Control.Get', {
          Controls: [controlName],
        })) as ControlGetResult;
        const controls = result.result;
        if (Array.isArray(controls) && controls.length > 0 && controls[0]) {
          return controls[0];
        }
        return null;
      },
      {
        context: `Get control value for ${controlName}`,
        fallback: null,
        contextData: { controlName },
      }
    );
  }

  /**
   * Validate and convert control value based on control type
   */
  private validateControlValue(
    controlName: string,
    value: unknown,
    controlInfo?: unknown
  ): { valid: boolean; value?: unknown; error?: string } {
    return validateControlValue(controlName, value, controlInfo);
  }

  // ===== Event Handling =====

  /**
   * Retry an individual operation with exponential backoff
   * Used for operations within commands that need retry logic
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const { maxRetries = 3, retryDelay = 1000, retryBackoff = 2 } = options;

    let lastError: Error = new QSysError('Unknown error', QSysErrorCode.COMMAND_FAILED);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry non-transient errors
        if (!this.isRetryableError(error)) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(retryBackoff, attempt);
          logger.debug(`Operation failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            error: lastError.message,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * List all active change groups
   */
  listChangeGroups(): Array<{
    id: string;
    controlCount: number;
    hasAutoPoll: boolean;
  }> {
    return Array.from(this.changeGroups.entries()).map(([id, group]) => ({
      id,
      controlCount: group.controls.length,
      hasAutoPoll: this.autoPollTimers.has(id),
    }));
  }

  /**
   * Clear all caches (should be called after long disconnections)
   */
  clearAllCaches(): void {
    // Clear control index
    this.invalidateControlIndex();

    // Clear all autoPoll timers
    for (const [id, timer] of this.autoPollTimers) {
      clearInterval(timer);
      logger.debug(`Cleared AutoPoll timer for change group ${id}`);
    }
    this.autoPollTimers.clear();

    // Clear change groups
    this.changeGroups.clear();
    this.changeGroupLastValues.clear();
    this.autoPollFailureCounts.clear();

    logger.info('All caches cleared due to long disconnection');
  }

  /**
   * Dispose of the adapter and clean up all resources
   * This should be called when the adapter is no longer needed
   * to prevent memory leaks from active timers
   */
  dispose(): void {
    logger.info('Disposing QRWCClientAdapter...');

    // Clear all caches and timers
    this.clearAllCaches();

    // Additional cleanup if needed in the future
    logger.info('QRWCClientAdapter disposed successfully');
  }
}
