/**
 * Agent types for OpenAI integration and conversation management
 */

import type { ID, Timestamp } from './common.js';
import type { OpenAIModel, OpenAIVoice, OpenAITool, OpenAIChatMessage, OpenAIConversationContext } from './openai.js';
import type { MCPToolHandler } from './mcp.js';
import type { QSysClient } from './qsys.js';

/**
 * Agent configuration
 */
export interface AgentConfig {
  id: ID;
  name: string;
  description: string;
  version: string;
  model: OpenAIModel;
  voice: OpenAIVoice;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  tools: OpenAITool[];
  capabilities: AgentCapabilities;
  settings: AgentSettings;
}

/**
 * Agent capabilities
 */
export interface AgentCapabilities {
  textChat: boolean;
  voiceChat: boolean;
  realtimeVoice: boolean;
  qsysControl: boolean;
  functionCalling: boolean;
  contextMemory: boolean;
  multimodal: boolean;
}

/**
 * Agent settings
 */
export interface AgentSettings {
  maxConversationLength: number;
  conversationTimeout: number;
  autoSaveConversations: boolean;
  voiceActivationThreshold: number;
  responseTimeout: number;
  retryAttempts: number;
  debugMode: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * Agent context
 */
export interface AgentContext {
  userId?: ID;
  sessionId?: ID;
  conversationId?: ID;
  qsysConnected: boolean;
  userPreferences: UserPreferences;
  systemState: SystemState;
  currentDateTime: Timestamp;
  timezone: string;
}

/**
 * User preferences
 */
export interface UserPreferences {
  preferredVoice: OpenAIVoice;
  language: string;
  responseStyle: 'formal' | 'casual' | 'technical';
  verbosityLevel: 'concise' | 'normal' | 'detailed';
  confirmActions: boolean;
  autoExecuteCommands: boolean;
  saveHistory: boolean;
}

/**
 * System state
 */
export interface SystemState {
  qsysCore: {
    connected: boolean;
    designName?: string;
    coreId?: string;
    status?: 'ok' | 'compromised' | 'fault';
  };
  openai: {
    connected: boolean;
    model: OpenAIModel;
    rateLimitRemaining?: number;
  };
  mcp: {
    active: boolean;
    toolsCount: number;
    lastActivity?: Timestamp;
  };
  memory: {
    used: number;
    total: number;
  };
  uptime: number;
}

/**
 * Agent instruction templates
 */
export interface AgentInstructions {
  systemPrompt: string;
  qsysInstructions: string;
  safetyInstructions: string;
  responseGuidelines: string;
  errorHandling: string;
  contextAwareness: string;
}

/**
 * Agent conversation state
 */
export interface AgentConversationState {
  id: ID;
  userId?: ID;
  sessionId?: ID;
  status: 'active' | 'inactive' | 'ended';
  created: Timestamp;
  updated: Timestamp;
  messageCount: number;
  tokensUsed: number;
  currentTool?: string;
  pendingAction?: PendingAction;
  context: Record<string, any>;
}

/**
 * Pending action (awaiting confirmation)
 */
export interface PendingAction {
  id: ID;
  type: 'qsys_control' | 'snapshot_load' | 'system_command';
  description: string;
  parameters: Record<string, any>;
  confirmationRequired: boolean;
  expiresAt: Timestamp;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Agent response
 */
export interface AgentResponse {
  id: ID;
  conversationId: ID;
  message: OpenAIChatMessage;
  actions?: AgentAction[];
  suggestions?: string[];
  context?: Record<string, any>;
  tokensUsed: number;
  responseTime: number;
  timestamp: Timestamp;
}

/**
 * Agent action
 */
export interface AgentAction {
  id: ID;
  type: 'qsys_control' | 'snapshot' | 'system' | 'information';
  description: string;
  parameters: Record<string, any>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  timestamp: Timestamp;
}

/**
 * Agent tool execution context
 */
export interface AgentToolContext {
  conversationId: ID;
  userId?: ID;
  sessionId?: ID;
  toolName: string;
  parameters: Record<string, any>;
  timestamp: Timestamp;
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
}

/**
 * Agent tool execution result
 */
export interface AgentToolResult {
  success: boolean;
  result?: any;
  error?: string;
  message?: string;
  actions?: AgentAction[];
  suggestions?: string[];
  context?: Record<string, any>;
}

/**
 * Agent memory
 */
export interface AgentMemory {
  userId?: ID;
  sessionId?: ID;
  conversationId?: ID;
  shortTerm: Record<string, any>;
  longTerm: Record<string, any>;
  preferences: UserPreferences;
  recentActions: AgentAction[];
  frequentCommands: Array<{
    command: string;
    count: number;
    lastUsed: Timestamp;
  }>;
  learned: Array<{
    pattern: string;
    response: string;
    confidence: number;
  }>;
}

/**
 * Agent metrics
 */
export interface AgentMetrics {
  totalConversations: number;
  totalMessages: number;
  totalTokensUsed: number;
  averageResponseTime: number;
  successfulActions: number;
  failedActions: number;
  userSatisfactionScore?: number;
  topCommands: Array<{
    command: string;
    count: number;
    percentage: number;
  }>;
  errorRate: number;
  uptime: number;
}

/**
 * Agent learning data
 */
export interface AgentLearningData {
  userBehavior: {
    commonCommands: string[];
    preferredSettings: Record<string, any>;
    usagePatterns: Record<string, number>;
  };
  systemPatterns: {
    frequentErrors: string[];
    performanceMetrics: Record<string, number>;
    optimizationOpportunities: string[];
  };
  conversationInsights: {
    averageLength: number;
    topicDistribution: Record<string, number>;
    satisfactionTrends: number[];
  };
}

/**
 * Agent interface
 */
export interface Agent {
  // Configuration
  config: AgentConfig;
  context: AgentContext;
  memory: AgentMemory;
  
  // Core functionality
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Conversation management
  startConversation(userId?: ID, sessionId?: ID): Promise<AgentConversationState>;
  endConversation(conversationId: ID): Promise<void>;
  sendMessage(conversationId: ID, message: string, context?: Record<string, any>): Promise<AgentResponse>;
  getConversationHistory(conversationId: ID, limit?: number): Promise<OpenAIChatMessage[]>;
  
  // Voice capabilities
  processVoiceInput(audio: ArrayBuffer, conversationId: ID): Promise<AgentResponse>;
  synthesizeVoice(text: string, voice?: OpenAIVoice): Promise<ArrayBuffer>;
  
  // Tool management
  registerTool(handler: MCPToolHandler): void;
  unregisterTool(name: string): void;
  executeTool(name: string, parameters: Record<string, any>, context: AgentToolContext): Promise<AgentToolResult>;
  
  // Q-SYS integration
  setQSysClient(client: QSysClient): void;
  getQSysStatus(): Promise<SystemState['qsysCore']>;
  
  // Memory and learning
  updateMemory(conversationId: ID, data: Record<string, any>): Promise<void>;
  getMemory(conversationId: ID): Promise<Record<string, any>>;
  learn(data: AgentLearningData): Promise<void>;
  
  // Metrics and monitoring
  getMetrics(): Promise<AgentMetrics>;
  resetMetrics(): Promise<void>;
  
  // Event handling
  on(event: 'conversation_started', listener: (state: AgentConversationState) => void): void;
  on(event: 'conversation_ended', listener: (conversationId: ID) => void): void;
  on(event: 'message_received', listener: (conversationId: ID, message: string) => void): void;
  on(event: 'message_sent', listener: (response: AgentResponse) => void): void;
  on(event: 'tool_executed', listener: (result: AgentToolResult) => void): void;
  on(event: 'error', listener: (error: Error, context?: Record<string, any>) => void): void;
  
  off(event: string, listener: Function): void;
  removeAllListeners(event?: string): void;
}

/**
 * Agent factory interface
 */
export interface AgentFactory {
  createAgent(config: AgentConfig): Promise<Agent>;
  createDefaultAgent(): Promise<Agent>;
  getAgentTemplates(): AgentConfig[];
  validateConfig(config: AgentConfig): boolean;
}

/**
 * Agent manager interface
 */
export interface AgentManager {
  // Agent lifecycle
  createAgent(config: AgentConfig): Promise<Agent>;
  getAgent(id: ID): Agent | undefined;
  removeAgent(id: ID): Promise<void>;
  listAgents(): Agent[];
  
  // Global operations
  broadcastMessage(message: string, filter?: (agent: Agent) => boolean): Promise<void>;
  getGlobalMetrics(): Promise<AgentMetrics>;
  
  // Event handling
  on(event: 'agent_created', listener: (agent: Agent) => void): void;
  on(event: 'agent_removed', listener: (agentId: ID) => void): void;
  on(event: 'global_error', listener: (error: Error, agentId?: ID) => void): void;
  
  off(event: string, listener: Function): void;
  removeAllListeners(event?: string): void;
} 