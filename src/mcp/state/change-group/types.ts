import type { ControlState } from '../repository.js';

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
  Error = 'error',
}
