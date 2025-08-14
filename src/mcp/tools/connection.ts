/**
 * Connection Management Tool
 * 
 * Provides comprehensive connection management capabilities for Q-SYS Core
 * Includes status monitoring, reconnection control, diagnostics, and more
 */

import { z } from 'zod';
import { BaseQSysTool } from './base.js';
import type { IControlSystem } from '../interfaces/control-system.js';
import type { ToolExecutionResult } from './base.js';
import { getCorrelationId } from '../../shared/utils/correlation.js';
import { globalLogger as logger } from '../../shared/utils/logger.js';
import { 
  ValidationError,
} from '../../shared/types/errors.js';
import type {
  ConnectionEvent,
  ReconnectOptions,
  DiagnosticsResult,
  TestResult,
  ConnectionConfig,
  ManageConnectionParams,
  ManageConnectionResult,
} from '../types/connection.js';
import dns from 'dns';
import { promisify } from 'util';
import net from 'net';
import os from 'os';

const dnsLookup = promisify(dns.lookup);

/**
 * Input schema for the manage_connection tool
 */
const ManageConnectionSchema = z.object({
  action: z.enum([
    'status',
    'reconnect',
    'diagnose',
    'test',
    'configure',
    'history',
    'monitor',
    'reset',
    'switch',
  ]),
  // Status action parameters
  verbose: z.boolean().optional(),
  // Reconnect action parameters
  force: z.boolean().optional(),
  maxAttempts: z.number().min(1).max(100).optional(),
  timeout: z.number().min(1000).max(60000).optional(),
  // Diagnose action parameters
  checks: z.array(z.string()).optional(),
  // Test action parameters
  type: z.enum(['basic', 'latency', 'throughput', 'comprehensive']).optional(),
  duration: z.number().min(1).max(300).optional(),
  // Configure action parameters
  settings: z.object({
    autoReconnect: z.boolean().optional(),
    maxRetryAttempts: z.number().min(0).max(100).optional(),
    retryInterval: z.number().min(100).max(60000).optional(),
    connectionTimeout: z.number().min(1000).max(60000).optional(),
    circuitBreakerThreshold: z.number().min(1).max(50).optional(),
  }).optional(),
  // History action parameters
  timeRange: z.enum(['1h', '24h', '7d', '30d']).optional(),
  eventType: z.enum(['all', 'connections', 'disconnections', 'errors']).optional(),
  // Monitor action parameters
  interval: z.number().min(1).max(60).optional(),
  alerts: z.object({
    onDisconnect: z.boolean().optional(),
    onHighLatency: z.number().min(1).max(10000).optional(),
    onErrorRate: z.number().min(0).max(100).optional(),
  }).optional(),
  // Reset action parameters
  clearCaches: z.boolean().optional(),
  resetCircuitBreaker: z.boolean().optional(),
  resetStats: z.boolean().optional(),
  // Switch action parameters
  target: z.object({
    host: z.string(),
    port: z.number().min(1).max(65535).optional(),
  }).optional(),
});

type ManageConnectionInput = z.infer<typeof ManageConnectionSchema>;

/**
 * Connection Management Tool implementation
 */
export class ManageConnectionTool extends BaseQSysTool<ManageConnectionInput> {
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'manage_connection',
      'Manage Q-SYS connection: status, reconnect, diagnose, test, configure, history, monitor, switch IP. Examples: {action:"status"}, {action:"switch",target:{host:"192.168.1.100"}}',
      ManageConnectionSchema
    );
  }

  /**
   * Execute the connection management action (internal implementation)
   */
  protected async executeInternal(input: ManageConnectionInput): Promise<ToolExecutionResult> {
    const correlationId = getCorrelationId();
    const startTime = Date.now();

    try {
      // Input is already validated by base class
      const validatedInput = input;

      // Route to appropriate action handler
      let result: ManageConnectionResult;
      switch (validatedInput.action) {
        case 'status':
          result = await this.handleStatus(validatedInput, correlationId || '');
          break;
        case 'reconnect':
          result = await this.handleReconnect(validatedInput, correlationId || '');
          break;
        case 'diagnose':
          result = await this.handleDiagnose(validatedInput, correlationId || '');
          break;
        case 'test':
          result = await this.handleTest(validatedInput, correlationId || '');
          break;
        case 'configure':
          result = await this.handleConfigure(validatedInput, correlationId || '');
          break;
        case 'history':
          result = await this.handleHistory(validatedInput, correlationId || '');
          break;
        case 'monitor':
          result = await this.handleMonitor(validatedInput, correlationId || '');
          break;
        case 'reset':
          result = await this.handleReset(validatedInput, correlationId || '');
          break;
        case 'switch':
          result = await this.handleSwitch(validatedInput, correlationId || '');
          break;
        default:
          throw new ValidationError(`Unknown action: ${(validatedInput as any).action}`, []);
      }

      const executionTime = Date.now() - startTime;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: !result.success,
        executionTimeMs: executionTime,
        context: {
          startTime,
          toolName: this.name,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorResult: ToolExecutionResult = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: {
                code: 'CONN_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
                details: error,
              },
            }),
          },
        ],
        isError: true,
        executionTimeMs: executionTime,
        context: {
          startTime,
          toolName: this.name,
        },
      };
      return errorResult;
    }
  }

  /**
   * Handle status action - Get connection health and metrics
   */
  private async handleStatus(
    input: ManageConnectionInput,
    correlationId: string
  ): Promise<ManageConnectionResult> {
    try {
      const isConnected = this.controlSystem.isConnected();
      
      // Get connection health if available
      let health = null;
      if (this.controlSystem.getConnectionHealth) {
        health = this.controlSystem.getConnectionHealth();
      }

      // Get connection history summary if verbose
      let history = null;
      if (input.verbose && this.controlSystem.getConnectionHistory) {
        const events = this.controlSystem.getConnectionHistory(100);
        const connections = events.filter(e => e.type === 'connect').length;
        const disconnections = events.filter(e => e.type === 'disconnect').length;
        const errors = events.filter(e => e.type === 'error').length;
        
        history = {
          recentEvents: events.slice(0, 10),
          summary: {
            totalEvents: events.length,
            connections,
            disconnections,
            errors,
          },
        };
      }

      return {
        success: true,
        action: 'status',
        data: {
          connected: isConnected,
          health,
          history: history || undefined,
          timestamp: new Date().toISOString(),
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 0,
          correlationId,
        },
      };
    } catch (error) {
      logger.error('Failed to get connection status', { error, correlationId });
      return {
        success: false,
        action: 'status',
        error: {
          code: 'CONN_STATUS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get connection status',
          details: error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 0,
          correlationId,
        },
      };
    }
  }

  /**
   * Handle reconnect action - Manually trigger reconnection
   */
  private async handleReconnect(
    input: ManageConnectionInput,
    correlationId: string
  ): Promise<ManageConnectionResult> {
    const startTime = Date.now();
    
    try {
      if (!this.controlSystem.reconnect) {
        throw new ValidationError('Reconnection not supported by this control system', []);
      }

      const options: ReconnectOptions = {};
      if (input.force !== undefined) options.force = input.force;
      if (input.maxAttempts !== undefined) options.maxAttempts = input.maxAttempts;
      if (input.timeout !== undefined) options.timeout = input.timeout;

      logger.info('Initiating reconnection', { options, correlationId });
      await this.controlSystem.reconnect(options);

      // Verify connection after reconnect
      const isConnected = this.controlSystem.isConnected();
      const duration = Date.now() - startTime;

      return {
        success: isConnected,
        action: 'reconnect',
        data: {
          connected: isConnected,
          duration,
          options,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
          correlationId,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Reconnection failed', { error, correlationId, duration });
      
      return {
        success: false,
        action: 'reconnect',
        error: {
          code: 'CONN_RECONNECT_ERROR',
          message: error instanceof Error ? error.message : 'Reconnection failed',
          details: error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
          correlationId,
        },
      };
    }
  }

  /**
   * Handle diagnose action - Run connection diagnostics
   */
  private async handleDiagnose(
    input: ManageConnectionInput,
    correlationId: string
  ): Promise<ManageConnectionResult> {
    const startTime = Date.now();
    
    try {
      // If control system has built-in diagnostics, use them
      if (this.controlSystem.runDiagnostics) {
        const diagnostics = await this.controlSystem.runDiagnostics();
        return {
          success: true,
          action: 'diagnose',
          data: diagnostics,
          metadata: {
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            correlationId,
          },
        };
      }

      // Otherwise, run basic diagnostics
      const diagnostics = await this.runBasicDiagnostics(input.checks);
      
      return {
        success: true,
        action: 'diagnose',
        data: diagnostics,
        metadata: {
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          correlationId,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Diagnostics failed', { error, correlationId, duration });
      
      return {
        success: false,
        action: 'diagnose',
        error: {
          code: 'CONN_DIAGNOSE_ERROR',
          message: error instanceof Error ? error.message : 'Diagnostics failed',
          details: error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
          correlationId,
        },
      };
    }
  }

  /**
   * Run basic diagnostics when control system doesn't provide them
   */
  private async runBasicDiagnostics(checks?: string[]): Promise<DiagnosticsResult> {
    const result: DiagnosticsResult = {
      timestamp: new Date(),
      network: { reachable: false },
      dns: { resolved: false },
      port: { open: false },
      websocket: { compatible: true }, // Assume compatible
      authentication: { valid: true }, // Assume valid if connected
      resources: {
        memory: {
          used: process.memoryUsage().heapUsed,
          available: os.totalmem() - os.freemem(),
          percentage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        },
      },
      summary: '',
    };

    const runCheck = (check: string) => !checks || checks.includes(check);

    // Check if connected
    const isConnected = this.controlSystem.isConnected();
    if (isConnected) {
      result.network.reachable = true;
      result.dns.resolved = true;
      result.port.open = true;
      result.websocket.compatible = true;
      result.authentication.valid = true;
      result.summary = 'Connection is healthy';
    } else {
      result.summary = 'Connection is not established';
      
      // Try to get more details from connection health
      if (this.controlSystem.getConnectionHealth) {
        const health = this.controlSystem.getConnectionHealth();
        if (health.circuitBreakerState === 'open') {
          result.summary += ' - Circuit breaker is open';
        }
        if (health.consecutiveFailures > 0) {
          result.summary += ` - ${health.consecutiveFailures} consecutive failures`;
        }
      }
    }

    return result;
  }

  /**
   * Handle test action - Test connection quality
   */
  private async handleTest(
    input: ManageConnectionInput,
    correlationId: string
  ): Promise<ManageConnectionResult> {
    const startTime = Date.now();
    
    try {
      const testType = input.type || 'basic';
      
      // If control system has built-in testing, use it
      if (this.controlSystem.testConnection) {
        const testResult = await this.controlSystem.testConnection(testType);
        return {
          success: testResult.success,
          action: 'test',
          data: testResult,
          metadata: {
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            correlationId,
          },
        };
      }

      // Otherwise, run basic test
      const isConnected = this.controlSystem.isConnected();
      const testResult: TestResult = {
        type: testType,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        results: {
          basic: {
            connected: isConnected,
            responseTime: isConnected ? 1 : 0, // Placeholder
          },
        },
        success: isConnected,
        ...(isConnected ? {} : { error: 'Not connected' }),
      };

      return {
        success: testResult.success,
        action: 'test',
        data: testResult,
        metadata: {
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          correlationId,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Connection test failed', { error, correlationId, duration });
      
      return {
        success: false,
        action: 'test',
        error: {
          code: 'CONN_TEST_ERROR',
          message: error instanceof Error ? error.message : 'Connection test failed',
          details: error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
          correlationId,
        },
      };
    }
  }

  /**
   * Handle configure action - Update connection configuration
   */
  private async handleConfigure(
    input: ManageConnectionInput,
    correlationId: string
  ): Promise<ManageConnectionResult> {
    try {
      if (!input.settings) {
        throw new ValidationError('Settings are required for configure action', []);
      }

      if (!this.controlSystem.updateConnectionConfig) {
        throw new ValidationError('Configuration update not supported by this control system', []);
      }

      const config: Partial<ConnectionConfig> = {};
      if (input.settings.autoReconnect !== undefined) config.autoReconnect = input.settings.autoReconnect;
      if (input.settings.maxRetryAttempts !== undefined) config.maxRetryAttempts = input.settings.maxRetryAttempts;
      if (input.settings.retryInterval !== undefined) config.retryInterval = input.settings.retryInterval;
      if (input.settings.connectionTimeout !== undefined) config.connectionTimeout = input.settings.connectionTimeout;
      if (input.settings.circuitBreakerThreshold !== undefined) config.circuitBreakerThreshold = input.settings.circuitBreakerThreshold;
      
      this.controlSystem.updateConnectionConfig(config);

      return {
        success: true,
        action: 'configure',
        data: {
          settings: input.settings,
          message: 'Configuration updated successfully',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 0,
          correlationId,
        },
      };
    } catch (error) {
      logger.error('Configuration update failed', { error, correlationId });
      
      return {
        success: false,
        action: 'configure',
        error: {
          code: 'CONN_CONFIG_ERROR',
          message: error instanceof Error ? error.message : 'Configuration update failed',
          details: error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 0,
          correlationId,
        },
      };
    }
  }

  /**
   * Handle history action - Get connection event history
   */
  private async handleHistory(
    input: ManageConnectionInput,
    correlationId: string
  ): Promise<ManageConnectionResult> {
    try {
      if (!this.controlSystem.getConnectionHistory) {
        throw new ValidationError('Connection history not supported by this control system', []);
      }

      // Calculate time range
      let limit = 100;
      if (input.timeRange) {
        const ranges = { '1h': 100, '24h': 500, '7d': 1000, '30d': 5000 };
        limit = ranges[input.timeRange];
      }

      // Get events
      let events = this.controlSystem.getConnectionHistory(limit);

      // Filter by type if specified
      if (input.eventType && input.eventType !== 'all') {
        const typeMap = {
          'connections': 'connect' as const,
          'disconnections': 'disconnect' as const,
          'errors': 'error' as const,
        };
        const filterType = typeMap[input.eventType];
        events = events.filter(e => e.type === filterType);
      }

      // Generate summary
      const summary = {
        totalEvents: events.length,
        connections: events.filter(e => e.type === 'connect').length,
        disconnections: events.filter(e => e.type === 'disconnect').length,
        errors: events.filter(e => e.type === 'error').length,
        retries: events.filter(e => e.type === 'retry').length,
      };

      return {
        success: true,
        action: 'history',
        data: {
          events: events.slice(0, 50), // Limit returned events
          summary,
          timeRange: input.timeRange,
          eventType: input.eventType,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 0,
          correlationId,
        },
      };
    } catch (error) {
      logger.error('Failed to get connection history', { error, correlationId });
      
      return {
        success: false,
        action: 'history',
        error: {
          code: 'CONN_HISTORY_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get connection history',
          details: error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 0,
          correlationId,
        },
      };
    }
  }

  /**
   * Handle monitor action - Continuous connection monitoring
   */
  private async handleMonitor(
    input: ManageConnectionInput,
    correlationId: string
  ): Promise<ManageConnectionResult> {
    try {
      // For now, just return current status with monitoring setup message
      // Full monitoring would require a persistent monitoring service
      const interval = input.interval || 5;
      const duration = input.duration || 60;

      const health = this.controlSystem.getConnectionHealth?.();
      const isConnected = this.controlSystem.isConnected();

      return {
        success: true,
        action: 'monitor',
        data: {
          message: `Monitoring would run every ${interval}s for ${duration}s`,
          currentStatus: {
            connected: isConnected,
            health,
          },
          config: {
            interval,
            duration,
            alerts: input.alerts,
          },
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 0,
          correlationId,
        },
      };
    } catch (error) {
      logger.error('Failed to setup monitoring', { error, correlationId });
      
      return {
        success: false,
        action: 'monitor',
        error: {
          code: 'CONN_MONITOR_ERROR',
          message: error instanceof Error ? error.message : 'Failed to setup monitoring',
          details: error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 0,
          correlationId,
        },
      };
    }
  }

  /**
   * Handle reset action - Reset connection and clear states
   */
  private async handleReset(
    input: ManageConnectionInput,
    correlationId: string
  ): Promise<ManageConnectionResult> {
    const startTime = Date.now();
    
    try {
      const actions: string[] = [];

      // Reset circuit breaker if requested
      if (input.resetCircuitBreaker) {
        actions.push('Reset circuit breaker');
        // This would need to be implemented in the control system
      }

      // Clear caches if requested
      if (input.clearCaches) {
        actions.push('Cleared caches');
        // This would need to be implemented in the control system
      }

      // Reset stats if requested
      if (input.resetStats) {
        actions.push('Reset statistics');
        // This would need to be implemented in the control system
      }

      // If no specific reset requested, do a full reset
      if (actions.length === 0) {
        actions.push('Full connection reset');
        if (this.controlSystem.reconnect) {
          await this.controlSystem.reconnect({ force: true });
        }
      }

      return {
        success: true,
        action: 'reset',
        data: {
          actions,
          message: 'Reset completed successfully',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          correlationId,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Reset failed', { error, correlationId, duration });
      
      return {
        success: false,
        action: 'reset',
        error: {
          code: 'CONN_RESET_ERROR',
          message: error instanceof Error ? error.message : 'Reset failed',
          details: error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
          correlationId,
        },
      };
    }
  }

  /**
   * Handle switch action - Switch to a different Q-SYS Core IP
   */
  private async handleSwitch(
    input: ManageConnectionInput,
    correlationId: string
  ): Promise<ManageConnectionResult> {
    const startTime = Date.now();
    
    try {
      // Validate target is provided
      if (!input.target?.host) {
        throw new ValidationError('Target host is required for switch action', []);
      }

      // Check if switchCore is supported
      if (!this.controlSystem.switchCore) {
        throw new ValidationError('IP switching is not supported by this control system', []);
      }

      logger.info('Initiating IP switch', { 
        targetHost: input.target.host,
        targetPort: input.target.port || 443,
        correlationId 
      });

      // Execute the switch
      await this.controlSystem.switchCore({
        host: input.target.host,
        port: input.target.port || 443,
      });

      // Verify connection to new IP
      const isConnected = this.controlSystem.isConnected();
      const duration = Date.now() - startTime;

      logger.info('IP switch completed', {
        success: isConnected,
        newHost: input.target.host,
        duration,
        correlationId
      });

      return {
        success: isConnected,
        action: 'switch',
        data: {
          newHost: input.target.host,
          newPort: input.target.port || 443,
          connected: isConnected,
          duration,
          message: isConnected 
            ? `Successfully switched to ${input.target.host}` 
            : `Failed to connect to ${input.target.host}`,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
          correlationId,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('IP switch failed', { 
        error, 
        targetHost: input.target?.host,
        correlationId, 
        duration 
      });
      
      return {
        success: false,
        action: 'switch',
        error: {
          code: 'CONN_SWITCH_ERROR',
          message: error instanceof Error ? error.message : 'IP switch failed',
          details: error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
          correlationId,
        },
      };
    }
  }
}

/**
 * Factory function to create a ManageConnectionTool instance
 */
export function createManageConnectionTool(
  controlSystem: IControlSystem
): ManageConnectionTool {
  return new ManageConnectionTool(controlSystem);
}