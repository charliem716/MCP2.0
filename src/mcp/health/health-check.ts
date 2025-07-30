/**
 * Health Check System for MCP Server
 * 
 * Provides comprehensive health monitoring for all system components
 * including Q-SYS connection, memory usage, and internal state.
 */

import type { ILogger } from '../interfaces/logger.js';
import type { OfficialQRWCClient } from '../../qrwc/officialClient.js';
import type { DIContainer } from '../infrastructure/container.js';
import { ServiceTokens } from '../infrastructure/container.js';
import type { IStateRepository } from '../state/repository.js';
import os from 'os';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Health check status levels
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * Individual health check result
 */
export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Overall system health report
 */
export interface HealthReport {
  status: HealthStatus;
  timestamp: Date;
  version: string;
  uptime: number;
  checks: HealthCheckResult[];
  metrics: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      load: number[];
    };
    connections: {
      qsys: boolean;
      activeClients: number;
    };
  };
}

/**
 * Health Checker
 * 
 * Performs comprehensive health checks on all system components
 */
export class HealthChecker {
  private readonly logger: ILogger;
  private readonly startTime: Date;
  private lastHealthReport?: HealthReport;
  private healthCheckInterval: NodeJS.Timeout | undefined;

  constructor(
    private readonly container: DIContainer,
    private readonly qsysClient: OfficialQRWCClient,
    private readonly serverVersion: string,
    logger: ILogger
  ) {
    this.logger = logger;
    this.startTime = new Date();
    
    this.logger.info('Health checker initialized');
  }

  /**
   * Perform all health checks
   */
  async check(): Promise<HealthReport> {
    const checks: HealthCheckResult[] = [];
    const startTime = Date.now();

    try {
      // Run all health checks in parallel
      const [
        qsysCheck,
        memoryCheck,
        diskCheck,
        stateCheck,
        processCheck,
      ] = await Promise.allSettled([
        this.checkQsysConnection(),
        this.checkMemoryUsage(),
        this.checkDiskSpace(),
        this.checkStateRepository(),
        this.checkProcessHealth(),
      ]);

      // Collect results
      checks.push(this.getCheckResult('Q-SYS Connection', qsysCheck));
      checks.push(this.getCheckResult('Memory Usage', memoryCheck));
      checks.push(this.getCheckResult('Disk Space', diskCheck));
      checks.push(this.getCheckResult('State Repository', stateCheck));
      checks.push(this.getCheckResult('Process Health', processCheck));

      // Determine overall status
      const overallStatus = this.determineOverallStatus(checks);

      // Build health report
      const report: HealthReport = {
        status: overallStatus,
        timestamp: new Date(),
        version: this.serverVersion,
        uptime: Date.now() - this.startTime.getTime(),
        checks,
        metrics: {
          memory: this.getMemoryMetrics(),
          cpu: {
            load: os.loadavg(),
          },
          connections: {
            qsys: this.qsysClient.isConnected(),
            activeClients: 0, // TODO: Track active MCP clients
          },
        },
      };

      // Cache the report
      this.lastHealthReport = report;

      // Log health status
      const checkDuration = Date.now() - startTime;
      this.logger.info('Health check completed', {
        status: overallStatus,
        duration: checkDuration,
        failedChecks: checks.filter(c => c.status !== HealthStatus.HEALTHY).length,
      });

      return report;
    } catch (error) {
      this.logger.error('Health check failed', { error });
      
      return {
        status: HealthStatus.UNHEALTHY,
        timestamp: new Date(),
        version: this.serverVersion,
        uptime: Date.now() - this.startTime.getTime(),
        checks: [{
          name: 'Health Check System',
          status: HealthStatus.UNHEALTHY,
          message: `Health check system error: ${error}`,
        }],
        metrics: {
          memory: this.getMemoryMetrics(),
          cpu: { load: os.loadavg() },
          connections: { qsys: false, activeClients: 0 },
        },
      };
    }
  }

  /**
   * Check Q-SYS connection health
   */
  private async checkQsysConnection(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      if (!this.qsysClient.isConnected()) {
        return {
          name: 'Q-SYS Connection',
          status: HealthStatus.UNHEALTHY,
          message: 'Not connected to Q-SYS Core',
          latencyMs: Date.now() - start,
        };
      }

      // Try a simple command to verify connection is active
      const qrwc = this.qsysClient.getQrwc();
      if (!qrwc) {
        return {
          name: 'Q-SYS Connection',
          status: HealthStatus.UNHEALTHY,
          message: 'QRWC instance not available',
          latencyMs: Date.now() - start,
        };
      }

      // Check if we have components
      const componentCount = Object.keys(qrwc.components).length;
      
      if (componentCount === 0) {
        return {
          name: 'Q-SYS Connection',
          status: HealthStatus.DEGRADED,
          message: 'Connected but no components discovered',
          latencyMs: Date.now() - start,
          metadata: { componentCount },
        };
      }

      return {
        name: 'Q-SYS Connection',
        status: HealthStatus.HEALTHY,
        message: `Connected to Q-SYS Core with ${componentCount} components`,
        latencyMs: Date.now() - start,
        metadata: {
          componentCount,
          host: this.qsysClient.getConnectionOptions().host,
          port: this.qsysClient.getConnectionOptions().port,
        },
      };
    } catch (error) {
      return {
        name: 'Q-SYS Connection',
        status: HealthStatus.UNHEALTHY,
        message: `Connection check failed: ${error}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemoryUsage(): Promise<HealthCheckResult> {
    const metrics = this.getMemoryMetrics();
    
    if (metrics.percentage > 90) {
      return {
        name: 'Memory Usage',
        status: HealthStatus.UNHEALTHY,
        message: `Critical memory usage: ${metrics.percentage.toFixed(1)}%`,
        metadata: metrics,
      };
    }
    
    if (metrics.percentage > 75) {
      return {
        name: 'Memory Usage',
        status: HealthStatus.DEGRADED,
        message: `High memory usage: ${metrics.percentage.toFixed(1)}%`,
        metadata: metrics,
      };
    }
    
    return {
      name: 'Memory Usage',
      status: HealthStatus.HEALTHY,
      message: `Memory usage normal: ${metrics.percentage.toFixed(1)}%`,
      metadata: metrics,
    };
  }

  /**
   * Check disk space
   */
  private async checkDiskSpace(): Promise<HealthCheckResult> {
    try {
      // Check tmp directory space (where state might be persisted)
      const tmpDir = os.tmpdir();
      const stats = await fs.statfs(tmpDir);
      
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bfree * stats.bsize;
      const usedBytes = totalBytes - freeBytes;
      const usagePercent = (usedBytes / totalBytes) * 100;
      
      const metadata = {
        path: tmpDir,
        totalGB: totalBytes / (1024 ** 3),
        freeGB: freeBytes / (1024 ** 3),
        usagePercent,
      };
      
      if (usagePercent > 95) {
        return {
          name: 'Disk Space',
          status: HealthStatus.UNHEALTHY,
          message: `Critical disk usage: ${usagePercent.toFixed(1)}%`,
          metadata,
        };
      }
      
      if (usagePercent > 85) {
        return {
          name: 'Disk Space',
          status: HealthStatus.DEGRADED,
          message: `High disk usage: ${usagePercent.toFixed(1)}%`,
          metadata,
        };
      }
      
      return {
        name: 'Disk Space',
        status: HealthStatus.HEALTHY,
        message: `Disk usage normal: ${usagePercent.toFixed(1)}%`,
        metadata,
      };
    } catch (error) {
      return {
        name: 'Disk Space',
        status: HealthStatus.DEGRADED,
        message: `Could not check disk space: ${error}`,
      };
    }
  }

  /**
   * Check state repository health
   */
  private async checkStateRepository(): Promise<HealthCheckResult> {
    try {
      const stateRepo = this.container.resolve<IStateRepository>(ServiceTokens.STATE_REPOSITORY);
      
      if (!stateRepo) {
        return {
          name: 'State Repository',
          status: HealthStatus.UNHEALTHY,
          message: 'State repository not initialized',
        };
      }

      // Get state repository metrics
      const metrics = await stateRepo.getStatistics();
      
      return {
        name: 'State Repository',
        status: HealthStatus.HEALTHY,
        message: 'State repository operational',
        metadata: { ...metrics },
      };
    } catch (error) {
      return {
        name: 'State Repository',
        status: HealthStatus.DEGRADED,
        message: `State repository check failed: ${error}`,
      };
    }
  }

  /**
   * Check process health
   */
  private checkProcessHealth(): HealthCheckResult {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const metadata = {
      pid: process.pid,
      memoryRSS: memUsage.rss / (1024 ** 2), // MB
      memoryHeap: memUsage.heapUsed / (1024 ** 2), // MB
      cpuUser: cpuUsage.user / 1000, // ms
      cpuSystem: cpuUsage.system / 1000, // ms
      eventLoopUtilization: this.getEventLoopUtilization(),
    };
    
    // Check for memory leaks (heap > 1GB)
    if (memUsage.heapUsed > 1024 ** 3) {
      return {
        name: 'Process Health',
        status: HealthStatus.DEGRADED,
        message: 'High heap memory usage detected',
        metadata,
      };
    }
    
    return {
      name: 'Process Health',
      status: HealthStatus.HEALTHY,
      message: 'Process metrics within normal range',
      metadata,
    };
  }

  /**
   * Get memory metrics
   */
  private getMemoryMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      used: usedMem,
      total: totalMem,
      percentage: (usedMem / totalMem) * 100,
    };
  }

  /**
   * Get event loop utilization (simplified)
   */
  private getEventLoopUtilization() {
    // In a real implementation, use perf_hooks.performance.eventLoopUtilization()
    // For now, return a placeholder
    return 0;
  }

  /**
   * Get result from settled promise
   */
  private getCheckResult(
    name: string,
    result: PromiseSettledResult<HealthCheckResult>
  ): HealthCheckResult {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    
    return {
      name,
      status: HealthStatus.UNHEALTHY,
      message: `Check failed: ${result.reason}`,
    };
  }

  /**
   * Determine overall system status
   */
  private determineOverallStatus(checks: HealthCheckResult[]): HealthStatus {
    const hasUnhealthy = checks.some(c => c.status === HealthStatus.UNHEALTHY);
    const hasDegraded = checks.some(c => c.status === HealthStatus.DEGRADED);
    
    if (hasUnhealthy) {
      return HealthStatus.UNHEALTHY;
    }
    
    if (hasDegraded) {
      return HealthStatus.DEGRADED;
    }
    
    return HealthStatus.HEALTHY;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(intervalMs = 60000): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(() => {
      this.check().catch(error => {
        this.logger.error('Periodic health check failed', { error });
      });
    }, intervalMs);

    this.logger.info('Started periodic health checks', { intervalMs });
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.logger.info('Stopped periodic health checks');
    }
  }

  /**
   * Get last health report
   */
  getLastReport(): HealthReport | undefined {
    return this.lastHealthReport;
  }

  /**
   * Create health check endpoint response
   */
  async getHealthEndpointResponse(verbose = false): Promise<{
    status: 'ok' | 'degraded' | 'error';
    timestamp: string;
    version: string;
    uptime: number;
    checks?: HealthCheckResult[];
    metrics?: HealthReport['metrics'];
  }> {
    const report = await this.check();
    
    const status = report.status === HealthStatus.HEALTHY ? 'ok' as const : 
                   report.status === HealthStatus.DEGRADED ? 'degraded' as const : 'error' as const;
    
    const response = {
      status,
      timestamp: report.timestamp.toISOString(),
      version: report.version,
      uptime: report.uptime,
    };

    if (verbose) {
      return {
        ...response,
        checks: report.checks,
        metrics: report.metrics,
      };
    }

    return response;
  }
}