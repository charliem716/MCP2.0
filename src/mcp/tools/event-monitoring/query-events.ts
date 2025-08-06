import { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema } from '../base.js';
import type { MonitoredStateManager } from '../../state/monitored-state-manager.js';
import type { IControlSystem } from '../../interfaces/control-system.js';
import type { ToolCallResult } from '../../handlers/index.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';

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
      // Cast control system to MonitoredStateManager to access event monitor
      const stateManager = this.controlSystem as unknown as MonitoredStateManager;
      
      // Check if getEventMonitor method exists
      if (!stateManager.getEventMonitor) {
        return {
          content: [
            {
              type: 'text',
              text: 'Event monitoring is not available. The system may not be configured with event monitoring support.',
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
              text: 'Event monitoring is not enabled. Please ensure EVENT_MONITORING_ENABLED=true and create a change group with auto-polling to start recording events.',
            },
          ],
          isError: true,
        };
      }

      // Query events with provided parameters, filtering out undefined values
      const queryParams: Parameters<typeof eventMonitor.query>[0] = {
        limit: params.limit || 1000,
      };
      
      if (params.startTime !== undefined) queryParams.startTime = params.startTime;
      if (params.endTime !== undefined) queryParams.endTime = params.endTime;
      if (params.changeGroupId !== undefined) queryParams.changeGroupId = params.changeGroupId;
      if (params.controlNames !== undefined) queryParams.controlNames = params.controlNames;
      if (params.componentNames !== undefined) queryParams.componentNames = params.componentNames;
      if (params.offset !== undefined) queryParams.offset = params.offset;

      const events = await eventMonitor.query(queryParams);

      // Parse JSON values for better readability
      const formattedEvents = events.map(event => ({
        ...event,
        value: JSON.parse(event.value),
        previousValue: event.previousValue ? JSON.parse(event.previousValue) : undefined,
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