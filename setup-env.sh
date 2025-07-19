#!/bin/bash

# Setup environment files with clear separation of concerns
# - qsys-core.config.json: Q-SYS Core connection settings (primary)
# - .env: OpenAI API keys, environment settings, secrets

echo "🔧 Setting up environment configuration..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📋 Creating .env file (OpenAI & environment settings only)..."
    cat > .env << 'EOF'
# =============================================================================
# MCP Voice/Text-Controlled Q-SYS Demo - Environment Variables
# =============================================================================
# This file contains ONLY environment-specific and secret configuration
# Q-SYS Core settings are in qsys-core.config.json (NO DUPLICATION!)

# Node.js Environment
NODE_ENV=development
PORT=443
LOG_LEVEL=info

# =============================================================================
# Q-SYS Configuration - MOVED TO qsys-core.config.json
# =============================================================================
# ❌ Q-SYS settings are NOT in this file - they're in qsys-core.config.json
# ✅ This eliminates duplication and confusion
# 
# For Q-SYS Core IP, port, credentials, connection settings:
# → Edit qsys-core.config.json instead!

# =============================================================================
# OpenAI Configuration (Phase 3 - AI Integration)
# =============================================================================
# Get your API key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_ORGANIZATION=org-your-org-id-here
OPENAI_MODEL=gpt-4
OPENAI_VOICE=nova

# =============================================================================
# Security Configuration
# =============================================================================
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-12345678
SESSION_SECRET=your-super-secret-session-key-change-this-in-production-12345678
CORS_ORIGIN=http://localhost:3000

# =============================================================================
# Rate Limiting
# =============================================================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# =============================================================================
# Feature Flags
# =============================================================================
VERBOSE_LOGGING=false
ENABLE_SWAGGER=true
ENABLE_METRICS=true
ENABLE_HEALTH_CHECK=true
EOF
    echo "✅ .env file created (OpenAI & environment settings only)"
else
    echo "📋 .env file already exists"
fi

# Display configuration separation
echo ""
echo "📁 CONFIGURATION SEPARATION:"
echo "   📄 qsys-core.config.json  → Q-SYS Core settings (IP, port, credentials)"
echo "   📄 .env                   → OpenAI API key, environment variables"
echo ""

# Check Q-SYS JSON config
if [ -f "qsys-core.config.json" ]; then
    echo "✅ qsys-core.config.json exists with Q-SYS Core settings"
    CURRENT_HOST=$(grep '"host"' qsys-core.config.json | sed 's/.*: *"\([^"]*\)".*/\1/')
    echo "   🎯 Current Q-SYS Host: $CURRENT_HOST"
else
    echo "❌ qsys-core.config.json not found!"
fi

echo ""
echo "📝 NEXT STEPS:"
echo "   1. 🎛️ Q-SYS Core settings:"
echo "      → Edit qsys-core.config.json (NOT .env)"
echo "      → Update host IP, credentials, connection settings"
echo ""
echo "   2. 🤖 OpenAI API setup:"
echo "      → Edit .env file"
echo "      → Add: OPENAI_API_KEY=sk-your-actual-key-here"
echo ""
echo "   3. 🧪 Test the setup:"
echo "      → npm run dev"
echo "      → node test-connection.mjs"
echo ""
echo "📖 See OPENAI_SETUP.md for detailed OpenAI configuration!"
echo "📖 See QRWC_SETUP_GUIDE.md for Q-SYS Core configuration!"

# Make the script executable
chmod +x setup-env.sh 