import { globalLogger as logger } from '../../../shared/utils/logger.js';
import type { QRWCClientInterface } from '../../qrwc/adapter.js';
import type { ControlChangeResult } from './types.js';
import { ChangeGroupEvent } from './types.js';
import type { EventEmitter } from 'events';

/**
 * Rollback Handler for Change Groups
 *
 * Handles rollback operations when change group execution fails
 */
export class RollbackHandler {
  constructor(
    private qrwcClient: QRWCClientInterface,
    private eventEmitter: EventEmitter
  ) {}

  /**
   * Rollback successful changes on failure
   */
  async rollbackChangeGroup(
    changeGroupId: string,
    successfulChanges: ControlChangeResult[]
  ): Promise<void> {
    if (successfulChanges.length === 0) {
      logger.debug('No changes to rollback');
      return;
    }

    logger.warn('Rolling back change group', {
      changeGroupId,
      changesToRollback: successfulChanges.length,
    });

    this.eventEmitter.emit(ChangeGroupEvent.RollbackStarted, {
      changeGroupId,
      controlCount: successfulChanges.length,
    });

    const rollbackResults: ControlChangeResult[] = [];

    for (const change of successfulChanges) {
      if (change.previousValue === undefined) {
        logger.warn('Cannot rollback - no previous value', {
          controlName: change.controlName,
        });
        continue;
      }

      try {
        await this.qrwcClient.sendCommand('Control.SetValues', {
          Controls: [
            {
              Name: change.controlName,
              Value: change.previousValue,
            },
          ],
        });

        rollbackResults.push({
          controlName: change.controlName,
          targetValue: change.previousValue,
          success: true,
        });

        logger.debug('Control rolled back', {
          controlName: change.controlName,
          value: change.previousValue,
        });
      } catch (error) {
        logger.error('Failed to rollback control', {
          controlName: change.controlName,
          error,
        });

        rollbackResults.push({
          controlName: change.controlName,
          targetValue: change.previousValue,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.eventEmitter.emit(ChangeGroupEvent.RollbackCompleted, {
      changeGroupId,
      results: rollbackResults,
    });
  }
}
