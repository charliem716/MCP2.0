/**
 * Tests for Centralized Configuration Manager
 * Verifies fix for configuration fragmentation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Configuration Manager', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all test-related env vars
    delete process.env['QSYS_HOST'];
    delete process.env['QSYS_PORT'];
    delete process.env['LOG_LEVEL'];
    delete process.env['NODE_ENV'];
    delete process.env['PORT'];
    
    // Set NODE_ENV to test by default
    process.env['NODE_ENV'] = 'test';
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  it('should load configuration from environment variables', async () => {
    // Set some env vars
    process.env['QSYS_HOST'] = 'env-host';
    process.env['QSYS_PORT'] = '8080';
    process.env['LOG_LEVEL'] = 'debug';
    process.env['NODE_ENV'] = 'test';

    // Import after setting env
    const { configManager } = await import('../../../src/config/index');
    const config = configManager.getConfig();

    expect(config.qsys.host).toBe('env-host');
    expect(config.qsys.port).toBe(8080);
    expect(config.mcp.logLevel).toBe('debug');
    expect(config.environment).toBe('test');
  });

  it('should provide typed config sections', async () => {
    const { getQSysConfig, getMCPConfig, getAPIConfig } = await import('../../../src/config/index');

    const qsysConfig = getQSysConfig();
    expect(qsysConfig).toHaveProperty('host');
    expect(qsysConfig).toHaveProperty('port');
    expect(qsysConfig).toHaveProperty('secure');

    const mcpConfig = getMCPConfig();
    expect(mcpConfig).toHaveProperty('logLevel');
    expect(mcpConfig).toHaveProperty('cacheSize');

    const apiConfig = getAPIConfig();
    expect(apiConfig).toHaveProperty('port');
    expect(apiConfig).toHaveProperty('cors');
  });

  it('should support path-based config access', async () => {
    const { configManager } = await import('../../../src/config/index');
    
    // Test with current config values
    expect(configManager.getPath('qsys.host')).toBeDefined();
    expect(configManager.getPath('mcp.logLevel')).toBeDefined();
    expect(configManager.getPath('invalid.path')).toBeUndefined();
  });

  it('should identify environment correctly', async () => {
    const { configManager } = await import('../../../src/config/index');
    const config = configManager.getConfig();

    // Should be 'test' because we set it in beforeEach
    expect(config.environment).toBe('test');
    expect(config.isProduction).toBe(false);
    expect(config.isDevelopment).toBe(false);
    expect(config.isTest).toBe(true);
  });

  it('should generate configuration summary', async () => {
    const { configManager } = await import('../../../src/config/index');
    const summary = configManager.getSummary();

    // Just verify summary has expected structure
    expect(summary).toContain('Configuration Summary:');
    expect(summary).toContain('Environment:');
    expect(summary).toContain('Q-SYS:');
    expect(summary).toContain('MCP:');
    expect(summary).toContain('API:');
  });

  it('should use default values when env vars are not set', async () => {
    const { configManager } = await import('../../../src/config/index');
    const config = configManager.getConfig();

    // Should have defaults
    expect(config.qsys.host).toBeDefined();
    expect(config.qsys.port).toBeDefined();
    expect(config.mcp.logLevel).toBeDefined();
  });

  it('should be a singleton', async () => {
    const { configManager: instance1 } = await import('../../../src/config/index');
    const { configManager: instance2 } = await import('../../../src/config/index');

    expect(instance1).toBe(instance2);
  });
});