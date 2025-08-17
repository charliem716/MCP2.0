/**
 * Connection Management Tool
 * 
 * Simple, elegant connection management for Q-SYS Core
 * Three essential actions: status, connect, disconnect
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
  ManageConnectionResult,
} from '../types/connection.js';

/**
 * Input schema for the manage_connection tool
 * Simple discriminated union for 3 actions
 */
const ManageConnectionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('status'),
  }),
  z.object({
    action: z.literal('connect'),
    host: z.string(),
    port: z.number().min(1).max(65535).optional(),
  }),
  z.object({
    action: z.literal('disconnect'),
  }),
]);

type ManageConnectionInput = z.infer<typeof ManageConnectionSchema>;

/**
 * Connection Management Tool implementation
 */
export class ManageConnectionTool extends BaseQSysTool<ManageConnectionInput> {
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'manage_connection',
      'WORKS OFFLINE - Manage Q-SYS Core connection. Actions: status (check connection), connect (host required), disconnect. Works even when Core is offline.',
      ManageConnectionSchema
    );
  }

  /**
   * Override to skip connection check for connection management actions
   * These actions need to work even when disconnected
   */
  protected override skipConnectionCheck(): boolean {
    // For manage_connection tool, we need to check the action parameter
    // to determine if we should skip the connection check
    // This is a special case because some actions need to work when disconnected
    return true; // Skip connection check for all actions - we'll handle it per-action
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
          result = await this.handleStatus(correlationId || '');
          break;
        case 'connect':
          result = await this.handleConnect(validatedInput, correlationId || '');
          break;
        case 'disconnect':
          result = await this.handleDisconnect(correlationId || '');
          break;
        default:
          // This should never happen due to discriminated union validation
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
   * Handle connect action - Connect to Q-SYS Core
   * Automatically switches if already connected to a different Core
   */
  private async handleConnect(
    input: Extract<ManageConnectionInput, { action: 'connect' }>,
    correlationId: string
  ): Promise<ManageConnectionResult> {
    const startTime = Date.now();
    
    try {
      const targetHost = input.host;
      const targetPort = input.port || 443;
      
      logger.info('Initiating connection to Q-SYS Core', { 
        targetHost,
        targetPort,
        correlationId 
      });
      
      // Use switchCore to connect to the new host (handles disconnecting if needed)
      if (this.controlSystem.switchCore) {
        await this.controlSystem.switchCore({
          host: targetHost,
          port: targetPort
        });
      } else {
        // Fallback error if switchCore not implemented
        throw new ValidationError('Connection switching not supported by control system', []);
      }
      
      // Verify connection
      const isConnected = this.controlSystem.isConnected();
      const duration = Date.now() - startTime;
      
      logger.info('Connection attempt completed', {
        success: isConnected,
        host: targetHost,
        duration,
        correlationId
      });
      
      return {
        success: isConnected,
        action: 'connect',
        data: {
          message: isConnected 
            ? `Connected to Q-SYS Core at ${targetHost}` 
            : `Failed to connect to ${targetHost}`,
          host: targetHost,
          port: targetPort,
          connected: isConnected,
          duration
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
          correlationId
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Connection failed', {
        error: error instanceof Error ? error.message : String(error),
        targetHost: input.host,
        duration,
        correlationId
      });
      
      return {
        success: false,
        action: 'connect',
        error: {
          code: 'CONN_FAILED',
          message: error instanceof Error ? error.message : 'Connection failed',
          details: { duration, host: input.host }
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
          correlationId
        }
      };
    }
  }
  
  /**
   * Handle disconnect action - Disconnect from Q-SYS Core
   */
  private async handleDisconnect(
    correlationId: string
  ): Promise<ManageConnectionResult> {
    try {
      logger.info('Disconnecting from Q-SYS Core', { correlationId });
      
      if (this.controlSystem.disconnect) {
        await this.controlSystem.disconnect();
      }
      
      const isConnected = this.controlSystem.isConnected();
      
      return {
        success: !isConnected,
        action: 'disconnect',
        data: {
          message: !isConnected 
            ? 'Successfully disconnected from Q-SYS Core' 
            : 'Failed to disconnect - still connected',
          connected: isConnected
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 0,
          correlationId
        }
      };
    } catch (error) {
      logger.error('Disconnect failed', {
        error: error instanceof Error ? error.message : String(error),
        correlationId
      });
      
      return {
        success: false,
        action: 'disconnect',
        error: {
          code: 'DISCONNECT_FAILED',
          message: error instanceof Error ? error.message : 'Disconnect failed'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          duration: 0,
          correlationId
        }
      };
    }
  }
  
  /**
   * Handle status action - Get connection status
   */
  private async handleStatus(
    correlationId: string
  ): Promise<ManageConnectionResult> {
    try {
      const isConnected = this.controlSystem.isConnected();
      
      // Get basic connection info
      let currentHost = null;
      let currentPort = null;
      let uptime = null;
      
      if (isConnected) {
        // Get connection health if available for uptime calculation
        if (this.controlSystem.getConnectionHealth) {
          const health = this.controlSystem.getConnectionHealth();
          if (health.lastSuccessfulConnection) {
            const connectedTime = new Date(health.lastSuccessfulConnection).getTime();
            uptime = Math.floor((Date.now() - connectedTime) / 1000); // seconds
          }
        }
        // TODO: Get current host/port from control system if available
      }

      return {
        success: true,
        action: 'status',
        data: {
          connected: isConnected,
          host: currentHost,
          port: currentPort,
          uptime,
          message: isConnected 
            ? 'Connected to Q-SYS Core'
            : 'Not connected to any Q-SYS Core'
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

}

/**
 * Factory function to create a ManageConnectionTool instance
 */
export function createManageConnectionTool(
  controlSystem: IControlSystem
): ManageConnectionTool {
  return new ManageConnectionTool(controlSystem);
}
