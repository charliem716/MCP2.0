import { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema } from '../base.js';
import type { MonitoredStateManager } from '../../state/monitored-state-manager.js';
import type { IControlSystem } from '../../interfaces/control-system.js';
import type { ToolCallResult } from '../../handlers/index.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import type { QRWCClientAdapter } from '../../qrwc/adapter.js';

/**
 * Parameters for querying historical change events
 */
const QueryEventsParamsSchema = BaseToolParamsSchema.extend({
  startTime: z
    .number()
    .optional()
    .describe('Start time (Unix timestamp in milliseconds)'),
  endTime: z
    .number()
    .optional()
    .describe('End time (Unix timestamp in milliseconds)'),
  changeGroupId: z
    .string()
    .optional()
    .describe('Filter by specific change group ID'),
  controlNames: z
    .array(z.string())
    .optional()
    .describe('Filter by specific control names'),
  componentNames: z
    .array(z.string())
    .optional()
    .describe('Filter by component names'),
  limit: z
    .number()
    .min(1)
    .max(10000)
    .default(1000)
    .optional()
    .describe('Maximum number of events to return (default: 1000, max: 10000)'),
  offset: z
    .number()
    .min(0)
    .optional()
    .describe('Number of events to skip for pagination'),
});

type QueryEventsParams = z.infer<typeof QueryEventsParamsSchema>;

/**
 * Tool for querying historical control change events
 */
export class QueryChangeEventsTool extends BaseQSysTool<QueryEventsParams> {
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'query_change_events',
      'Query historical control change events from the event monitoring system. Returns events recorded from active change groups with auto-polling. Use startTime/endTime for time ranges, controlNames/componentNames for filtering, and limit/offset for pagination.',
      QueryEventsParamsSchema
    );
  }

  protected async executeInternal(params: QueryEventsParams): Promise<ToolCallResult> {
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
              text: 'Event monitoring is not active. Please create and subscribe to a change group with auto-polling to start recording events.',
            },
          ],
          isError: true,
        };
      }

      // Query events with provided parameters
      const queryParams: {
        limit?: number;
        startTime?: number;
        endTime?: number;
        changeGroupId?: string;
        controlPaths?: string[];
      } = {
        limit: params.limit || 1000,
      };
      
      if (params.startTime !== undefined) queryParams.startTime = params.startTime;
      if (params.endTime !== undefined) queryParams.endTime = params.endTime;
      if (params.changeGroupId !== undefined) queryParams.changeGroupId = params.changeGroupId;
      if (params.controlNames !== undefined) queryParams.controlPaths = params.controlNames;

      const events = await eventMonitor.queryEvents(queryParams);

      // The new monitor returns raw values, not JSON strings
      const formattedEvents = events.map((event: any) => ({
        ...event,
        value: event.value,
        stringValue: event.stringValue
      }));

      const response = {
        eventCount: events.length,
        events: formattedEvents,
        query: {
          startTime: params.startTime,
          endTime: params.endTime,
          changeGroupId: params.changeGroupId,
          controlNames: params.controlNames,
          componentNames: params.componentNames,
          limit: params.limit || 1000,
          offset: params.offset,
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
      logger.error('Failed to query events', { error, params });

      return {
        content: [
          {
            type: 'text',
            text: `Failed to query events: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}

/**
 * Factory function to create QueryChangeEventsTool
 */
export function createQueryChangeEventsTool(
  controlSystem: IControlSystem
): QueryChangeEventsTool {
  return new QueryChangeEventsTool(controlSystem);
}