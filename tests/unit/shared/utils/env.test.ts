import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('Environment Configuration', () => {
  let env: any;
  let config: any;
  let appRoot: any;

  beforeEach(async () => {
    jest.resetModules();
    
    // Mock the env module with jest.unstable_mockModule
    jest.unstable_mockModule('@/shared/utils/env', () => ({
      env: {
        NODE_ENV: 'test',
        OPENAI_API_KEY: 'test-key',
        QSYS_HOST: '192.168.1.100',
        QSYS_PORT: 443,
        QSYS_USERNAME: 'test-user',
        QSYS_PASSWORD: 'test-pass',
        QSYS_VERIFY_CERTIFICATE: false,
        LOG_LEVEL: 'info',
        AGENT_PORT: 3000,
        MCP_PORT: 3001,
        API_PORT: 3002,
      },
      appRoot: '/test/app/root',
      config: {
        qsys: {
          host: '192.168.1.100',
          port: 443,
          username: 'test-user',
          password: 'test-pass',
          verifyCertificate: false,
        },
        openai: {
          apiKey: 'test-key',
        },
        logging: {
          level: 'info',
        },
        agent: {
          port: 3000,
        },
        mcp: {
          port: 3001,
        },
        api: {
          port: 3002,
        },
      },
    }));

    // Import after mocking
    const envModule = await import('@/shared/utils/env');
    env = envModule.env;
    config = envModule.config;
    appRoot = envModule.appRoot;
  });

  describe('env', () => {
    it('should have required environment variables', () => {
      expect(env.NODE_ENV).toBe('test');
      expect(env.OPENAI_API_KEY).toBe('test-key');
      expect(env.QSYS_HOST).toBe('192.168.1.100');
      expect(env.QSYS_PORT).toBe(443);
    });

    it('should have logging configuration', () => {
      expect(env.LOG_LEVEL).toBe('info');
    });

    it('should have server ports', () => {
      expect(env.AGENT_PORT).toBe(3000);
      expect(env.MCP_PORT).toBe(3001);
      expect(env.API_PORT).toBe(3002);
    });

    it('should have Q-SYS credentials', () => {
      expect(env.QSYS_USERNAME).toBe('test-user');
      expect(env.QSYS_PASSWORD).toBe('test-pass');
      expect(env.QSYS_VERIFY_CERTIFICATE).toBe(false);
    });
  });

  describe('config', () => {
    it('should have Q-SYS configuration', () => {
      expect(config.qsys).toEqual({
        host: '192.168.1.100',
        port: 443,
        username: 'test-user',
        password: 'test-pass',
        verifyCertificate: false,
      });
    });

    it('should have OpenAI configuration', () => {
      expect(config.openai).toEqual({
        apiKey: 'test-key',
      });
    });

    it('should have logging configuration', () => {
      expect(config.logging).toEqual({
        level: 'info',
      });
    });

    it('should have server configurations', () => {
      expect(config.agent.port).toBe(3000);
      expect(config.mcp.port).toBe(3001);
      expect(config.api.port).toBe(3002);
    });
  });

  describe('appRoot', () => {
    it('should have app root path', () => {
      expect(appRoot).toBe('/test/app/root');
    });
  });
});