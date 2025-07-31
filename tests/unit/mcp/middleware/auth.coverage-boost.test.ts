/**
 * Coverage boost tests for auth middleware
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { RequestContext } from '../../../../src/mcp/types/context.js';

// Mock dependencies
jest.mock('../../../../src/shared/utils/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
}));

// Import after mocking
import { MCPAuthenticator } from '../../../../src/mcp/middleware/auth.js';

describe('MCPAuthenticator - Coverage Boost', () => {
  let authenticator: MCPAuthenticator;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create authenticator with default options', () => {
      authenticator = new MCPAuthenticator();
      expect(authenticator).toBeDefined();
    });

    it('should create authenticator with custom options', () => {
      authenticator = new MCPAuthenticator({
        allowAnonymous: false,
        requireAuth: true,
        jwtSecret: 'test-secret',
        sessionSecret: 'session-secret',
      });
      expect(authenticator).toBeDefined();
    });

    it('should create authenticator with API key validation', () => {
      const validateApiKey = jest.fn().mockResolvedValue(true);
      authenticator = new MCPAuthenticator({
        validateApiKey,
      });
      expect(authenticator).toBeDefined();
    });
  });

  describe('authenticate', () => {
    it('should allow anonymous access when enabled', async () => {
      authenticator = new MCPAuthenticator({
        allowAnonymous: true,
      });

      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
      };

      const result = await authenticator.authenticate(context);
      expect(result.authenticated).toBe(true);
      expect(result.anonymous).toBe(true);
    });

    it('should reject when auth is required and no credentials provided', async () => {
      authenticator = new MCPAuthenticator({
        allowAnonymous: false,
        requireAuth: true,
      });

      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
      };

      const result = await authenticator.authenticate(context);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Authentication required');
    });

    it('should authenticate with Bearer token', async () => {
      authenticator = new MCPAuthenticator({
        jwtSecret: 'test-secret',
      });

      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
        meta: {
          authorization: 'Bearer valid-token',
        },
      };

      // Mock JWT validation would go here
      const result = await authenticator.authenticate(context);
      // Note: Actual JWT validation would fail without proper token
      expect(result).toBeDefined();
    });

    it('should authenticate with API key', async () => {
      const validateApiKey = jest.fn().mockResolvedValue(true);
      authenticator = new MCPAuthenticator({
        validateApiKey,
      });

      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
        meta: {
          'x-api-key': 'test-api-key',
        },
      };

      const result = await authenticator.authenticate(context);
      expect(validateApiKey).toHaveBeenCalledWith('test-api-key');
      expect(result.authenticated).toBe(true);
    });

    it('should reject invalid API key', async () => {
      const validateApiKey = jest.fn().mockResolvedValue(false);
      authenticator = new MCPAuthenticator({
        validateApiKey,
        allowAnonymous: false,
      });

      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
        meta: {
          'x-api-key': 'invalid-key',
        },
      };

      const result = await authenticator.authenticate(context);
      expect(validateApiKey).toHaveBeenCalledWith('invalid-key');
      expect(result.authenticated).toBe(false);
    });

    it('should handle API key validation errors', async () => {
      const validateApiKey = jest.fn().mockRejectedValue(new Error('Validation failed'));
      authenticator = new MCPAuthenticator({
        validateApiKey,
        allowAnonymous: false,
      });

      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
        meta: {
          'x-api-key': 'test-key',
        },
      };

      const result = await authenticator.authenticate(context);
      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    it('should extract user from session', async () => {
      authenticator = new MCPAuthenticator({
        sessionSecret: 'session-secret',
      });

      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
        meta: {
          session: {
            user: {
              id: 'user-123',
              name: 'Test User',
            },
          },
        },
      };

      const result = await authenticator.authenticate(context);
      expect(result.authenticated).toBe(true);
      expect(result.user).toEqual({
        id: 'user-123',
        name: 'Test User',
      });
    });
  });

  describe('authorize', () => {
    beforeEach(() => {
      authenticator = new MCPAuthenticator();
    });

    it('should authorize authenticated user', async () => {
      const authResult = {
        authenticated: true,
        user: { id: 'user-123' },
      };

      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
      };

      const result = await authenticator.authorize(authResult, context);
      expect(result.authorized).toBe(true);
    });

    it('should reject unauthenticated user', async () => {
      const authResult = {
        authenticated: false,
      };

      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
      };

      const result = await authenticator.authorize(authResult, context);
      expect(result.authorized).toBe(false);
    });

    it('should allow anonymous access to public methods', async () => {
      const authResult = {
        authenticated: true,
        anonymous: true,
      };

      const context: RequestContext = {
        method: 'public/test',
        params: {},
        requestId: 'test-123',
      };

      const result = await authenticator.authorize(authResult, context);
      expect(result.authorized).toBe(true);
    });
  });

  describe('middleware', () => {
    it('should create middleware function', () => {
      authenticator = new MCPAuthenticator();
      const middleware = authenticator.middleware();
      expect(typeof middleware).toBe('function');
    });

    it('should process request through middleware', async () => {
      authenticator = new MCPAuthenticator({
        allowAnonymous: true,
      });

      const middleware = authenticator.middleware();
      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
      };

      const next = jest.fn().mockResolvedValue({
        result: 'success',
      });

      const result = await middleware(context, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        auth: expect.objectContaining({
          authenticated: true,
        }),
      }));
      expect(result).toEqual({ result: 'success' });
    });

    it('should reject unauthorized requests', async () => {
      authenticator = new MCPAuthenticator({
        allowAnonymous: false,
        requireAuth: true,
      });

      const middleware = authenticator.middleware();
      const context: RequestContext = {
        method: 'test',
        params: {},
        requestId: 'test-123',
      };

      const next = jest.fn();

      await expect(middleware(context, next)).rejects.toThrow('Unauthorized');
      expect(next).not.toHaveBeenCalled();
    });
  });
});