# Production Readiness Features

This document describes the production readiness features implemented in the MCP Q-SYS Control Server to ensure reliable, secure, and observable operation in production environments.

## Table of Contents

- [Overview](#overview)
- [Rate Limiting](#rate-limiting)
- [Input Validation](#input-validation)
- [Health Checks](#health-checks)
- [Circuit Breaker](#circuit-breaker)
- [Monitoring & Metrics](#monitoring--metrics)
- [Authentication](#authentication)
- [Audit Logging](#audit-logging)
- [Configuration](#configuration)
- [Deployment Guide](#deployment-guide)
- [Troubleshooting](#troubleshooting)

## Overview

The MCP server includes comprehensive production features to ensure:

- **Reliability**: Circuit breakers, health checks, and graceful error handling
- **Security**: Rate limiting, input validation, and authentication
- **Observability**: Metrics, health endpoints, and audit logging
- **Performance**: Resource management and optimized request handling

## Rate Limiting

### Purpose
Prevents abuse and ensures fair resource usage by limiting the number of requests per client or globally.

### Implementation
- Token bucket algorithm for smooth rate limiting
- Configurable per-client or global limits
- Burst capacity for handling traffic spikes

### Configuration
```json
{
  "rateLimiting": {
    "requestsPerMinute": 60,
    "burstSize": 10,
    "perClient": false
  }
}
```

### Usage
The rate limiter automatically applies to all MCP tool calls. When limits are exceeded:
- Clients receive a `-32005` error code
- Error includes retry-after information
- Metrics track rate limit hits

### Monitoring
- `mcp_rate_limit_hits_total`: Counter of rate limit violations
- `mcp_rate_limit_remaining`: Gauge of remaining tokens

## Input Validation

### Purpose
Ensures all tool inputs meet expected schemas, preventing errors and potential security issues.

### Implementation
- Zod schemas for all Q-SYS tools
- Automatic validation before tool execution
- Detailed error messages for invalid inputs

### Validation Rules

#### Component Names
- 1-100 characters
- Alphanumeric, underscore, hyphen, and dot only
- Pattern: `/^[a-zA-Z0-9_.-]+$/`

#### Control Values
- Numbers: Must be finite
- Strings: Maximum 1000 characters
- Booleans: Standard true/false

#### Example Schema
```typescript
'qsys.set_control': z.object({
  component_name: ComponentNameSchema,
  control_name: ControlNameSchema,
  value: ControlValueSchema,
  ramp_time: z.number().min(0).max(60).optional(),
}).strict()
```

### Error Handling
Invalid inputs return:
- Error code: `-32602` (Invalid params)
- Detailed validation errors with paths
- Suggestions for correction

## Health Checks

### Purpose
Provides comprehensive system health monitoring for load balancers and monitoring systems.

### Health Check Components

1. **Q-SYS Connection**
   - Verifies WebSocket connection
   - Checks component discovery
   - Monitors reconnection state

2. **Memory Usage**
   - Process heap and RSS monitoring
   - System memory availability
   - Configurable thresholds

3. **Disk Space**
   - Temp directory monitoring
   - State persistence capacity
   - Warning at 85%, critical at 95%

4. **State Repository**
   - Cache hit rates
   - Entry counts
   - Persistence status

5. **Process Health**
   - CPU usage tracking
   - Event loop lag monitoring
   - Memory leak detection

### Health Status Levels
- **HEALTHY**: All checks passing
- **DEGRADED**: Non-critical issues detected
- **UNHEALTHY**: Critical failures requiring attention

### Endpoints

#### Basic Health Check
```javascript
const health = await mcpServer.getHealth();
// Returns: { status: 'ok' | 'degraded' | 'error', timestamp, version, uptime }
```

#### Detailed Health Check
```javascript
const health = await mcpServer.getHealth(true);
// Returns full health report with all check results and metrics
```

### Monitoring Integration
- Periodic health checks every 60 seconds
- Health state changes logged
- Metrics exported for monitoring systems

## Circuit Breaker

### Purpose
Prevents cascading failures by detecting and isolating failing services.

### States
1. **CLOSED**: Normal operation, requests pass through
2. **OPEN**: Failure threshold exceeded, requests rejected
3. **HALF_OPEN**: Testing if service recovered

### Configuration
```javascript
{
  failureThreshold: 5,      // Failures before opening
  successThreshold: 3,      // Successes to close from half-open
  timeout: 60000,          // Time before attempting recovery (ms)
}
```

### Protected Operations
- Q-SYS WebSocket connections
- Component discovery
- Control updates
- All `qsys.*` tool calls

### Monitoring
- State change events emitted
- Metrics track circuit state
- Automatic recovery attempts

### Usage Example
```javascript
// Circuit breaker automatically protects Q-SYS operations
try {
  await mcpServer.callTool('qsys.set_control', { ... });
} catch (error) {
  if (error.message.includes('Circuit breaker is OPEN')) {
    // Service is temporarily unavailable
  }
}
```

## Monitoring & Metrics

### Metrics Collection
Comprehensive Prometheus-compatible metrics for all aspects of the system.

#### Request Metrics
- `mcp_requests_total`: Total requests by method and status
- `mcp_request_duration_seconds`: Request latency histogram
- `mcp_request_errors_total`: Error counts by type

#### Tool Metrics
- `mcp_tool_calls_total`: Tool invocations by name and status
- `mcp_tool_duration_seconds`: Tool execution time
- `mcp_tool_errors_total`: Tool-specific errors

#### Connection Metrics
- `qsys_active_connections`: Current connection status (0/1)
- `qsys_connection_errors_total`: Connection failure counts
- `qsys_reconnects_total`: Reconnection attempts

#### System Metrics
- `process_memory_usage_bytes`: Memory usage by type
- `process_cpu_usage_percent`: CPU utilization
- `nodejs_event_loop_lag_seconds`: Event loop performance

#### Cache Metrics
- `mcp_cache_hits_total`: Cache hit counts
- `mcp_cache_misses_total`: Cache miss counts
- `mcp_cache_size_items`: Current cache size

### Accessing Metrics

#### Prometheus Format
```javascript
const metricsText = mcpServer.getMetrics();
// Returns metrics in Prometheus text format
```

#### JSON Format
```javascript
const metricsJson = mcpServer.getMetricsJSON();
// Returns structured metrics data
```

### Metric Labels
Most metrics include labels for detailed analysis:
- `method`: MCP method name
- `status`: success/error
- `tool`: Tool name for tool-specific metrics
- `error_type`: Error classification

## Authentication

### Purpose
Secure access control for MCP server operations.

### Authentication Methods

1. **API Keys**
   - Pre-shared keys for service accounts
   - Hashed storage for security
   - Per-key client identification

2. **Bearer Tokens**
   - Time-limited tokens
   - Generated from API keys
   - Cached for performance

### Configuration
```json
{
  "authentication": {
    "enabled": true,
    "apiKeys": ["key1", "key2"],
    "tokenExpiration": 3600,
    "allowAnonymous": ["system.ping", "system.health"]
  }
}
```

### Usage

#### With API Key
```http
Authorization: ApiKey your-api-key
```
or
```http
X-API-Key: your-api-key
```

#### With Token
```http
Authorization: Bearer generated-token
```

### Security Features
- API keys hashed with SHA-256
- Tokens signed with HMAC
- Automatic token expiration
- Anonymous access for specific methods

### Error Handling
Authentication failures return:
- Error code: `-32001`
- Clear error messages
- No timing information (prevents timing attacks)

## Audit Logging

### Purpose
Track all operations for security, compliance, and debugging.

### Logged Information
- Timestamp of operation
- Tool name
- Client ID (if authenticated)
- Success/failure status
- Execution duration

### Accessing Audit Logs
```javascript
const logs = mcpServer.getAuditLog(100); // Last 100 entries
```

### Log Rotation
- In-memory buffer of last 1000 entries
- Automatic rotation to prevent memory growth
- Integration with external logging systems recommended

### Example Log Entry
```json
{
  "timestamp": "2024-01-30T10:15:30.123Z",
  "tool": "qsys.set_control",
  "clientId": "api_a1b2c3d4",
  "success": true,
  "duration": 125
}
```

## Configuration

### Complete Configuration Example
```json
{
  "name": "mcp-qsys-server",
  "version": "1.0.0",
  "transport": "stdio",
  "qrwc": {
    "host": "192.168.1.100",
    "port": 443,
    "reconnectInterval": 5000
  },
  "rateLimiting": {
    "requestsPerMinute": 60,
    "burstSize": 10,
    "perClient": true
  },
  "authentication": {
    "enabled": true,
    "apiKeys": ["${API_KEY_1}", "${API_KEY_2}"],
    "tokenExpiration": 3600,
    "allowAnonymous": ["system.ping", "system.health"]
  }
}
```

### Environment Variables
```bash
# API Keys (recommended over config file)
export MCP_API_KEYS="key1,key2,key3"

# Rate limiting
export MCP_RATE_LIMIT_RPM=60
export MCP_RATE_LIMIT_BURST=10

# Authentication
export MCP_AUTH_ENABLED=true
export MCP_JWT_SECRET="your-secret-key"
```

## Deployment Guide

### Prerequisites
1. Node.js 20+ with ESM support
2. Q-SYS Core with API access enabled
3. Monitoring infrastructure (optional)

### Production Checklist

#### Security
- [ ] Enable authentication
- [ ] Configure strong API keys
- [ ] Set appropriate rate limits
- [ ] Enable input validation
- [ ] Configure firewall rules

#### Reliability
- [ ] Configure health check endpoints
- [ ] Set up monitoring alerts
- [ ] Enable circuit breaker
- [ ] Configure automatic restarts
- [ ] Set resource limits

#### Observability
- [ ] Export metrics to monitoring system
- [ ] Configure log aggregation
- [ ] Set up error tracking
- [ ] Enable audit logging
- [ ] Create operational dashboards

### Deployment Example

#### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --production
RUN npm run build

# Health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "require('./dist/health-check.js').check()"

# Run with limited resources
CMD ["node", "--max-old-space-size=512", "dist/index.js"]
```

#### Kubernetes
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mcp-config
data:
  config.json: |
    {
      "rateLimiting": {
        "requestsPerMinute": 60,
        "burstSize": 10
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-qsys-server
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: mcp-server
        image: mcp-qsys:latest
        resources:
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
```

## Troubleshooting

### Common Issues

#### Rate Limiting
**Problem**: Legitimate requests being rate limited
```
Error: Rate limit exceeded. Please slow down your requests.
```
**Solution**:
- Increase `requestsPerMinute` or `burstSize`
- Enable per-client limiting
- Check for misbehaving clients in metrics

#### Circuit Breaker Open
**Problem**: All Q-SYS operations failing
```
Error: Circuit breaker is OPEN for qsys-connection
```
**Solution**:
1. Check Q-SYS Core connectivity
2. Review recent error logs
3. Wait for automatic recovery (60s)
4. Manually reset if needed

#### Authentication Failures
**Problem**: Valid credentials rejected
```
Error: Authentication failed: Invalid API key
```
**Solution**:
- Verify API key configuration
- Check for special characters in keys
- Ensure proper header format
- Review allow-anonymous settings

#### Memory Growth
**Problem**: Increasing memory usage over time
**Solution**:
1. Check cache sizes in metrics
2. Review audit log retention
3. Monitor event listeners
4. Enable memory profiling

### Debug Mode

Enable detailed logging:
```bash
export LOG_LEVEL=debug
export MCP_DEBUG=true
```

### Monitoring Queries

#### Prometheus Queries

Error rate:
```promql
rate(mcp_request_errors_total[5m]) / rate(mcp_requests_total[5m])
```

P95 latency:
```promql
histogram_quantile(0.95, rate(mcp_request_duration_seconds_bucket[5m]))
```

Connection stability:
```promql
rate(qsys_reconnects_total[1h])
```

#### Health Check Script
```bash
#!/bin/bash
HEALTH=$(curl -s http://localhost:8080/health)
STATUS=$(echo $HEALTH | jq -r '.status')

if [ "$STATUS" != "ok" ]; then
  echo "Health check failed: $HEALTH"
  exit 1
fi
```

## Best Practices

1. **Start Conservative**: Begin with strict limits and relax as needed
2. **Monitor Everything**: Use metrics to understand system behavior
3. **Test Failure Modes**: Verify circuit breaker and error handling
4. **Automate Recovery**: Configure automatic restarts and scaling
5. **Document Changes**: Track configuration modifications
6. **Regular Reviews**: Analyze logs and metrics for optimization

## Support

For issues or questions about production features:
1. Check this documentation
2. Review error logs and metrics
3. Test in staging environment
4. Contact support with detailed diagnostics