/**
 * HTTP Health Endpoint for MCP Server
 * 
 * Provides a health check endpoint for monitoring and alerting systems
 */

import { createServer, type Server } from 'http';
import type { HealthChecker } from '../health/health-check.js';
import type { MCPMetrics } from './metrics.js';
import type { ILogger } from '../interfaces/logger.js';
import { getCorrelationId, generateCorrelationId, runWithCorrelation } from '../../shared/utils/correlation.js';

export interface HealthEndpointConfig {
  port?: number;
  host?: string;
  enabled?: boolean;
}

/**
 * Health Endpoint Server
 * 
 * Provides HTTP endpoints for health checking and metrics
 */
export class HealthEndpointServer {
  private server?: Server;
  private readonly port: number;
  private readonly host: string;
  private readonly enabled: boolean;

  constructor(
    private readonly healthChecker: HealthChecker,
    private readonly metrics: MCPMetrics,
    private readonly logger: ILogger,
    config: HealthEndpointConfig = {}
  ) {
    this.port = config.port ?? 8080;
    this.host = config.host ?? '127.0.0.1';
    this.enabled = config.enabled ?? true;
  }

  /**
   * Start the health endpoint server
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      this.logger.info('Health endpoint disabled');
      return;
    }

    this.server = createServer(async (req, res) => {
      const correlationId = generateCorrelationId();
      
      await runWithCorrelation(correlationId, async () => {
        const startTime = Date.now();
        const url = req.url ?? '/';
        
        this.logger.info('Health endpoint request', {
          method: req.method,
          url,
          correlationId,
          component: 'health.endpoint',
          headers: req.headers
        });

        // CORS headers for browser access
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('X-Correlation-ID', correlationId);

        // Handle OPTIONS for CORS
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // Only allow GET requests
        if (req.method !== 'GET') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          // Route handling
          if (url === '/health' || url === '/health/') {
            await this.handleHealth(req, res, false, correlationId);
          } else if (url === '/health/verbose' || url.includes('verbose=true')) {
            await this.handleHealth(req, res, true, correlationId);
          } else if (url === '/metrics') {
            await this.handleMetrics(req, res, correlationId);
          } else if (url === '/metrics/json') {
            await this.handleMetricsJSON(req, res, correlationId);
          } else if (url === '/ready') {
            await this.handleReadiness(req, res, correlationId);
          } else if (url === '/live') {
            await this.handleLiveness(req, res, correlationId);
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              error: 'Not found',
              availableEndpoints: [
                '/health',
                '/health/verbose',
                '/metrics',
                '/metrics/json',
                '/ready',
                '/live'
              ]
            }));
          }

          const duration = Date.now() - startTime;
          this.logger.info('Health endpoint response', {
            url,
            statusCode: res.statusCode,
            duration,
            correlationId,
            component: 'health.endpoint'
          });
        } catch (error) {
          const duration = Date.now() - startTime;
          this.logger.error('Health endpoint error', {
            error,
            url,
            duration,
            correlationId,
            component: 'health.endpoint'
          });
          
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Internal server error',
            correlationId 
          }));
        }
      }, { startTime: Date.now() });
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, this.host, () => {
        this.logger.info('Health endpoint server started', {
          host: this.host,
          port: this.port,
          component: 'health.endpoint',
          endpoints: [
            `http://${this.host}:${this.port}/health`,
            `http://${this.host}:${this.port}/metrics`
          ]
        });
        resolve();
      });

      this.server!.on('error', (error) => {
        this.logger.error('Health endpoint server error', { 
          error,
          component: 'health.endpoint'
        });
        reject(error);
      });
    });
  }

  /**
   * Stop the health endpoint server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.logger.info('Health endpoint server stopped', {
          component: 'health.endpoint'
        });
        resolve();
      });
    });
  }

  /**
   * Handle health check endpoint
   */
  private async handleHealth(
    req: any,
    res: any,
    verbose: boolean,
    correlationId: string
  ): Promise<void> {
    const health = await this.healthChecker.getHealthEndpointResponse(verbose);
    
    const statusCode = health.status === 'ok' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;
    
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...health,
      correlationId
    }, null, 2));
  }

  /**
   * Handle metrics endpoint (Prometheus format)
   */
  private async handleMetrics(
    req: any,
    res: any,
    correlationId: string
  ): Promise<void> {
    const metricsText = this.metrics.export();
    
    res.writeHead(200, { 
      'Content-Type': 'text/plain; version=0.0.4',
      'X-Correlation-ID': correlationId
    });
    res.end(metricsText);
  }

  /**
   * Handle metrics endpoint (JSON format)
   */
  private async handleMetricsJSON(
    req: any,
    res: any,
    correlationId: string
  ): Promise<void> {
    const metricsJson = this.metrics.toJSON();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...metricsJson,
      correlationId,
      timestamp: new Date().toISOString()
    }, null, 2));
  }

  /**
   * Handle readiness probe (for Kubernetes)
   */
  private async handleReadiness(
    req: any,
    res: any,
    correlationId: string
  ): Promise<void> {
    const health = await this.healthChecker.getHealthEndpointResponse(false);
    
    if (health.status === 'ok' || health.status === 'degraded') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        ready: true,
        correlationId 
      }));
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        ready: false,
        reason: 'System unhealthy',
        correlationId 
      }));
    }
  }

  /**
   * Handle liveness probe (for Kubernetes)
   */
  private async handleLiveness(
    req: any,
    res: any,
    correlationId: string
  ): Promise<void> {
    // Liveness is simpler - just check if the process is responsive
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      alive: true,
      correlationId,
      timestamp: new Date().toISOString()
    }));
  }
}