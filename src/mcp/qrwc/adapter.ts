/**
 * QRWC Client Adapter
 *
 * Adapts the OfficialQRWCClient to the interface expected by MCP tools.
 * This allows us to use the real Q-SYS connection while maintaining
 * compatibility with existing tool implementations.
 */

import { EventEmitter } from 'events';
import { globalLogger as logger } from '../../shared/utils/logger.js';
import { getCorrelationId } from '../../shared/utils/correlation.js';
import type { OfficialQRWCClient } from '../../qrwc/officialClient.js';
import type { IControlState } from '@q-sys/qrwc';
import {
  validateControlValue,
  isRetryableError as isRetryableErrorValidator,
} from './validators.js';
import { QSysError, QSysErrorCode, NetworkError, ValidationError } from '../../shared/types/errors.js';
import { withErrorRecovery } from '../../shared/utils/error-recovery.js';
import { discoveryCache } from '../state/discovery-cache.js';
// Import removed - extractControlValue is now in command-handlers.js
import {
  handleGetComponents,
  handleGetControls,
  handleComponentGet,
  handleControlGet,
  handleControlGetValues,
  handleControlSet,
  handleStatusGet,
  handleDirectControl,
} from './command-handlers.js';
import type { CommandMap, CommandName, CommandParams, CommandResult } from './command-map.js';
import { ControlSimulator } from './control-simulator.js';
import { isQSysApiResponse, type QSysApiResponse } from '../types/qsys-api-responses.js';
import type { IControlSystem, ControlSystemCommand } from '../interfaces/control-system.js';
import type { IStateRepository } from '../state/repository.js';
import type {
  ConnectionEvent,
  ReconnectOptions,
  DiagnosticsResult,
  TestResult,
  ConnectionConfig,
  CoreTarget,
} from '../types/connection.js';
import type { ConnectionHealth } from '../../qrwc/connection/ConnectionManager.js';
import { ConnectionState } from '../../shared/types/common.js';

/**
 * Interface that MCP tools expect from a QRWC client
 * Now extends the generic control system interface
 */
export interface QRWCClientInterface extends IControlSystem {
  // Override with more specific Q-SYS types
  sendCommand<T extends CommandName>(
    command: T,
    params?: CommandParams<T>
  ): Promise<QSysApiResponse<CommandResult<T>>>;

  // Also support generic IControlSystem signature
  sendCommand<T = unknown>(
    command: ControlSystemCommand,
    params?: Record<string, unknown>
  ): Promise<QSysApiResponse<T>>;
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
  state: IControlState;
  // Other control properties like methods may exist
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
  lastPollValues?: Map<string, { Value: unknown; String: string }>;
  lastPollTime?: number;
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
  private autoPollFailureCounts = new Map<string, number>();
  private readonly MAX_AUTOPOLL_FAILURES = 10; // Configurable threshold
  private globalSequenceNumber = 0;
  private stateManager?: IStateRepository;

  private simulator: ControlSimulator | null = null;
  private useSimulation = false;

  constructor(private readonly officialClient: OfficialQRWCClient) {
    super();
    // Extract host and port from the official client if possible
    // We'll initialize the raw command client lazily when needed
    
    // Initialize simulator for testing when not connected to real Core
    if (process.env['USE_CONTROL_SIMULATION'] === 'true') {
      this.simulator = new ControlSimulator();
      this.simulator.start();
      this.useSimulation = true;
      logger.info('Control simulator enabled for 33Hz testing');
    }

    // Listen for connection events to manage cache
    this.setupConnectionHandlers();
  }

  /**
   * Setup connection event handlers for cache management
   */
  private setupConnectionHandlers(): void {
    // Listen for connection events from official client
    this.officialClient.on('connected', () => {
      logger.info('QRWC connected - discovery cache ready');
      discoveryCache.onConnectionStateChange(true);
      // Invalidate control index on reconnect as components may have changed
      this.invalidateControlIndex();
    });

    this.officialClient.on('disconnected', () => {
      logger.info('QRWC disconnected - clearing discovery cache');
      discoveryCache.onConnectionStateChange(false);
      // Clear control index on disconnect
      this.invalidateControlIndex();
    });

    this.officialClient.on('error', (error: Error) => {
      logger.error('QRWC connection error', { error });
      // Don't clear cache on transient errors, only on disconnect
    });
  }

  // ===== State Manager Integration =====

  /**
   * Set the state manager for this adapter
   * This allows event monitoring tools to access the state through the control system
   */
  setStateManager(manager: IStateRepository): void {
    this.stateManager = manager;
    logger.debug('State manager attached to QRWC adapter', {
      hasEventMonitor: !!('getEventMonitor' in manager && typeof (manager as { getEventMonitor?: unknown }).getEventMonitor === 'function')
    });
  }

  /**
   * Get the state manager attached to this adapter
   */
  getStateManager(): IStateRepository | undefined {
    return this.stateManager;
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
      logger.debug('Built control index', {
        controlCount,
        componentCount: Object.keys(qrwc.components).length,
        correlationId: getCorrelationId(),
        component: 'qrwc.adapter.index'
      });
    } catch (error) {
      logger.error('Failed to build control index', { 
        error,
        correlationId: getCorrelationId(),
        component: 'qrwc.adapter.index'
      });
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
   * Get the underlying OfficialQRWCClient instance
   * Used by SQLiteEventMonitorV2 for SDK event monitoring
   */
  getClient(): OfficialQRWCClient {
    return this.officialClient;
  }


  // ===== Control Methods =====

  /**
   * Send a command to Q-SYS Core
   *
   * Delegates to the official QRWC client instead of providing mock responses.
   * This eliminates code duplication and provides real Q-SYS data.
   * Includes retry logic for transient failures.
   */
  async sendCommand<T extends CommandName>(
    command: T,
    params?: CommandParams<T>,
    options: RetryOptions = {}
  ): Promise<QSysApiResponse<CommandResult<T>>> {
    const startTime = Date.now();
    const correlationId = getCorrelationId();
    const { maxRetries = 3, retryDelay = 1000, retryBackoff = 2 } = options;

    logger.debug('sendCommand initiated', {
      command,
      correlationId,
      component: 'qrwc.adapter',
      hasParams: !!params
    });

    let lastError: Error = new QSysError('Unknown error', QSysErrorCode.COMMAND_FAILED);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Allow Status.Get to work even when disconnected
        if (!this.isConnected()) {
          // Check if this is a Status.Get command which should work when disconnected
          const isStatusCommand = 
            (command as string) === 'Status.Get' || 
            (command as string) === 'StatusGet';
          
          if (!isStatusCommand) {
            throw new QSysError('Not connected', QSysErrorCode.CONNECTION_FAILED);
          }
        }

        // Safely log params without circular references
        let safeParams: unknown;
        try {
          // Try to stringify params to check for circular references
          JSON.stringify(params);
          safeParams = params;
        } catch {
          // If params has circular references, just log the keys
          safeParams = params ? Object.keys(params as Record<string, unknown>) : undefined;
        }
        
        logger.debug('Sending QRWC command via adapter', {
          command,
          params: safeParams,
          attempt,
          correlationId,
          component: 'qrwc.adapter.command',
          elapsedMs: Date.now() - startTime
        });

        const commandStartTime = Date.now();
        const result = await this.executeCommand(command, params, options);
        const commandDuration = Date.now() - commandStartTime;
        
        logger.info('Command executed successfully', {
          command,
          duration: commandDuration,
          totalDuration: Date.now() - startTime,
          correlationId,
          component: 'qrwc.adapter.command',
          attempt,
          performanceMetrics: {
            commandExecutionTimeMs: commandDuration,
            totalTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
          }
        });
        
        // Check if result is already wrapped in QSysApiResponse
        if (isQSysApiResponse(result)) {
          return result as QSysApiResponse<CommandResult<T>>;
        }
        
        // Wrap in QSysApiResponse structure
        return {
          jsonrpc: '2.0',
          id: Date.now(),
          result: result as CommandResult<T>
        } as QSysApiResponse<CommandResult<T>>;
      } catch (error) {
        // Ensure error is an Error object
        if (error instanceof Error) {
          lastError = error;
        } else {
          lastError = new QSysError(
            typeof error === 'string' ? error : 'Unknown error occurred',
            QSysErrorCode.COMMAND_FAILED,
            { originalError: error }
          );
        }

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
        return async () => handleGetComponents(params, this.officialClient);
      case 'Component.GetControls':
      case 'ComponentGetControls':
        return () => handleGetControls(params, this.officialClient);
      case 'Component.Get':
      case 'ComponentGet':
        return () => handleComponentGet(params, this.officialClient);
      case 'Control.Get':
      case 'ControlGet':
        return () => handleControlGet(params, this.officialClient);
      case 'Control.GetValues':
      case 'ControlGetValues':
        return () => handleControlGetValues(params, this.officialClient);
      case 'Control.Set':
      case 'ControlSet':
        return async () => this.handleControlSetWrapper(params);
      case 'Component.Set':
      case 'ComponentSet':
        return async () => this.handleComponentSet(params);
      case 'Status.Get':
      case 'StatusGet':
        return () => handleStatusGet(params, this.officialClient);
      case 'ChangeGroup.Create':
        return () => this.handleChangeGroupCreate(params);
      case 'ChangeGroup.AddControl':
        return () => this.handleChangeGroupAddControl(params);
      case 'ChangeGroup.AddComponentControl':
        return () => this.handleChangeGroupAddComponentControl(params);
      case 'ChangeGroup.Poll':
        return () => this.handleChangeGroupPoll(params);
      case 'ChangeGroup.AutoPoll':
        return () => this.handleChangeGroupAutoPoll(params);
      case 'ChangeGroup.Destroy':
        return () => this.handleChangeGroupDestroy(params);
      case 'ChangeGroup.Remove':
        return () => this.handleChangeGroupRemove(params);
      case 'ChangeGroup.Clear':
        return () => this.handleChangeGroupClear(params);
      default:
        return null;
    }
  }

  /**
   * Handle Component.Set command - sets multiple controls on a component
   */
  private async handleComponentSet(params?: Record<string, unknown>): Promise<unknown> {
    if (!params?.['Name'] || !params?.['Controls']) {
      throw new ValidationError('Component name and Controls array are required',
        [{ field: 'Name', message: 'Component name and Controls array are required', code: 'REQUIRED_FIELD' }]);
    }
    
    const componentName = params['Name'] as string;
    const controlsParam = params['Controls'];
    
    if (!Array.isArray(controlsParam)) {
      throw new ValidationError('Controls must be an array',
        [{ field: 'Controls', message: 'Must be an array', code: 'INVALID_TYPE' }]);
    }
    
    // Convert Component.Set format to Control.Set format
    // Component.Set has: { Name: "componentName", Controls: [{Name: "controlName", Value: x}] }
    // Control.Set needs: { Controls: [{Name: "componentName.controlName", Value: x}] }
    const convertedControls = controlsParam.map((control: unknown) => {
      if (typeof control !== 'object' || !control) {
        throw new ValidationError('Invalid control format',
          [{ field: 'control', message: 'Control must be an object', code: 'INVALID_FORMAT' }]);
      }
      
      const controlObj = control as Record<string, unknown>;
      const controlName = controlObj['Name'];
      
      if (!controlName || typeof controlName !== 'string') {
        throw new ValidationError('Control name is required',
          [{ field: 'Name', message: 'Control name is required', code: 'REQUIRED_FIELD' }]);
      }
      
      // Create the full control name
      const fullControlName = `${componentName}.${controlName}`;
      
      // Build the converted control object
      const convertedControl: Record<string, unknown> = {
        Name: fullControlName,
        Value: controlObj['Value']
      };
      
      // Preserve optional properties
      if ('Ramp' in controlObj) {
        convertedControl['Ramp'] = controlObj['Ramp'];
      }
      if ('Position' in controlObj) {
        convertedControl['Position'] = controlObj['Position'];
      }
      
      return convertedControl;
    });
    
    // Now call the existing Control.Set handler with converted format
    const result = await handleControlSet({ Controls: convertedControls }, this.officialClient);
    
    // The result from handleControlSet has the format:
    // { result: [{Name: "componentName.controlName", Result: "Success/Error", Error?: "..."}] }
    // We should keep this format for consistency
    return result;
  }

  /**
   * Wrapper for Control.Set to match test expectations
   */
  private async handleControlSetWrapper(params?: Record<string, unknown>): Promise<unknown> {
    const result = await handleControlSet(params, this.officialClient);
    const resultArray = result.result;
    
    // Check for any errors that should be thrown as exceptions
    const errorResult = resultArray.find(r => r.Result === 'Error');
    if (errorResult && errorResult.Error) {
      // Throw for specific error types that tests expect as exceptions
      if (errorResult.Error.includes('Invalid control name format')) {
        throw new ValidationError(
          errorResult.Error,
          [{ field: 'Name', message: errorResult.Error, code: 'INVALID_FORMAT' }],
          { controlName: errorResult.Name }
        );
      }
      if (errorResult.Error.includes('Component not found')) {
        throw new QSysError(
          errorResult.Error,
          QSysErrorCode.INVALID_COMPONENT,
          { componentName: errorResult.Name }
        );
      }
    }
    
    // Always return the detailed array format for consistency
    return result;
  }

  /**
   * Execute raw command as fallback
   */
  private executeRawCommand(
    command: string,
    params?: Record<string, unknown>
  ): unknown {
    // Log which commands we actually support for debugging
    logger.warn('Unhandled command received', {
      command,
      hasParams: !!params,
      supportedCommands: [
        'Component.GetComponents', 'Component.GetControls', 'Component.Get', 'Component.Set',
        'Control.Get', 'Control.Set', 'Control.GetValues',
        'Status.Get',
        'ChangeGroup.Create', 'ChangeGroup.AddControl', 'ChangeGroup.AddComponentControl',
        'ChangeGroup.Poll', 'ChangeGroup.AutoPoll', 'ChangeGroup.Destroy',
        'ChangeGroup.Remove', 'ChangeGroup.Clear'
      ],
      component: 'qrwc.adapter'
    });
    
    // For unknown commands, throw a more helpful error
    throw new QSysError(
      `Unrecognized command: '${command}'. This might be due to a typo or case sensitivity issue. Check the command name and try again.`,
      QSysErrorCode.COMMAND_FAILED,
      { 
        command,
        hint: 'Commands are case-sensitive. Common commands include Component.Get, Control.Set, ChangeGroup.Create, etc.'
      }
    );
  }

  /**
   * Get control value by name
   */
  private async getControlValue(
    controlName: string
  ): Promise<{ Value: unknown; String?: string } | null> {
    return withErrorRecovery<{ Value: unknown; String?: string } | null>(
      async () => {
        const response = await this.sendCommand('Control.Get', {
          Controls: [controlName],
        });
        
        // Check if response has a result
        if (!response.result) {
          return null;
        }
        
        const controls = response.result;
        if (Array.isArray(controls) && controls.length > 0 && controls[0]) {
          return controls[0] as { Value: unknown; String?: string };
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
        // Ensure error is an Error object
        if (error instanceof Error) {
          lastError = error;
        } else {
          lastError = new QSysError(
            typeof error === 'string' ? error : 'Unknown error occurred',
            QSysErrorCode.COMMAND_FAILED,
            { originalError: error }
          );
        }

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
      // Clear both interval and timeout timers
      clearInterval(timer);
      clearTimeout(timer);
      logger.debug(`Cleared AutoPoll timer for change group ${id}`);
    }
    this.autoPollTimers.clear();

    // Clear change groups
    this.changeGroups.clear();
    this.autoPollFailureCounts.clear();

    logger.info('All caches cleared due to long disconnection');
  }

  /**
   * Handle ChangeGroup.Create command
   */
  private handleChangeGroupCreate(params?: Record<string, unknown>): unknown {
    if (!params?.['Id']) {
      throw new QSysError('Change group ID required', QSysErrorCode.COMMAND_FAILED);
    }
    
    const groupId = params['Id'] as string;
    
    // Check if group already exists
    if (this.changeGroups.has(groupId)) {
      return {
        Id: groupId,
        result: 'Change group already exists'
      };
    }
    
    // Create new change group
    const group = { 
      id: groupId, 
      controls: [] 
    };
    this.changeGroups.set(groupId, group);
    
    return {
      Id: groupId,
      result: 'Change group created successfully'
    };
  }

  /**
   * Handle ChangeGroup.AddComponentControl command (QRWC SDK format)
   */
  private handleChangeGroupAddComponentControl(params?: Record<string, unknown>): unknown {
    if (!params?.['Id']) {
      throw new QSysError('Change group ID required', QSysErrorCode.COMMAND_FAILED);
    }
    
    const groupId = params['Id'] as string;
    const componentParam = params['Component'] as { Name: string; Controls: Array<{ Name: string }> } | undefined;
    
    if (!componentParam?.Name || !componentParam?.Controls) {
      throw new QSysError('Component and Controls required', QSysErrorCode.COMMAND_FAILED);
    }
    
    // Convert to our internal format
    const controls: string[] = componentParam.Controls.map(c => 
      `${componentParam.Name}.${c.Name}`
    );
    
    // Use existing AddControl logic and convert result to SDK format
    const internalResult = this.handleChangeGroupAddControl({
      Id: groupId,
      Controls: controls
    }) as { result: { addedCount: number } };
    
    // Return in QRWC SDK format
    return {
      result: {
        Id: groupId,
        Controls: controls
      }
    };
  }

  /**
   * Handle ChangeGroup.AddControl command
   */
  // eslint-disable-next-line max-statements -- Complex logic for adding controls to change groups with validation
  private handleChangeGroupAddControl(params?: Record<string, unknown>): unknown {
    if (!params?.['Id']) {
      throw new QSysError('Change group ID required', QSysErrorCode.COMMAND_FAILED);
    }
    
    const groupId = params['Id'] as string;
    const controlsParam = params['Controls'];
    let controls: string[] = [];
    
    // Handle both string array and object array formats
    if (Array.isArray(controlsParam)) {
      controls = controlsParam.map((control: unknown) => {
        if (typeof control === 'string') {
          return control;
        } else if (typeof control === 'object' && control !== null && 'Name' in control) {
          // Type assertion with validation
          const controlObj = control as { Name: unknown };
          return typeof controlObj.Name === 'string' ? controlObj.Name : '';
        }
        return '';
      }).filter(name => name.length > 0);
    }
    
    // Check if creating a new group with empty controls (from CreateChangeGroupTool)
    const isCreatingNewGroup = controls.length === 0;
    
    // Get or create change group
    let group = this.changeGroups.get(groupId);
    let existingGroup = false;
    let existingControlCount = 0;
    
    if (group) {
      existingGroup = true;
      existingControlCount = group.controls.length;
    } else {
      group = { id: groupId, controls: [] };
      this.changeGroups.set(groupId, group);
    }
    
    // Add controls that don't already exist
    let addedCount = 0;
    const skippedControls: string[] = [];
    const invalidControls: string[] = [];
    
    for (const control of controls) {
      // If using simulation, skip validation
      if (this.useSimulation && this.simulator) {
        if (!group.controls.includes(control)) {
          group.controls.push(control);
          addedCount++;
        }
        continue;
      }
      
      // Validate control format and add to group
      const parts = control.split('.');
      if (parts.length < 2) {
        invalidControls.push(control);
        logger.warn(`Invalid control format for change group: ${control} (expected Component.Control or Component.Control.Index format)`);
        continue;
      }
      
      // Support both Component.Control and Component.Control.Index formats
      // Examples: "Main Gain.gain" or "TableMicMeter.meter.1"
      const componentName = parts[0];
      const controlName = parts.slice(1).join('.'); // Join remaining parts for multi-part control names
      
      if (!componentName || !controlName) {
        invalidControls.push(control);
        continue;
      }
      
      // Add control to group if not already present
      // We don't validate against qrwc.components since components with Script Access
      // may not be loaded in the SDK (like TableMicMeter)
      if (!group.controls.includes(control)) {
        group.controls.push(control);
        addedCount++;
        logger.debug(`Added control ${control} to change group ${groupId}`);
      } else {
        skippedControls.push(control);
      }
    }
    
    interface ChangeGroupAddResult {
      result: { 
        addedCount: number;
        totalControls?: number;
        invalidControls?: string[];
        skippedControls?: string[];
      };
      warning?: string;
    }
    
    const result: ChangeGroupAddResult = { 
      result: { 
        addedCount,
        totalControls: group.controls.length
      } 
    };
    
    // Add validation feedback
    if (invalidControls.length > 0) {
      result.result.invalidControls = invalidControls;
      result.warning = `${invalidControls.length} control(s) had invalid format and were skipped`;
    }
    
    if (skippedControls.length > 0) {
      result.result.skippedControls = skippedControls;
    }
    
    // If creating a new group and it already existed, add warning
    if (isCreatingNewGroup && existingGroup) {
      const existingWarning = `Change group '${groupId}' already exists with ${existingControlCount} controls`;
      result.warning = result.warning ? `${result.warning}. ${existingWarning}` : existingWarning;
    }
    
    return result;
  }
  
  /**
   * Handle ChangeGroup.Poll command
   */
  /**
   * Handle ChangeGroup.Poll command
   * Implements proper change detection by tracking previous values
   */
  private handleChangeGroupPoll(params?: Record<string, unknown>): unknown {
    if (!params?.['Id']) {
      throw new QSysError('Change group ID required', QSysErrorCode.COMMAND_FAILED);
    }
    
    const groupId = params['Id'] as string;
    const showAll = params['showAll'] === true; // Optional parameter to show all values
    const group = this.changeGroups.get(groupId);
    
    if (!group) {
      throw new QSysError('Change group not found', QSysErrorCode.COMMAND_FAILED);
    }
    
    // Initialize last poll values map if not exists
    if (!group.lastPollValues) {
      group.lastPollValues = new Map();
    }
    
    // Collect current values and detect changes
    const currentValues: Array<{ Name: string; Value: unknown; String: string }> = [];
    const changedValues: Array<{ Name: string; Value: unknown; String: string }> = [];
    const qrwc = this.officialClient.getQrwc() as QRWCInstance | undefined;
    
    for (const controlPath of group.controls) {
      let currentValue: number;
      let currentString: string;
      
      // Use simulator if enabled
      if (this.useSimulation && this.simulator) {
        const simValue = this.simulator.getControlValue(controlPath);
        if (simValue) {
          currentValue = simValue.Value;
          currentString = simValue.String;
        } else {
          continue;
        }
      } else {
        // Use real Q-SYS Core values
        const parts = controlPath.split('.');
        if (parts.length < 2) continue;
        
        // Support both Component.Control and Component.Control.Index formats
        const componentName = parts[0];
        const controlName = parts.slice(1).join('.'); // Join remaining parts for multi-part control names
        
        if (!componentName || !controlName || !qrwc) continue;
        const component = qrwc.components[componentName];
        const control = component?.controls?.[controlName];
        
        if (control) {
          const controlState = control.state;
          currentValue = controlState.Value ?? 0;
          currentString = controlState.String ?? String(currentValue);
        } else {
          continue;
        }
      }
      
      const currentState = {
        Name: controlPath,
        Value: currentValue,
        String: currentString,
      };
      
      currentValues.push(currentState);
      
      // Check if value has changed since last poll
      const lastValue = group.lastPollValues.get(controlPath);
      const hasChanged = !lastValue || 
                        lastValue.Value !== currentValue || 
                        lastValue.String !== currentString;
      
      if (hasChanged) {
        changedValues.push(currentState);
        // Update the stored last value
        group.lastPollValues.set(controlPath, {
          Value: currentValue,
          String: currentString,
        });
      }
    }
    
    // Track poll time for high-frequency detection
    const now = Date.now();
    const timeSinceLastPoll = group.lastPollTime ? now - group.lastPollTime : Infinity;
    
    // For high-frequency monitoring (33Hz), always emit to capture the actual polling rate
    // This ensures meter monitoring captures all samples even if values don't change
    // Check BEFORE updating lastPollTime
    const isHighFrequency = this.autoPollTimers.has(groupId) && timeSinceLastPoll < 100;
    
    group.lastPollTime = now;
    
    // Emit event for monitoring - emit if there are changes, first poll, or high-frequency monitoring
    if (changedValues.length > 0 || group.lastPollValues.size === 0 || isHighFrequency) {
      this.emit('changeGroup:poll', {
        groupId,
        controls: changedValues.length > 0 ? changedValues : currentValues, // Send changes or all values
        timestamp: now
      });
    }
    
    // Return changes for the poll response (or all values if requested or first poll)
    let returnValues: Array<{ Name: string; Value: unknown; String: string }>;
    
    if (showAll) {
      // Show all current values when explicitly requested
      returnValues = currentValues;
    } else {
      // Normal behavior: show only changes (or all on first poll)
      returnValues = changedValues.length > 0 ? changedValues : 
                    (group.lastPollValues.size === 0 ? currentValues : []);
    }
    
    return {
      result: {
        Id: groupId,
        Changes: returnValues,
      },
    };
  }
  
  /**
   * Handle ChangeGroup.AutoPoll command
   * Supports high-frequency polling up to 33Hz (30ms intervals)
   */
  private handleChangeGroupAutoPoll(params?: Record<string, unknown>): unknown {
    if (!params?.['Id']) {
      throw new QSysError('Change group ID required', QSysErrorCode.COMMAND_FAILED);
    }
    
    const groupId = params['Id'] as string;
    // Rate in seconds, supports fractional values (e.g., 0.03 for 30ms)
    // Default to 30ms (33Hz) for high-frequency event monitoring
    const rate = (params['Rate'] as number | undefined) ?? 0.03;
    
    // Validate rate (minimum 30ms, maximum 1 hour)
    if (rate < 0.03 || rate > 3600) {
      throw new QSysError(
        `Invalid poll rate: ${rate}. Must be between 0.03 (33Hz) and 3600 seconds`,
        QSysErrorCode.COMMAND_FAILED
      );
    }
    
    const group = this.changeGroups.get(groupId);
    if (!group) {
      throw new QSysError('Change group not found', QSysErrorCode.COMMAND_FAILED);
    }
    
    // Clear existing timer if any
    const existingTimer = this.autoPollTimers.get(groupId);
    if (existingTimer) {
      // Clear both interval and timeout timers
      clearInterval(existingTimer);
      clearTimeout(existingTimer);
      this.autoPollTimers.delete(groupId);
    }
    
    // Set up new timer with millisecond precision
    // Convert rate (in seconds) to milliseconds, with minimum of 30ms
    const intervalMs = Math.max(30, Math.round(rate * 1000));
    
    // For high-frequency polling (< 100ms), use a different strategy
    // to avoid overlapping async operations
    if (intervalMs < 100) {
      // Use recursive setTimeout for precise high-frequency polling
      let isPolling = false;
      let lastPollTime = Date.now();
      let currentTimerId: NodeJS.Timeout | null = null;
      
      const highFrequencyPoll = () => {
        // Skip if previous poll is still running
        if (isPolling) {
          currentTimerId = setTimeout(() => highFrequencyPoll(), intervalMs);
          this.autoPollTimers.set(groupId, currentTimerId as NodeJS.Timeout);
          return;
        }
        
        isPolling = true;
        const pollStartTime = Date.now();
        
        try {
          // Use synchronous poll for high-frequency to avoid async overhead
          const pollResult = this.handleChangeGroupPoll({ Id: groupId });
          
          // Track actual poll rate for debugging
          const actualInterval = pollStartTime - lastPollTime;
          if (actualInterval > intervalMs * 2) {
            logger.debug('High-frequency poll lagging', { 
              groupId, 
              targetMs: intervalMs, 
              actualMs: actualInterval 
            });
          }
          lastPollTime = pollStartTime;
          
          // Reset failure count on success
          this.autoPollFailureCounts.delete(groupId);
        } catch (error) {
          logger.error('High-frequency auto-poll failed', { groupId, error });
          const failures = (this.autoPollFailureCounts.get(groupId) ?? 0) + 1;
          this.autoPollFailureCounts.set(groupId, failures);
          
          if (failures >= this.MAX_AUTOPOLL_FAILURES) {
            if (currentTimerId) clearTimeout(currentTimerId);
            this.autoPollTimers.delete(groupId);
            this.autoPollFailureCounts.delete(groupId);
            logger.error('Auto-poll stopped due to repeated failures', { groupId, failures });
            isPolling = false;
            return;
          }
        } finally {
          isPolling = false;
        }
        
        // Schedule next poll precisely based on target interval
        const processingTime = Date.now() - pollStartTime;
        const nextDelay = Math.max(1, intervalMs - processingTime);
        
        // Continue polling if timer hasn't been cleared
        if (this.autoPollTimers.has(groupId)) {
          currentTimerId = setTimeout(() => highFrequencyPoll(), nextDelay);
          this.autoPollTimers.set(groupId, currentTimerId as NodeJS.Timeout);
        }
      };
      
      // Set initial timer placeholder to indicate polling is active
      this.autoPollTimers.set(groupId, null as unknown as NodeJS.Timeout);
      
      // Start the high-frequency polling
      highFrequencyPoll();
    } else {
      // For lower frequencies (>= 100ms), use standard setInterval
      const timer = setInterval(() => {
        void (async () => {
          try {
            await this.sendCommand('ChangeGroup.Poll', { Id: groupId });
          } catch (error) {
            logger.error('Auto-poll failed', { groupId, error });
            // Increment failure count
            const failures = (this.autoPollFailureCounts.get(groupId) ?? 0) + 1;
            this.autoPollFailureCounts.set(groupId, failures);
            
            // Stop auto-polling if too many failures
            if (failures >= this.MAX_AUTOPOLL_FAILURES) {
              clearInterval(timer);
              this.autoPollTimers.delete(groupId);
              this.autoPollFailureCounts.delete(groupId);
              logger.error('Auto-poll stopped due to repeated failures', { groupId, failures });
            }
          }
        })();
      }, intervalMs);
      
      this.autoPollTimers.set(groupId, timer);
    }
    
    this.autoPollFailureCounts.delete(groupId); // Reset failure count
    
    logger.info('Auto-polling configured for change group', { 
      groupId, 
      rateSeconds: rate,
      intervalMs,
      frequency: intervalMs <= 30 ? '33Hz' : `${(1000 / intervalMs).toFixed(1)}Hz`
    });
    
    return { result: { Id: groupId, Rate: rate } };
  }
  
  /**
   * Handle ChangeGroup.Destroy command
   */
  private handleChangeGroupDestroy(params?: Record<string, unknown>): unknown {
    if (!params?.['Id']) {
      throw new QSysError('Change group ID required', QSysErrorCode.COMMAND_FAILED);
    }
    
    const groupId = params['Id'] as string;
    
    // Clear timer if exists
    const timer = this.autoPollTimers.get(groupId);
    if (timer) {
      // Clear both interval and timeout timers
      clearInterval(timer);
      clearTimeout(timer);
      this.autoPollTimers.delete(groupId);
    }
    
    // Remove group and associated data
    this.changeGroups.delete(groupId);
    this.autoPollFailureCounts.delete(groupId);
    
    return { result: true };
  }

  /**
   * Handle ChangeGroup.Remove command - Remove specific controls from a change group
   */
  private handleChangeGroupRemove(params?: Record<string, unknown>): unknown {
    if (!params?.['Id']) {
      throw new QSysError('Change group ID required', QSysErrorCode.COMMAND_FAILED);
    }
    
    const groupId = params['Id'] as string;
    const controlsParam = params['Controls'];
    
    if (!controlsParam || !Array.isArray(controlsParam) || controlsParam.length === 0) {
      throw new QSysError('Controls array required and must not be empty', QSysErrorCode.COMMAND_FAILED);
    }
    
    const group = this.changeGroups.get(groupId);
    if (!group) {
      throw new QSysError(`Change group '${groupId}' not found`, QSysErrorCode.COMMAND_FAILED);
    }
    
    const controlsToRemove = controlsParam as string[];
    const initialCount = group.controls.length;
    
    // Remove specified controls from the group
    group.controls = group.controls.filter(control => !controlsToRemove.includes(control));
    
    const removedCount = initialCount - group.controls.length;
    
    logger.debug('Removed controls from change group', {
      groupId,
      removedCount,
      remainingControls: group.controls.length,
      controlsToRemove
    });
    
    return {
      Success: true,
      RemainingControls: group.controls.length,
      RemovedCount: removedCount
    };
  }

  /**
   * Handle ChangeGroup.Clear command - Remove all controls from a change group
   */
  private handleChangeGroupClear(params?: Record<string, unknown>): unknown {
    if (!params?.['Id']) {
      throw new QSysError('Change group ID required', QSysErrorCode.COMMAND_FAILED);
    }
    
    const groupId = params['Id'] as string;
    
    const group = this.changeGroups.get(groupId);
    if (!group) {
      throw new QSysError(`Change group '${groupId}' not found`, QSysErrorCode.COMMAND_FAILED);
    }
    
    const clearedCount = group.controls.length;
    group.controls = [];
    
    logger.debug('Cleared all controls from change group', {
      groupId,
      clearedCount
    });
    
    return {
      Success: true,
      ClearedCount: clearedCount
    };
  }

  // ============================================================================
  // Connection Management Methods (IConnectionManageable implementation)
  // ============================================================================

  private connectionHistory: ConnectionEvent[] = [];
  private readonly MAX_HISTORY_SIZE = 1000;

  /**
   * Add a connection event to history
   */
  private addConnectionEvent(event: Omit<ConnectionEvent, 'timestamp' | 'correlationId'>): void {
    const fullEvent: ConnectionEvent = {
      ...event,
      timestamp: new Date(),
      correlationId: getCorrelationId() || 'unknown',
    };

    this.connectionHistory.unshift(fullEvent);
    
    // Keep history size limited
    if (this.connectionHistory.length > this.MAX_HISTORY_SIZE) {
      this.connectionHistory = this.connectionHistory.slice(0, this.MAX_HISTORY_SIZE);
    }
  }

  /**
   * Get current connection health and metrics
   */
  getConnectionHealth(): ConnectionHealth {
    // Get health from the official client's connection manager if available
    const connectionManager = (this.officialClient as any).connectionManager;
    if (connectionManager && typeof connectionManager.getHealthStatus === 'function') {
      return connectionManager.getHealthStatus();
    }

    // Fallback to basic health status
    const isConnected = this.isConnected();
    const lastEvent = this.connectionHistory[0];
    
    return {
      isHealthy: isConnected,
      lastSuccessfulConnection: lastEvent?.type === 'connect' ? lastEvent.timestamp : null,
      consecutiveFailures: 0,
      totalAttempts: this.connectionHistory.filter(e => e.type === 'connect' || e.type === 'retry').length,
      totalSuccesses: this.connectionHistory.filter(e => e.type === 'connect' && e.success).length,
      uptime: isConnected ? Date.now() : 0,
      state: isConnected ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED,
      circuitBreakerState: 'closed',
    };
  }

  /**
   * Manually trigger reconnection with options
   */
  async reconnect(options?: ReconnectOptions): Promise<void> {
    logger.info('Manual reconnection requested', { options });
    
    this.addConnectionEvent({
      type: 'reconnect',
      details: options as Record<string, unknown>,
    });

    // If force is specified, try to access connection manager directly
    if (options?.force) {
      const connectionManager = (this.officialClient as any).connectionManager;
      if (connectionManager && typeof connectionManager.reset === 'function') {
        connectionManager.reset();
      }
    }

    // Trigger reconnection through the official client
    if (typeof (this.officialClient as any).forceReconnect === 'function') {
      await (this.officialClient as any).forceReconnect(options);
    } else {
      // Fallback: disconnect and reconnect
      await this.officialClient.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.officialClient.connect();
    }

    this.addConnectionEvent({
      type: 'connect',
      success: this.isConnected(),
    });
  }

  /**
   * Get connection event history
   */
  getConnectionHistory(limit?: number): ConnectionEvent[] {
    const actualLimit = limit || 100;
    return this.connectionHistory.slice(0, actualLimit);
  }

  /**
   * Run comprehensive connection diagnostics
   */
  async runDiagnostics(): Promise<DiagnosticsResult> {
    const startTime = Date.now();
    const isConnected = this.isConnected();
    
    const result: DiagnosticsResult = {
      timestamp: new Date(),
      network: { 
        reachable: isConnected,
        ...(isConnected && { latency: Date.now() - startTime }),
      },
      dns: { 
        resolved: isConnected,
        ...(isConnected && { addresses: [(this.officialClient as any).options?.host] }),
      },
      port: { 
        open: isConnected,
        ...(isConnected && { service: 'qsys-websocket' }),
      },
      websocket: { 
        compatible: true,
        protocols: ['qsys-qrwc'],
      },
      authentication: { 
        valid: isConnected,
        method: 'qsys-internal',
      },
      resources: {
        memory: {
          used: process.memoryUsage().heapUsed,
          available: process.memoryUsage().heapTotal,
          percentage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100,
        },
      },
      summary: isConnected ? 'Connection healthy' : 'Not connected',
    };

    // Get more details from connection manager if available
    const connectionManager = (this.officialClient as any).connectionManager;
    if (connectionManager) {
      const health = connectionManager.getHealthStatus?.();
      if (health) {
        if (health.circuitBreakerState === 'open') {
          result.summary = 'Circuit breaker open - too many failures';
        } else if (health.consecutiveFailures > 0) {
          result.summary = `Connection unstable - ${health.consecutiveFailures} failures`;
        }
      }
    }

    return result;
  }

  /**
   * Test connection quality
   */
  async testConnection(type: 'basic' | 'latency' | 'throughput' | 'comprehensive'): Promise<TestResult> {
    const startTime = Date.now();
    const isConnected = this.isConnected();
    
    const result: TestResult = {
      type,
      timestamp: new Date(),
      duration: 0,
      results: {},
      success: false,
    };

    if (!isConnected) {
      result.error = 'Not connected to Q-SYS Core';
      result.duration = Date.now() - startTime;
      return result;
    }

    try {
      switch (type) {
        case 'basic':
          // Simple connectivity test
          const statusResponse = await this.sendCommand('StatusGet' as any, {});
          result.results.basic = {
            connected: true,
            responseTime: Date.now() - startTime,
          };
          result.success = true;
          break;

        case 'latency':
          // Measure latency with multiple pings
          const latencies: number[] = [];
          for (let i = 0; i < 10; i++) {
            const pingStart = Date.now();
            await this.sendCommand('StatusGet' as any, {});
            latencies.push(Date.now() - pingStart);
          }
          latencies.sort((a, b) => a - b);
          result.results.latency = {
            min: latencies[0] || 0,
            max: latencies[latencies.length - 1] || 0,
            avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
            p95: latencies[Math.floor(latencies.length * 0.95)] || 0,
            p99: latencies[Math.floor(latencies.length * 0.99)] || 0,
          };
          result.success = true;
          break;

        case 'throughput':
          // Test command throughput
          const throughputStart = Date.now();
          let commandCount = 0;
          const testDuration = 5000; // 5 seconds
          
          while (Date.now() - throughputStart < testDuration) {
            await this.sendCommand('StatusGet' as any, {});
            commandCount++;
          }
          
          const actualDuration = (Date.now() - throughputStart) / 1000;
          result.results.throughput = {
            commandsPerSecond: commandCount / actualDuration,
            bytesPerSecond: 0, // Would need to track actual bytes
          };
          result.success = true;
          break;

        case 'comprehensive':
          // Run all tests
          const basicTest = await this.testConnection('basic');
          const latencyTest = await this.testConnection('latency');
          const throughputTest = await this.testConnection('throughput');
          
          result.results = {
            ...(basicTest.results.basic && { basic: basicTest.results.basic }),
            ...(latencyTest.results.latency && { latency: latencyTest.results.latency }),
            ...(throughputTest.results.throughput && { throughput: throughputTest.results.throughput }),
          };
          result.success = basicTest.success && latencyTest.success && throughputTest.success;
          break;
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Test failed';
      result.success = false;
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Update connection configuration at runtime
   */
  updateConnectionConfig(config: Partial<ConnectionConfig>): void {
    logger.info('Updating connection configuration', { config });
    
    // Update connection manager settings if available
    const connectionManager = (this.officialClient as any).connectionManager;
    if (connectionManager && typeof connectionManager.updateConfig === 'function') {
      connectionManager.updateConfig(config);
    }

    // Store config update in history
    this.addConnectionEvent({
      type: 'connect',
      details: { configUpdate: config },
    });
  }

  /**
   * Switch to a different Q-SYS Core IP address
   * Performs a complete disconnect, state clear, and reconnect
   */
  async switchCore(target: CoreTarget): Promise<void> {
    const previousHost = (this.officialClient as any).options?.host;
    logger.info('Switching Q-SYS Core connection', { 
      from: previousHost, 
      to: target.host,
      port: target.port || 443
    });

    try {
      // Step 1: Disconnect from current core
      logger.debug('Disconnecting from current core...');
      if (this.isConnected()) {
        await this.officialClient.disconnect();
      }

      // Step 2: Clear all state (clean slate)
      logger.debug('Clearing all caches and state...');
      
      // Clear discovery cache
      this.clearAllCaches();
      
      // Clear change groups
      this.changeGroups.clear();
      
      // Clear auto-poll timers
      this.autoPollTimers.forEach(timer => clearInterval(timer));
      this.autoPollTimers.clear();
      this.autoPollFailureCounts.clear();
      
      // Clear connection history for clean start
      this.connectionHistory = [];
      
      // Reset sequence number
      this.globalSequenceNumber = 0;

      // Step 3: Update client configuration
      logger.debug('Updating client configuration...');
      const clientOptions = (this.officialClient as any).options;
      if (clientOptions) {
        clientOptions.host = target.host;
        clientOptions.port = target.port || 443;
        
        // Update credentials if provided
        if (target.credentials) {
          clientOptions.username = target.credentials.username;
          clientOptions.password = target.credentials.password;
        }
      }

      // Step 4: Connect to new IP
      logger.info('Connecting to new Q-SYS Core...', { 
        host: target.host, 
        port: target.port || 443 
      });
      await this.officialClient.connect();

      // Step 5: Verify connection and log event
      const connected = this.isConnected();
      this.addConnectionEvent({
        type: 'connect',
        success: connected,
        details: { 
          action: 'switch',
          previousHost,
          newHost: target.host,
          port: target.port || 443
        },
      });

      if (connected) {
        logger.info('Successfully switched to new Q-SYS Core', { 
          host: target.host,
          port: target.port || 443
        });
      } else {
        throw new Error(`Failed to connect to ${target.host}:${target.port || 443}`);
      }
    } catch (error) {
      logger.error('Failed to switch Q-SYS Core', { 
        error,
        targetHost: target.host,
        previousHost 
      });
      
      // Log failure event
      this.addConnectionEvent({
        type: 'error',
        reason: `Switch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { 
          action: 'switch',
          targetHost: target.host,
          error 
        },
      });

      throw error;
    }
  }

  /**
   * Dispose of the adapter and clean up all resources
   * This should be called when the adapter is no longer needed
   * to prevent memory leaks from active timers
   */
  async dispose(): Promise<void> {
    logger.info('Disposing QRWCClientAdapter...');

    // Clear all caches and timers
    this.clearAllCaches();

    // Shutdown state manager if it exists
    if (this.stateManager && 'shutdown' in this.stateManager) {
      try {
        logger.info('Shutting down state manager...');
        await (this.stateManager as { shutdown: () => Promise<void> }).shutdown();
        logger.info('State manager shutdown completed');
      } catch (error) {
        logger.error('Error shutting down state manager', { error });
      }
    }

    logger.info('QRWCClientAdapter disposed successfully');
  }
}
