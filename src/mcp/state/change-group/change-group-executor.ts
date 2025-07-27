import { globalLogger as logger } from '../../../shared/utils/logger.js';
import type { ChangeGroup, ControlState } from '../repository.js';
import type { QRWCClientInterface } from '../../qrwc/adapter.js';
import type {
  ControlChangeResult,
  ChangeGroupExecutionOptions,
} from './types.js';
import { ChangeGroupEvent } from './types.js';
import { Semaphore } from './concurrency-utils.js';
import type { EventEmitter } from 'events';
import { ValidationError } from '../../../shared/types/errors.js';

/**
 * Change Group Executor
 *
 * Handles the execution logic for change groups
 */
export class ChangeGroupExecutor {
  constructor(
    private qrwcClient: QRWCClientInterface,
    private eventEmitter: EventEmitter
  ) {}

  /**
   * Validate change group before execution
   */
  validateChangeGroup(changeGroup: ChangeGroup): void {
    const errors = [];
    
    if (!changeGroup.id) {
      errors.push({
        field: 'id',
        message: 'Change group ID is required',
        code: 'REQUIRED_FIELD',
      });
    }

    if (!changeGroup.controls || changeGroup.controls.length === 0) {
      errors.push({
        field: 'controls',
        message: 'Change group must contain at least one control',
        code: 'REQUIRED_FIELD',
      });
    }
    
    if (errors.length > 0) {
      throw new ValidationError('Invalid change group', errors);
    }

    // Validate each control
    for (const control of changeGroup.controls) {
      if (!control.name) {
        throw new ValidationError('Control name is required',
          [{ field: 'name', message: 'Control name is required', code: 'REQUIRED_FIELD' }]);
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime validation
      if (control.value === undefined || control.value === null) {
        throw new ValidationError(`Control ${control.name} value is required`,
          [{ field: control.name, message: 'Value is required', code: 'REQUIRED_FIELD' }]);
      }
    }

    logger.debug('Change group validated', {
      changeGroupId: changeGroup.id,
      controlCount: changeGroup.controls.length,
    });
  }

  /**
   * Execute control changes with concurrency control
   */
  async executeControls(
    changeGroup: ChangeGroup,
    options: ChangeGroupExecutionOptions
  ): Promise<ControlChangeResult[]> {
    const semaphore = new Semaphore(options.maxConcurrentChanges);
    const results: ControlChangeResult[] = [];
    const promises: Array<Promise<ControlChangeResult>> = [];

    // Early return if no controls
    if (!changeGroup.controls || changeGroup.controls.length === 0) {
      return results;
    }
    
    for (const control of changeGroup.controls) {
      const promise = (async (): Promise<ControlChangeResult> => {
        await semaphore.acquire();

        try {
          const controlForExecution: {
            name: string;
            value: ControlState['value'];
            ramp?: number;
          } = {
            name: control.name,
            value: control.value,
          };
          if (control.ramp !== undefined) {
            controlForExecution.ramp = control.ramp;
          }

          const result = await this.executeIndividualControl(
            controlForExecution,
            changeGroup.id
          );

          if (!result.success && !options.continueOnError) {
            throw new ValidationError(`Control ${control.name} failed: ${result.error}`,
              [{ field: control.name, message: result.error ?? 'Validation failed', code: 'VALIDATION_ERROR' }]);
          }

          return result;
        } finally {
          semaphore.release();
        }
      })();

      promises.push(promise);
    }

    // Wait for all executions
    if (options.continueOnError) {
      const settled = await Promise.allSettled(promises);
      for (let i = 0; i < settled.length; i++) {
        const result = settled[i];
        const control = changeGroup.controls[i];
        
        if (!result || !control) {
          continue; // Skip if either is undefined
        }
        
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // For rejected promises, create a failed result
          const error = result.reason as unknown;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          // Extract the actual error message if it's a ValidationError
          const actualError = this.extractValidationError(error, errorMessage);
          
          results.push({
            controlName: control.name,
            targetValue: control.value,
            success: false,
            error: actualError,
            executionTimeMs: 0, // We don't have the exact time for failed operations
          });
        }
      }
    } else {
      // For fail-fast mode, we need to collect results as they complete
      // even if one fails
      const settled = await Promise.allSettled(promises);
      let firstError: unknown = null;
      
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          firstError ??= result.reason;
        }
      }
      
      // Throw the first error after collecting all results
      if (firstError) {
        // Attach results to the error so they can be retrieved
        (firstError as Error & { __results?: ControlChangeResult[] }).__results = results;
        throw firstError;
      }
    }

    return results;
  }

  /**
   * Extract actual error message from ValidationError
   */
  private extractValidationError(error: unknown, defaultMessage: string): string {
    if (!(error instanceof ValidationError) || !error.message.includes('failed:')) {
      return defaultMessage;
    }
    
    const match = /Control \S+ failed: (.+)/.exec(error.message);
    return match?.[1] ?? defaultMessage;
  }

  /**
   * Execute a single control change
   */
  private async executeIndividualControl(
    control: { name: string; value: ControlState['value']; ramp?: number },
    changeGroupId: string
  ): Promise<ControlChangeResult> {
    const startTime = Date.now();

    try {
      logger.debug('Executing control change', {
        controlName: control.name,
        targetValue: control.value,
        ramp: control.ramp,
      });

      // Get current value before change
      let previousValue: ControlState['value'] | undefined;
      try {
        const currentState = (await this.qrwcClient.sendCommand(
          'Control.GetValues',
          {
            Names: [control.name],
          }
        )) as {
          controls?: Array<{ Value: unknown }>;
        };

        if (currentState?.controls?.[0]?.Value !== undefined) {
          const value = currentState.controls[0].Value;
          // Validate that the value is of the expected type
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            previousValue = value;
          }
        }
      } catch (error) {
        logger.warn('Failed to get previous value', {
          controlName: control.name,
          error,
        });
      }

      // Execute the change
      const command =
        control.ramp !== undefined ? 'Control.SetRamp' : 'Control.SetValues';

      const params =
        control.ramp !== undefined
          ? {
              Name: control.name,
              Value: control.value,
              Ramp: control.ramp,
            }
          : {
              Controls: [
                {
                  Name: control.name,
                  Value: control.value,
                },
              ],
            };

      await this.qrwcClient.sendCommand(command, params);

      const result: ControlChangeResult = {
        controlName: control.name,
        targetValue: control.value,
        success: true,
        executionTimeMs: Date.now() - startTime,
      };

      if (previousValue !== undefined) {
        result.previousValue = previousValue;
      }

      if (control.ramp !== undefined) {
        result.rampTime = control.ramp;
      }

      logger.debug('Control change successful', {
        controlName: control.name,
        executionTimeMs: result.executionTimeMs,
      });

      this.eventEmitter.emit(ChangeGroupEvent.ControlChanged, {
        changeGroupId,
        result,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      const result: ControlChangeResult = {
        controlName: control.name,
        targetValue: control.value,
        success: false,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
      };

      logger.error('Control change failed', {
        controlName: control.name,
        error: errorMessage,
      });

      this.eventEmitter.emit(ChangeGroupEvent.ControlFailed, {
        changeGroupId,
        result,
      });

      return result;
    }
  }
}
