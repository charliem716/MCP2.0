# Q-SYS QRWC Setup Guide

_Based on Official Q-SYS Documentation_

## **🚨 CRITICAL Q-SYS Core Requirements**

Before the application can connect to your Q-SYS Core, you **MUST** configure the following in
Q-SYS:

### **1. Enable WebSocket Capability** ⚡

**In Q-SYS Core Manager:**

1. Open **Q-SYS Core Manager**
2. Navigate to **Network** → **Services**
3. **Enable** the **WebSocket** capability
4. **Save and apply** the configuration

### **2. Set Code Access Permissions** 🔐

**In Q-SYS Designer:**

1. Open your **Q-SYS Design**
2. Go to **Design** → **Code Access**
3. Set Code Access to **'External'** or **'All'**
   - This allows external applications to connect
   - Required for QRWC to access scriptable components

### **3. Core Status Requirements** 🏃

- Core must have a **design loaded**
- Core must be in **Run mode**
- Core must be **accessible on the network**

---

## **🔧 Connection Details**

### **Port & Protocol:**

- **Port:** `443` (HTTPS/WebSocket)
- **Protocol:** `WebSocket` over HTTPS
- **Endpoint:** `/qrc-public-api/v0`
- **Keep-alive:** Must communicate every <60 seconds

### **Authentication:**

- Most Q-SYS Cores don't require authentication for QRWC
- Leave username/password **empty** unless your Core specifically requires them

---

## **📋 Troubleshooting Checklist**

### **If Connection Fails:**

**✅ Q-SYS Core Manager:**

- [ ] WebSocket capability is **enabled** under Network → Services
- [ ] Core configuration has been **saved and applied**

**✅ Q-SYS Designer:**

- [ ] Design is **loaded and running** on the Core
- [ ] Code Access is set to **'External'** or **'All'**
- [ ] At least one component is marked as **'Scriptable'**
- [ ] Design has been **deployed** to the Core

**✅ Network:**

- [ ] Core IP address is correct: `192.168.50.150`
- [ ] Port 443 is accessible: `nc -z 192.168.50.150 443`
- [ ] No firewall blocking the connection

**✅ Components:**

- [ ] At least one component has **'Scriptable'** enabled in Properties
- [ ] Components are available in the running design

---

## **🎛️ Scriptable Components Setup**

For QRWC to discover components, they must be marked as **Scriptable**:

### **In Q-SYS Designer:**

1. **Select a component** (e.g., Gain, Mixer, etc.)
2. In **Properties** panel, check **'Scriptable'**
3. Give it a meaningful **Name** (this is how QRWC will access it)
4. **Repeat** for all components you want to control
5. **Deploy** the design to the Core

### **Example Scriptable Components:**

- **Gain Controls:** Set 'Scriptable' to access `gain` and `mute` controls
- **Mixers:** Set 'Scriptable' to access crosspoint controls
- **Routers:** Set 'Scriptable' to access input/output routing
- **Custom Controls:** Any user control you want external access to

---

## **🧪 Testing Your Setup**

### **1. Basic Connection Test:**

```bash
npm run test:connection
```

### **2. Manual Verification:**

```bash
# Test port accessibility
nc -z 192.168.50.150 443

# Test HTTPS endpoint (should return some response)
curl -k https://192.168.50.150:443/

# Test WebSocket upgrade (advanced)
curl -k -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: test" \
     https://192.168.50.150:443/qrc-public-api/v0
```

### **3. Expected Success Indicators:**

- ✅ WebSocket connects successfully
- ✅ QRWC instance created
- ✅ Components discovered (shows count > 0)
- ✅ Controls accessible within components

---

## **⚠️ Common Issues**

### **"Connection Refused" / "Timeout"**

- WebSocket capability not enabled in Core Manager
- Core not accessible on network
- Firewall blocking port 443

### **"Socket Hang Up" / "Connection Reset"**

- Code Access not set to 'External' or 'All'
- Design not in Run mode
- QRWC endpoint not available

### **"No Components Found"**

- No components marked as 'Scriptable'
- Design not deployed to Core
- Core not running the latest design

### **"Parse Error" / "Invalid HTTP"**

- Wrong port (trying 1710 instead of 443)
- WebSocket capability not enabled
- Incorrect endpoint URL

---

## **📚 Q-SYS Documentation References**

- **QRWC NPM Library:** `@q-sys/qrwc`
- **Code Access:** Q-SYS Designer Help → Code Access
- **WebSocket Services:** Q-SYS Core Manager Help → Network Services
- **Component Scripting:** Q-SYS Designer Help → Scriptable Components

---

## **🚀 Quick Setup Summary**

1. **Core Manager:** Enable WebSocket under Network → Services
2. **Designer:** Set Code Access to 'External', mark components as 'Scriptable'
3. **Deploy:** Load and run design on Core
4. **Test:** Run `npm run dev` to verify connection
5. **Configure:** Update `qsys-core.config.json` with your Core's IP

**That's it!** Your Q-SYS Core should now be ready for QRWC connections. 🎯
