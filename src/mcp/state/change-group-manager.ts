import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { globalLogger as logger } from "../../shared/utils/logger.js";
import type { ChangeGroup, ControlState } from "./repository.js";
import { StateRepositoryEvent, StateUtils } from "./repository.js";
import type { QRWCClient } from "../qrwc/client.js";

/**
 * Change group execution result
 */
export interface ChangeGroupExecutionResult {
  changeGroupId: string;
  totalControls: number;
  successCount: number;
  failureCount: number;
  executionTimeMs: number;
  results: ControlChangeResult[];
  rollbackPerformed: boolean;
}

/**
 * Individual control change result
 */
export interface ControlChangeResult {
  controlName: string;
  targetValue: ControlState['value'];
  success: boolean;
  error?: string;
  executionTimeMs?: number;
  previousValue?: ControlState['value'];
  rampTime?: number;
}

/**
 * Change group execution options
 */
export interface ChangeGroupExecutionOptions {
  rollbackOnFailure: boolean;
  continueOnError: boolean;
  maxConcurrentChanges: number;
  timeoutMs: number;
  validateBeforeExecution: boolean;
}

/**
 * Change group events
 */
export enum ChangeGroupEvent {
  Started = 'started',
  ControlChanged = 'controlChanged',
  ControlFailed = 'controlFailed',
  Completed = 'completed',
  RollbackStarted = 'rollbackStarted',
  RollbackCompleted = 'rollbackCompleted',
  Error = 'error'
}

/**
 * Sophisticated Change Group Manager
 * 
 * Provides transaction-like semantics for batch Q-SYS control updates:
 * - Atomic batch operations with rollback capabilities
 * - Concurrent execution with configurable limits
 * - Comprehensive error handling and recovery
 * - Progress tracking and detailed result reporting
 * - Integration with state cache for optimal performance
 */
export class ChangeGroupManager extends EventEmitter {
  private readonly activeChangeGroups = new Map<string, ChangeGroup>();
  private readonly executionHistory = new Map<string, ChangeGroupExecutionResult>();
  
  // Configuration
  private readonly defaultOptions: ChangeGroupExecutionOptions = {
    rollbackOnFailure: true,
    continueOnError: false,
    maxConcurrentChanges: 10,
    timeoutMs: 30000,
    validateBeforeExecution: true
  };

  constructor(
    private readonly qrwcClient: QRWCClient
  ) {
    super();
    logger.debug('ChangeGroupManager created');
  }

  /**
   * Execute a change group with transaction-like semantics
   */
  async executeChangeGroup(
    changeGroup: ChangeGroup,
    options: Partial<ChangeGroupExecutionOptions> = {}
  ): Promise<ChangeGroupExecutionResult> {
    const execOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    
    logger.info('Executing change group', {
      changeGroupId: changeGroup.id,
      controlCount: changeGroup.controls.length,
      options: execOptions
    });

    // Track active change group
    this.activeChangeGroups.set(changeGroup.id, changeGroup);
    
    this.emit(ChangeGroupEvent.Started, {
      changeGroup,
      options: execOptions
    });

    const result: ChangeGroupExecutionResult = {
      changeGroupId: changeGroup.id,
      totalControls: changeGroup.controls.length,
      successCount: 0,
      failureCount: 0,
      executionTimeMs: 0,
      results: [],
      rollbackPerformed: false
    };

    try {
      // Validation phase
      if (execOptions.validateBeforeExecution) {
        await this.validateChangeGroup(changeGroup);
      }

      // Execution phase
      const controlResults = await this.executeControls(
        changeGroup,
        execOptions
      );
      
      result.results = controlResults;
      result.successCount = controlResults.filter(r => r.success).length;
      result.failureCount = controlResults.filter(r => !r.success).length;

      // Check if rollback is needed
      const hasFailures = result.failureCount > 0;
      const shouldRollback = hasFailures && execOptions.rollbackOnFailure;

      if (shouldRollback) {
        logger.warn('Rolling back change group due to failures', {
          changeGroupId: changeGroup.id,
          failureCount: result.failureCount
        });

        await this.rollbackChangeGroup(changeGroup, result);
        result.rollbackPerformed = true;
      }

      result.executionTimeMs = Date.now() - startTime;

      // Update change group status
      const finalStatus = hasFailures ? 'failed' : 'completed';
      changeGroup.status = finalStatus;

      this.emit(ChangeGroupEvent.Completed, {
        changeGroup,
        result,
        success: !hasFailures
      });

      logger.info('Change group execution completed', {
        changeGroupId: changeGroup.id,
        totalControls: result.totalControls,
        successCount: result.successCount,
        failureCount: result.failureCount,
        executionTimeMs: result.executionTimeMs,
        rollbackPerformed: result.rollbackPerformed
      });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result.executionTimeMs = Date.now() - startTime;
      result.failureCount = changeGroup.controls.length;
      
      changeGroup.status = 'failed';

      this.emit(ChangeGroupEvent.Error, {
        changeGroup,
        error: err,
        result
      });

      logger.error('Change group execution failed', {
        changeGroupId: changeGroup.id,
        error: err.message
      });

      throw err;
    } finally {
      // Clean up
      this.activeChangeGroups.delete(changeGroup.id);
      this.executionHistory.set(changeGroup.id, result);
    }

    return result;
  }

  /**
   * Get execution result for a change group
   */
  getExecutionResult(changeGroupId: string): ChangeGroupExecutionResult | null {
    return this.executionHistory.get(changeGroupId) || null;
  }

  /**
   * Get all active change groups
   */
  getActiveChangeGroups(): ChangeGroup[] {
    return Array.from(this.activeChangeGroups.values());
  }

  /**
   * Cancel an active change group
   */
  async cancelChangeGroup(changeGroupId: string): Promise<boolean> {
    const changeGroup = this.activeChangeGroups.get(changeGroupId);
    if (!changeGroup) return false;

    // For simplicity, mark as failed - in production, this would interrupt ongoing operations
    changeGroup.status = 'failed';
    this.activeChangeGroups.delete(changeGroupId);

    logger.info('Change group cancelled', { changeGroupId });
    return true;
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    const historySize = this.executionHistory.size;
    this.executionHistory.clear();
    logger.debug('Execution history cleared', { entriesRemoved: historySize });
  }

  /**
   * Get statistics about change group executions
   */
  getStatistics() {
    const results = Array.from(this.executionHistory.values());
    
    return {
      totalExecutions: results.length,
      successfulExecutions: results.filter(r => r.failureCount === 0).length,
      failedExecutions: results.filter(r => r.failureCount > 0).length,
      totalControlsProcessed: results.reduce((sum, r) => sum + r.totalControls, 0),
      totalRollbacks: results.filter(r => r.rollbackPerformed).length,
      averageExecutionTimeMs: results.length > 0 
        ? results.reduce((sum, r) => sum + r.executionTimeMs, 0) / results.length 
        : 0,
      activeChangeGroups: this.activeChangeGroups.size
    };
  }

  // Private methods

  /**
   * Validate change group before execution
   */
  private async validateChangeGroup(changeGroup: ChangeGroup): Promise<void> {
    // Check QRWC connection
    if (!this.qrwcClient.isConnected()) {
      throw new Error('Q-SYS Core not connected');
    }

    // Validate control names and values
    for (const control of changeGroup.controls) {
      if (!control.name || control.name.trim() === '') {
        throw new Error(`Invalid control name: '${control.name}'`);
      }

      if (control.value === null || control.value === undefined) {
        throw new Error(`Invalid value for control '${control.name}': ${control.value}`);
      }

      if (control.ramp !== undefined && (control.ramp <= 0 || control.ramp > 300)) {
        throw new Error(`Invalid ramp time for control '${control.name}': ${control.ramp}`);
      }
    }

    logger.debug('Change group validation completed', {
      changeGroupId: changeGroup.id,
      controlCount: changeGroup.controls.length
    });
  }

  /**
   * Execute all controls in the change group
   */
  private async executeControls(
    changeGroup: ChangeGroup,
    options: ChangeGroupExecutionOptions
  ): Promise<ControlChangeResult[]> {
    const results: ControlChangeResult[] = [];
    const semaphore = new Semaphore(options.maxConcurrentChanges);

    // Execute controls with concurrency limiting
    const promises = changeGroup.controls.map(control => 
      semaphore.acquire().then(async (release) => {
        try {
          const result = await this.executeIndividualControl(control, options.timeoutMs);
          results.push(result);

          if (result.success) {
            this.emit(ChangeGroupEvent.ControlChanged, {
              changeGroup,
              controlResult: result
            });
          } else {
            this.emit(ChangeGroupEvent.ControlFailed, {
              changeGroup,
              controlResult: result
            });

            // Stop on first error if not continuing on error
            if (!options.continueOnError) {
              throw new Error(`Control change failed: ${result.error}`);
            }
          }

          return result;
        } finally {
          release();
        }
      })
    );

    // Wait for all or fail fast
    if (options.continueOnError) {
      await Promise.allSettled(promises);
    } else {
      await Promise.all(promises);
    }

    // Sort results to match original order
    results.sort((a, b) => {
      const aIndex = changeGroup.controls.findIndex(c => c.name === a.controlName);
      const bIndex = changeGroup.controls.findIndex(c => c.name === b.controlName);
      return aIndex - bIndex;
    });

    return results;
  }

  /**
   * Execute a single control change
   */
  private async executeIndividualControl(
    control: ChangeGroup['controls'][0],
    timeoutMs: number
  ): Promise<ControlChangeResult> {
    const startTime = Date.now();
    
    try {
      // Get current value for potential rollback
      const currentValueResponse = await Promise.race([
        this.qrwcClient.sendCommand("Control.GetValue", { Name: control.name }),
        this.createTimeoutPromise(timeoutMs)
      ]) as any;

      const previousValue = currentValueResponse?.Value;

      // Set new value
      const commandParams: any = {
        Name: control.name,
        Value: control.value
      };

      if (control.ramp !== undefined) {
        commandParams.Ramp = control.ramp;
      }

      await Promise.race([
        this.qrwcClient.sendCommand("Control.SetValue", commandParams),
        this.createTimeoutPromise(timeoutMs)
      ]);

      const executionTimeMs = Date.now() - startTime;

      logger.debug('Control change successful', {
        controlName: control.name,
        value: control.value,
        previousValue,
        executionTimeMs
      });

      const result: ControlChangeResult = {
        controlName: control.name,
        targetValue: control.value,
        success: true,
        executionTimeMs,
        previousValue
      };

      if (control.ramp !== undefined) {
        result.rampTime = control.ramp;
      }

      return result;

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Control change failed', {
        controlName: control.name,
        value: control.value,
        error: errorMessage,
        executionTimeMs
      });

      const result: ControlChangeResult = {
        controlName: control.name,
        targetValue: control.value,
        success: false,
        error: errorMessage,
        executionTimeMs
      };

      if (control.ramp !== undefined) {
        result.rampTime = control.ramp;
      }

      return result;
    }
  }

  /**
   * Rollback a change group by reverting successful changes
   */
  private async rollbackChangeGroup(
    changeGroup: ChangeGroup,
    executionResult: ChangeGroupExecutionResult
  ): Promise<void> {
    this.emit(ChangeGroupEvent.RollbackStarted, {
      changeGroup,
      executionResult
    });

    const successfulChanges = executionResult.results.filter(r => 
      r.success && r.previousValue !== undefined
    );

    logger.info('Starting rollback', {
      changeGroupId: changeGroup.id,
      changesToRollback: successfulChanges.length
    });

    // Rollback successful changes in reverse order
    for (const change of successfulChanges.reverse()) {
      try {
        await this.qrwcClient.sendCommand("Control.SetValue", {
          Name: change.controlName,
          Value: change.previousValue
        });

        logger.debug('Control rolled back', {
          controlName: change.controlName,
          rolledBackTo: change.previousValue
        });

      } catch (error) {
        logger.error('Rollback failed for control', {
          controlName: change.controlName,
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with other rollbacks even if one fails
      }
    }

    this.emit(ChangeGroupEvent.RollbackCompleted, {
      changeGroup,
      rolledBackCount: successfulChanges.length
    });

    logger.info('Rollback completed', {
      changeGroupId: changeGroup.id,
      rolledBackCount: successfulChanges.length
    });
  }

  /**
   * Create a timeout promise for race conditions
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });
  }
}

/**
 * Simple semaphore for limiting concurrency
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve(() => this.release());
      } else {
        this.queue.push(() => {
          this.permits--;
          resolve(() => this.release());
        });
      }
    });
  }

  private release(): void {
    this.permits++;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
} 