import type { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema } from '../base.js';
import type { MonitoredStateManager } from '../../state/monitored-state-manager.js';
import type { IControlSystem } from '../../interfaces/control-system.js';
import type { ToolCallResult } from '../../handlers/index.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import type { QRWCClientAdapter } from '../../qrwc/adapter.js';

/**
 * Parameters for getting event statistics (empty for now)
 */
const GetEventStatisticsParamsSchema = BaseToolParamsSchema.extend({});

type GetEventStatisticsParams = z.infer<typeof GetEventStatisticsParamsSchema>;

/**
 * Tool for getting event monitoring statistics and status
 */
export class GetEventStatisticsTool extends BaseQSysTool<GetEventStatisticsParams> {
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'get_event_statistics',
      'Get event monitoring statistics and status including total events, unique controls, database size, and buffer status. Use this to check if event monitoring is active and working.',
      GetEventStatisticsParamsSchema
    );
  }

  protected async executeInternal(
    params: GetEventStatisticsParams
  ): Promise<ToolCallResult> {
    const startTime = Date.now();

    try {
      // Get state manager from adapter
      const adapter = this.controlSystem as QRWCClientAdapter;
      
      // Check if adapter has getStateManager method
      if (!adapter.getStateManager) {
        return {
          content: [
            {
              type: 'text',
              text: 'Event monitoring is not available. The control system does not support state management.',
            },
          ],
          isError: true,
        };
      }
      
      const stateManager = adapter.getStateManager() as MonitoredStateManager | undefined;
      
      // Check if state manager exists and has event monitor
      if (!stateManager?.getEventMonitor) {
        return {
          content: [
            {
              type: 'text',
              text: 'Event monitoring is not available. Please ensure EVENT_MONITORING_ENABLED=true in your environment.',
            },
          ],
          isError: true,
        };
      }

      const eventMonitor = stateManager.getEventMonitor();

      if (!eventMonitor) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'disabled',
                  message:
                    'Event monitoring is not active. Please create and subscribe to a change group with auto-polling to start recording events.',
                  configuration: {
                    EVENT_MONITORING_ENABLED: process.env['EVENT_MONITORING_ENABLED'] || 'false',
                    EVENT_MONITORING_DB_PATH: process.env['EVENT_MONITORING_DB_PATH'] || './data/events',
                    EVENT_MONITORING_RETENTION_DAYS: process.env['EVENT_MONITORING_RETENTION_DAYS'] || '30',
                    EVENT_MONITORING_BUFFER_SIZE: process.env['EVENT_MONITORING_BUFFER_SIZE'] || '1000',
                    EVENT_MONITORING_FLUSH_INTERVAL: process.env['EVENT_MONITORING_FLUSH_INTERVAL'] || '100',
                  },
                },
                null,
                2
              ),
            },
          ],
          isError: false,
        };
      }

      // Get statistics from event monitor
      const stats = await eventMonitor.getStatistics();

      // Format the response with additional calculated fields
      const response = {
        status: 'enabled',
        statistics: {
          totalEvents: stats.totalEvents,
          uniqueControls: stats.uniqueControls,
          uniqueChangeGroups: stats.uniqueChangeGroups,
          oldestEvent: stats.oldestEvent
            ? new Date(stats.oldestEvent).toISOString()
            : null,
          newestEvent: stats.newestEvent
            ? new Date(stats.newestEvent).toISOString()
            : null,
          timeRange: stats.oldestEvent && stats.newestEvent
            ? {
                durationMs: stats.newestEvent - stats.oldestEvent,
                durationHours: (stats.newestEvent - stats.oldestEvent) / (1000 * 60 * 60),
              }
            : null,
          database: {
            sizeBytes: stats.databaseSize,
            sizeMB: (stats.databaseSize / (1024 * 1024)).toFixed(2),
          },
          buffer: {
            currentSize: stats.bufferSize,
            maxSize: parseInt(process.env['EVENT_MONITORING_BUFFER_SIZE'] || '1000', 10),
            utilizationPercent: (
              (stats.bufferSize / parseInt(process.env['EVENT_MONITORING_BUFFER_SIZE'] || '1000', 10)) *
              100
            ).toFixed(1),
          },
        },
        configuration: {
          enabled: true,
          dbPath: process.env['EVENT_MONITORING_DB_PATH'] || './data/events',
          retentionDays: parseInt(process.env['EVENT_MONITORING_RETENTION_DAYS'] || '30', 10),
          bufferSize: parseInt(process.env['EVENT_MONITORING_BUFFER_SIZE'] || '1000', 10),
          flushInterval: parseInt(process.env['EVENT_MONITORING_FLUSH_INTERVAL'] || '100', 10),
        },
        executionTimeMs: Date.now() - startTime,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error: any) {
      logger.error('Failed to get event statistics', { error });

      return {
        content: [
          {
            type: 'text',
            text: `Failed to get event statistics: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}

/**
 * Factory function to create GetEventStatisticsTool
 */
export function createGetEventStatisticsTool(
  controlSystem: IControlSystem
): GetEventStatisticsTool {
  return new GetEventStatisticsTool(controlSystem);
}