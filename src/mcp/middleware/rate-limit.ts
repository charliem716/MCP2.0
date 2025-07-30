/**
 * Rate Limiting for MCP Server
 * 
 * Implements token bucket algorithm for rate limiting MCP requests
 * to prevent abuse and ensure stable performance.
 */

import type { ILogger } from '../interfaces/logger.js';

/**
 * Rate limiter configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute: number;
  /** Burst size - maximum requests allowed in a burst */
  burstSize: number;
  /** Whether to enable per-client rate limiting */
  perClient: boolean;
  /** Time window in milliseconds for rate calculation */
  windowMs?: number;
}

/**
 * Token bucket implementation for rate limiting
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(capacity: number, refillRatePerMinute: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRatePerMinute / 60000; // Convert to per-ms rate
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token
   */
  tryConsume(): boolean {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    
    return false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Get current token count
   */
  getTokenCount(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * MCP Rate Limiter
 * 
 * Manages rate limiting for MCP server requests using token bucket algorithm
 */
export class MCPRateLimiter<T = string> {
  private readonly logger: ILogger;
  private readonly globalBucket?: TokenBucket;
  private readonly clientBuckets = new Map<string, TokenBucket>();
  private readonly config: Required<RateLimitConfig>;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: RateLimitConfig, logger: ILogger) {
    this.logger = logger;
    
    this.config = {
      ...config,
      windowMs: config.windowMs ?? 60000, // Default to 1 minute window
    };

    // Create global rate limiter if not using per-client limiting
    if (!this.config.perClient) {
      this.globalBucket = new TokenBucket(
        this.config.burstSize,
        this.config.requestsPerMinute
      );
    }

    // Start cleanup interval for stale client buckets
    if (this.config.perClient) {
      this.startCleanup();
    }

    this.logger.info('Rate limiter initialized', {
      requestsPerMinute: this.config.requestsPerMinute,
      burstSize: this.config.burstSize,
      perClient: this.config.perClient,
    });
  }

  /**
   * Check if a request should be allowed
   */
  checkLimit(clientId?: string): boolean {
    try {
      if (!this.config.perClient || !clientId) {
        // Use global rate limiter
        const allowed = this.globalBucket?.tryConsume() ?? true;
        
        if (!allowed) {
          this.logger.warn('Global rate limit exceeded');
        }
        
        return allowed;
      }

      // Use per-client rate limiter
      let bucket = this.clientBuckets.get(clientId);
      
      if (!bucket) {
        bucket = new TokenBucket(
          this.config.burstSize,
          this.config.requestsPerMinute
        );
        this.clientBuckets.set(clientId, bucket);
        
        this.logger.debug('Created new token bucket for client', { clientId });
      }

      const allowed = bucket.tryConsume();
      
      if (!allowed) {
        this.logger.warn('Client rate limit exceeded', { 
          clientId,
          remainingTokens: bucket.getTokenCount(),
        });
      }

      return allowed;
    } catch (error) {
      this.logger.error('Error checking rate limit', { error, clientId });
      // Fail open - allow request on error
      return true;
    }
  }

  /**
   * Get current rate limit status
   */
  getStatus(clientId?: string): {
    allowed: boolean;
    remaining: number;
    limit: number;
    resetAt: Date;
  } {
    const now = Date.now();
    const resetAt = new Date(now + this.config.windowMs);

    if (!this.config.perClient || !clientId) {
      const tokens = this.globalBucket?.getTokenCount() ?? this.config.burstSize;
      
      return {
        allowed: tokens >= 1,
        remaining: Math.floor(tokens),
        limit: this.config.requestsPerMinute,
        resetAt,
      };
    }

    const bucket = this.clientBuckets.get(clientId);
    const tokens = bucket?.getTokenCount() ?? this.config.burstSize;

    return {
      allowed: tokens >= 1,
      remaining: Math.floor(tokens),
      limit: this.config.requestsPerMinute,
      resetAt,
    };
  }

  /**
   * Start cleanup interval for stale client buckets
   */
  private startCleanup(): void {
    // Clean up stale buckets every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const staleThreshold = Date.now() - 300000; // 5 minutes
      let cleaned = 0;

      for (const [clientId, bucket] of this.clientBuckets.entries()) {
        // Check if bucket has been idle
        // This is a simplified check - in production you'd track last access time
        if (bucket.getTokenCount() >= this.config.burstSize) {
          this.clientBuckets.delete(clientId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.logger.debug('Cleaned up stale client buckets', { count: cleaned });
      }
    }, 300000); // Every 5 minutes
  }

  /**
   * Stop the rate limiter and clean up resources
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.clientBuckets.clear();
    this.logger.info('Rate limiter stopped');
  }
}

/**
 * Create rate limit error response
 */
export function createRateLimitError(clientId?: string): {
  code: number;
  message: string;
  data: {
    type: string;
    retryAfter: number;
    clientId?: string;
  };
} {
  return {
    code: -32005, // Custom error code for rate limiting
    message: 'Rate limit exceeded. Please slow down your requests.',
    data: {
      type: 'rate_limit_exceeded',
      retryAfter: 60, // Seconds until rate limit resets
      ...(clientId && { clientId }),
    },
  };
}