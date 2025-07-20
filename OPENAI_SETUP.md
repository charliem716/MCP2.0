# OpenAI API Key Setup

## 🚀 **Quick Setup for Phase 3 (AI Integration)**

The `.env` file has been created and is ready for your OpenAI API key configuration.

---

## 📁 **CONFIGURATION SEPARATION (Important!)**

We use **separate files** for different configuration purposes:

| File | Purpose | Contains |
|------|---------|----------|
| **`qsys-core.config.json`** | Q-SYS Core connection | Host IP, port, credentials, connection settings |
| **`.env`** | Environment & secrets | OpenAI API key, environment variables, secrets |

**Benefits:**
- ✅ **No duplication** - Each setting has one source of truth
- ✅ **Clear separation** - Q-SYS vs AI vs environment settings
- ✅ **Better UX** - JSON is easier to edit than env vars
- ✅ **Better docs** - JSON file includes examples and comments

---

### **1. Get Your OpenAI API Key**

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in to your OpenAI account
3. Click **"Create new secret key"**
4. Copy the key (it starts with `sk-...`)
5. **Save it securely** - you won't be able to see it again!

### **2. Configure Your .env File**

Edit the `.env` file and update the OpenAI section:

```bash
# =============================================================================
# OpenAI Configuration
# =============================================================================
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_ORGANIZATION=org-your-org-id-here  # Optional
OPENAI_MODEL=gpt-4                        # or gpt-4-turbo, gpt-3.5-turbo
OPENAI_VOICE=nova                         # For voice synthesis (nova, alloy, echo, fable, onyx, shimmer)
```

### **3. Q-SYS Configuration (SEPARATE FILE)**

**⚠️ IMPORTANT:** Q-SYS settings are NOT in `.env` - they're in `qsys-core.config.json`!

This separation eliminates duplication and makes configuration clearer:

```json
// Edit qsys-core.config.json (NOT .env):
{
  "qsysCore": {
    "host": "192.168.50.150",
    "port": 443,
    "username": "",
    "password": ""
  }
}
```

### **4. Test Your Configuration**

After updating the `.env` file:

```bash
# Test the application starts without OpenAI errors
npm run dev

# The Q-SYS connection should work (OpenAI is optional for Phase 1)
npm run test:connection
```

### **5. OpenAI Models Recommended**

For voice-controlled Q-SYS automation:

| Model | Best For | Cost |
|-------|----------|------|
| **gpt-4-turbo** | Complex AV commands, reasoning | Higher |
| **gpt-4** | Reliable voice command processing | Medium |
| **gpt-3.5-turbo** | Basic commands, cost-effective | Lower |

### **6. Voice Options**

For text-to-speech responses:

| Voice | Characteristics |
|-------|----------------|
| **nova** | Clear, professional (recommended for AV) |
| **alloy** | Neutral, versatile |
| **echo** | Male, confident |
| **fable** | British accent, expressive |
| **onyx** | Deep, authoritative |
| **shimmer** | Soft, whispery |

---

## **🔒 Security Notes**

### **⚠️ IMPORTANT: Never Commit Your API Key**
- The `.env` file is in `.gitignore` 
- Never share your API key publicly
- Regenerate your key if accidentally exposed

### **💰 Cost Management**
- Monitor usage at [OpenAI Usage](https://platform.openai.com/usage)
- Set usage limits in your OpenAI account
- Start with gpt-3.5-turbo for testing

### **🧪 Testing Without OpenAI**
Phase 1 and 2 work without OpenAI API key:
- Q-SYS connection works independently
- MCP Server tools work without AI
- Only Phase 3 (voice AI) requires the API key

---

## **🎯 Phase Integration**

### **Phase 1 (Current)** ✅
- **Q-SYS Connection:** Works without OpenAI
- **Component Control:** Independent of AI
- **Real-time Events:** No AI required

### **Phase 2 (Next)** ⏳
- **MCP Server:** Works without OpenAI  
- **Tool Creation:** Independent control tools
- **Component Monitoring:** No AI required

### **Phase 3 (Future)** 🔮
- **Voice Processing:** **Requires OpenAI API key**
- **Natural Language:** Commands to Q-SYS actions
- **Conversational AI:** Smart AV assistant

---

## **🚀 Ready When You Are**

The system is designed to work progressively:
1. **Now:** Q-SYS control works (Phase 1 ✅)
2. **Soon:** MCP tools work (Phase 2)  
3. **Later:** Add OpenAI key for voice AI (Phase 3)

You can add the OpenAI API key anytime to unlock voice features! 🎙️ 