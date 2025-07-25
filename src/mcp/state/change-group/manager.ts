import { EventEmitter } from 'events';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import { config as envConfig } from '../../../shared/utils/env.js';
import type { ChangeGroup } from '../repository.js';
import type { QRWCClientInterface } from '../../qrwc/adapter.js';
import type {
  ChangeGroupExecutionResult,
  ControlChangeResult,
  ChangeGroupExecutionOptions,
} from './types.js';
import { ChangeGroupEvent } from './types.js';
import { ChangeGroupExecutor } from './change-group-executor.js';
import { RollbackHandler } from './rollback-handler.js';
import { createTimeoutPromise } from './concurrency-utils.js';

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
  private readonly executionHistory = new Map<
    string,
    ChangeGroupExecutionResult
  >();
  private readonly executor: ChangeGroupExecutor;
  private readonly rollbackHandler: RollbackHandler;

  // Configuration
  private readonly defaultOptions: ChangeGroupExecutionOptions = {
    rollbackOnFailure: true,
    continueOnError: false,
    maxConcurrentChanges: 10,
    timeoutMs: envConfig.timeouts.changeGroupMs,
    validateBeforeExecution: true,
  };

  constructor(private readonly qrwcClient: QRWCClientInterface) {
    super();
    this.executor = new ChangeGroupExecutor(qrwcClient, this);
    this.rollbackHandler = new RollbackHandler(qrwcClient, this);
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
      options: execOptions,
    });

    // Mark as active
    this.activeChangeGroups.set(changeGroup.id, changeGroup);

    // Emit start event
    this.emit(ChangeGroupEvent.Started, {
      changeGroupId: changeGroup.id,
      controlCount: changeGroup.controls.length,
      timestamp: new Date(),
    });

    let results: ControlChangeResult[] = [];
    let rollbackPerformed = false;

    try {
      // Validate if requested
      if (execOptions.validateBeforeExecution) {
        await this.executor.validateChangeGroup(changeGroup);
      }

      // Execute with timeout
      const executionPromise = this.executor.executeControls(
        changeGroup,
        execOptions
      );
      const timeoutPromise = createTimeoutPromise(
        execOptions.timeoutMs,
        `Change group execution timed out after ${execOptions.timeoutMs}ms`
      );

      results = await Promise.race([executionPromise, timeoutPromise]);

      // Check for failures
      const failures = results.filter(r => !r.success);

      if (failures.length > 0 && execOptions.rollbackOnFailure) {
        // Rollback successful changes
        const successfulChanges = results.filter(r => r.success);
        if (successfulChanges.length > 0) {
          await this.rollbackHandler.rollbackChangeGroup(
            changeGroup.id,
            successfulChanges
          );
          rollbackPerformed = true;
        }
      }
    } catch (error) {
      logger.error('Change group execution failed', {
        changeGroupId: changeGroup.id,
        error,
      });

      // Emit error event
      this.emit(ChangeGroupEvent.Error, {
        changeGroupId: changeGroup.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Rollback on error if configured
      if (execOptions.rollbackOnFailure) {
        const successfulChanges = results.filter(r => r.success);
        if (successfulChanges.length > 0) {
          await this.rollbackHandler.rollbackChangeGroup(
            changeGroup.id,
            successfulChanges
          );
          rollbackPerformed = true;
        }
      }

      throw error;
    } finally {
      // Remove from active
      this.activeChangeGroups.delete(changeGroup.id);

      // Create execution result
      const executionResult: ChangeGroupExecutionResult = {
        changeGroupId: changeGroup.id,
        totalControls: changeGroup.controls.length,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length,
        executionTimeMs: Date.now() - startTime,
        results,
        rollbackPerformed,
      };

      // Store in history
      this.executionHistory.set(changeGroup.id, executionResult);

      // Limit history size
      if (this.executionHistory.size > 1000) {
        const oldestKey = this.executionHistory.keys().next().value;
        if (oldestKey) {
          this.executionHistory.delete(oldestKey);
        }
      }

      // Emit completion event
      this.emit(ChangeGroupEvent.Completed, executionResult);

      logger.info('Change group execution completed', {
        changeGroupId: changeGroup.id,
        successCount: executionResult.successCount,
        failureCount: executionResult.failureCount,
        executionTimeMs: executionResult.executionTimeMs,
        rollbackPerformed,
      });

      return executionResult;
    }
  }

  /**
   * Get execution result for a change group
   */
  getExecutionResult(changeGroupId: string): ChangeGroupExecutionResult | null {
    return this.executionHistory.get(changeGroupId) || null;
  }

  /**
   * Get currently executing change groups
   */
  getActiveChangeGroups(): Map<string, ChangeGroup> {
    return new Map(this.activeChangeGroups);
  }

  /**
   * Cancel an active change group (if possible)
   */
  cancelChangeGroup(changeGroupId: string): boolean {
    if (this.activeChangeGroups.has(changeGroupId)) {
      // Note: Actual cancellation would require more sophisticated
      // implementation with cancellation tokens
      logger.warn('Change group cancellation requested', { changeGroupId });
      return false; // Not implemented
    }
    return false;
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory.clear();
    logger.info('Change group execution history cleared');
  }

  /**
   * Get statistics about change group executions
   */
  getStatistics(): {
    totalExecutions: number;
    activeCount: number;
    averageExecutionTime: number;
    successRate: number;
  } {
    const executions = Array.from(this.executionHistory.values());

    const totalExecutions = executions.length;
    const activeCount = this.activeChangeGroups.size;

    const averageExecutionTime =
      totalExecutions > 0
        ? executions.reduce((sum, r) => sum + r.executionTimeMs, 0) /
          totalExecutions
        : 0;

    const totalControls = executions.reduce(
      (sum, r) => sum + r.totalControls,
      0
    );
    const successfulControls = executions.reduce(
      (sum, r) => sum + r.successCount,
      0
    );
    const successRate =
      totalControls > 0 ? successfulControls / totalControls : 0;

    return {
      totalExecutions,
      activeCount,
      averageExecutionTime: Math.round(averageExecutionTime),
      successRate: Math.round(successRate * 100) / 100,
    };
  }
}
