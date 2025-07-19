/**
 * OpenAI specific types for agents SDK and API integration
 */

import type { ID, Timestamp } from './common.js';

/**
 * OpenAI model names
 */
export type OpenAIModel = 
  | 'gpt-4'
  | 'gpt-4-turbo'
  | 'gpt-4-turbo-preview'
  | 'gpt-3.5-turbo'
  | 'gpt-3.5-turbo-16k';

/**
 * OpenAI voice options for TTS
 */
export type OpenAIVoice = 
  | 'alloy'
  | 'echo'
  | 'fable'
  | 'onyx'
  | 'nova'
  | 'shimmer';

/**
 * OpenAI audio formats
 */
export type OpenAIAudioFormat = 
  | 'mp3'
  | 'opus'
  | 'aac'
  | 'flac'
  | 'wav'
  | 'pcm';

/**
 * OpenAI message role
 */
export type OpenAIMessageRole = 
  | 'system'
  | 'user'
  | 'assistant'
  | 'function'
  | 'tool';

/**
 * OpenAI function call
 */
export interface OpenAIFunctionCall {
  name: string;
  arguments: string;
  required?: string[];
}

/**
 * OpenAI tool call
 */
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: OpenAIFunctionCall;
}

/**
 * OpenAI chat message
 */
export interface OpenAIChatMessage {
  role: OpenAIMessageRole;
  content: string | null;
  name?: string;
  function_call?: OpenAIFunctionCall;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/**
 * OpenAI function definition
 */
export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * OpenAI tool definition
 */
export interface OpenAITool {
  type: 'function';
  function: (...args: unknown[]) => unknown;
}

/**
 * OpenAI chat completion request
 */
export interface OpenAIChatCompletionRequest {
  model: OpenAIModel;
  messages: OpenAIChatMessage[];
  functions?: OpenAIFunction[];
  function_call?: 'auto' | 'none' | { name: string };
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
}

/**
 * OpenAI chat completion choice
 */
export interface OpenAIChatCompletionChoice {
  index: number;
  message: OpenAIChatMessage;
  finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter';
}

/**
 * OpenAI chat completion response
 */
export interface OpenAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
}

/**
 * OpenAI streaming response chunk
 */
export interface OpenAIChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<OpenAIChatMessage>;
    finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI TTS request
 */
export interface OpenAITTSRequest {
  model: 'tts-1' | 'tts-1-hd';
  input: string;
  voice: OpenAIVoice;
  response_format?: OpenAIAudioFormat;
  speed?: number;
}

/**
 * OpenAI STT request
 */
export interface OpenAISTTRequest {
  file: Blob | Buffer;
  model: 'whisper-1';
  language?: string;
  prompt?: string;
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;
}

/**
 * OpenAI STT response
 */
export interface OpenAISTTResponse {
  text: string;
  language?: string;
  duration?: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
  segments?: Array<{
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
    transient?: boolean;
  }>;
}

/**
 * OpenAI error response
 */
export interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

/**
 * OpenAI API configuration
 */
export interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  model?: OpenAIModel;
  temperature?: number;
  maxTokens?: number;
}

/**
 * OpenAI conversation context
 */
export interface OpenAIConversationContext {
  id: ID;
  messages: OpenAIChatMessage[];
  functions?: OpenAIFunction[];
  tools?: OpenAITool[];
  systemPrompt?: string;
  userContext?: Record<string, unknown>;
  created: Timestamp;
  updated: Timestamp;
  tokensUsed: number;
  maxTokens?: number;
}

/**
 * OpenAI realtime API types
 */
export interface OpenAIRealtimeConfig {
  model: 'gpt-4o-realtime-preview';
  voice: OpenAIVoice;
  inputAudioFormat?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  outputAudioFormat?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  vadThreshold?: number;
  vadSilenceDuration?: number;
  vadPrefixPadding?: number;
  vadSilencePadding?: number;
  instructions?: string;
  temperature?: number;
  maxOutputTokens?: number;
  tools?: OpenAITool[];
  toolChoice?: 'auto' | 'none' | 'required';
  modalities?: Array<'text' | 'audio'>;
}

/**
 * OpenAI realtime session
 */
export interface OpenAIRealtimeSession {
  id: string;
  object: 'realtime.session';
  model: string;
  modalities: Array<'text' | 'audio'>;
  instructions: string;
  voice: OpenAIVoice;
  inputAudioFormat: string;
  outputAudioFormat: string;
  inputAudioTranscription?: {
    model: string;
  };
  turnDetection?: {
    type: 'server_vad';
    threshold: number;
    prefixPaddingMs: number;
    silenceDurationMs: number;
  };
  tools: OpenAITool[];
  toolChoice: string;
  temperature: number;
  maxOutputTokens: number;
}

/**
 * OpenAI realtime event base
 */
export interface OpenAIRealtimeEventBase {
  event_id?: string;
  type: string;
}

/**
 * OpenAI realtime session update event
 */
export interface OpenAIRealtimeSessionUpdateEvent extends OpenAIRealtimeEventBase {
  type: 'session.update';
  session: Partial<OpenAIRealtimeSession>;
}

/**
 * OpenAI realtime input audio buffer append event
 */
export interface OpenAIRealtimeInputAudioBufferAppendEvent extends OpenAIRealtimeEventBase {
  type: 'input_audio_buffer.append';
  audio: string; // base64 encoded audio
}

/**
 * OpenAI realtime response create event
 */
export interface OpenAIRealtimeResponseCreateEvent extends OpenAIRealtimeEventBase {
  type: 'response.create';
  response?: {
    modalities?: Array<'text' | 'audio'>;
    instructions?: string;
    voice?: OpenAIVoice;
    outputAudioFormat?: string;
    tools?: OpenAITool[];
    toolChoice?: string;
    temperature?: number;
    maxOutputTokens?: number;
  };
}

/**
 * OpenAI realtime conversation item
 */
export interface OpenAIRealtimeConversationItem {
  id: string;
  object: 'realtime.item';
  type: 'message' | 'function_call' | 'function_call_output';
  status: 'completed' | 'in_progress' | 'incomplete';
  role: 'user' | 'assistant' | 'system';
  content?: Array<{
    type: 'input_text' | 'input_audio' | 'text' | 'audio';
    text?: string;
    audio?: string;
    transcript?: string;
  }>;
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
}

/**
 * OpenAI realtime response
 */
export interface OpenAIRealtimeResponse {
  id: string;
  object: 'realtime.response';
  status: 'in_progress' | 'completed' | 'cancelled' | 'failed' | 'incomplete';
  statusDetails?: {
    type: 'cancelled' | 'incomplete' | 'failed';
    reason?: string;
    error?: {
      type: string;
      code?: string;
      message: string;
      param?: string;
    };
  };
  output: OpenAIRealtimeConversationItem[];
  usage?: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    inputTokenDetails?: {
      cachedTokens: number;
      textTokens: number;
      audioTokens: number;
    };
    outputTokenDetails?: {
      textTokens: number;
      audioTokens: number;
    };
  };
}

/**
 * OpenAI client interface
 */
export interface OpenAIClient {
  // Chat completions
  createChatCompletion(request: OpenAIChatCompletionRequest): Promise<OpenAIChatCompletionResponse>;
  createChatCompletionStream(request: OpenAIChatCompletionRequest): AsyncIterableIterator<OpenAIChatCompletionChunk>;
  
  // Text-to-speech
  createSpeech(request: OpenAITTSRequest): Promise<ArrayBuffer>;
  
  // Speech-to-text
  createTranscription(request: OpenAISTTRequest): Promise<OpenAISTTResponse>;
  createTranslation(request: OpenAISTTRequest): Promise<OpenAISTTResponse>;
  
  // Realtime API
  createRealtimeSession(config: OpenAIRealtimeConfig): Promise<WebSocket>;
}

/**
 * OpenAI agent interface
 */
export interface OpenAIAgent {
  id: ID;
  name: string;
  description: string;
  instructions: string;
  model: OpenAIModel;
  tools: OpenAITool[];
  temperature: number;
  maxTokens: number;
  
  // Conversation management
  createConversation(systemPrompt?: string): Promise<OpenAIConversationContext>;
  sendMessage(conversationId: ID, message: string, context?: Record<string, unknown>): Promise<OpenAIChatMessage>;
  sendMessageStream(conversationId: ID, message: string, context?: Record<string, unknown>): AsyncIterableIterator<OpenAIChatCompletionChunk>;
  
  // Tool management
  registerTool(tool: OpenAITool): void;
  unregisterTool(name: string): void;
  executeTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  
  // Voice capabilities
  textToSpeech(text: string, voice?: OpenAIVoice): Promise<ArrayBuffer>;
  speechToText(audio: ArrayBuffer): Promise<string>;
  
  // Realtime capabilities
  createRealtimeSession(config?: Partial<OpenAIRealtimeConfig>): Promise<WebSocket>;
} 