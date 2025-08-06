/**
 * Security Headers Middleware for MCP Server
 * 
 * Provides security headers for HTTP-based MCP transports.
 * Note: MCP primarily uses stdio transport, so these headers
 * are mainly for future HTTP/WebSocket transport support.
 */

import { createLogger, type Logger } from '../../shared/utils/logger.js';

/**
 * Security configuration
 */
export interface SecurityConfig {
  /** Enable security headers */
  enabled?: boolean;
  /** Optional logger instance for dependency injection */
  logger?: Logger;
  /** Content Security Policy directives */
  csp?: {
    defaultSrc?: string[];
    scriptSrc?: string[];
    styleSrc?: string[];
    imgSrc?: string[];
    connectSrc?: string[];
    fontSrc?: string[];
    objectSrc?: string[];
    mediaSrc?: string[];
    frameSrc?: string[];
  };
  /** CORS configuration */
  cors?: {
    origin?: string | string[] | boolean;
    credentials?: boolean;
    maxAge?: number;
  };
  /** HSTS configuration */
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
}

/**
 * Security Headers Provider
 * 
 * Provides security headers for MCP server responses
 */
export class SecurityHeadersProvider {
  private readonly logger: Logger;
  private readonly config: Required<Omit<SecurityConfig, 'logger'>>;

  constructor(config: SecurityConfig = {}) {
    // Use injected logger or create a default one
    this.logger = config.logger ?? createLogger('mcp-security');

    this.config = {
      enabled: config.enabled ?? true,
      csp: {
        defaultSrc: config.csp?.defaultSrc ?? ["'self'"],
        scriptSrc: config.csp?.scriptSrc ?? ["'self'"],
        styleSrc: config.csp?.styleSrc ?? ["'self'", "'unsafe-inline'"],
        imgSrc: config.csp?.imgSrc ?? ["'self'", "data:", "https:"],
        connectSrc: config.csp?.connectSrc ?? ["'self'"],
        fontSrc: config.csp?.fontSrc ?? ["'self'"],
        objectSrc: config.csp?.objectSrc ?? ["'none'"],
        mediaSrc: config.csp?.mediaSrc ?? ["'self'"],
        frameSrc: config.csp?.frameSrc ?? ["'none'"],
      },
      cors: {
        origin: config.cors?.origin ?? false,
        credentials: config.cors?.credentials ?? true,
        maxAge: config.cors?.maxAge ?? 86400,
      },
      hsts: {
        maxAge: config.hsts?.maxAge ?? 31536000,
        includeSubDomains: config.hsts?.includeSubDomains ?? true,
        preload: config.hsts?.preload ?? false,
      },
    };

    if (this.config.enabled) {
      this.logger.info('Security headers enabled', {
        csp: !!this.config.csp,
        cors: !!this.config.cors,
        hsts: !!this.config.hsts,
      });
    }
  }

  /**
   * Get security headers for response
   */
  getHeaders(): Record<string, string> {
    if (!this.config.enabled) {
      return {};
    }

    const headers: Record<string, string> = {};

    // Basic security headers
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['X-Frame-Options'] = 'DENY';
    headers['X-XSS-Protection'] = '1; mode=block';
    headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()';

    // Content Security Policy
    if (this.config.csp) {
      const cspDirectives: string[] = [];
      
      for (const [directive, sources] of Object.entries(this.config.csp)) {
        if (sources && sources.length > 0) {
          const kebabDirective = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
          cspDirectives.push(`${kebabDirective} ${sources.join(' ')}`);
        }
      }

      if (cspDirectives.length > 0) {
        headers['Content-Security-Policy'] = cspDirectives.join('; ');
      }
    }

    // HSTS
    if (this.config.hsts) {
      const hstsDirectives: string[] = [`max-age=${this.config.hsts.maxAge}`];
      
      if (this.config.hsts.includeSubDomains) {
        hstsDirectives.push('includeSubDomains');
      }
      
      if (this.config.hsts.preload) {
        hstsDirectives.push('preload');
      }

      headers['Strict-Transport-Security'] = hstsDirectives.join('; ');
    }

    return headers;
  }

  /**
   * Get CORS headers
   */
  getCorsHeaders(origin?: string): Record<string, string> {
    if (!this.config.enabled || !this.config.cors) {
      return {};
    }

    const headers: Record<string, string> = {};

    // Handle origin
    const { origin: allowedOrigin, credentials, maxAge } = this.config.cors;
    
    if (allowedOrigin === true) {
      // Allow any origin
      headers['Access-Control-Allow-Origin'] = origin || '*';
    } else if (typeof allowedOrigin === 'string') {
      // Allow specific origin
      headers['Access-Control-Allow-Origin'] = allowedOrigin;
    } else if (Array.isArray(allowedOrigin) && origin) {
      // Check if origin is in allowed list
      if (allowedOrigin.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
      }
    }

    // Other CORS headers
    if (headers['Access-Control-Allow-Origin']) {
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-API-Key';
      
      if (credentials) {
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
      
      if (maxAge) {
        headers['Access-Control-Max-Age'] = String(maxAge);
      }
    }

    return headers;
  }

  /**
   * Apply security headers to response (for HTTP transport)
   */
  applyHeaders(res: {
    setHeader: (name: string, value: string) => void;
  }, origin?: string): void {
    const headers = this.getHeaders();
    const corsHeaders = this.getCorsHeaders(origin);

    // Apply all headers
    for (const [name, value] of Object.entries({ ...headers, ...corsHeaders })) {
      res.setHeader(name, value);
    }

    this.logger.debug('Security headers applied', {
      headerCount: Object.keys(headers).length + Object.keys(corsHeaders).length,
    });
  }

  /**
   * Get security headers as middleware (Express-style)
   */
  middleware() {
    return (req: { headers: { origin?: string } }, res: any, next: () => void) => {
      this.applyHeaders(res, req.headers.origin);
      next();
    };
  }
}

/**
 * Create security headers middleware
 */
export function createSecurityHeaders(config?: SecurityConfig) {
  const provider = new SecurityHeadersProvider(config);
  return provider.middleware();
}

/**
 * Default security headers for MCP
 */
export const defaultSecurityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
};