/**
 * Authentication Middleware for MCP Server
 * 
 * Provides API key and token-based authentication for MCP requests.
 * Note: MCP protocol doesn't have built-in auth, so this is a custom implementation
 * that would work with a custom MCP client or proxy.
 */

import type { ILogger } from '../interfaces/logger.js';
import crypto from 'crypto';

/**
 * Authentication configuration
 */
export interface AuthConfig {
  /** Enable authentication */
  enabled: boolean;
  /** List of valid API keys */
  apiKeys?: string[];
  /** Secret for JWT-style token validation */
  jwtSecret?: string;
  /** Token expiration time in seconds */
  tokenExpiration?: number;
  /** Allow anonymous access for specific methods */
  allowAnonymous?: string[];
}

/**
 * Authentication result
 */
export interface AuthResult {
  authenticated: boolean;
  clientId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Simple token payload
 */
interface TokenPayload {
  clientId: string;
  iat: number;
  exp: number;
}

/**
 * MCP Authentication Handler
 * 
 * Handles authentication for MCP requests using API keys or tokens
 */
export class MCPAuthenticator {
  private readonly logger: ILogger;
  private readonly config: Required<AuthConfig>;
  private readonly validApiKeys: Set<string>;
  private readonly tokenCache = new Map<string, TokenPayload>();

  constructor(config: AuthConfig, logger: ILogger) {
    this.logger = logger;
    
    this.config = {
      enabled: config.enabled,
      apiKeys: config.apiKeys ?? [],
      jwtSecret: config.jwtSecret ?? this.generateSecret(),
      tokenExpiration: config.tokenExpiration ?? 3600, // 1 hour default
      allowAnonymous: config.allowAnonymous ?? ['system.ping', 'system.health'],
    };

    // Hash API keys for secure comparison
    this.validApiKeys = new Set(
      this.config.apiKeys.map(key => this.hashApiKey(key))
    );

    if (this.config.enabled) {
      this.logger.info('Authentication enabled', {
        apiKeyCount: this.validApiKeys.size,
        anonymousMethods: this.config.allowAnonymous,
      });
    } else {
      this.logger.info('Authentication disabled');
    }
  }

  /**
   * Authenticate a request
   */
  authenticate(
    method: string,
    headers?: Record<string, string | string[]>,
    metadata?: Record<string, unknown>
  ): AuthResult {
    // Check if authentication is disabled
    if (!this.config.enabled) {
      return { authenticated: true, clientId: 'anonymous' };
    }

    // Check if method allows anonymous access
    if (this.isAnonymousAllowed(method)) {
      return { authenticated: true, clientId: 'anonymous' };
    }

    // Extract auth credentials
    const authHeader = this.extractAuthHeader(headers);
    
    if (!authHeader) {
      this.logger.warn('Missing authentication header', { method });
      return {
        authenticated: false,
        error: 'Missing authentication credentials',
      };
    }

    // Try different auth methods
    if (authHeader.startsWith('Bearer ')) {
      return this.authenticateToken(authHeader.substring(7));
    }
    
    if (authHeader.startsWith('ApiKey ')) {
      return this.authenticateApiKey(authHeader.substring(7));
    }

    // Try as raw API key for backward compatibility
    return this.authenticateApiKey(authHeader);
  }

  /**
   * Generate a token for a client
   */
  generateToken(clientId: string): string {
    const payload: TokenPayload = {
      clientId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.config.tokenExpiration,
    };

    // Simple token generation (not real JWT, but similar concept)
    const tokenData = JSON.stringify(payload);
    const signature = this.sign(tokenData);
    const token = Buffer.from(`${tokenData}.${signature}`).toString('base64');

    // Cache token for fast validation
    this.tokenCache.set(token, payload);

    // Clean up expired tokens periodically
    this.cleanupExpiredTokens();

    return token;
  }

  /**
   * Validate an API key
   */
  validateApiKey(apiKey: string): boolean {
    const hashedKey = this.hashApiKey(apiKey);
    return this.validApiKeys.has(hashedKey);
  }

  /**
   * Check if method allows anonymous access
   */
  private isAnonymousAllowed(method: string): boolean {
    return this.config.allowAnonymous.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
        return regex.test(method);
      }
      return pattern === method;
    });
  }

  /**
   * Extract auth header from various sources
   */
  private extractAuthHeader(
    headers?: Record<string, string | string[]>
  ): string | undefined {
    if (!headers) return undefined;

    // Check standard Authorization header
    const authHeader = headers['authorization'] ?? headers['Authorization'];
    if (authHeader) {
      return Array.isArray(authHeader) ? authHeader[0] : authHeader;
    }

    // Check custom X-API-Key header
    const apiKeyHeader = headers['x-api-key'] ?? headers['X-API-Key'];
    if (apiKeyHeader) {
      const key = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
      return `ApiKey ${key}`;
    }

    return undefined;
  }

  /**
   * Authenticate using token
   */
  private authenticateToken(token: string): AuthResult {
    try {
      // Check cache first
      const cached = this.tokenCache.get(token);
      if (cached) {
        if (cached.exp > Date.now() / 1000) {
          return {
            authenticated: true,
            clientId: cached.clientId,
            metadata: { tokenExp: cached.exp },
          };
        } else {
          this.tokenCache.delete(token);
        }
      }

      // Decode and verify token
      const decoded = Buffer.from(token, 'base64').toString();
      const [payloadStr, signature] = decoded.split('.');
      
      if (!payloadStr || !signature) {
        return { authenticated: false, error: 'Invalid token format' };
      }

      // Verify signature
      if (this.sign(payloadStr) !== signature) {
        return { authenticated: false, error: 'Invalid token signature' };
      }

      // Parse payload
      const payload: TokenPayload = JSON.parse(payloadStr);
      
      // Check expiration
      if (payload.exp <= Date.now() / 1000) {
        return { authenticated: false, error: 'Token expired' };
      }

      // Cache for future use
      this.tokenCache.set(token, payload);

      return {
        authenticated: true,
        clientId: payload.clientId,
        metadata: { tokenExp: payload.exp },
      };
    } catch (error) {
      this.logger.error('Token authentication failed', { error });
      return { authenticated: false, error: 'Invalid token' };
    }
  }

  /**
   * Authenticate using API key
   */
  private authenticateApiKey(apiKey: string): AuthResult {
    const hashedKey = this.hashApiKey(apiKey);
    
    if (this.validApiKeys.has(hashedKey)) {
      // Generate client ID from API key (first 8 chars of hash)
      const clientId = `api_${hashedKey.substring(0, 8)}`;
      
      return {
        authenticated: true,
        clientId,
        metadata: { authMethod: 'api_key' },
      };
    }

    this.logger.warn('Invalid API key attempted');
    return { authenticated: false, error: 'Invalid API key' };
  }

  /**
   * Hash API key for secure storage
   */
  private hashApiKey(apiKey: string): string {
    return crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');
  }

  /**
   * Sign data with secret
   */
  private sign(data: string): string {
    return crypto
      .createHmac('sha256', this.config.jwtSecret)
      .update(data)
      .digest('hex');
  }

  /**
   * Generate a secure random secret
   */
  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Clean up expired tokens from cache
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now() / 1000;
    let cleaned = 0;

    for (const [token, payload] of this.tokenCache.entries()) {
      if (payload.exp <= now) {
        this.tokenCache.delete(token);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Cleaned up expired tokens', { count: cleaned });
    }
  }

  /**
   * Get authentication statistics
   */
  getStats() {
    return {
      enabled: this.config.enabled,
      apiKeyCount: this.validApiKeys.size,
      cachedTokens: this.tokenCache.size,
      anonymousMethods: this.config.allowAnonymous,
    };
  }
}

/**
 * Create authentication error response
 */
export function createAuthError(message: string): {
  code: number;
  message: string;
  data: {
    type: string;
  };
} {
  return {
    code: -32001, // Custom error code for authentication
    message: `Authentication failed: ${message}`,
    data: {
      type: 'authentication_error',
    },
  };
}