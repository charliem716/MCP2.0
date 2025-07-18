# MCP Voice/Text-Controlled Q-SYS Demo

AI-powered voice and text control for Q-SYS audio systems using OpenAI Agents SDK and Model Context Protocol.

## 🚀 Quick Start

### GitHub Repository Setup

To complete Phase 1.1 setup, create a GitHub repository:

1. Go to [GitHub](https://github.com) and create a new repository
2. Repository name: `mcp-voice-text-qsys` (recommended)
3. Description: `MCP Voice/Text-Controlled Q-SYS Demo - AI-powered voice and text control for Q-SYS audio systems`
4. Make it public or private as needed
5. **Do not** initialize with README, .gitignore, or license (we have these already)

6. After creating the repository, run these commands:
```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mcp-voice-text-qsys.git
git push -u origin main
```

### Development Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Build for production
npm run build
```

## 📋 Project Status

- **Phase 1.1**: Project Setup - ✅ **COMPLETE**
- **Phase 1.2**: Core Infrastructure - 🔄 **IN PROGRESS**
- **Phase 1.3**: QRWC Client - ⏳ **PENDING**

## 🛠️ Technology Stack

- **TypeScript 5.3.3** - Strict typing and modern JavaScript
- **OpenAI Agents SDK** - AI agent functionality
- **Model Context Protocol** - Structured AI communication
- **Winston** - Structured logging
- **Jest** - Testing framework
- **ESLint + Prettier** - Code quality and formatting

## 📁 Project Structure

```
src/
├── agent/              # OpenAI Agents SDK integration
├── mcp/                # MCP Server implementation
├── api/                # REST API server
├── web/                # Web UI components
└── shared/             # Shared utilities and types
```

## 🔧 Configuration

Copy `.env.example` to `.env` and configure your environment variables:

```bash
cp .env.example .env
```

## 📖 Documentation

- [Implementation Plan](implementation.md)
- [Project Checklist](checklist.md)
- [Project Rules](CURSOR.md)

## 📄 License

MIT License - see LICENSE file for details.

---

*Generated as part of Phase 1.1 Project Setup* 