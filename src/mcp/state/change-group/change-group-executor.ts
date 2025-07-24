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
  async validateChangeGroup(changeGroup: ChangeGroup): Promise<void> {
    if (!changeGroup.id) {
      throw new Error('Change group ID is required');
    }

    if (!changeGroup.controls || changeGroup.controls.length === 0) {
      throw new Error('Change group must contain at least one control');
    }

    // Validate each control
    for (const control of changeGroup.controls) {
      if (!control.name) {
        throw new Error(`Control name is required`);
      }

      if (control.value === undefined || control.value === null) {
        throw new Error(`Control ${control.name} value is required`);
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
    const promises: Array<Promise<void>> = [];

    for (const control of changeGroup.controls) {
      const promise = (async () => {
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

          results.push(result);

          if (!result.success && !options.continueOnError) {
            throw new Error(`Control ${control.name} failed: ${result.error}`);
          }
        } finally {
          semaphore.release();
        }
      })();

      promises.push(promise);
    }

    // Wait for all executions or stop on first error
    if (options.continueOnError) {
      await Promise.allSettled(promises);
    } else {
      await Promise.all(promises);
    }

    return results;
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
