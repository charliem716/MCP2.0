/**
 * WebSocket types for real-time communication
 */

import type { ID, Timestamp, WebSocketState, ConnectionState } from './common.js';
import type { QSysControlChange, QSysComponentChange, QSysEngineStatus } from './qsys.js';
import type { OpenAIChatMessage } from './openai.js';

/**
 * WebSocket message types
 */
export enum WebSocketMessageType {
  // Connection messages
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  PING = 'ping',
  PONG = 'pong',
  
  // Chat messages
  CHAT_MESSAGE = 'chat_message',
  CHAT_TYPING = 'chat_typing',
  CHAT_RESPONSE = 'chat_response',
  CHAT_ERROR = 'chat_error',
  
  // Voice messages
  VOICE_START = 'voice_start',
  VOICE_STOP = 'voice_stop',
  VOICE_DATA = 'voice_data',
  VOICE_TRANSCRIPTION = 'voice_transcription',
  VOICE_SYNTHESIS = 'voice_synthesis',
  VOICE_ERROR = 'voice_error',
  
  // Q-SYS messages
  QSYS_CONTROL_CHANGE = 'qsys_control_change',
  QSYS_COMPONENT_CHANGE = 'qsys_component_change',
  QSYS_ENGINE_STATUS = 'qsys_engine_status',
  QSYS_CONNECTION_STATUS = 'qsys_connection_status',
  QSYS_ERROR = 'qsys_error',
  
  // System messages
  SYSTEM_STATUS = 'system_status',
  SYSTEM_ERROR = 'system_error',
  SYSTEM_NOTIFICATION = 'system_notification',
  
  // OpenAI Realtime messages
  REALTIME_SESSION_START = 'realtime_session_start',
  REALTIME_SESSION_END = 'realtime_session_end',
  REALTIME_AUDIO_INPUT = 'realtime_audio_input',
  REALTIME_AUDIO_OUTPUT = 'realtime_audio_output',
  REALTIME_TRANSCRIPT = 'realtime_transcript',
  REALTIME_FUNCTION_CALL = 'realtime_function_call',
  REALTIME_ERROR = 'realtime_error',
}

/**
 * Base WebSocket message structure
 */
export interface WebSocketMessage<T = unknown> {
  id: ID;
  type: WebSocketMessageType;
  data: T;
  timestamp: Timestamp;
  clientId?: ID;
  sessionId?: ID;
}

/**
 * WebSocket connection info
 */
export interface WebSocketConnectionInfo {
  id: ID;
  clientId: ID;
  sessionId?: ID;
  connectedAt: Timestamp;
  lastActivity: Timestamp;
  userAgent?: string;
  ipAddress?: string;
  userId?: ID;
  subscriptions: Set<string>;
}

/**
 * WebSocket connection status
 */
export interface WebSocketConnectionStatus {
  state: ConnectionState;
  readyState: WebSocketState;
  connectedAt?: Timestamp;
  lastActivity?: Timestamp;
  error?: string;
  reconnectAttempts: number;
  subscriptions: string[];
}

/**
 * Chat WebSocket messages
 */
export interface ChatMessageData {
  conversationId: ID;
  message: string;
  context?: Record<string, unknown>;
  stream?: boolean;
}

export interface ChatResponseData {
  conversationId: ID;
  message: OpenAIChatMessage;
  tokensUsed: number;
  responseTime: number;
}

export interface ChatTypingData {
  conversationId: ID;
  isTyping: boolean;
  userId?: ID;
}

export interface ChatErrorData {
  conversationId?: ID;
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Voice WebSocket messages
 */
export interface VoiceStartData {
  sessionId: ID;
  format: 'pcm16' | 'opus' | 'webm';
  sampleRate: number;
  channels: number;
  bufferSize?: number;
}

export interface VoiceStopData {
  sessionId: ID;
  reason?: string;
}

export interface VoiceDataMessage {
  sessionId: ID;
  audio: ArrayBuffer;
  sequence: number;
  timestamp: Timestamp;
}

export interface VoiceTranscriptionData {
  sessionId: ID;
  text: string;
  confidence: number;
  language: string;
  isFinal: boolean;
  words?: Array<{
    word: string;
    confidence: number;
    start: number;
    end: number;
  }>;
}

export interface VoiceSynthesisData {
  sessionId: ID;
  text: string;
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'ogg';
}

export interface VoiceErrorData {
  sessionId: ID;
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Q-SYS WebSocket messages
 */
export interface QSysControlChangeData {
  changes: QSysControlChange[];
  timestamp: Timestamp;
}

export interface QSysComponentChangeData {
  changes: QSysComponentChange[];
  timestamp: Timestamp;
}

export interface QSysEngineStatusData {
  status: QSysEngineStatus;
  timestamp: Timestamp;
}

export interface QSysConnectionStatusData {
  state: ConnectionState;
  host: string;
  port: number;
  lastConnected?: Timestamp;
  lastDisconnected?: Timestamp;
  error?: string;
}

export interface QSysErrorData {
  error: string;
  code: string;
  details?: unknown;
  timestamp: Timestamp;
}

/**
 * System WebSocket messages
 */
export interface SystemStatusData {
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
  connections: {
    total: number;
    active: number;
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
}

export interface SystemErrorData {
  error: string;
  code: string;
  service?: string;
  details?: unknown;
  timestamp: Timestamp;
}

export interface SystemNotificationData {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  persistent?: boolean;
  actions?: Array<{
    label: string;
    action: string;
    data?: unknown;
  }>;
}

/**
 * OpenAI Realtime WebSocket messages
 */
export interface RealtimeSessionStartData {
  sessionId: ID;
  config: {
    model: string;
    voice: string;
    inputAudioFormat: string;
    outputAudioFormat: string;
    instructions?: string;
    temperature?: number;
    maxOutputTokens?: number;
  };
}

export interface RealtimeSessionEndData {
  sessionId: ID;
  reason?: string;
  tokensUsed?: number;
  duration?: number;
}

export interface RealtimeAudioInputData {
  sessionId: ID;
  audio: string; // base64 encoded audio
  sequence: number;
}

export interface RealtimeAudioOutputData {
  sessionId: ID;
  audio: string; // base64 encoded audio
  sequence: number;
  transcript?: string;
}

export interface RealtimeTranscriptData {
  sessionId: ID;
  text: string;
  role: 'user' | 'assistant';
  delta?: string;
  isFinal: boolean;
}

export interface RealtimeFunctionCallData {
  sessionId: ID;
  functionName: string;
  arguments: Record<string, unknown>;
  callId: string;
}

export interface RealtimeErrorData {
  sessionId: ID;
  error: string;
  code: string;
  details?: unknown;
}

/**
 * WebSocket subscription types
 */
export interface WebSocketSubscription {
  id: ID;
  type: string;
  filter?: Record<string, unknown>;
  clientId: ID;
  createdAt: Timestamp;
}

export interface WebSocketSubscriptionRequest {
  type: string;
  filter?: Record<string, unknown>;
}

export interface WebSocketSubscriptionResponse {
  subscriptionId: ID;
  type: string;
  filter?: Record<string, unknown>;
  success: boolean;
  error?: string;
}

/**
 * WebSocket client interface
 */
export interface WebSocketClient {
  id: ID;
  clientId: ID;
  sessionId?: ID;
  socket: WebSocket;
  info: WebSocketConnectionInfo;
  
  // Connection management
  connect(): Promise<void>;
  disconnect(code?: number, reason?: string): Promise<void>;
  isConnected(): boolean;
  getStatus(): WebSocketConnectionStatus;
  
  // Message handling
  send<T>(type: WebSocketMessageType, data: T): Promise<void>;
  sendMessage(message: WebSocketMessage): Promise<void>;
  onMessage<T>(type: WebSocketMessageType, handler: (data: T) => void): void;
  offMessage(type: WebSocketMessageType, handler?: (...args: unknown[]) => void): void;
  
  // Subscription management
  subscribe(type: string, filter?: Record<string, unknown>): Promise<WebSocketSubscription>;
  unsubscribe(subscriptionId: ID): Promise<void>;
  listSubscriptions(): WebSocketSubscription[];
  
  // Event handling
  on(event: 'connect', listener: () => void): void;
  on(event: 'disconnect', listener: (code: number, reason: string) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'message', listener: (message: WebSocketMessage) => void): void;
  
  off(event: string, listener: (...args: unknown[]) => void): void;
  removeAllListeners(event?: string): void;
}

/**
 * WebSocket server interface
 */
export interface WebSocketServer {
  // Server management
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  
  // Client management
  getClients(): WebSocketClient[];
  getClient(clientId: ID): WebSocketClient | undefined;
  getClientsByUserId(userId: ID): WebSocketClient[];
  
  // Broadcasting
  broadcast<T>(type: WebSocketMessageType, data: T, filter?: (client: WebSocketClient) => boolean): Promise<void>;
  broadcastToSubscribers<T>(subscriptionType: string, type: WebSocketMessageType, data: T): Promise<void>;
  
  // Event handling
  on(event: 'connection', listener: (client: WebSocketClient) => void): void;
  on(event: 'disconnection', listener: (client: WebSocketClient) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'message', listener: (client: WebSocketClient, message: WebSocketMessage) => void): void;
  
  off(event: string, listener: (...args: unknown[]) => void): void;
  removeAllListeners(event?: string): void;
}

/**
 * WebSocket server configuration
 */
export interface WebSocketServerConfig {
  port: number;
  host?: string;
  path?: string;
  maxConnections?: number;
  pingInterval?: number;
  pongTimeout?: number;
  compression?: boolean;
  perMessageDeflate?: boolean;
  maxPayloadLength?: number;
  verifyClient?: (info: {
    origin: string;
    secure: boolean;
    req: unknown;
  }) => boolean;
  authentication?: {
    enabled: boolean;
    verifyToken?: (token: string) => Promise<{ userId: ID; sessionId?: ID } | null>;
  };
} 