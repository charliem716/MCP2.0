/**
 * Simple integration test to verify connection resilience fix
 * Tests that health monitoring and circuit breaker features are available
 */

import { OfficialQRWCClient } from '../../src/qrwc/officialClient.js';
import { ConnectionState } from '../../src/shared/types/common.js';

describe('Connection Resilience Features', () => {
  let client: OfficialQRWCClient;

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
  });

  it('should have all new health monitoring methods available', () => {
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
    });

    // Verify all new methods exist
    expect(typeof client.getHealthStatus).toBe('function');
    expect(typeof client.isHealthy).toBe('function');
    expect(typeof client.getCircuitBreakerState).toBe('function');
    expect(typeof client.checkHealth).toBe('function');
  });

  it('should return proper health status structure', () => {
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
    });

    const health = client.getHealthStatus();

    // Verify health status structure
    expect(health).toHaveProperty('isHealthy');
    expect(health).toHaveProperty('lastSuccessfulConnection');
    expect(health).toHaveProperty('consecutiveFailures');
    expect(health).toHaveProperty('totalAttempts');
    expect(health).toHaveProperty('totalSuccesses');
    expect(health).toHaveProperty('uptime');
    expect(health).toHaveProperty('state');
    expect(health).toHaveProperty('circuitBreakerState');

    // Verify initial values
    expect(health.isHealthy).toBe(false);
    expect(health.state).toBe(ConnectionState.DISCONNECTED);
    expect(health.consecutiveFailures).toBe(0);
    expect(health.totalAttempts).toBe(0);
    expect(health.totalSuccesses).toBe(0);
    expect(health.circuitBreakerState).toBe('closed');
  });

  it('should have circuit breaker functionality', () => {
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
    });

    // Circuit breaker should start closed
    const state = client.getCircuitBreakerState();
    expect(['closed', 'open', 'half-open']).toContain(state);
    expect(state).toBe('closed');
  });

  it('should have isHealthy convenience method', () => {
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
    });

    // Should return false when not connected
    expect(client.isHealthy()).toBe(false);
  });

  it('should support manual health checks', () => {
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
    });

    const health = client.checkHealth();
    
    // Should return the same structure as getHealthStatus
    expect(health).toHaveProperty('isHealthy');
    expect(health).toHaveProperty('state');
    expect(health).toHaveProperty('circuitBreakerState');
  });

  it('should support auto-reconnect configuration', () => {
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
      enableAutoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectInterval: 2000,
    });

    // Client should be created successfully with these options
    expect(client).toBeDefined();
    expect(client.getState()).toBe(ConnectionState.DISCONNECTED);
  });

  it('should expose connection state', () => {
    client = new OfficialQRWCClient({
      host: 'test-core',
      port: 443,
    });

    const state = client.getState();
    expect(Object.values(ConnectionState)).toContain(state);
  });
});