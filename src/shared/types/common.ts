/**
 * Common TypeScript types used throughout the application
 */

/**
 * Generic success/error result type
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Optional with undefined
 */
export type Optional<T> = T | undefined;

/**
 * Nullable type
 */
export type Nullable<T> = T | null;

/**
 * Make all properties optional
 */
export type PartialRecord<K extends keyof unknown, T> = Partial<Record<K, T>>;

/**
 * Deep partial type
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Timestamp type
 */
export type Timestamp = number;

/**
 * ISO date string
 */
export type ISODateString = string;

/**
 * UUID type
 */
export type UUID = string;

/**
 * Log levels
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

/**
 * Environment types
 */
export type Environment = 'development' | 'production' | 'test';

/**
 * Generic ID type
 */
export type ID = string | number;

/**
 * Generic callback type
 */
export type Callback<T = void> = (error?: Error, result?: T) => void;

/**
 * Event listener type
 */
export type EventListener<T = unknown> = (event: T) => void;

/**
 * Cleanup function type
 */
export type CleanupFunction = () => void;

/**
 * Constructor type
 */
export type Constructor<T = unknown> = new (...args: unknown[]) => T;

/**
 * Generic configuration object
 */
export type Config = Record<string, unknown>;

/**
 * Generic metadata object
 */
export type Metadata = Record<string, unknown>;

/**
 * Health check status
 */
export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded';

/**
 * Health check result
 */
export interface HealthCheck {
  status: HealthStatus;
  timestamp: Timestamp;
  uptime: number;
  version: string;
  checks: Record<string, {
    status: HealthStatus;
    message?: string;
    latency?: number;
  }>;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * Pagination result
 */
export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Sort parameters
 */
export interface SortParams {
  field: string;
  order: 'asc' | 'desc';
}

/**
 * Filter parameters
 */
export type FilterParams = Record<string, unknown>;

/**
 * Search parameters
 */
export interface SearchParams {
  query?: string;
  fields?: string[];
  pagination?: PaginationParams;
  sort?: SortParams;
  filters?: FilterParams;
}

/**
 * Generic response wrapper
 */
export interface ResponseWrapper<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Timestamp;
}

/**
 * HTTP status codes
 */
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

/**
 * HTTP methods
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  OPTIONS = 'OPTIONS',
  HEAD = 'HEAD',
}

/**
 * Content types
 */
export enum ContentType {
  JSON = 'application/json',
  TEXT = 'text/plain',
  HTML = 'text/html',
  XML = 'application/xml',
  FORM_DATA = 'multipart/form-data',
  URL_ENCODED = 'application/x-www-form-urlencoded',
}

/**
 * WebSocket states
 */
export enum WebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

/**
 * Connection states
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * Generic event type
 */
export interface Event<T = unknown> {
  type: string;
  data: T;
  timestamp: Timestamp;
  id?: string;
}

/**
 * Generic command type
 */
export interface Command<T = unknown> {
  id: string;
  type: string;
  payload: T;
  timestamp: Timestamp;
}

/**
 * Generic response type
 */
export interface Response<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Timestamp;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
}

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  request: number;
  response: number;
  connection: number;
} 