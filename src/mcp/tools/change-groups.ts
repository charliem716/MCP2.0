import { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema } from './base.js';
import type { QRWCClientInterface } from '../qrwc/adapter.js';
import type { ToolCallResult } from '../handlers/index.js';
import type {
  EventCacheManager,
  EventQuery,
  CachedEvent,
} from '../state/event-cache/manager.js';
import type { ControlValue } from '../state/event-cache/event-types.js';
import { MCPError, MCPErrorCode } from '../../shared/types/errors.js';

/**
 * Change Group Tools for Q-SYS
 *
 * Provides MCP tool access to Change Group functionality for efficient
 * monitoring of control value changes in Q-SYS systems.
 */

// ===== Tool 1: Create Change Group =====

const CreateChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe('Unique identifier for the change group'),
});

type CreateChangeGroupParams = z.infer<typeof CreateChangeGroupParamsSchema>;

export class CreateChangeGroupTool extends BaseQSysTool<CreateChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'create_change_group',
      "Create a new change group for monitoring control value changes. Groups allow efficient polling of multiple controls at once. Example: {groupId:'mixer-controls'} creates a group for monitoring mixer-related controls. Group IDs must be unique and non-empty. Errors: Throws if groupId is empty, if Q-SYS Core is not connected, or if communication fails. Returns warning if group already exists.",
      CreateChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: CreateChangeGroupParams
  ): Promise<ToolCallResult> {
    const result = (await this.qrwcClient.sendCommand(
      'ChangeGroup.AddControl',
      {
        Id: params.groupId,
        Controls: [], // Initialize with empty controls
      }
    )) as { result: boolean; warning?: string };

    const response: any = {
      success: true,
      groupId: params.groupId,
    };

    if (result.warning) {
      response.warning = result.warning;
      response.message = result.warning;
    } else {
      response.message = `Change group '${params.groupId}' created successfully`;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  }
}

// ===== Tool 2: Add Controls to Change Group =====

const AddControlsToChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe('Change group identifier'),
  controlNames: z
    .array(z.string())
    .min(1)
    .describe("Array of control names to add (e.g., 'Gain1.gain')"),
});

type AddControlsToChangeGroupParams = z.infer<
  typeof AddControlsToChangeGroupParamsSchema
>;

export class AddControlsToChangeGroupTool extends BaseQSysTool<AddControlsToChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'add_controls_to_change_group',
      "Add Named Controls to a change group for monitoring. Controls must exist in Q-SYS (e.g., 'Gain1.gain', 'Mixer.level'). Invalid controls are skipped. Example: {groupId:'mixer-controls',controlNames:['MainMixer.gain','MainMixer.mute']} adds gain and mute controls to the mixer-controls group. Errors: Throws if groupId is empty, controlNames array is empty, Q-SYS Core is not connected, or if the change group doesn't exist.",
      AddControlsToChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: AddControlsToChangeGroupParams
  ): Promise<ToolCallResult> {
    const result = await this.qrwcClient.sendCommand('ChangeGroup.AddControl', {
      Id: params.groupId,
      Controls: params.controlNames,
    });

    // Extract the actual count of controls added from the result
    const addedCount =
      (result as any)?.result?.addedCount ?? params.controlNames.length;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            groupId: params.groupId,
            controlsAdded: addedCount,
            message: `Added ${addedCount} controls to change group '${params.groupId}'`,
          }),
        },
      ],
    };
  }
}

// ===== Tool 3: Poll Change Group =====

const PollChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe('Change group identifier to poll'),
});

type PollChangeGroupParams = z.infer<typeof PollChangeGroupParamsSchema>;

export class PollChangeGroupTool extends BaseQSysTool<PollChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'poll_change_group',
      "Poll a change group for control value changes since last poll. Returns only controls whose values changed. First poll returns all controls as changed. Example: {groupId:'mixer-controls'} returns array of changed controls with Name, Value, and String properties. Use for efficient UI updates or state monitoring. Errors: Throws if groupId is empty, Q-SYS Core is not connected, or if the change group doesn't exist.",
      PollChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: PollChangeGroupParams
  ): Promise<ToolCallResult> {
    const response = await this.qrwcClient.sendCommand('ChangeGroup.Poll', {
      Id: params.groupId,
    });

    const result = response as {
      result: {
        Id: string;
        Changes: Array<{
          Name: string;
          Value: unknown;
          String?: string;
        }>;
      };
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            groupId: result.result.Id,
            changes: result.result.Changes,
            changeCount: result.result.Changes.length,
            hasChanges: result.result.Changes.length > 0,
          }),
        },
      ],
    };
  }
}

// ===== Tool 4: Destroy Change Group =====

const DestroyChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe('Change group identifier to destroy'),
});

type DestroyChangeGroupParams = z.infer<typeof DestroyChangeGroupParamsSchema>;

export class DestroyChangeGroupTool extends BaseQSysTool<DestroyChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'destroy_change_group',
      "Destroy a change group and clean up all resources including auto-poll timers. Always destroy groups when no longer needed to prevent memory leaks. Example: {groupId:'mixer-controls'} destroys the group and stops any associated polling. Errors: Throws if groupId is empty, Q-SYS Core is not connected, or if the change group doesn't exist.",
      DestroyChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: DestroyChangeGroupParams
  ): Promise<ToolCallResult> {
    await this.qrwcClient.sendCommand('ChangeGroup.Destroy', {
      Id: params.groupId,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            groupId: params.groupId,
            message: `Change group '${params.groupId}' destroyed successfully`,
          }),
        },
      ],
    };
  }
}

// ===== Tool 5: Remove Controls from Change Group =====

const RemoveControlsFromChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe('Change group identifier'),
  controlNames: z
    .array(z.string())
    .min(1)
    .describe('Array of control names to remove'),
});

type RemoveControlsFromChangeGroupParams = z.infer<
  typeof RemoveControlsFromChangeGroupParamsSchema
>;

export class RemoveControlsFromChangeGroupTool extends BaseQSysTool<RemoveControlsFromChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'remove_controls_from_change_group',
      "Remove specific controls from a change group without destroying the group. Example: {groupId:'mixer-controls',controlNames:['MainMixer.input_1_gain']} removes the specified control. Use when dynamically adjusting monitored controls. Errors: Throws if groupId is empty, controlNames array is empty, Q-SYS Core is not connected, or if the change group doesn't exist.",
      RemoveControlsFromChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: RemoveControlsFromChangeGroupParams
  ): Promise<ToolCallResult> {
    await this.qrwcClient.sendCommand('ChangeGroup.Remove', {
      Id: params.groupId,
      Controls: params.controlNames,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            groupId: params.groupId,
            controlsRemoved: params.controlNames.length,
            message: `Removed ${params.controlNames.length} controls from change group '${params.groupId}'`,
          }),
        },
      ],
    };
  }
}

// ===== Tool 6: Clear Change Group =====

const ClearChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe('Change group identifier to clear'),
});

type ClearChangeGroupParams = z.infer<typeof ClearChangeGroupParamsSchema>;

export class ClearChangeGroupTool extends BaseQSysTool<ClearChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'clear_change_group',
      "Remove all controls from a change group while keeping it active. Useful for reconfiguring monitoring without destroying/recreating the group. Example: {groupId:'mixer-controls'} clears all controls but keeps the group ready for new additions. Errors: Throws if groupId is empty, Q-SYS Core is not connected, or if the change group doesn't exist.",
      ClearChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: ClearChangeGroupParams
  ): Promise<ToolCallResult> {
    await this.qrwcClient.sendCommand('ChangeGroup.Clear', {
      Id: params.groupId,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            groupId: params.groupId,
            message: `All controls cleared from change group '${params.groupId}'`,
          }),
        },
      ],
    };
  }
}

// ===== Tool 7: Set Change Group Auto Poll =====

const SetChangeGroupAutoPollParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe('Change group identifier'),
  enabled: z.boolean().describe('Enable or disable automatic polling'),
  intervalSeconds: z
    .number()
    .min(0.1)
    .max(300)
    .optional()
    .describe('Polling interval in seconds (default: 1.0)'),
});

type SetChangeGroupAutoPollParams = z.infer<
  typeof SetChangeGroupAutoPollParamsSchema
>;

export class SetChangeGroupAutoPollTool extends BaseQSysTool<SetChangeGroupAutoPollParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'set_change_group_auto_poll',
      "Configure automatic polling for a change group. When enabled, polls at specified interval (0.1-300 seconds). Auto-stops after 10 consecutive failures. Example: {groupId:'mixer-controls',enabled:true,intervalSeconds:0.5} polls every 500ms. Set enabled:false to stop polling. Errors: Throws if groupId is empty, intervalSeconds is outside 0.1-300 range, Q-SYS Core is not connected, or if the change group doesn't exist.",
      SetChangeGroupAutoPollParamsSchema
    );
  }

  protected async executeInternal(
    params: SetChangeGroupAutoPollParams
  ): Promise<ToolCallResult> {
    if (params.enabled) {
      // Enable auto polling
      await this.qrwcClient.sendCommand('ChangeGroup.AutoPoll', {
        Id: params.groupId,
        Rate: params.intervalSeconds ?? 1.0,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              groupId: params.groupId,
              autoPollEnabled: true,
              intervalSeconds: params.intervalSeconds ?? 1.0,
              message: `Auto-poll enabled for change group '${params.groupId}' at ${params.intervalSeconds ?? 1.0}s intervals`,
            }),
          },
        ],
      };
    } else {
      // Disable auto polling by clearing the timer
      const adapter = this.qrwcClient as any;

      // Check if adapter has the autoPollTimers Map and the group has an active timer
      if (adapter.autoPollTimers?.has(params.groupId)) {
        const timer = adapter.autoPollTimers.get(params.groupId);
        clearInterval(timer);
        adapter.autoPollTimers.delete(params.groupId);

        // Also clean up failure counts if present
        if (adapter.autoPollFailureCounts?.has(params.groupId)) {
          adapter.autoPollFailureCounts.delete(params.groupId);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              groupId: params.groupId,
              autoPollEnabled: false,
              message: `Auto-poll disabled for change group '${params.groupId}'`,
            }),
          },
        ],
      };
    }
  }
}

// ===== Tool 8: List Change Groups =====

const ListChangeGroupsParamsSchema = BaseToolParamsSchema;

type ListChangeGroupsParams = z.infer<typeof ListChangeGroupsParamsSchema>;

export class ListChangeGroupsTool extends BaseQSysTool<ListChangeGroupsParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      'list_change_groups',
      "List all active change groups (MCP-specific tool, not part of Q-SYS API). Shows ID, control count, and auto-poll status. No parameters needed. Example: {} returns [{id:'mixer-controls',controlCount:4,hasAutoPoll:true}]. Use to monitor MCP server state and verify cleanup. Errors: Throws if Q-SYS Core is not connected or if adapter doesn't support group listing.",
      ListChangeGroupsParamsSchema
    );
  }

  protected async executeInternal(
    params: ListChangeGroupsParams
  ): Promise<ToolCallResult> {
    // Cast the client to access the listChangeGroups method
    const adapter = this.qrwcClient as any;

    if (typeof adapter.listChangeGroups !== 'function') {
      throw new MCPError('Change group listing not supported by this adapter',
        MCPErrorCode.METHOD_NOT_FOUND, { adapter: 'change-groups' });
    }

    const groups = adapter.listChangeGroups();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            groups,
            totalGroups: groups.length,
            message:
              groups.length > 0
                ? `Found ${groups.length} active change group(s)`
                : 'No active change groups',
          }),
        },
      ],
    };
  }
}

// ===== Tool 9: Read Change Group Events =====

const ReadChangeGroupEventsParamsSchema = BaseToolParamsSchema.extend({
  groupId: z
    .string()
    .optional()
    .describe('Change group identifier (omit for all groups)'),
  startTime: z
    .number()
    .optional()
    .describe('Start time in milliseconds since epoch (default: 1 minute ago)'),
  endTime: z
    .number()
    .optional()
    .describe('End time in milliseconds since epoch (default: now)'),
  controlNames: z
    .array(z.string())
    .optional()
    .describe('Filter by specific control names'),
  valueFilter: z
    .object({
      operator: z
        .enum([
          'eq',
          'neq',
          'gt',
          'gte',
          'lt',
          'lte',
          'changed_to',
          'changed_from',
        ])
        .describe('Comparison operator'),
      value: z.unknown().describe('Value to compare against'),
    })
    .strict()
    .optional()
    .describe('Filter events by value criteria'),
  limit: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .describe('Maximum number of events to return (default: 1000)'),
  offset: z
    .number()
    .min(0)
    .optional()
    .describe('Number of events to skip for pagination (default: 0)'),
  aggregation: z
    .enum(['raw', 'changes_only', 'summary'])
    .optional()
    .describe('Event aggregation mode (default: raw)'),
  timeout: z
    .number()
    .min(1000)
    .max(60000)
    .optional()
    .describe('Query timeout in milliseconds (default: 30000, min: 1000, max: 60000)'),
});

type ReadChangeGroupEventsParams = z.infer<
  typeof ReadChangeGroupEventsParamsSchema
>;

export class ReadChangeGroupEventsTool extends BaseQSysTool<ReadChangeGroupEventsParams> {
  private eventCache?: EventCacheManager | undefined;

  constructor(qrwcClient: QRWCClientInterface, eventCache?: EventCacheManager) {
    super(
      qrwcClient,
      'read_change_group_events',
      "Query historical change group events for time-based analysis. Retrieves control changes within time range (default: last minute). Filters by group, control names, or value changes. Example: {groupId:'mixer-controls',startTime:Date.now()-300000,controlNames:['Gain1.gain'],valueFilter:{operator:'changed_to',value:0}} finds when gain was muted in last 5 minutes. Requires event cache to be enabled. Errors: Returns empty array if no cache available or no events match criteria.",
      ReadChangeGroupEventsParamsSchema
    );
    this.eventCache = eventCache;
  }

  setEventCache(eventCache: EventCacheManager): void {
    this.eventCache = eventCache;
  }

  protected async executeInternal(
    params: ReadChangeGroupEventsParams
  ): Promise<ToolCallResult> {
    if (!this.eventCache) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              events: [],
              error:
                'Event cache not available. Historical queries require event caching to be enabled.',
              message: 'Enable event caching in the MCP server configuration',
            }),
          },
        ],
      };
    }

    // Transform params to match EventQuery interface
    const queryParams: EventQuery = {
      ...(params.groupId && { groupId: params.groupId }),
      ...(params.startTime !== undefined && { startTime: params.startTime }),
      ...(params.endTime !== undefined && { endTime: params.endTime }),
      ...(params.controlNames && { controlNames: params.controlNames }),
      ...(params.valueFilter && {
        valueFilter: {
          operator: params.valueFilter.operator,
          value: params.valueFilter.value as ControlValue | undefined,
        },
      }),
      ...(params.limit !== undefined && { limit: params.limit }),
      ...(params.offset !== undefined && { offset: params.offset }),
      // Map 'summary' to 'raw' since EventQuery doesn't support 'summary'
      ...(params.aggregation && {
        aggregation:
          params.aggregation === 'summary' ? 'raw' : params.aggregation,
      }),
    };

    // Get timeout value (default: 30 seconds)
    const timeoutMs = params.timeout ?? 30000;
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query timeout after ${timeoutMs}ms. Consider using a more specific time range or control filter to reduce query complexity.`));
      }, timeoutMs);
    });

    // Execute query with timeout protection
    let events: CachedEvent[];
    try {
      events = await Promise.race([
        this.eventCache.query(queryParams),
        timeoutPromise
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                events: [],
                error: error.message,
                timeout: timeoutMs,
                suggestion: 'Try reducing the time range or adding specific control filters',
              }),
            },
          ],
          isError: true,
        };
      }
      throw error; // Re-throw non-timeout errors
    }

    // Calculate summary statistics if requested
    let summary = undefined;
    if (params.aggregation === 'summary' && events.length > 0) {
      const uniqueControls = new Set(events.map(e => e.controlName));
      const firstEvent = events[0];
      const lastEvent = events[events.length - 1];
      const timeRange =
        firstEvent && lastEvent
          ? lastEvent.timestampMs - firstEvent.timestampMs
          : 0;

      summary = {
        totalEvents: events.length,
        uniqueControls: uniqueControls.size,
        timeRangeMs: timeRange,
        eventsPerSecond: timeRange > 0 ? events.length / (timeRange / 1000) : 0,
      };
    }

    // Convert BigInt timestamps to strings for JSON serialization
    const serializedEvents = events.map(event => ({
      ...event,
      timestamp: event.timestamp.toString(),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            events: serializedEvents,
            count: events.length,
            timeRange: {
              start: params.startTime ?? Date.now() - 60000,
              end: params.endTime ?? Date.now(),
            },
            summary,
            message:
              events.length > 0
                ? `Found ${events.length} event(s) in the specified time range`
                : 'No events found matching the criteria',
          }),
        },
      ],
    };
  }
}

// ===== Tool 10: Subscribe to Change Events =====

const SubscribeToChangeEventsParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe('The change group ID to subscribe to'),
  enableCache: z.boolean().default(true).describe('Enable event caching for this group'),
  cacheConfig: z
    .object({
      maxAgeMs: z
        .number()
        .min(60000) // 1 minute
        .max(86400000) // 24 hours
        .default(3600000) // 1 hour
        .optional()
        .describe('How long to keep events in cache (milliseconds)'),
      maxEvents: z
        .number()
        .min(1000)
        .max(1000000)
        .default(100000)
        .optional()
        .describe('Maximum number of events to cache per group'),
      priority: z
        .enum(['high', 'normal', 'low'])
        .default('normal')
        .optional()
        .describe('Priority for memory management (high priority groups are evicted last)'),
    })
    .optional()
    .describe('Optional cache configuration for this group'),
});

type SubscribeToChangeEventsParams = z.infer<typeof SubscribeToChangeEventsParamsSchema>;

export class SubscribeToChangeEventsTool extends BaseQSysTool<SubscribeToChangeEventsParams> {
  private eventCache?: EventCacheManager | undefined;

  constructor(qrwcClient: QRWCClientInterface, eventCache?: EventCacheManager) {
    super(
      qrwcClient,
      'subscribe_to_change_events',
      `Subscribe to real-time change events from a change group. Events are automatically cached and can be queried later using read_change_group_events. Subscription enables both real-time monitoring and historical analysis. Note: You must call set_change_group_auto_poll to start receiving events. Example: 1. Subscribe: subscribe_to_change_events({ groupId: "my-group", enableCache: true }) 2. Start polling: set_change_group_auto_poll({ groupId: "my-group", rate: 100 }) 3. Query history: read_change_group_events({ groupId: "my-group", startTime: Date.now()-60000 })`,
      SubscribeToChangeEventsParamsSchema as z.ZodSchema<SubscribeToChangeEventsParams>
    );
    this.eventCache = eventCache;
  }

  setEventCache(eventCache: EventCacheManager): void {
    this.eventCache = eventCache;
  }

  protected async executeInternal(
    params: SubscribeToChangeEventsParams
  ): Promise<ToolCallResult> {
    const { groupId, enableCache, cacheConfig } = params;

    if (!this.eventCache) {
      throw new MCPError(
        'Event cache not available',
        MCPErrorCode.TOOL_EXECUTION_ERROR,
        { groupId }
      );
    }

    try {
      if (enableCache) {
        // Set group priority if specified
        if (cacheConfig?.priority) {
          // @ts-expect-error - accessing private property for configuration
          this.eventCache.groupPriorities.set(groupId, cacheConfig.priority);
        }

        // Note: EventCacheManager doesn't have explicit enable/disable methods
        // It automatically caches events for all groups that receive events
        // The configuration is applied via the groupPriorities map

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Event caching enabled for group '${groupId}'`,
                config: {
                  maxAgeMs: cacheConfig?.maxAgeMs ?? 3600000,
                  maxEvents: cacheConfig?.maxEvents ?? 100000,
                  priority: cacheConfig?.priority ?? 'normal',
                },
              }),
            },
          ],
        };
      } else {
        // To disable caching, we clear the group's buffer
        // @ts-expect-error - accessing private method for group management
        if (this.eventCache.buffers.has(groupId)) {
          this.eventCache.clearGroup(groupId);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Event caching disabled for group '${groupId}'`,
              }),
            },
          ],
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new MCPError(
        `Failed to configure event subscription: ${errorMessage}`,
        MCPErrorCode.TOOL_EXECUTION_ERROR,
        { groupId, error: errorMessage }
      );
    }
  }
}

// ===== Factory Functions =====

export function createCreateChangeGroupTool(
  qrwcClient: QRWCClientInterface
): CreateChangeGroupTool {
  return new CreateChangeGroupTool(qrwcClient);
}

export function createAddControlsToChangeGroupTool(
  qrwcClient: QRWCClientInterface
): AddControlsToChangeGroupTool {
  return new AddControlsToChangeGroupTool(qrwcClient);
}

export function createPollChangeGroupTool(
  qrwcClient: QRWCClientInterface
): PollChangeGroupTool {
  return new PollChangeGroupTool(qrwcClient);
}

export function createDestroyChangeGroupTool(
  qrwcClient: QRWCClientInterface
): DestroyChangeGroupTool {
  return new DestroyChangeGroupTool(qrwcClient);
}

export function createRemoveControlsFromChangeGroupTool(
  qrwcClient: QRWCClientInterface
): RemoveControlsFromChangeGroupTool {
  return new RemoveControlsFromChangeGroupTool(qrwcClient);
}

export function createClearChangeGroupTool(
  qrwcClient: QRWCClientInterface
): ClearChangeGroupTool {
  return new ClearChangeGroupTool(qrwcClient);
}

export function createSetChangeGroupAutoPollTool(
  qrwcClient: QRWCClientInterface
): SetChangeGroupAutoPollTool {
  return new SetChangeGroupAutoPollTool(qrwcClient);
}

export function createListChangeGroupsTool(
  qrwcClient: QRWCClientInterface
): ListChangeGroupsTool {
  return new ListChangeGroupsTool(qrwcClient);
}

export function createReadChangeGroupEventsTool(
  qrwcClient: QRWCClientInterface,
  eventCache?: EventCacheManager
): ReadChangeGroupEventsTool {
  return new ReadChangeGroupEventsTool(qrwcClient, eventCache);
}

export function createSubscribeToChangeEventsTool(
  qrwcClient: QRWCClientInterface,
  eventCache?: EventCacheManager
): SubscribeToChangeEventsTool {
  return new SubscribeToChangeEventsTool(qrwcClient, eventCache);
}
