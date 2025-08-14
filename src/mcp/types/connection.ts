/**
 * Connection Management Types
 * 
 * Type definitions for the manage_connection MCP tool
 * Provides comprehensive connection management capabilities
 */

export interface ConnectionEvent {
  timestamp: Date;
  type: 'connect' | 'disconnect' | 'error' | 'retry' | 'reconnect';
  reason?: string;
  details?: Record<string, unknown>;
  correlationId: string;
  attempt?: number;
  duration?: number;
  success?: boolean;
}

export interface ReconnectOptions {
  force?: boolean;
  maxAttempts?: number;
  timeout?: number;
  retryDelay?: number;
}

export interface DiagnosticsResult {
  timestamp: Date;
  network: {
    reachable: boolean;
    latency?: number;
    error?: string;
  };
  dns: {
    resolved: boolean;
    addresses?: string[];
    error?: string;
  };
  port: {
    open: boolean;
    service?: string;
    error?: string;
  };
  websocket: {
    compatible: boolean;
    protocols?: string[];
    error?: string;
  };
  authentication: {
    valid: boolean;
    method?: string;
    error?: string;
  };
  resources: {
    memory: {
      used: number;
      available: number;
      percentage: number;
    };
    fileDescriptors?: {
      used: number;
      limit: number;
    };
  };
  summary: string;
}

export interface TestResult {
  type: 'basic' | 'latency' | 'throughput' | 'comprehensive';
  timestamp: Date;
  duration: number;
  results: {
    basic?: {
      connected: boolean;
      responseTime: number;
    };
    latency?: {
      min: number;
      max: number;
      avg: number;
      p95: number;
      p99: number;
    };
    throughput?: {
      bytesPerSecond: number;
      commandsPerSecond: number;
    };
  };
  success: boolean;
  error?: string;
}

export interface ConnectionConfig {
  autoReconnect?: boolean;
  maxRetryAttempts?: number;
  retryInterval?: number;
  connectionTimeout?: number;
  circuitBreakerThreshold?: number;
}

export interface ConnectionHistory {
  events: ConnectionEvent[];
  summary: {
    totalConnections: number;
    totalDisconnections: number;
    totalErrors: number;
    averageUptime: number;
    lastConnection?: Date;
    lastDisconnection?: Date;
  };
}

export interface MonitoringOptions {
  interval?: number;
  duration?: number;
  alerts?: {
    onDisconnect?: boolean;
    onHighLatency?: number;
    onErrorRate?: number;
  };
}

export interface MonitoringResult {
  timestamp: Date;
  health: {
    isHealthy: boolean;
    latency?: number;
    errorRate?: number;
  };
  alerts: Array<{
    type: string;
    message: string;
    threshold?: number;
    value?: number;
  }>;
}

export interface CoreTarget {
  host: string;
  port?: number;
  credentials?: {
    username?: string;
    password?: string;
  };
}

export type ManageConnectionAction = 
  | 'status'
  | 'reconnect'
  | 'diagnose'
  | 'test'
  | 'configure'
  | 'history'
  | 'monitor'
  | 'reset'
  | 'switch';

export interface ManageConnectionParams {
  action: ManageConnectionAction;
  verbose?: boolean;
  force?: boolean;
  maxAttempts?: number;
  timeout?: number;
  checks?: string[];
  type?: 'basic' | 'latency' | 'throughput' | 'comprehensive';
  duration?: number;
  settings?: ConnectionConfig;
  timeRange?: '1h' | '24h' | '7d' | '30d';
  eventType?: 'all' | 'connections' | 'disconnections' | 'errors';
  interval?: number;
  alerts?: MonitoringOptions['alerts'];
  clearCaches?: boolean;
  resetCircuitBreaker?: boolean;
  resetStats?: boolean;
  target?: CoreTarget;
}

export interface ManageConnectionResult {
  success: boolean;
  action: ManageConnectionAction;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    timestamp: string;
    duration: number;
    correlationId: string;
  };
}