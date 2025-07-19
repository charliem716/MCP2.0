/**
 * API types for REST endpoints and middleware
 */

import type { ID, Timestamp, HttpStatus, HttpMethod } from './common.js';
import type { QSysComponent, QSysControl, QSysSnapshot, QSysCoreStatus } from './qsys.js';
import type { OpenAIChatMessage } from './openai.js';

/**
 * API request metadata
 */
export interface APIRequestMetadata {
  requestId: ID;
  timestamp: Timestamp;
  userAgent?: string;
  ipAddress?: string;
  userId?: ID;
  sessionId?: ID;
}

/**
 * API response metadata
 */
export interface APIResponseMetadata {
  requestId: ID;
  timestamp: Timestamp;
  duration: number;
  version: string;
}

/**
 * Generic API response wrapper
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: APIResponseMetadata;
}

/**
 * API error response
 */
export interface APIError {
  code: string;
  message: string;
  details?: unknown;
  path?: string;
  statusCode: HttpStatus;
}

/**
 * API validation error
 */
export interface APIValidationError extends APIError {
  code: 'VALIDATION_ERROR';
  details: {
    fields: Array<{
      field: string;
      message: string;
      value?: unknown;
    }>;
  };
}

/**
 * Health check endpoint response
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Timestamp;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    qsys: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    openai: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    mcp: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
  };
}

/**
 * Chat API types
 */
export interface ChatSendRequest {
  message: string;
  conversationId?: ID;
  context?: Record<string, unknown>;
  stream?: boolean;
}

export interface ChatSendResponse {
  conversationId: ID;
  message: OpenAIChatMessage;
  tokensUsed: number;
  responseTime: number;
}

export interface ChatHistoryRequest {
  conversationId: ID;
  limit?: number;
  offset?: number;
  since?: Timestamp;
}

export interface ChatHistoryResponse {
  conversationId: ID;
  messages: OpenAIChatMessage[];
  total: number;
  hasMore: boolean;
}

export interface ChatConversationListResponse {
  conversations: Array<{
    id: ID;
    created: Timestamp;
    updated: Timestamp;
    messageCount: number;
    tokensUsed: number;
    preview?: string;
  }>;
  total: number;
  hasMore: boolean;
}

/**
 * Q-SYS API types
 */
export interface QSysComponentsListResponse {
  components: QSysComponent[];
  total: number;
  cached: boolean;
  lastUpdated: Timestamp;
}

export interface QSysControlsListRequest {
  component: string;
  refresh?: boolean;
}

export interface QSysControlsListResponse {
  component: string;
  controls: QSysControl[];
  total: number;
  cached: boolean;
  lastUpdated: Timestamp;
}

export interface QSysControlValueRequest {
  component?: string;
  control: string;
}

export interface QSysControlValueResponse {
  component?: string;
  control: string;
  value: string | number | boolean;
  timestamp: Timestamp;
}

export interface QSysControlValuesRequest {
  controls: Array<{
    component?: string;
    control: string;
  }>;
}

export interface QSysControlValuesResponse {
  controls: Array<{
    component?: string;
    control: string;
    value: string | number | boolean;
    error?: string;
  }>;
  timestamp: Timestamp;
}

export interface QSysSetControlValueRequest {
  component?: string;
  control: string;
  value: string | number | boolean;
}

export interface QSysSetControlValuesRequest {
  controls: Array<{
    component?: string;
    control: string;
    value: string | number | boolean;
  }>;
}

export interface QSysSnapshotLoadRequest {
  bank: number;
  snapshot: number;
  ramp?: number;
}

export interface QSysSnapshotSaveRequest {
  bank: number;
  snapshot: number;
  name?: string;
}

export interface QSysSnapshotsListResponse {
  snapshots: QSysSnapshot[];
  total: number;
  cached: boolean;
  lastUpdated: Timestamp;
}

export interface QSysStatusResponse {
  status: QSysCoreStatus;
  timestamp: Timestamp;
}

/**
 * Voice API types
 */
export interface VoiceUploadRequest {
  audio: ArrayBuffer;
  format: 'wav' | 'mp3' | 'ogg' | 'webm';
  sampleRate?: number;
  channels?: number;
}

export interface VoiceUploadResponse {
  transcription: string;
  confidence: number;
  language: string;
  duration: number;
  processingTime: number;
}

export interface VoiceStreamConfig {
  format: 'pcm16' | 'opus' | 'webm';
  sampleRate: number;
  channels: number;
  bufferSize?: number;
}

export interface VoiceSynthesisRequest {
  text: string;
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'ogg';
}

export interface VoiceSynthesisResponse {
  audio: ArrayBuffer;
  duration: number;
  format: string;
  processingTime: number;
}

/**
 * System API types
 */
export interface SystemStatusResponse {
  system: {
    uptime: number;
    memory: {
      used: number;
      total: number;
      usage: number;
    };
    cpu: {
      usage: number;
      loadAverage: number[];
    };
    disk: {
      used: number;
      total: number;
      usage: number;
    };
  };
  services: {
    qsys: {
      connected: boolean;
      lastSeen?: Timestamp;
    };
    openai: {
      connected: boolean;
      lastSeen?: Timestamp;
    };
    mcp: {
      active: boolean;
      lastSeen?: Timestamp;
    };
  };
  timestamp: Timestamp;
}

export interface SystemLogsRequest {
  level?: 'error' | 'warn' | 'info' | 'debug';
  since?: Timestamp;
  until?: Timestamp;
  limit?: number;
  offset?: number;
}

export interface SystemLogsResponse {
  logs: Array<{
    timestamp: Timestamp;
    level: string;
    message: string;
    service: string;
    context?: Record<string, unknown>;
  }>;
  total: number;
  hasMore: boolean;
}

/**
 * Middleware types
 */
export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: unknown) => string;
}

export interface AuthenticationContext {
  userId?: ID;
  sessionId?: ID;
  permissions: string[];
  isAuthenticated: boolean;
  expiresAt?: Timestamp;
}

export interface CORSOptions {
  origin: string | string[] | RegExp;
  methods: HttpMethod[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export interface RequestLoggingOptions {
  excludePaths?: string[];
  includeBody?: boolean;
  includeHeaders?: boolean;
  logLevel?: 'info' | 'debug';
}

/**
 * API route definitions
 */
export interface APIRoute {
  path: string;
  method: HttpMethod;
  handler: (req: unknown, res: unknown, next: unknown) => Promise<void>;
  middleware?: Array<(req: unknown, res: unknown, next: unknown) => Promise<void>>;
  auth?: boolean;
  rateLimit?: RateLimitOptions;
  validation?: {
    body?: unknown;
    params?: unknown;
    query?: unknown;
  };
}

/**
 * API server configuration
 */
export interface APIServerConfig {
  port: number;
  host?: string;
  cors?: CORSOptions;
  rateLimit?: RateLimitOptions;
  authentication?: {
    enabled: boolean;
    secret: string;
    expiresIn?: string;
  };
  logging?: RequestLoggingOptions;
  compression?: boolean;
  helmet?: boolean;
  swagger?: {
    enabled: boolean;
    path: string;
    title: string;
    version: string;
    description: string;
  };
}

/**
 * OpenAPI/Swagger types
 */
export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
    termsOfService?: string;
    contact?: {
      name?: string;
      url?: string;
      email?: string;
    };
    license?: {
      name: string;
      url?: string;
    };
  };
  servers: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, unknown>;
  components?: {
    schemas?: Record<string, unknown>;
    responses?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    examples?: Record<string, unknown>;
    requestBodies?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  security?: Array<Record<string, unknown>>;
  tags?: Array<{
    name: string;
    description?: string;
  }>;
} 