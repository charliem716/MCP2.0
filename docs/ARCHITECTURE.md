# MCP Voice/Text-Controlled Q-SYS Demo - Implementation Plan

## Executive Summary

This document provides a detailed, phased implementation plan for building a voice and
text-controlled Q-SYS demonstration system. The architecture emphasizes modularity, clean code
practices, and scalability while maintaining a maximum file size of 500 lines per module.

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web UI (Browser)                          │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Alpine.js UI   │  │ WebRTC Audio │  │  EventSource     │  │
│  │  Components     │  │   Handler    │  │   (SSE Client)   │  │
│  └────────┬────────┘  └──────┬───────┘  └────────┬─────────┘  │
└───────────┼──────────────────┼───────────────────┼─────────────┘
            │                  │                    │
            ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REST API (Port 443)                           │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Chat Routes   │  │ Voice Routes │  │   SSE Routes     │  │
│  └────────┬────────┘  └──────┬───────┘  └────────┬─────────┘  │
└───────────┼──────────────────┼───────────────────┼─────────────┘
            │                  │                    │
            ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              Voice/Text Agent (OpenAI Agents SDK)                │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Agent Manager  │  │ Tool Registry│  │  Conversation    │  │
│  │                 │  │              │  │    History       │  │
│  └────────┬────────┘  └──────┬───────┘  └────────┬─────────┘  │
└───────────┼──────────────────┼───────────────────┼─────────────┘
            │                  │                    │
            ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                 MCP Server (stdio JSON-RPC)                      │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  QRWC Client    │  │ MCP Protocol │  │  State Manager   │  │
│  │  (WebSocket)    │  │   Handler    │  │                  │  │
│  └────────┬────────┘  └──────────────┘  └──────────────────┘  │
└───────────┼─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Q-SYS NV-32-H Core                             │
│                    (Port 443 - QRWC)                             │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
mcp-voice-text-qsys/
├── src/
│   ├── agent/                    # OpenAI Agents SDK integration
│   │   ├── index.ts             # Agent initialization (< 200 lines)
│   │   ├── tools/               # Q-SYS control tools
│   │   │   ├── index.ts         # Tool registry (< 150 lines)
│   │   │   ├── components.ts    # Component tools (< 300 lines)
│   │   │   ├── controls.ts      # Control tools (< 300 lines)
│   │   │   ├── mixer.ts         # Mixer tools (< 300 lines)
│   │   │   └── status.ts        # Status tools (< 200 lines)
│   │   ├── voice/               # Voice processing
│   │   │   ├── index.ts         # Voice handler (< 200 lines)
│   │   │   └── stream.ts        # Audio streaming (< 300 lines)
│   │   └── conversation/        # Conversation management
│   │       ├── index.ts         # History manager (< 200 lines)
│   │       └── types.ts         # Type definitions (< 100 lines)
│   │
│   ├── mcp/                     # MCP Server implementation
│   │   ├── server.ts            # MCP server core (< 300 lines)
│   │   ├── transport.ts         # stdio transport (< 200 lines)
│   │   ├── handlers/            # MCP method handlers
│   │   │   ├── index.ts         # Handler registry (< 150 lines)
│   │   │   ├── tools.ts         # Tool handlers (< 300 lines)
│   │   │   └── resources.ts     # Resource handlers (< 200 lines)
│   │   └── qrwc/                # Q-SYS integration
│   │       ├── client.ts        # WebSocket client (< 300 lines)
│   │       ├── commands.ts      # QRC commands (< 400 lines)
│   │       └── types.ts         # QRC types (< 200 lines)
│   │
│   ├── api/                     # REST API server
│   │   ├── server.ts            # Express setup (< 200 lines)
│   │   ├── middleware/          # Express middleware
│   │   │   ├── auth.ts          # Authentication (< 150 lines)
│   │   │   ├── cors.ts          # CORS config (< 100 lines)
│   │   │   └── error.ts         # Error handling (< 150 lines)
│   │   ├── routes/              # API routes
│   │   │   ├── chat.ts          # Chat endpoints (< 200 lines)
│   │   │   ├── voice.ts         # Voice endpoints (< 200 lines)
│   │   │   ├── history.ts       # History endpoints (< 150 lines)
│   │   │   └── sse.ts           # SSE endpoints (< 200 lines)
│   │   └── websocket/           # WebSocket handlers
│   │       └── voice.ts         # Voice WebSocket (< 300 lines)
│   │
│   ├── web/                     # Web UI
│   │   ├── index.html           # Main HTML (< 200 lines)
│   │   ├── js/                  # JavaScript modules
│   │   │   ├── app.js           # Alpine.js app (< 300 lines)
│   │   │   ├── components/      # UI components
│   │   │   │   ├── status.js    # Status component (< 150 lines)
│   │   │   │   ├── conversation.js # Chat UI (< 200 lines)
│   │   │   │   └── controls.js  # Control panel (< 200 lines)
│   │   │   ├── services/        # API services
│   │   │   │   ├── api.js       # API client (< 200 lines)
│   │   │   │   ├── voice.js     # Voice service (< 300 lines)
│   │   │   │   └── sse.js       # SSE service (< 150 lines)
│   │   │   └── utils/           # Utilities
│   │   │       └── webrtc.js    # WebRTC helpers (< 200 lines)
│   │   └── css/                 # Styles
│   │       └── app.css          # Tailwind styles (< 300 lines)
│   │
│   ├── shared/                  # Shared code
│   │   ├── types/               # TypeScript types
│   │   │   ├── agent.ts         # Agent types (< 150 lines)
│   │   │   ├── api.ts           # API types (< 200 lines)
│   │   │   └── qsys.ts          # Q-SYS types (< 200 lines)
│   │   └── utils/               # Shared utilities
│   │       ├── logger.ts        # Logging utility (< 150 lines)
│   │       └── validation.ts    # Input validation (< 200 lines)
│   │
│   └── index.ts                 # Main entry point (< 100 lines)
│
├── tests/                       # Test files
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   └── e2e/                     # End-to-end tests
│
├── docs/                        # Documentation
│   ├── api/                     # API documentation
│   ├── deployment/              # Deployment guides
│   └── development/             # Development guides
│
├── scripts/                     # Build and deployment scripts
├── .github/                     # GitHub Actions workflows
├── package.json                 # Node.js dependencies
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── .env.example                # Environment variables template
└── README.md                   # Project documentation
```

## Technology Stack

### Core Technologies

1. **TypeScript 5.x**
   - Strict mode enabled
   - ES2022 target
   - Module resolution: Node16

2. **Node.js 20.x LTS**
   - Native ESM support
   - Built-in WebSocket support

3. **OpenAI Agents SDK**
   - Latest version with RealtimeAgent support
   - Tool-based architecture

4. **MCP SDK**
   - @modelcontextprotocol/sdk
   - stdio transport for agent communication

### Backend Technologies

1. **Express.js 4.x**
   - Minimal REST API framework
   - Middleware architecture

2. **WebSocket (ws)**
   - For QRWC communication
   - For voice streaming

3. **Zod**
   - Runtime type validation
   - Schema definition

### Frontend Technologies

1. **Alpine.js 3.x**
   - Lightweight reactive framework
   - Component-based architecture

2. **Tailwind CSS 3.x**
   - Utility-first CSS
   - Mobile-responsive design

3. **WebRTC**
   - getUserMedia API
   - Audio streaming

## Critical SDK Constraints

### ⚠️ MANDATORY: Use Official SDK Only

**DO NOT ATTEMPT**:
- Using `sendRawCommand()` - it is NON-FUNCTIONAL (see SDK-LIMITATIONS.md)
- Bypassing SDK for any Q-SYS operations
- Direct WebSocket connections to Q-SYS Core
- Implementing ramp/fade functionality until SDK supports it

**KNOWN LIMITATIONS**:
1. **Ramp parameter does not work** - SDK's control.update() only accepts value
2. **sendRawCommand is broken** - Timeouts on all commands due to protocol mismatch
3. **Must use SDK methods exclusively** - No workarounds exist

See `docs/SDK-LIMITATIONS.md` and `bugs/BULLETIN-201.md` for full details.

## Implementation Phases

### Phase 1: Foundation (Week 1)

#### 1.1 Project Setup

- Initialize TypeScript project with strict configuration
- Set up ESLint with recommended rules
- Configure Prettier for code formatting
- Set up Jest for testing
- Create GitHub repository with CI/CD

#### 1.2 Core Infrastructure

- Implement logger utility with Winston
- Set up environment configuration
- Create TypeScript type definitions
- Implement error handling framework

#### 1.3 QRWC Client

- WebSocket connection management
- QRC command implementation
- Connection retry logic
- Event-based architecture

**Deliverables:**

- Working project structure
- QRWC client that can connect to Q-SYS Core
- Basic logging and error handling

### Phase 2: MCP Server (Week 1)

#### 2.1 MCP Protocol Implementation

- stdio transport setup
- JSON-RPC 2.0 handler
- Method registry pattern
- Error response handling

#### 2.2 Q-SYS Tools

- list_components tool
- list_controls tool
- get_control_values tool
- set_control_values tool
- query_core_status tool

#### 2.3 State Management

- Control state caching
- Change group implementation
- State synchronization

**Deliverables:**

- Functional MCP server
- Q-SYS control capabilities
- State management system

### Phase 3: OpenAI Agent Integration (Week 2)

#### 3.1 Agent Setup

- Initialize OpenAI Agents SDK
- Configure agent with Q-SYS instructions
- Tool registration system
- Context management

#### 3.2 Voice Integration

- RealtimeAgent configuration
- WebRTC audio capture
- Voice activity detection
- Audio streaming pipeline

#### 3.3 Text Processing

- Text command parser
- Intent recognition
- Response formatting
- Error recovery

**Deliverables:**

- Working agent that understands Q-SYS commands
- Voice input processing
- Text command processing

### Phase 4: REST API & Web UI (Week 2)

#### 4.1 REST API Server

- Express.js setup with TypeScript
- Authentication middleware
- CORS configuration
- Route implementation

#### 4.2 API Endpoints

- POST /api/chat/send
- GET /api/chat/history
- WebSocket /api/voice
- SSE /api/events

#### 4.3 Web UI Components

- Status bar component
- Conversation history
- Control panel
- Voice/text input

**Deliverables:**

- Complete REST API
- Functional web UI
- Real-time updates via SSE

### Phase 5: Integration & Testing (Week 3)

#### 5.1 System Integration

- End-to-end connectivity
- Performance optimization
- Error handling refinement
- Memory leak prevention

#### 5.2 Testing Suite

- Unit tests for all modules
- Integration tests for API
- E2E tests for user flows
- Load testing

#### 5.3 Documentation

- API documentation with OpenAPI
- Deployment guide
- User manual
- Developer documentation

**Deliverables:**

- Fully integrated system
- Comprehensive test suite
- Complete documentation

## Module Design Patterns

### 1. Service Pattern

```typescript
// services/base.service.ts
export abstract class BaseService {
  protected logger: Logger;

  constructor(protected config: ServiceConfig) {
    this.logger = createLogger(this.constructor.name);
  }

  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;
}
```

### 2. Command Pattern for Tools

```typescript
// agent/tools/base.tool.ts
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: z.ZodSchema;

  abstract execute(params: unknown): Promise<ToolResult>;
}
```

### 3. Event-Driven Architecture

```typescript
// shared/events/emitter.ts
export class TypedEventEmitter<T> extends EventEmitter {
  emit<K extends keyof T>(event: K, ...args: T[K]): boolean;
  on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): this;
}
```

### 4. Repository Pattern for State

```typescript
// mcp/state/repository.ts
export interface StateRepository<T> {
  get(id: string): Promise<T | null>;
  set(id: string, value: T): Promise<void>;
  delete(id: string): Promise<boolean>;
  list(): Promise<string[]>;
}
```

## Security Considerations

1. **Authentication**
   - JWT tokens for API access
   - Session management
   - Rate limiting

2. **Input Validation**
   - Zod schemas for all inputs
   - SQL injection prevention
   - XSS protection

3. **Network Security**
   - HTTPS only
   - CORS configuration
   - CSP headers

## Performance Optimization

1. **Caching Strategy**
   - In-memory cache for control states
   - LRU eviction policy
   - Cache invalidation on updates

2. **Connection Pooling**
   - WebSocket connection reuse
   - HTTP keep-alive
   - Database connection pooling

3. **Resource Management**
   - Memory usage monitoring
   - Graceful shutdown handlers
   - Resource cleanup

## Future Expansion Considerations

### 1. Multi-Core Support

- Abstract core connection management
- Load balancing between cores
- Failover mechanisms

### 2. Plugin Architecture

```typescript
// plugin/interface.ts
export interface Plugin {
  name: string;
  version: string;
  initialize(context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
}
```

### 3. Advanced UI Features

- Drag-and-drop control arrangement
- Custom control widgets
- Real-time visualization

### 4. Extended Protocol Support

- OSC integration
- MIDI control
- DMX lighting control

### 5. Cloud Integration

- Remote access capabilities
- Cloud-based logging
- Analytics dashboard

## Development Best Practices

1. **Code Style**
   - Use functional programming where appropriate
   - Prefer composition over inheritance
   - Keep functions pure when possible
   - Use dependency injection

2. **Testing Strategy**
   - TDD for business logic
   - Integration tests for APIs
   - Snapshot tests for UI components
   - Property-based testing for algorithms

3. **Documentation**
   - JSDoc for all public APIs
   - README for each module
   - Architecture decision records
   - API examples

4. **Version Control**
   - Feature branch workflow
   - Semantic versioning
   - Automated changelog generation
   - Protected main branch

## Deployment Architecture

### 1. Docker Containerization

```dockerfile
# Multi-stage build for optimization
FROM node:20-alpine AS builder
# Build stage...

FROM node:20-alpine AS runtime
# Runtime stage...
```

### 2. Environment Configuration

- Development: Local with hot reload
- Staging: Docker Compose
- Production: Kubernetes ready

### 3. Monitoring & Logging

- Structured logging with Winston
- Metrics collection with Prometheus
- Distributed tracing ready
- Health check endpoints

## Success Metrics

1. **Performance**
   - < 100ms API response time
   - < 200ms voice command latency
   - < 50MB memory footprint

2. **Reliability**
   - 99.9% uptime
   - Automatic reconnection
   - Graceful degradation

3. **Usability**
   - < 5 clicks to complete any task
   - Intuitive voice commands
   - Clear error messages

## Risk Mitigation

1. **Technical Risks**
   - Fallback to text if voice fails
   - Offline mode capabilities
   - Backward compatibility

2. **Schedule Risks**
   - MVP first approach
   - Parallel development tracks
   - Buffer time for integration

## Q-SYS Integration Details

### QRWC Connection Architecture

```typescript
// mcp/qrwc/client.ts
export class QRWCClient extends TypedEventEmitter<QRWCEvents> {
  private ws?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private changeGroups = new Map<string, ChangeGroup>();

  constructor(
    private config: QRWCConfig,
    private logger: Logger
  ) {
    super();
  }

  async connect(): Promise<void> {
    const url = `ws://${this.config.host}:${this.config.port || 443}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', data => this.handleMessage(data));
    this.ws.on('close', () => this.handleClose());
    this.ws.on('error', err => this.handleError(err));
  }
}
```

### MCP Tool Implementation Examples

```typescript
// agent/tools/mixer.ts
export class SetMixerGainTool extends BaseTool {
  name = 'set_mixer_gain';
  description = 'Set the gain level for a mixer input or output';

  parameters = z.object({
    mixer: z.string().describe('Name of the mixer'),
    channel: z.string().describe('Input or output channel (e.g., "1", "1-4", "*")'),
    type: z.enum(['input', 'output']).describe('Channel type'),
    gain: z.number().min(-100).max(20).describe('Gain in dB'),
    ramp: z.number().optional().describe('Ramp time in seconds'),
  });

  async execute(params: z.infer<typeof this.parameters>): Promise<ToolResult> {
    const command = params.type === 'input' ? 'Mixer.SetInputGain' : 'Mixer.SetOutputGain';

    const result = await this.qrwc.sendCommand({
      method: command,
      params: {
        Name: params.mixer,
        [params.type === 'input' ? 'Inputs' : 'Outputs']: params.channel,
        Value: params.gain,
        ...(params.ramp && { Ramp: params.ramp }),
      },
    });

    return {
      success: true,
      message: `Set ${params.type} ${params.channel} to ${params.gain}dB`,
    };
  }
}
```

### Voice Agent Configuration

```typescript
// agent/voice/index.ts
export class VoiceAgentManager {
  private agent: RealtimeAgent;

  async initialize(): Promise<void> {
    this.agent = new RealtimeAgent({
      name: 'Q-SYS Control Assistant',
      instructions: `You are a helpful Q-SYS control assistant. You can:
        - Control mixer levels and routing
        - Manage audio components (gains, mutes, delays)
        - Query system status and component states
        - Execute snapshots and presets
        
        Always confirm actions before making changes.
        Speak naturally and provide clear feedback.`,
      tools: await this.loadTools(),
      voice: 'nova', // OpenAI voice model
    });
  }
}
```

## Concrete Implementation Examples

### 1. WebRTC Audio Capture Module

```javascript
// web/js/utils/webrtc.js
export class WebRTCAudioCapture {
  constructor() {
    this.stream = null;
    this.audioContext = null;
    this.processor = null;
  }

  async initialize() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.stream);

      // Create a script processor for real-time processing
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      return true;
    } catch (error) {
      console.error('Failed to initialize audio capture:', error);
      return false;
    }
  }

  onAudioData(callback) {
    if (!this.processor) return;

    this.processor.onaudioprocess = event => {
      const inputData = event.inputBuffer.getChannelData(0);
      const pcm16 = this.convertFloat32ToPCM16(inputData);
      callback(pcm16);
    };
  }

  convertFloat32ToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }
}
```

### 2. Alpine.js Conversation Component

```javascript
// web/js/components/conversation.js
export default () => ({
  messages: [],
  inputText: '',
  isRecording: false,
  audioCapture: null,

  async init() {
    // Subscribe to SSE for real-time updates
    this.$watch('messages', () => {
      this.$nextTick(() => this.scrollToBottom());
    });

    // Initialize audio capture
    this.audioCapture = new WebRTCAudioCapture();

    // Load conversation history
    await this.loadHistory();
  },

  async loadHistory() {
    try {
      const response = await fetch('/api/chat/history');
      const data = await response.json();
      this.messages = data.messages;
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  },

  async sendMessage() {
    if (!this.inputText.trim()) return;

    const message = {
      role: 'user',
      text: this.inputText,
      ts: Date.now(),
    };

    this.messages.push(message);
    this.inputText = '';

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.text }),
      });

      if (!response.ok) throw new Error('Failed to send message');
    } catch (error) {
      console.error('Send message error:', error);
      this.showError('Failed to send message');
    }
  },

  async toggleRecording() {
    if (!this.isRecording) {
      const success = await this.audioCapture.initialize();
      if (!success) {
        this.showError('Failed to access microphone');
        return;
      }

      this.isRecording = true;
      this.startVoiceStream();
    } else {
      this.isRecording = false;
      this.stopVoiceStream();
    }
  },

  scrollToBottom() {
    const container = this.$refs.messagesContainer;
    container.scrollTop = container.scrollHeight;
  },
});
```

### 3. MCP Protocol Handler

```typescript
// mcp/handlers/tools.ts
export class ToolHandler implements MethodHandler {
  constructor(
    private toolRegistry: ToolRegistry,
    private qrwcClient: QRWCClient
  ) {}

  async handle(method: string, params: any): Promise<any> {
    switch (method) {
      case 'tools/list':
        return this.listTools();

      case 'tools/call':
        return this.callTool(params);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private async listTools(): Promise<ToolListResponse> {
    const tools = this.toolRegistry.getAllTools();

    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.parameters),
      })),
    };
  }

  private async callTool(params: ToolCallParams): Promise<ToolCallResponse> {
    const tool = this.toolRegistry.getTool(params.name);
    if (!tool) {
      throw new Error(`Tool not found: ${params.name}`);
    }

    // Validate parameters
    const validatedParams = tool.parameters.parse(params.arguments);

    // Execute tool
    const result = await tool.execute(validatedParams);

    return {
      content: [
        {
          type: 'text',
          text: result.message,
        },
      ],
    };
  }
}
```

## Development Timeline

### Week 1: Foundation & Core Infrastructure

| Day | Tasks                                                                      | Deliverables                    |
| --- | -------------------------------------------------------------------------- | ------------------------------- |
| 1   | • Project setup<br>• TypeScript configuration<br>• Development environment | Working development environment |
| 2   | • Logger implementation<br>• Error handling framework<br>• Basic types     | Core utilities ready            |
| 3   | • QRWC WebSocket client<br>• Connection management<br>• Event handling     | Can connect to Q-SYS            |
| 4   | • QRC command implementation<br>• State management basics                  | Can send/receive QRC commands   |
| 5   | • Testing framework<br>• CI/CD pipeline<br>• Documentation structure       | Automated testing ready         |

### Week 2: MCP Server & Agent Integration

| Day | Tasks                                                               | Deliverables             |
| --- | ------------------------------------------------------------------- | ------------------------ |
| 6   | • MCP server setup<br>• stdio transport<br>• JSON-RPC handler       | Basic MCP server running |
| 7   | • Tool implementation<br>• State synchronization<br>• Change groups | Q-SYS tools working      |
| 8   | • OpenAI Agent setup<br>• Tool registration<br>• Basic instructions | Text commands working    |
| 9   | • Voice integration<br>• RealtimeAgent config<br>• Audio streaming  | Voice input working      |
| 10  | • Conversation history<br>• Context management<br>• Error recovery  | Complete agent system    |

### Week 3: API, UI & Integration

| Day | Tasks                                                               | Deliverables         |
| --- | ------------------------------------------------------------------- | -------------------- |
| 11  | • Express.js setup<br>• REST API routes<br>• WebSocket handlers     | API server running   |
| 12  | • Web UI structure<br>• Alpine.js components<br>• Tailwind styling  | Basic UI working     |
| 13  | • WebRTC implementation<br>• SSE integration<br>• Real-time updates | Complete UI features |
| 14  | • End-to-end testing<br>• Performance optimization<br>• Bug fixes   | Integrated system    |
| 15  | • Documentation<br>• Deployment guide<br>• Demo preparation         | Ready for demo       |

## Testing Strategy

### Unit Test Example

```typescript
// tests/unit/qrwc/commands.test.ts
describe('QRWCCommands', () => {
  let commands: QRWCCommands;
  let mockClient: jest.Mocked<QRWCClient>;

  beforeEach(() => {
    mockClient = createMockQRWCClient();
    commands = new QRWCCommands(mockClient);
  });

  describe('setControlValue', () => {
    it('should send correct command for simple control', async () => {
      await commands.setControlValue('MainGain', -10);

      expect(mockClient.sendCommand).toHaveBeenCalledWith({
        method: 'Control.Set',
        params: {
          Name: 'MainGain',
          Value: -10,
        },
      });
    });

    it('should handle ramp time parameter', async () => {
      await commands.setControlValue('MainGain', -10, { ramp: 2.5 });

      expect(mockClient.sendCommand).toHaveBeenCalledWith({
        method: 'Control.Set',
        params: {
          Name: 'MainGain',
          Value: -10,
          Ramp: 2.5,
        },
      });
    });
  });
});
```

### Integration Test Example

```typescript
// tests/integration/api/chat.test.ts
describe('Chat API', () => {
  let app: Application;
  let agent: MockAgent;

  beforeAll(async () => {
    agent = new MockAgent();
    app = await createTestApp({ agent });
  });

  describe('POST /api/chat/send', () => {
    it('should process text message and return response', async () => {
      const response = await request(app)
        .post('/api/chat/send')
        .send({ message: 'Set main volume to -10dB' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        response: expect.stringContaining('volume set to -10dB'),
      });

      expect(agent.processMessage).toHaveBeenCalledWith('Set main volume to -10dB');
    });
  });
});
```

## Monitoring and Observability

### Structured Logging

```typescript
// shared/utils/logger.ts
export const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcp-qsys' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

// Usage example
logger.info('QRC command executed', {
  command: 'Control.Set',
  control: 'MainGain',
  value: -10,
  duration: 45, // ms
});
```

### Health Check Endpoints

```typescript
// api/routes/health.ts
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      qsys: qrwcClient.isConnected() ? 'connected' : 'disconnected',
      agent: agentManager.isReady() ? 'ready' : 'initializing',
      memory: process.memoryUsage(),
    },
  });
});

router.get('/health/detailed', async (req, res) => {
  const checks = await Promise.all([
    checkQSYSConnection(),
    checkAgentStatus(),
    checkDatabaseConnection(),
  ]);

  res.json({
    status: checks.every(c => c.healthy) ? 'healthy' : 'unhealthy',
    checks: checks.reduce((acc, check) => {
      acc[check.name] = {
        healthy: check.healthy,
        message: check.message,
        latency: check.latency,
      };
      return acc;
    }, {}),
  });
});
```

## Configuration Management

### Environment Variables

```bash
# .env.example
# Q-SYS Configuration
QSYS_HOST=your-qsys-core-ip
QSYS_PORT=443
QSYS_USERNAME=admin
QSYS_PASSWORD=admin

# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_ORGANIZATION=org-...

# Server Configuration
PORT=443
NODE_ENV=production
LOG_LEVEL=info

# Security
JWT_SECRET=your-secret-key
SESSION_SECRET=your-session-secret

# Feature Flags
ENABLE_VOICE=true
ENABLE_HISTORY_PERSISTENCE=true
MAX_HISTORY_LENGTH=1000
```

### Configuration Schema

```typescript
// shared/config/schema.ts
export const configSchema = z.object({
  qsys: z.object({
    host: z.string().ip(),
    port: z.number().default(443),
    username: z.string().optional(),
    password: z.string().optional(),
    reconnectInterval: z.number().default(5000),
    heartbeatInterval: z.number().default(30000),
  }),

  openai: z.object({
    apiKey: z.string(),
    organization: z.string().optional(),
    model: z.string().default('gpt-4'),
    voice: z.string().default('nova'),
  }),

  server: z.object({
    port: z.number().default(443),
    corsOrigins: z.array(z.string()).default(['*']),
    maxRequestSize: z.string().default('10mb'),
    rateLimit: z.object({
      windowMs: z.number().default(60000),
      max: z.number().default(100),
    }),
  }),

  features: z.object({
    voice: z.boolean().default(true),
    historyPersistence: z.boolean().default(true),
    maxHistoryLength: z.number().default(1000),
  }),
});

export type Config = z.infer<typeof configSchema>;
```

This comprehensive implementation plan provides a clear roadmap for building the MCP
Voice/Text-Controlled Q-SYS Demo with modern, scalable architecture and best practices throughout.
