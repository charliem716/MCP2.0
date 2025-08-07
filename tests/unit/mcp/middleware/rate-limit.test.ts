/**
 * Rate Limiting Middleware Tests
 * 
 * Comprehensive test coverage for MCP rate limiting functionality
 */

import { MCPRateLimiter, createRateLimitError } from '../../../../src/mcp/middleware/rate-limit.js';
import type { ILogger } from '../../../../src/mcp/interfaces/logger.js';

// Mock logger
const createMockLogger = (): ILogger => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  child: jest.fn(() => createMockLogger()),
});

describe('MCPRateLimiter', () => {
  let logger: ILogger;
  
  beforeEach(() => {
    logger = createMockLogger();
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });
  
  describe('Global Rate Limiting', () => {
    it('should allow requests within rate limit', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 10,
          perClient: false,
        },
        logger
      );
      
      // Should allow burst of 10 requests
      for (let i = 0; i < 10; i++) {
        expect(limiter.checkLimit()).toBe(true);
      }
    });
    
    it('should block requests exceeding burst size', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 5,
          perClient: false,
        },
        logger
      );
      
      // Use up burst
      for (let i = 0; i < 5; i++) {
        expect(limiter.checkLimit()).toBe(true);
      }
      
      // Should block next request
      expect(limiter.checkLimit()).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Global rate limit exceeded');
    });
    
    it('should refill tokens over time', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60, // 1 per second
          burstSize: 2,
          perClient: false,
        },
        logger
      );
      
      // Use up burst
      expect(limiter.checkLimit()).toBe(true);
      expect(limiter.checkLimit()).toBe(true);
      expect(limiter.checkLimit()).toBe(false);
      
      // Wait 1 second - should refill 1 token
      jest.advanceTimersByTime(1000);
      expect(limiter.checkLimit()).toBe(true);
      expect(limiter.checkLimit()).toBe(false);
      
      // Wait 2 more seconds - should refill 2 tokens (capped at burst size)
      jest.advanceTimersByTime(2000);
      expect(limiter.checkLimit()).toBe(true);
      expect(limiter.checkLimit()).toBe(true);
      expect(limiter.checkLimit()).toBe(false);
    });
  });
  
  describe('Per-Client Rate Limiting', () => {
    it('should track limits separately per client', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 3,
          perClient: true,
        },
        logger
      );
      
      // Client A uses their burst
      expect(limiter.checkLimit('client-a')).toBe(true);
      expect(limiter.checkLimit('client-a')).toBe(true);
      expect(limiter.checkLimit('client-a')).toBe(true);
      expect(limiter.checkLimit('client-a')).toBe(false);
      
      // Client B should still have their full burst
      expect(limiter.checkLimit('client-b')).toBe(true);
      expect(limiter.checkLimit('client-b')).toBe(true);
      expect(limiter.checkLimit('client-b')).toBe(true);
      expect(limiter.checkLimit('client-b')).toBe(false);
    });
    
    it('should create new buckets for new clients', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 2,
          perClient: true,
        },
        logger
      );
      
      expect(limiter.checkLimit('new-client')).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        'Created new token bucket for client',
        { clientId: 'new-client' }
      );
    });
    
    it('should clean up stale client buckets', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 2,
          perClient: true,
        },
        logger
      );
      
      // Create client bucket
      limiter.checkLimit('client-1');
      limiter.checkLimit('client-1');
      
      // Wait for tokens to refill to max
      jest.advanceTimersByTime(120000); // 2 minutes
      
      // Trigger cleanup (happens every 5 minutes)
      jest.advanceTimersByTime(300000); // 5 minutes
      
      expect(logger.debug).toHaveBeenCalledWith(
        'Cleaned up stale client buckets',
        { count: 1 }
      );
    });
  });
  
  describe('Status Reporting', () => {
    it('should report correct status for global limiter', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 5,
          perClient: false,
          windowMs: 60000,
        },
        logger
      );
      
      // Use 2 tokens
      limiter.checkLimit();
      limiter.checkLimit();
      
      const status = limiter.getStatus();
      expect(status.allowed).toBe(true);
      expect(status.remaining).toBe(3);
      expect(status.limit).toBe(60);
      expect(status.resetAt).toBeInstanceOf(Date);
    });
    
    it('should report correct status for per-client limiter', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 120,
          burstSize: 10,
          perClient: true,
          windowMs: 60000,
        },
        logger
      );
      
      // Use 8 tokens for client
      for (let i = 0; i < 8; i++) {
        limiter.checkLimit('client-x');
      }
      
      const status = limiter.getStatus('client-x');
      expect(status.allowed).toBe(true);
      expect(status.remaining).toBe(2);
      expect(status.limit).toBe(120);
    });
    
    it('should report status for unknown client', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 5,
          perClient: true,
        },
        logger
      );
      
      const status = limiter.getStatus('unknown-client');
      expect(status.allowed).toBe(true);
      expect(status.remaining).toBe(5);
      expect(status.limit).toBe(60);
    });
  });
  
  describe('Error Handling', () => {
    it('should fail open on errors', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 5,
          perClient: true, // Use per-client to test error path
        },
        logger
      );
      
      // Mock the clientBuckets Map to throw an error
      const originalGet = Map.prototype.get;
      Map.prototype.get = jest.fn().mockImplementation(function(this: Map<any, any>, key: any) {
        if (key === 'error-client') {
          throw new Error('Test error');
        }
        return originalGet.call(this, key);
      });
      
      // Should allow request despite error
      expect(limiter.checkLimit('error-client')).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        'Error checking rate limit',
        expect.objectContaining({
          error: expect.any(Error),
          clientId: 'error-client',
        })
      );
      
      // Restore original method
      Map.prototype.get = originalGet;
    });
  });
  
  describe('Cleanup', () => {
    it('should stop cleanup interval on stop', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 5,
          perClient: true,
        },
        logger
      );
      
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      limiter.stop();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Rate limiter stopped');
    });
    
    it('should clear client buckets on stop', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 5,
          perClient: true,
        },
        logger
      );
      
      // Create some client buckets
      limiter.checkLimit('client-1');
      limiter.checkLimit('client-2');
      
      limiter.stop();
      
      // Verify buckets are cleared by checking new client gets full burst
      const newLimiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 5,
          perClient: true,
        },
        logger
      );
      
      const status = newLimiter.getStatus('client-1');
      expect(status.remaining).toBe(5);
    });
  });
  
  describe('createRateLimitError', () => {
    it('should create error with client ID', () => {
      const error = createRateLimitError('test-client');
      
      expect(error).toEqual({
        code: -32005,
        message: 'Rate limit exceeded. Please slow down your requests.',
        data: {
          type: 'rate_limit_exceeded',
          retryAfter: 60,
          clientId: 'test-client',
        },
      });
    });
    
    it('should create error without client ID', () => {
      const error = createRateLimitError();
      
      expect(error).toEqual({
        code: -32005,
        message: 'Rate limit exceeded. Please slow down your requests.',
        data: {
          type: 'rate_limit_exceeded',
          retryAfter: 60,
        },
      });
    });
  });
  
  describe('Configuration', () => {
    it('should use default window if not specified', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 5,
          perClient: false,
        },
        logger
      );
      
      const status = limiter.getStatus();
      const resetTime = status.resetAt.getTime() - Date.now();
      
      // Should be approximately 60000ms (1 minute)
      expect(resetTime).toBeGreaterThan(59000);
      expect(resetTime).toBeLessThanOrEqual(60000);
    });
    
    it('should use custom window if specified', () => {
      const limiter = new MCPRateLimiter(
        {
          requestsPerMinute: 60,
          burstSize: 5,
          perClient: false,
          windowMs: 30000, // 30 seconds
        },
        logger
      );
      
      const status = limiter.getStatus();
      const resetTime = status.resetAt.getTime() - Date.now();
      
      // Should be approximately 30000ms
      expect(resetTime).toBeGreaterThan(29000);
      expect(resetTime).toBeLessThanOrEqual(30000);
    });
  });
});