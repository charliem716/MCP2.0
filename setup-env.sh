#!/bin/bash

# Setup environment files with clear separation of concerns
# - qsys-core.config.json: Q-SYS Core connection settings (primary)
# - .env: OpenAI API keys, environment settings, secrets

echo "🔧 Setting up environment configuration..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📋 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
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