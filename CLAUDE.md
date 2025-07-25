# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build and Run
```bash
# Development mode with auto-reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run production build
npm start

# Clean build artifacts
npm run clean
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Test Q-SYS connection (requires configured Q-SYS Core)
npm run test:connection

# Test component control
node tests/integration/qsys/test-component-control.mjs
```

### Code Quality
```bash
# Run ESLint
npm run lint

# Run ESLint with auto-fix
npm run lint:fix

# Check TypeScript types
npm run type-check

# Format code with Prettier
npm run format

# Check formatting
npm run format:check
```

## High-Level Architecture

This is an MCP (Model Context Protocol) server that provides AI-powered voice and text control for Q-SYS audio/video systems. The architecture consists of several interconnected layers:

### Core Components

1. **MCP Server Layer** (`src/mcp/`)
   - Implements Model Context Protocol for AI agent integration
   - Provides tools for Q-SYS control (component discovery, control manipulation, status monitoring)
   - Manages state with LRU cache, persistence, and synchronization
   - Entry point: `src/index.ts` starts the MCP server with stdio transport

2. **Q-SYS Integration Layer** (`src/qrwc/`)
   - Uses official `@q-sys/qrwc` SDK for secure WebSocket connections
   - Handles real-time communication with Q-SYS Core on port 443 (WSS)
   - Manages component discovery, control changes, and event subscriptions
   - Critical: Q-SYS requires WSS (secure WebSocket), not regular WS

3. **State Management** (`src/mcp/state/`)
   - **LRU Cache**: Efficient memory management for component states
   - **Persistence**: File-based state storage for recovery
   - **Change Group Manager**: Batches multiple control changes
   - **Synchronizer**: Keeps MCP state in sync with Q-SYS Core
   - **Repository**: Central state storage with event emission

4. **API Layer** (`src/api/`)
   - REST API endpoints for web UI and external integrations
   - WebSocket handlers for real-time updates
   - Express middleware for authentication and error handling

5. **Agent Integration** (`src/agent/`)
   - OpenAI Agents SDK integration for voice processing
   - Conversation management and context tracking
   - Tool definitions for natural language Q-SYS control

### Key Design Patterns

- **Event-Driven Architecture**: Components communicate via events for loose coupling
- **Adapter Pattern**: QRWC adapter abstracts the official SDK for easier testing
- **Repository Pattern**: Centralized state management with clear interfaces
- **Error Boundaries**: Comprehensive error handling with custom error classes
- **Type Safety**: Strict TypeScript throughout with no `any` types

### Configuration

The system uses multiple configuration sources:
- `qsys-core.config.json`: Q-SYS Core connection settings (IP, port, credentials)
- `.env`: Environment variables (OpenAI API key, log levels)
- Both files can be set up using `./setup-env.sh`

### Current Status

- **Phase 1 Complete**: Q-SYS QRWC integration fully functional
- Successfully connects to Q-SYS Cores with 42+ components
- MCP server implementation ready for AI agent connections
- Currently on `bug/001-fix` branch addressing several issues

### Important Notes

1. **Complete phases fully**: Follow the rule in `CURSOR.md` - complete each phase to 100% before moving to the next
2. **Q-SYS requires WSS**: Always use secure WebSocket connections with `rejectUnauthorized: false` for self-signed certificates
3. **Test connections first**: Use `npm run test:connection` before running the main application
4. **Structured logging**: Use Winston logger with appropriate metadata for debugging
5. **Type safety**: Maintain strict TypeScript standards - no `any` types or type assertions without validation

### MCP Servers Available

This project has access to the following MCP (Model Context Protocol) servers:

1. **context7** - Memory and context management server
   - Used to verify code patterns are up to date across the codebase
   - Helps maintain consistency with established patterns and conventions
   - Provides persistent memory for tracking implementation decisions

2. **playwright** - Browser automation server
   - Enables browser operations for testing web interfaces
   - Can be used to test the web UI components of the Q-SYS control system
   - Useful for automated testing of browser-based control interfaces