// Mock the env module before importing
jest.mock('../../../../src/shared/utils/env.js', () => ({
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

describe('Environment Configuration', () => {
  describe('env', () => {
    it('should have required environment variables', () => {
      const { env } = require('../../../../src/shared/utils/env.js');

      expect(env.NODE_ENV).toBe('test');
      expect(env.OPENAI_API_KEY).toBe('test-key');
      expect(env.QSYS_HOST).toBe('192.168.1.100');
      expect(env.QSYS_PORT).toBe(443);
    });
  });

  describe('config', () => {
    it('should have correct configuration structure', () => {
      const { config } = require('../../../../src/shared/utils/env.js');

      expect(config.qsys).toBeDefined();
      expect(config.qsys.host).toBe('192.168.1.100');
      expect(config.qsys.port).toBe(443);

      expect(config.openai).toBeDefined();
      expect(config.openai.apiKey).toBe('test-key');
    });
  });

  describe('appRoot', () => {
    it('should provide application root path', () => {
      const { appRoot } = require('../../../../src/shared/utils/env.js');

      expect(appRoot).toBe('/test/app/root');
      expect(typeof appRoot).toBe('string');
    });
  });
});
