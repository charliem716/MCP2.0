/**
 * Integration test for BUG-136: Production Readiness Features
 * Verifies that all production features are properly implemented and working
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MCPServer } from '../../src/mcp/server.js';
import { MCPRateLimiter } from '../../src/mcp/middleware/rate-limit.js';
import { InputValidator } from '../../src/mcp/middleware/validation.js';
import { HealthChecker } from '../../src/mcp/health/health-check.js';
import { CircuitBreaker, CircuitState } from '../../src/mcp/infrastructure/circuit-breaker.js';
import { getMetrics } from '../../src/mcp/monitoring/metrics.js';
import { MCPAuthenticator } from '../../src/mcp/middleware/auth.js';

describe('BUG-136: Production Readiness Features', () => {
  let server: MCPServer;
  
  beforeEach(() => {
    // Mock logger to avoid console output
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', () => {
      const limiter = new MCPRateLimiter({
        requestsPerMinute: 60,
        burstSize: 5,
        perClient: false,
      });

      // Should allow burst size requests
      for (let i = 0; i < 5; i++) {
        expect(limiter.checkLimit()).toBe(true);
      }

      // Should reject after burst exhausted
      expect(limiter.checkLimit()).toBe(false);
      
      // Verify status
      const status = limiter.getStatus();
      expect(status.allowed).toBe(false);
      expect(status.remaining).toBe(0);
      expect(status.limit).toBe(60);
      
      limiter.stop();
    });

    it('should support per-client rate limiting', () => {
      const limiter = new MCPRateLimiter({
        requestsPerMinute: 60,
        burstSize: 2,
        perClient: true,
      });

      // Client 1 exhausts limit
      expect(limiter.checkLimit('client1')).toBe(true);
      expect(limiter.checkLimit('client1')).toBe(true);
      expect(limiter.checkLimit('client1')).toBe(false);

      // Client 2 still has quota
      expect(limiter.checkLimit('client2')).toBe(true);
      expect(limiter.checkLimit('client2')).toBe(true);
      expect(limiter.checkLimit('client2')).toBe(false);
      
      limiter.stop();
    });
  });

  describe('Input Validation', () => {
    it('should validate tool inputs', () => {
      const validator = new InputValidator();

      // Valid input
      const validResult = validator.validate('qsys.set_control', {
        component_name: 'Mixer1',
        control_name: 'gain',
        value: 0.5,
      });
      expect(validResult.valid).toBe(true);
      expect(validResult.data).toEqual({
        component_name: 'Mixer1',
        control_name: 'gain',
        value: 0.5,
      });

      // Invalid input - missing required field
      const invalidResult = validator.validate('qsys.set_control', {
        component_name: 'Mixer1',
        value: 0.5,
      });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error?.code).toBe(-32602);
      expect(invalidResult.error?.data.errors).toContainEqual(
        expect.objectContaining({
          path: 'control_name',
          message: expect.any(String),
        })
      );

      // Invalid input - bad component name
      const badNameResult = validator.validate('qsys.set_control', {
        component_name: 'Invalid Name!',
        control_name: 'gain',
        value: 0.5,
      });
      expect(badNameResult.valid).toBe(false);
      expect(badNameResult.error?.data.errors[0].path).toBe('component_name');
    });

    it('should track validation statistics', () => {
      const validator = new InputValidator();
      
      validator.validate('qsys.get_control', {
        component_name: 'Mixer1',
        control_name: 'gain',
      });
      
      validator.validate('qsys.get_control', {
        component_name: 'Invalid!',
        control_name: 'gain',
      });

      const stats = validator.getStats();
      expect(stats.total).toBe(2);
      expect(stats.passed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBe(50);
    });
  });

  describe('Health Checks', () => {
    it('should report system health', async () => {
      // Mock QRWC client
      const mockQrwcClient = {
        isConnected: jest.fn().mockReturnValue(true),
        getQrwc: jest.fn().mockReturnValue({
          components: { Mixer1: {}, Mixer2: {} },
        }),
        getConnectionOptions: jest.fn().mockReturnValue({
          host: 'test.local',
          port: 443,
        }),
      };

      // Mock container
      const mockContainer = {
        resolve: jest.fn().mockResolvedValue({
          getMetrics: () => ({ entries: 10, hits: 8, misses: 2 }),
        }),
      };

      const healthChecker = new HealthChecker(
        mockContainer as any,
        mockQrwcClient as any,
        '1.0.0'
      );

      const report = await healthChecker.check();
      
      expect(report.status).toBeDefined();
      expect(report.version).toBe('1.0.0');
      expect(report.uptime).toBeGreaterThan(0);
      expect(report.checks).toHaveLength(5);
      
      // Check Q-SYS connection check
      const qsysCheck = report.checks.find(c => c.name === 'Q-SYS Connection');
      expect(qsysCheck?.status).toBe('healthy');
      expect(qsysCheck?.metadata?.componentCount).toBe(2);

      // Check memory usage check  
      const memCheck = report.checks.find(c => c.name === 'Memory Usage');
      expect(memCheck?.status).toBeDefined();
      expect(memCheck?.metadata?.percentage).toBeDefined();
    });
  });

  describe('Circuit Breaker', () => {
    it('should protect against failures', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 100,
      });

      let callCount = 0;
      const failingFn = async () => {
        callCount++;
        throw new Error('Service unavailable');
      };

      // Should fail 3 times then open
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Service unavailable');
      }
      expect(callCount).toBe(3);
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Should reject without calling function
      await expect(breaker.execute(failingFn)).rejects.toThrow('Circuit breaker is OPEN');
      expect(callCount).toBe(3); // No additional calls

      breaker.stop();
    });

    it('should recover after timeout', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 50,
      });

      // Open the circuit
      await expect(breaker.execute(async () => {
        throw new Error('Fail');
      })).rejects.toThrow();
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Should try again (half-open)
      let called = false;
      await breaker.execute(async () => {
        called = true;
        return 'success';
      });
      
      expect(called).toBe(true);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.stop();
    });
  });

  describe('Monitoring & Metrics', () => {
    it('should collect metrics', () => {
      const metrics = getMetrics();
      
      // Record some metrics
      metrics.requestCount.inc({ method: 'tools/call', status: 'success' });
      metrics.requestCount.inc({ method: 'tools/call', status: 'error' });
      metrics.toolDuration.observe(0.125);
      metrics.activeConnections.set(1);

      // Export metrics
      const exported = metrics.export();
      expect(exported).toContain('mcp_requests_total');
      expect(exported).toContain('mcp_tool_duration_seconds');
      expect(exported).toContain('qsys_active_connections 1');

      // JSON export
      const json = metrics.toJSON();
      expect(json.requests.total).toBeGreaterThanOrEqual(2);
      expect(json.connections.active).toBe(1);
    });
  });

  describe('Authentication', () => {
    it('should authenticate with API keys', () => {
      const auth = new MCPAuthenticator({
        enabled: true,
        apiKeys: ['test-key-123', 'test-key-456'],
      });

      // Valid API key
      const validResult = auth.authenticate('tools/call', {
        'x-api-key': 'test-key-123',
      });
      expect(validResult.authenticated).toBe(true);
      expect(validResult.clientId).toMatch(/^api_/);

      // Invalid API key
      const invalidResult = auth.authenticate('tools/call', {
        'x-api-key': 'wrong-key',
      });
      expect(invalidResult.authenticated).toBe(false);
      expect(invalidResult.error).toContain('Invalid API key');

      // Missing credentials
      const missingResult = auth.authenticate('tools/call', {});
      expect(missingResult.authenticated).toBe(false);
      expect(missingResult.error).toContain('Missing authentication');
    });

    it('should allow anonymous access to specific methods', () => {
      const auth = new MCPAuthenticator({
        enabled: true,
        apiKeys: ['test-key'],
        allowAnonymous: ['system.ping', 'system.health'],
      });

      // Anonymous allowed
      const pingResult = auth.authenticate('system.ping');
      expect(pingResult.authenticated).toBe(true);
      expect(pingResult.clientId).toBe('anonymous');

      // Anonymous not allowed
      const toolResult = auth.authenticate('tools/call');
      expect(toolResult.authenticated).toBe(false);
    });

    it('should generate and validate tokens', () => {
      const auth = new MCPAuthenticator({
        enabled: true,
        jwtSecret: 'test-secret',
        tokenExpiration: 3600,
      });

      // Generate token
      const token = auth.generateToken('client123');
      expect(token).toBeTruthy();

      // Validate token
      const result = auth.authenticate('tools/call', {
        'Authorization': `Bearer ${token}`,
      });
      expect(result.authenticated).toBe(true);
      expect(result.clientId).toBe('client123');
    });
  });

  describe('Integration', () => {
    it('should initialize all production features in server', async () => {
      const config = {
        name: 'test-server',
        version: '1.0.0',
        transport: 'stdio' as const,
        qrwc: {
          host: 'test.local',
          port: 443,
        },
        rateLimiting: {
          requestsPerMinute: 60,
          burstSize: 10,
        },
      };

      // Mock QRWC client connection
      jest.spyOn(console, 'error').mockImplementation();
      
      const server = new MCPServer(config);
      const status = server.getStatus();
      
      expect(status.production.rateLimiting).toBe(true);
      expect(status.production.inputValidation).toBe(true);
      expect(status.production.healthCheck).toBe(true);

      // Check health endpoint
      const health = await server.getHealth();
      expect(health.status).toBeDefined();

      // Check metrics endpoint
      const metrics = server.getMetrics();
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');

      // Check audit log
      const auditLog = server.getAuditLog();
      expect(Array.isArray(auditLog)).toBe(true);
    });
  });
});