import { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema } from '../base.js';
import type { MonitoredStateManager } from '../../state/monitored-state-manager.js';
import type { IControlSystem } from '../../interfaces/control-system.js';
import type { ToolCallResult } from '../../handlers/index.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';
import type { QRWCClientAdapter } from '../../qrwc/adapter.js';
import type { DatabaseEventRow } from '../../../shared/types/external-apis.js';

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
    .union([z.number(), z.string().transform(v => parseInt(v, 10))])
    .pipe(z.number().min(1).max(10000))
    .default(1000)
    .optional()
    .describe('Maximum number of events to return (default: 1000, max: 10000)'),
  offset: z
    .union([z.number(), z.string().transform(v => parseInt(v, 10))])
    .pipe(z.number().min(0))
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
      'Query the persistent event database for historical control changes recorded by automatic polling. ALWAYS filter by changeGroupId or controlNames to avoid mixed results. This shows actual recorded events, not manual poll results. Example: {changeGroupId:"mixer-controls",limit:50}. Numeric params accept strings.',
      QueryEventsParamsSchema as z.ZodSchema<QueryEventsParams>
    );
  }

  /**
   * Override to skip connection check - queries local SQLite database
   * Event data is stored locally and doesn't require Q-SYS connection
   */
  protected override skipConnectionCheck(): boolean {
    return true;
  }

  protected async executeInternal(params: QueryEventsParams): Promise<ToolCallResult> {
    const startTime = Date.now();

    try {
      // Get state manager from adapter with proper null checking
      const adapter = this.controlSystem as QRWCClientAdapter;
      
      // Check if adapter has getStateManager method
      if (!adapter || typeof adapter.getStateManager !== 'function') {
        logger.warn('Event monitoring not supported - adapter missing getStateManager', {
          adapterType: adapter?.constructor?.name,
          hasMethod: !!adapter?.getStateManager,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: 'Event monitoring is not available. The control system does not support state management.',
                hint: 'Ensure you are using a Q-SYS control system with event monitoring capabilities',
              }),
            },
          ],
          isError: true,
        };
      }
      
      let stateManager: MonitoredStateManager | undefined;
      try {
        stateManager = adapter.getStateManager() as MonitoredStateManager | undefined;
      } catch (getStateError) {
        logger.error('Failed to get state manager', {
          error: getStateError instanceof Error ? getStateError.message : String(getStateError),
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: 'Failed to access state manager',
                hint: 'The state management system may be initializing. Please try again.',
              }),
            },
          ],
          isError: true,
        };
      }
      
      // Check if state manager exists and has event monitor
      if (!stateManager || typeof stateManager.getEventMonitor !== 'function') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: 'Event monitoring is not available. Please ensure EVENT_MONITORING_ENABLED=true in your environment.',
                hint: 'Set EVENT_MONITORING_ENABLED=true and restart the application',
              }),
            },
          ],
          isError: true,
        };
      }

      let eventMonitor;
      try {
        eventMonitor = stateManager.getEventMonitor();
      } catch (getMonitorError) {
        logger.error('Failed to get event monitor', {
          error: getMonitorError instanceof Error ? getMonitorError.message : String(getMonitorError),
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: 'Failed to access event monitor',
                hint: 'The event monitoring system may be starting up. Please try again.',
              }),
            },
          ],
          isError: true,
        };
      }

      if (!eventMonitor) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: 'Event monitoring is not enabled in this environment.',
                hint: 'Set EVENT_MONITORING_ENABLED=true and restart the application. Then create change groups with polling to record events.',
              }),
            },
          ],
          isError: true,
        };
      }

      // Query events with provided parameters
      const queryParams: {
        limit?: number;
        offset?: number;
        startTime?: number;
        endTime?: number;
        changeGroupId?: string;
        controlPaths?: string[];
        componentNames?: string[];
      } = {
        limit: params.limit ?? 1000,
      };
      
      if (params.startTime !== undefined) queryParams.startTime = params.startTime;
      if (params.endTime !== undefined) queryParams.endTime = params.endTime;
      if (params.changeGroupId !== undefined) queryParams.changeGroupId = params.changeGroupId;
      if (params.controlNames !== undefined) queryParams.controlPaths = params.controlNames;
      if (params.componentNames !== undefined) queryParams.componentNames = params.componentNames;
      if (params.offset !== undefined) queryParams.offset = params.offset;

      let events: DatabaseEventRow[];
      try {
        // Query with timeout to prevent hanging
        const queryPromise = eventMonitor.queryEvents(queryParams);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000);
        });
        
        events = await Promise.race([queryPromise, timeoutPromise]) as DatabaseEventRow[];
      } catch (queryError) {
        logger.error('Failed to query events from monitor', {
          error: queryError instanceof Error ? queryError.message : String(queryError),
          queryParams,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: `Failed to query events: ${queryError instanceof Error ? queryError.message : String(queryError)}`,
                hint: 'Check your query parameters and ensure the database is accessible',
              }),
            },
          ],
          isError: true,
        };
      }

      // Safely format events with null checking
      let formattedEvents: (DatabaseEventRow | null)[];
      try {
        formattedEvents = (events || []).map((event: DatabaseEventRow) => {
          if (!event) return null;
          
          return {
            ...event,
            value: event.value ?? null,
            stringValue: event.string_value ?? null,
          };
        }).filter(Boolean); // Remove any null entries
      } catch (formatError) {
        logger.error('Failed to format events', {
          error: formatError instanceof Error ? formatError.message : String(formatError),
          eventCount: events?.length,
        });
        
        // Return raw events if formatting fails
        formattedEvents = events || [];
      }

      const response = {
        eventCount: formattedEvents.length,
        events: formattedEvents,
        query: {
          startTime: params.startTime,
          endTime: params.endTime,
          changeGroupId: params.changeGroupId,
          controlNames: params.controlNames,
          componentNames: params.componentNames,
          limit: params.limit ?? 1000,
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
      // This is the final catch-all for any unexpected errors
      logger.error('Unexpected error in query events tool', { 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        } : String(error),
        params,
        executionTimeMs: Date.now() - startTime,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: true,
              message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
              hint: 'An unexpected error occurred. Please check the logs for details.',
              executionTimeMs: Date.now() - startTime,
            }),
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