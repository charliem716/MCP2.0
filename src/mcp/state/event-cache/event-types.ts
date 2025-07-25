/**
 * Comprehensive type definitions for Event Cache module
 * This file provides strict typing to eliminate unsafe type usage
 */

import { CacheError, CacheErrorCode } from '../errors.js';

/**
 * Valid control value types in Q-SYS
 */
export type ControlValue = string | number | boolean | null | undefined;

/**
 * Event types supported by the cache
 */
export const EVENT_TYPES = {
  CHANGE: 'change',
  THRESHOLD_CROSSED: 'threshold_crossed',
  STATE_TRANSITION: 'state_transition',
  SIGNIFICANT_CHANGE: 'significant_change',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/**
 * Type guard for EventType
 */
export function isEventType(value: unknown): value is EventType {
  return (
    typeof value === 'string' &&
    Object.values(EVENT_TYPES).includes(value as EventType)
  );
}

/**
 * Type guard for ControlValue
 */
export function isControlValue(value: unknown): value is ControlValue {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Serialized version of CachedEvent for disk storage
 */
export interface SerializedCachedEvent {
  groupId: string;
  controlName: string;
  timestamp: string; // bigint serialized as string
  timestampMs: number;
  value: ControlValue;
  string: string;
  previousValue?: ControlValue;
  previousString?: string;
  delta?: number;
  duration?: number;
  sequenceNumber: number;
  eventType?: EventType;
  threshold?: number;
}

/**
 * Check if object has valid required fields for SerializedCachedEvent
 */
function hasValidRequiredFields(candidate: Record<string, unknown>): boolean {
  return (
    typeof candidate['groupId'] === 'string' &&
    typeof candidate['controlName'] === 'string' &&
    typeof candidate['timestamp'] === 'string' &&
    typeof candidate['timestampMs'] === 'number' &&
    isControlValue(candidate['value']) &&
    typeof candidate['string'] === 'string' &&
    typeof candidate['sequenceNumber'] === 'number'
  );
}

/**
 * Check if object has valid optional fields for SerializedCachedEvent
 */
function hasValidOptionalFields(candidate: Record<string, unknown>): boolean {
  // Check previousValue
  if (
    candidate['previousValue'] !== undefined &&
    !isControlValue(candidate['previousValue'])
  ) {
    return false;
  }

  // Check previousString
  if (
    candidate['previousString'] !== undefined &&
    typeof candidate['previousString'] !== 'string'
  ) {
    return false;
  }

  // Check numeric fields
  const numericFields = ['delta', 'duration', 'threshold'];
  for (const field of numericFields) {
    if (
      candidate[field] !== undefined &&
      typeof candidate[field] !== 'number'
    ) {
      return false;
    }
  }

  // Check eventType
  if (
    candidate['eventType'] !== undefined &&
    !isEventType(candidate['eventType'])
  ) {
    return false;
  }

  return true;
}

/**
 * Type guard for SerializedCachedEvent
 */
export function isSerializedCachedEvent(
  obj: unknown
): obj is SerializedCachedEvent {
  if (typeof obj !== 'object' || obj === null) return false;

  const candidate = obj as Record<string, unknown>;

  return hasValidRequiredFields(candidate) && hasValidOptionalFields(candidate);
}

/**
 * Type-safe adapter event interfaces
 */
export interface TypedQRWCAdapterEvents {
  'changeGroup:changes': (event: ChangeGroupEvent) => void;
  error: (error: Error) => void;
  disconnected: () => void;
  connected: () => void;
}

/**
 * Enhanced ChangeGroupEvent with proper typing
 */
export interface ChangeGroupEvent {
  groupId: string;
  changes: ControlChange[];
  timestamp: bigint;
  timestampMs: number;
  sequenceNumber: number;
}

/**
 * Enhanced ControlChange with proper typing
 */
export interface ControlChange {
  Name: string;
  Value: ControlValue;
  String?: string;
}

/**
 * Type guard for ControlChange with proper value checking
 */
export function isControlChange(obj: unknown): obj is ControlChange {
  if (typeof obj !== 'object' || obj === null) return false;

  const candidate = obj as Record<string, unknown>;

  return (
    typeof candidate['Name'] === 'string' &&
    isControlValue(candidate['Value']) &&
    (candidate['String'] === undefined ||
      typeof candidate['String'] === 'string')
  );
}

/**
 * Type guard for ChangeGroupEvent
 */
export function isChangeGroupEvent(obj: unknown): obj is ChangeGroupEvent {
  if (typeof obj !== 'object' || obj === null) return false;

  const candidate = obj as Record<string, unknown>;

  return (
    typeof candidate['groupId'] === 'string' &&
    Array.isArray(candidate['changes']) &&
    (candidate['changes'] as unknown[]).every(isControlChange) &&
    typeof candidate['timestamp'] === 'bigint' &&
    typeof candidate['timestampMs'] === 'number' &&
    typeof candidate['sequenceNumber'] === 'number'
  );
}

/**
 * Type-safe Map value retrieval helpers
 */
export function getMapValue<K, V>(map: Map<K, V>, key: K): V | undefined {
  return map.get(key);
}

export function getMapValueOrDefault<K, V>(
  map: Map<K, V>,
  key: K,
  defaultValue: V
): V {
  return map.get(key) ?? defaultValue;
}

/**
 * Safe JSON parse with type validation
 */
export function parseSerializedEvents(data: string): SerializedCachedEvent[] {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      throw new CacheError('Expected array of events', CacheErrorCode.INVALID_DATA,
        { type: typeof parsed });
    }

    const events: SerializedCachedEvent[] = [];
    for (const item of parsed) {
      if (isSerializedCachedEvent(item)) {
        events.push(item);
      } else {
        // Skip invalid serialized event
      }
    }

    return events;
  } catch (error) {
    throw new CacheError(
      `Failed to parse serialized events: ${error instanceof Error ? error.message : 'Unknown error'}`,
      CacheErrorCode.SERIALIZATION_ERROR,
      { originalError: error }
    );
  }
}
