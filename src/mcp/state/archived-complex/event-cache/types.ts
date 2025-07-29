/**
 * Type definitions for Event Cache module
 */

import { isControlValue, type ControlValue } from './event-types.js';

/**
 * Change event from a Q-SYS control
 */
export interface ControlChange {
  Name: string;
  Value: ControlValue;
  String?: string;
}

/**
 * Change group event emitted by the adapter
 */
export interface ChangeGroupEvent {
  groupId: string;
  changes: ControlChange[];
  timestamp: bigint;
  timestampMs: number;
  sequenceNumber: number;
}

/**
 * Type guard for ControlChange
 */
export function isControlChange(obj: unknown): obj is ControlChange {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'Name' in obj &&
    typeof (obj as ControlChange).Name === 'string' &&
    'Value' in obj &&
    isControlValue((obj as ControlChange).Value)
  );
}

/**
 * Type guard for ChangeGroupEvent
 */
export function isChangeGroupEvent(obj: unknown): obj is ChangeGroupEvent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'groupId' in obj &&
    typeof (obj as ChangeGroupEvent).groupId === 'string' &&
    'changes' in obj &&
    Array.isArray((obj as ChangeGroupEvent).changes) &&
    'timestamp' in obj &&
    'timestampMs' in obj &&
    typeof (obj as ChangeGroupEvent).timestampMs === 'number' &&
    'sequenceNumber' in obj &&
    typeof (obj as ChangeGroupEvent).sequenceNumber === 'number'
  );
}

/**
 * Type guard for array of ControlChanges
 */
export function isControlChangeArray(arr: unknown): arr is ControlChange[] {
  return Array.isArray(arr) && arr.every(isControlChange);
}

/**
 * Spilled event file structure
 */
export interface SpilledEventFile {
  groupId: string;
  startTime: number;
  endTime: number;
  events: Array<{
    groupId: string;
    controlName: string;
    timestamp: string | number | bigint;
    timestampMs: number;
    value: unknown;
    string: string;
    previousValue?: unknown;
    previousString?: string;
    delta?: number;
    duration?: number;
    sequenceNumber: number;
    eventType?: string;
    threshold?: number;
  }>;
}

/**
 * Type guard for spilled event file
 */
export function isSpilledEventFile(obj: unknown): obj is SpilledEventFile {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'groupId' in obj &&
    'startTime' in obj &&
    'endTime' in obj &&
    'events' in obj &&
    Array.isArray((obj as SpilledEventFile).events)
  );
}
