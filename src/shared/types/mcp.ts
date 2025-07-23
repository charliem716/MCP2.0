/**
 * MCP (Model Context Protocol) specific types
 */

import type { ID, Timestamp } from './common.js';
import type { MCPError } from './errors.js';

/**
 * MCP JSON-RPC version
 */
export type MCPVersion = '2.0';

/**
 * MCP transport types
 */
export type MCPTransport = 'stdio' | 'websocket' | 'http';

/**
 * MCP method names
 */
export enum MCPMethod {
  // Core methods
  INITIALIZE = 'initialize',
  PING = 'ping',
  
  // Tool methods
  TOOLS_LIST = 'tools/list',
  TOOLS_CALL = 'tools/call',
  
  // Resource methods
  RESOURCES_LIST = 'resources/list',
  RESOURCES_GET = 'resources/get',
  RESOURCES_SUBSCRIBE = 'resources/subscribe',
  RESOURCES_UNSUBSCRIBE = 'resources/unsubscribe',
  
  // Prompt methods
  PROMPTS_LIST = 'prompts/list',
  PROMPTS_GET = 'prompts/get',
  
  // Completion methods
  COMPLETION_COMPLETE = 'completion/complete',
  
  // Logging methods
  LOGGING_SET_LEVEL = 'logging/setLevel',
  
  // Notification methods
  NOTIFICATIONS_INITIALIZED = 'notifications/initialized',
  NOTIFICATIONS_CANCELLED = 'notifications/cancelled',
  NOTIFICATIONS_PROGRESS = 'notifications/progress',
  NOTIFICATIONS_RESOURCE_UPDATED = 'notifications/resourceUpdated',
  NOTIFICATIONS_RESOURCE_LIST_CHANGED = 'notifications/resourceListChanged',
  NOTIFICATIONS_TOOL_LIST_CHANGED = 'notifications/toolListChanged',
  NOTIFICATIONS_PROMPT_LIST_CHANGED = 'notifications/promptListChanged',
}

/**
 * MCP JSON-RPC request
 */
export interface MCPRequest {
  jsonrpc: MCPVersion;
  id: ID;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC response
 */
export interface MCPResponse {
  jsonrpc: MCPVersion;
  id: ID;
  result?: unknown;
  error?: MCPError;
}

/**
 * MCP JSON-RPC notification
 */
export interface MCPNotification {
  jsonrpc: MCPVersion;
  method: string;
  params?: Record<string, unknown>;
}



/**
 * MCP initialization parameters
 */
export interface MCPInitializeParams {
  protocolVersion: string;
  clientInfo: {
    name: string;
    version: string;
  };
  capabilities: MCPClientCapabilities;
}

/**
 * MCP initialization result
 */
export interface MCPInitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: MCPServerCapabilities;
}

/**
 * MCP client capabilities
 */
export interface MCPClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

/**
 * MCP server capabilities
 */
export interface MCPServerCapabilities {
  logging?: Record<string, unknown>;
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  experimental?: Record<string, unknown>;
}

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP tool call request
 */
export interface MCPToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * MCP tool call result
 */
export interface MCPToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP resource definition
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: Array<'human' | 'assistant'>;
    priority?: number;
  };
}

/**
 * MCP resource content
 */
export interface MCPResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

/**
 * MCP prompt definition
 */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * MCP prompt message
 */
export interface MCPPromptMessage {
  role: 'user' | 'assistant' | 'system';
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

/**
 * MCP prompt get result
 */
export interface MCPPromptGetResult {
  description?: string;
  messages: MCPPromptMessage[];
}

/**
 * MCP completion request
 */
export interface MCPCompletionRequest {
  ref: {
    type: 'ref/prompt' | 'ref/resource';
    name: string;
  };
  argument: {
    name: string;
    value: string;
  };
}

/**
 * MCP completion result
 */
export interface MCPCompletionResult {
  completion: {
    values: string[];
    total?: number;
    hasMore?: boolean;
  };
}

/**
 * MCP logging level
 */
export type MCPLogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

/**
 * MCP logging request
 */
export interface MCPLoggingRequest {
  level: MCPLogLevel;
  data?: unknown;
  logger?: string;
}

/**
 * MCP progress notification
 */
export interface MCPProgressNotification {
  progressToken: string | number;
  progress: number;
  total?: number;
}

/**
 * MCP cancelled notification
 */
export interface MCPCancelledNotification {
  requestId: ID;
  reason?: string;
}

/**
 * MCP transport interface
 */
export interface MCPTransportInterface {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: MCPRequest | MCPResponse | MCPNotification): Promise<void>;
  onMessage(callback: (message: MCPRequest | MCPResponse | MCPNotification) => void): void;
  onError(callback: (error: Error) => void): void;
  onClose(callback: () => void): void;
}

/**
 * MCP server interface
 */
export interface MCPServer {
  // Core methods
  initialize(params: MCPInitializeParams): Promise<MCPInitializeResult>;
  ping(): Promise<void>;
  
  // Tool methods
  listTools(): Promise<{ tools: MCPTool[] }>;
  callTool(params: MCPToolCallRequest): Promise<MCPToolCallResult>;
  
  // Resource methods
  listResources(): Promise<{ resources: MCPResource[] }>;
  getResource(uri: string): Promise<MCPResourceContent>;
  subscribeToResource(uri: string): Promise<void>;
  unsubscribeFromResource(uri: string): Promise<void>;
  
  // Prompt methods
  listPrompts(): Promise<{ prompts: MCPPrompt[] }>;
  getPrompt(name: string, args?: Record<string, unknown>): Promise<MCPPromptGetResult>;
  
  // Completion methods
  complete(params: MCPCompletionRequest): Promise<MCPCompletionResult>;
  
  // Logging methods
  setLogLevel(level: MCPLogLevel): Promise<void>;
  
  // Event handling
  on(event: 'request', listener: (request: MCPRequest) => void): void;
  on(event: 'notification', listener: (notification: MCPNotification) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'close', listener: () => void): void;
  
  // Notification methods
  sendNotification(method: string, params?: Record<string, unknown>): Promise<void>;
  sendProgress(token: string | number, progress: number, total?: number): Promise<void>;
  sendCancelled(requestId: ID, reason?: string): Promise<void>;
  
  // Transport management
  setTransport(transport: MCPTransportInterface): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * MCP tool handler interface
 */
export interface MCPToolHandler {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute(args: Record<string, unknown>): Promise<MCPToolCallResult>;
}

/**
 * MCP resource handler interface
 */
export interface MCPResourceHandler {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  get(): Promise<MCPResourceContent>;
  subscribe?(): Promise<void>;
  unsubscribe?(): Promise<void>;
}

/**
 * MCP prompt handler interface
 */
export interface MCPPromptHandler {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  execute(args?: Record<string, unknown>): Promise<MCPPromptGetResult>;
}

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  name: string;
  version: string;
  transport: MCPTransport;
  capabilities?: Partial<MCPServerCapabilities>;
  tools?: MCPToolHandler[];
  resources?: MCPResourceHandler[];
  prompts?: MCPPromptHandler[];
  logLevel?: MCPLogLevel;
  qrwc: {
    host: string;
    port?: number;
    username?: string;
    password?: string;
    secure?: boolean;
    reconnectInterval?: number;
    heartbeatInterval?: number;
  };
  eventCache?: {
    maxEvents?: number;
    maxAgeMs?: number;
    compressOldEvents?: boolean;
    persistToDisk?: boolean;
  };
}

/**
 * MCP context for request handling
 */
export interface MCPContext {
  requestId: ID;
  method: string;
  params?: Record<string, unknown>;
  timestamp: Timestamp;
  clientInfo?: {
    name: string;
    version: string;
  };
  progressToken?: string | number;
}

/**
 * MCP Error Response for JSON-RPC 2.0 compliance
 */
export interface MCPErrorResponse {
  code: number;
  message: string;
  data?: unknown;
} 