/**
 * Unit tests for SecurityHeadersProvider
 */

import { SecurityHeadersProvider, type SecurityConfig } from '../../../../src/mcp/middleware/security.js';
import { createLogger } from '../../../../src/shared/utils/logger.js';

// Mock the logger module
jest.mock('../../../../src/shared/utils/logger.js', () => ({
  createLogger: jest.fn(),
}));

describe('SecurityHeadersProvider', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => mockLogger),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createLogger as jest.Mock).mockReturnValue(mockLogger);
  });

  describe('constructor', () => {
    it('should create logger with correct name', () => {
      new SecurityHeadersProvider();
      expect(createLogger).toHaveBeenCalledWith('mcp-security');
    });

    it('should use default config when none provided', () => {
      const provider = new SecurityHeadersProvider();
      const headers = provider.getHeaders();
      
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
    });

    it('should log when security is enabled', () => {
      new SecurityHeadersProvider({ enabled: true });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Security headers enabled',
        expect.objectContaining({
          csp: true,
          cors: true,
          hsts: true,
        })
      );
    });

    it('should not log when security is disabled', () => {
      new SecurityHeadersProvider({ enabled: false });
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('getHeaders', () => {
    it('should return empty object when disabled', () => {
      const provider = new SecurityHeadersProvider({ enabled: false });
      expect(provider.getHeaders()).toEqual({});
    });

    it('should return basic security headers when enabled', () => {
      const provider = new SecurityHeadersProvider({ enabled: true });
      const headers = provider.getHeaders();

      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['Permissions-Policy']).toBe('geolocation=(), microphone=(), camera=()');
    });

    it('should include CSP headers when configured', () => {
      const provider = new SecurityHeadersProvider({
        enabled: true,
        csp: {
          defaultSrc: ["'self'", 'https:'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
        },
      });

      const headers = provider.getHeaders();
      expect(headers['Content-Security-Policy']).toContain("default-src 'self' https:");
      expect(headers['Content-Security-Policy']).toContain("script-src 'self' 'unsafe-inline'");
    });

    it('should include HSTS headers when configured', () => {
      const provider = new SecurityHeadersProvider({
        enabled: true,
        hsts: {
          maxAge: 63072000,
          includeSubDomains: true,
          preload: true,
        },
      });

      const headers = provider.getHeaders();
      expect(headers['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains; preload');
    });
  });

  describe('getCorsHeaders', () => {
    it('should return empty object when disabled', () => {
      const provider = new SecurityHeadersProvider({ enabled: false });
      expect(provider.getCorsHeaders()).toEqual({});
    });

    it('should return empty object when CORS not configured', () => {
      const provider = new SecurityHeadersProvider({ enabled: true });
      expect(provider.getCorsHeaders()).toEqual({});
    });

    it('should allow any origin when cors.origin is true', () => {
      const provider = new SecurityHeadersProvider({
        enabled: true,
        cors: { origin: true },
      });

      const headers = provider.getCorsHeaders('https://example.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
    });

    it('should allow specific origin when cors.origin is string', () => {
      const provider = new SecurityHeadersProvider({
        enabled: true,
        cors: { origin: 'https://trusted.com' },
      });

      const headers = provider.getCorsHeaders('https://example.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('https://trusted.com');
    });

    it('should check origin against array when cors.origin is array', () => {
      const provider = new SecurityHeadersProvider({
        enabled: true,
        cors: { origin: ['https://trusted1.com', 'https://trusted2.com'] },
      });

      const headers1 = provider.getCorsHeaders('https://trusted1.com');
      expect(headers1['Access-Control-Allow-Origin']).toBe('https://trusted1.com');

      const headers2 = provider.getCorsHeaders('https://untrusted.com');
      expect(headers2['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should include credentials header when configured', () => {
      const provider = new SecurityHeadersProvider({
        enabled: true,
        cors: { origin: true, credentials: true },
      });

      const headers = provider.getCorsHeaders('https://example.com');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });
  });

  describe('applyHeaders', () => {
    it('should apply all headers to response', () => {
      const provider = new SecurityHeadersProvider({ enabled: true });
      const res = { setHeader: jest.fn() };

      provider.applyHeaders(res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Security headers applied',
        expect.objectContaining({ headerCount: expect.any(Number) })
      );
    });

    it('should apply CORS headers when origin provided', () => {
      const provider = new SecurityHeadersProvider({
        enabled: true,
        cors: { origin: true },
      });
      const res = { setHeader: jest.fn() };

      provider.applyHeaders(res, 'https://example.com');

      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://example.com');
    });
  });

  describe('middleware', () => {
    it('should return Express-style middleware function', () => {
      const provider = new SecurityHeadersProvider({ enabled: true });
      const middleware = provider.middleware();

      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3);
    });

    it('should apply headers and call next', () => {
      const provider = new SecurityHeadersProvider({ enabled: true });
      const middleware = provider.middleware();

      const req = { headers: { origin: 'https://example.com' } };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('dependency injection', () => {
    it('should accept an injected logger', () => {
      const customLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn(() => customLogger),
      };

      const config: SecurityConfig = {
        enabled: true,
        logger: customLogger,
      };

      new SecurityHeadersProvider(config);
      
      // Verify that the custom logger is used
      expect(customLogger.info).toHaveBeenCalledWith(
        'Security headers enabled',
        expect.objectContaining({
          csp: true,
          cors: true,
          hsts: true,
        })
      );
      
      // Verify that createLogger was NOT called (it should use our injected logger)
      expect(createLogger).not.toHaveBeenCalled();
    });

    it('should use createLogger when no logger is injected', () => {
      new SecurityHeadersProvider({ enabled: true });
      
      // Verify that createLogger was called
      expect(createLogger).toHaveBeenCalledWith('mcp-security');
    });

    it('should work correctly with injected logger for debug logging', () => {
      const customLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn(() => customLogger),
      };

      const provider = new SecurityHeadersProvider({
        enabled: true,
        logger: customLogger,
      });

      const res = { setHeader: jest.fn() };
      provider.applyHeaders(res);

      // Verify debug was called on our custom logger
      expect(customLogger.debug).toHaveBeenCalledWith(
        'Security headers applied',
        expect.objectContaining({ headerCount: expect.any(Number) })
      );
    });

    it('should handle createLogger errors by throwing them (no more try-catch workaround)', () => {
      // Reset the mock to throw an error
      (createLogger as jest.Mock).mockImplementation(() => {
        throw new Error('Logger creation failed in test');
      });

      // Since we removed the try-catch, it should now throw
      expect(() => new SecurityHeadersProvider({ enabled: true })).toThrow('Logger creation failed in test');
      
      // Restore the mock for other tests
      (createLogger as jest.Mock).mockReturnValue(mockLogger);
    });
  });
});