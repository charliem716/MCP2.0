/**
 * Type definitions for external APIs and database responses
 * 
 * This file provides type safety for all external data sources
 * to eliminate unsafe any operations throughout the codebase.
 */

// ===== Database Types =====

export interface DatabaseIntegrityCheck {
  integrity_check: string;
}

export interface DatabaseCountResult {
  count: number;
}

export interface DatabaseStatsResult {
  total_events: number;
  unique_controls: number;
  change_groups: number;
  oldest_event: number | null;
  newest_event: number | null;
}

export interface DatabaseExportResult {
  count: number;
  min_ts: number;
  max_ts: number;
}

export interface DatabaseExportData {
  events: DatabaseEventRow[];
  metadata: {
    exportTime: string;
    totalEvents: number;
    startTime?: number;
    endTime?: number;
  };
}

export interface DatabaseEventRow {
  timestamp: number;
  change_group_id: string;
  control_path: string;
  component_name: string;
  control_name: string;
  value: number;
  string_value: string;
  source: string;
}

// ===== HTTP Request/Response Types =====

export interface HttpRequest {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[]>;
  query?: Record<string, string | string[]>;
}

export interface HttpResponse {
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(data?: string | Buffer): void;
  setHeader(name: string, value: string): void;
}

// ===== Commander Options Types =====

export interface BackupCommandOptions {
  output?: string;
  db?: string;
  start?: number;
  end?: number;
  days?: number;
  detailed?: boolean;
}

export interface RestoreCommandOptions {
  target: string;
  force?: boolean;
}

export interface ListCommandOptions {
  detailed?: boolean;
}

export interface ExportCommandOptions {
  start?: number;
  end?: number;
  days?: number;
}

// ===== Type Guards =====

export function isDatabaseIntegrityCheck(value: unknown): value is DatabaseIntegrityCheck {
  return (
    typeof value === 'object' &&
    value !== null &&
    'integrity_check' in value &&
    typeof (value as DatabaseIntegrityCheck).integrity_check === 'string'
  );
}

export function isDatabaseCountResult(value: unknown): value is DatabaseCountResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'count' in value &&
    typeof (value as DatabaseCountResult).count === 'number'
  );
}

export function isDatabaseStatsResult(value: unknown): value is DatabaseStatsResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'total_events' in value &&
    'unique_controls' in value &&
    'change_groups' in value
  );
}

export function isDatabaseExportData(value: unknown): value is DatabaseExportData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'events' in value &&
    Array.isArray((value as DatabaseExportData).events) &&
    'metadata' in value
  );
}

export function isHttpRequest(value: unknown): value is HttpRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('url' in value || 'method' in value || 'headers' in value)
  );
}

export function isHttpResponse(value: unknown): value is HttpResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'writeHead' in value &&
    'end' in value &&
    typeof (value as HttpResponse).writeHead === 'function' &&
    typeof (value as HttpResponse).end === 'function'
  );
}

// ===== Assertion Functions =====

export function assertDatabaseIntegrityCheck(value: unknown): DatabaseIntegrityCheck {
  if (!isDatabaseIntegrityCheck(value)) {
    throw new TypeError('Invalid database integrity check result');
  }
  return value;
}

export function assertDatabaseCountResult(value: unknown): DatabaseCountResult {
  if (!isDatabaseCountResult(value)) {
    throw new TypeError('Invalid database count result');
  }
  return value;
}

export function assertDatabaseStatsResult(value: unknown): DatabaseStatsResult {
  if (!isDatabaseStatsResult(value)) {
    throw new TypeError('Invalid database stats result');
  }
  return value;
}

export function assertDatabaseExportData(value: unknown): DatabaseExportData {
  if (!isDatabaseExportData(value)) {
    throw new TypeError('Invalid database export data');
  }
  return value;
}

export function assertHttpRequest(value: unknown): HttpRequest {
  if (!isHttpRequest(value)) {
    throw new TypeError('Invalid HTTP request object');
  }
  return value;
}

export function assertHttpResponse(value: unknown): HttpResponse {
  if (!isHttpResponse(value)) {
    throw new TypeError('Invalid HTTP response object');
  }
  return value;
}