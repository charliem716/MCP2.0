# Q-SYS Core Setup Instructions

## Quick Setup for Testing with Your Q-SYS Core

### Method 1: JSON Configuration (Recommended)

1. **Edit the `qsys-core.config.json` file** with your Core details:
   ```json
   {
     "qsysCore": {
       "host": "YOUR_CORE_IP_ADDRESS",
       "port": 443,
       "username": "YOUR_USERNAME", 
       "password": "YOUR_PASSWORD",
       "connectionSettings": {
         "timeout": 10000,
         "reconnectInterval": 5000,
         "maxReconnectAttempts": 5,
         "pollingInterval": 350,
         "enableAutoReconnect": true
       }
     }
   }
   ```

2. **Replace the placeholder values:**
   - `YOUR_CORE_IP_ADDRESS` - IP address of your Q-SYS Core
   - `YOUR_USERNAME` - Q-SYS username (if authentication required)
   - `YOUR_PASSWORD` - Q-SYS password (if authentication required)

3. **Test the connection:**
   ```bash
   npm run dev
   ```

### Method 2: Environment Variables

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file** and update these values:
   ```bash
   QSYS_HOST=YOUR_CORE_IP_ADDRESS
   QSYS_PORT=443
   QSYS_USERNAME=YOUR_USERNAME
   QSYS_PASSWORD=YOUR_PASSWORD
   ```

## Q-SYS Core Requirements

### Enable Remote Control (QRWC)
1. Open Q-SYS Designer
2. Go to **Inventory** → **Q-SYS Cores** → **Your Core**
3. In Core Properties, enable **"Allow External Control"**
4. Set **Control Port** to `443` (or your preferred port)
5. Configure authentication if needed

### Network Requirements
- Ensure your Core is accessible on the network
- If using a firewall, allow traffic on the QRWC port (default: 443)
- Test connectivity: `ping YOUR_CORE_IP_ADDRESS`

## Common Connection Scenarios

### Local Development with Emulator
```json
{
  "qsysCore": {
    "host": "127.0.0.1",
    "port": 1710,
    "username": "",
    "password": ""
  }
}
```

### Production Core
```json
{
  "qsysCore": {
    "host": "10.0.1.50",
    "port": 443,
    "username": "control-user",
    "password": "secure-password"
  }
}
```

### Test Core on Different Network
```json
{
  "qsysCore": {
    "host": "192.168.100.10",
    "port": 1710,
    "username": "test-admin",
    "password": "test-pass"
  }
}
```

## Troubleshooting

### Connection Timeout
```
Error: Connection timeout
```
**Solutions:**
- Verify the Core IP address is correct
- Check network connectivity: `ping YOUR_CORE_IP_ADDRESS`
- Ensure the Core is powered on and running
- Verify firewall settings

### Authentication Failed
```
Error: Authentication failed
```
**Solutions:**
- Check username/password are correct
- Verify the Core requires authentication
- Try with empty username/password for Cores without auth

### Port Issues
```
Error: Connection refused
```
**Solutions:**
- Verify the QRWC port in Q-SYS Designer matches your config
- Common ports: `443` (HTTPS), `1710` (HTTP), `8443` (custom)
- Check if another application is using the port

### Quick Test Commands

**Test network connectivity:**
```bash
ping YOUR_CORE_IP_ADDRESS
```

**Test port accessibility:**
```bash
telnet YOUR_CORE_IP_ADDRESS 443
```

**Run with debug logging:**
```bash
LOG_LEVEL=debug npm run dev
```

## Phase 1 Testing Notes

Per the checklist.md:
- ✅ Phase 1 focuses on QRWC connection establishment
- ✅ Authentication and basic connectivity testing
- ✅ Connection retry and error handling verification
- ✅ Logging and monitoring setup

The connection will be tested as part of the Phase 1 deliverable verification. 