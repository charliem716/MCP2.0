import { z } from 'zod';
import { BaseQSysTool, BaseToolParamsSchema } from './base.js';
import type { IControlSystem } from '../interfaces/control-system.js';
import type { ToolCallResult } from '../handlers/index.js';
// BUG-132: EventCache imports removed - functionality integrated into SimpleStateManager
import { MCPError, MCPErrorCode } from '../../shared/types/errors.js';
import { isQSysApiResponse } from '../types/qsys-api-responses.js';

/**
 * Change Group Tools for Q-SYS
 *
 * Provides MCP tool access to Change Group functionality for efficient
 * monitoring of control value changes in Q-SYS systems.
 */

// ===== Tool 1: Create Change Group =====

const CreateChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe('Unique identifier for the change group'),
  pollRate: z.coerce.number()
    .min(0.03)
    .max(3600)
    .default(1)
    .optional()
    .describe('Polling rate in seconds (0.03=33Hz, 0.1=10Hz, 1=1Hz). When event monitoring is enabled, controls polling frequency and recording rate.'),
});

type CreateChangeGroupParams = z.infer<typeof CreateChangeGroupParamsSchema>;

export class CreateChangeGroupTool extends BaseQSysTool<CreateChangeGroupParams> {
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'create_change_group',
      "Create a change group with automatic polling for monitoring control changes. Polling starts immediately at specified rate and records changes to the event database. Use query_change_events to retrieve recorded events. Note: pollRate accepts numbers (0.1 or '0.1'). Example: {groupId:'mixer-controls',pollRate:0.1}.",
      CreateChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: CreateChangeGroupParams
  ): Promise<ToolCallResult> {
    // Create the change group with empty controls
    const result = (await this.controlSystem.sendCommand(
      'ChangeGroup.AddControl',
      {
        Id: params.groupId,
        Controls: [], // Initialize with empty controls
      }
    )) as unknown as { result: boolean; warning?: string };

    // Automatically enable AutoPoll with the specified rate
    // This ensures recording starts immediately if event monitoring is enabled
    const pollRate = params.pollRate ?? 1;
    await this.controlSystem.sendCommand('ChangeGroup.AutoPoll', {
      Id: params.groupId,
      Rate: pollRate,
    });

    const response: {
      success: boolean;
      groupId: string;
      warning?: string;
      message: string;
      pollRate: number;
      frequency: string;
      recording: boolean;
    } = {
      success: true,
      groupId: params.groupId,
      message: result.warning ?? `Change group '${params.groupId}' created with auto-polling`,
      pollRate,
      frequency: pollRate <= 0.03 ? '33Hz' : `${(1/pollRate).toFixed(1)}Hz`,
      recording: true, // Always true - event monitoring is active when change groups exist
    };

    if (result.warning) {
      response.warning = result.warning;
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
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'add_controls_to_change_group',
      "Add controls to a change group for monitoring. Controls MUST use Component.Control format (e.g., 'Main_Mixer.gain'). Invalid formats are reported in response. Returns detailed feedback about added/skipped/invalid controls. Example: {groupId:'mixer-controls',controlNames:['Main.gain','Main.mute']}.",
      AddControlsToChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: AddControlsToChangeGroupParams
  ): Promise<ToolCallResult> {
    const result = await this.controlSystem.sendCommand('ChangeGroup.AddControl', {
      Id: params.groupId,
      Controls: params.controlNames.map(name => ({ Name: name })),
    });

    // Extract detailed result information
    let addedCount = params.controlNames.length;
    let totalControls = addedCount;
    let invalidControls: string[] = [];
    let skippedControls: string[] = [];
    let warning: string | undefined;
    
    if (isQSysApiResponse<{ 
      addedCount?: number;
      totalControls?: number;
      invalidControls?: string[];
      skippedControls?: string[];
    }>(result)) {
      if (result.result?.addedCount !== undefined) {
        addedCount = result.result.addedCount;
      }
      if (result.result?.totalControls !== undefined) {
        totalControls = result.result.totalControls;
      }
      if (result.result?.invalidControls) {
        invalidControls = result.result.invalidControls;
      }
      if (result.result?.skippedControls) {
        skippedControls = result.result.skippedControls;
      }
      if ('warning' in result && typeof result.warning === 'string') {
        warning = result.warning;
      }
    }

    const response: {
      success: boolean;
      groupId: string;
      requested: number;
      added: number;
      total: number;
      message: string;
      invalid?: string[];
      skipped?: string[];
      warning?: string;
    } = {
      success: addedCount > 0 || params.controlNames.length === 0,
      groupId: params.groupId,
      requested: params.controlNames.length,
      added: addedCount,
      total: totalControls,
      message: `Added ${addedCount} of ${params.controlNames.length} controls to change group '${params.groupId}'`,
    };

    if (invalidControls.length > 0) {
      response.invalid = invalidControls;
      response.message += `. ${invalidControls.length} invalid format (expected Component.Control)`;
    }

    if (skippedControls.length > 0) {
      response.skipped = skippedControls;
      response.message += `. ${skippedControls.length} already in group`;
    }

    if (warning) {
      response.warning = warning;
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

// ===== Tool 3: Poll Change Group =====

const PollChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe('Change group identifier to poll'),
  showAll: z.boolean().default(false).optional().describe('Show all current values, not just changes (useful for debugging)'),
});

type PollChangeGroupParams = z.infer<typeof PollChangeGroupParamsSchema>;

export class PollChangeGroupTool extends BaseQSysTool<PollChangeGroupParams> {
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'poll_change_group',
      "Manual poll tool for debugging - shows changes since YOUR last manual poll. NOT connected to event database. For recorded events, use query_change_events instead. Use showAll:true to see all current values. First poll always returns all values. Example: {groupId:'mixer-controls',showAll:true}.",
      PollChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: PollChangeGroupParams
  ): Promise<ToolCallResult> {
    const response = await this.controlSystem.sendCommand('ChangeGroup.Poll', {
      Id: params.groupId,
      showAll: params.showAll,
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
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'destroy_change_group',
      "Destroy a change group and stop automatic polling/recording. Historical events remain in database. ALWAYS destroy groups after testing to prevent memory leaks and unwanted event recording. Example: {groupId:'mixer-controls'}.",
      DestroyChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: DestroyChangeGroupParams
  ): Promise<ToolCallResult> {
    await this.controlSystem.sendCommand('ChangeGroup.Destroy', {
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
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'remove_controls_from_change_group',
      "Remove specific controls from a change group. Example: {groupId:'mixer-controls',controlNames:['Main.input_1_gain']}. Group remains active.",
      RemoveControlsFromChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: RemoveControlsFromChangeGroupParams
  ): Promise<ToolCallResult> {
    await this.controlSystem.sendCommand('ChangeGroup.Remove', {
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
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'clear_change_group',
      "Remove all controls from a change group but keep it active. Useful for reconfiguring. Example: {groupId:'mixer-controls'}.",
      ClearChangeGroupParamsSchema
    );
  }

  protected async executeInternal(
    params: ClearChangeGroupParams
  ): Promise<ToolCallResult> {
    await this.controlSystem.sendCommand('ChangeGroup.Clear', {
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

// ===== Tool 7: List Change Groups =====

const ListChangeGroupsParamsSchema = BaseToolParamsSchema;

type ListChangeGroupsParams = z.infer<typeof ListChangeGroupsParamsSchema>;

export class ListChangeGroupsTool extends BaseQSysTool<ListChangeGroupsParams> {
  constructor(controlSystem: IControlSystem) {
    super(
      controlSystem,
      'list_change_groups',
      "List ALL currently active change groups system-wide. Shows id, control count, and auto-poll status. Use to check what groups exist before creating new ones or to debug unexpected events. Example: {}",
      ListChangeGroupsParamsSchema
    );
  }

  protected async executeInternal(
    params: ListChangeGroupsParams
  ): Promise<ToolCallResult> {
    // Cast the client to access the listChangeGroups method
    const adapter = this.controlSystem as { 
      listChangeGroups?: () => Array<{
        id: string;
        controlCount: number;
        hasAutoPoll: boolean;
      }> 
    };

    if (typeof adapter.listChangeGroups !== 'function') {
      throw new MCPError('Change group listing not supported by this adapter',
        MCPErrorCode.METHOD_NOT_FOUND, { adapter: 'change-groups' });
    }

    const groups = adapter.listChangeGroups();

    return Promise.resolve({
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
    });
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

// BUG-132: EventCache-dependent tool removed
/*
export class ReadChangeGroupEventsTool extends BaseQSysTool<ReadChangeGroupEventsParams> {
  private eventCache?: EventCacheManager | undefined;

  constructor(controlSystem: IControlSystem, eventCache?: EventCacheManager) {
    super(
      controlSystem,
      'read_change_group_events',
      "Query historical change events. Filter by time, group, controls, or values. Default: last minute. Example: {groupId:'mixer-controls',startTime:Date.now()-300000}. Requires event cache.",
      ReadChangeGroupEventsParamsSchema
    );
    this.eventCache = eventCache;
  }

  setEventCache(eventCache: EventCacheManager): void {
    this.eventCache = eventCache;
  }

  // eslint-disable-next-line complexity -- Complex change group event query with multiple filters
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
*/

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

// BUG-132: EventCache-dependent tool removed
/*
export class SubscribeToChangeEventsTool extends BaseQSysTool<SubscribeToChangeEventsParams> {
  private eventCache?: EventCacheManager | undefined;

  constructor(controlSystem: IControlSystem, eventCache?: EventCacheManager) {
    super(
      controlSystem,
      'subscribe_to_change_events',
      `Subscribe to real-time change events from a change group. Events are automatically cached and can be queried later using read_change_group_events. Subscription enables both real-time monitoring and historical analysis. Note: Polling starts automatically when you create a change group. Example: 1. Create group: create_change_group({ groupId: "my-group", pollRate: 0.1 }) 2. Subscribe: subscribe_to_change_events({ groupId: "my-group", enableCache: true }) 3. Query history: read_change_group_events({ groupId: "my-group", startTime: Date.now()-60000 })`,
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

        return Promise.resolve({
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
        });
      } else {
        // To disable caching, we clear the group's buffer
        // @ts-expect-error - accessing private method for group management
        if (this.eventCache.buffers.has(groupId)) {
          this.eventCache.clearGroup(groupId);
        }

        return Promise.resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Event caching disabled for group '${groupId}'`,
              }),
            },
          ],
        });
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
*/

// ===== Factory Functions =====

export function createCreateChangeGroupTool(
  controlSystem: IControlSystem
): CreateChangeGroupTool {
  return new CreateChangeGroupTool(controlSystem);
}

export function createAddControlsToChangeGroupTool(
  controlSystem: IControlSystem
): AddControlsToChangeGroupTool {
  return new AddControlsToChangeGroupTool(controlSystem);
}

export function createPollChangeGroupTool(
  controlSystem: IControlSystem
): PollChangeGroupTool {
  return new PollChangeGroupTool(controlSystem);
}

export function createDestroyChangeGroupTool(
  controlSystem: IControlSystem
): DestroyChangeGroupTool {
  return new DestroyChangeGroupTool(controlSystem);
}

export function createRemoveControlsFromChangeGroupTool(
  controlSystem: IControlSystem
): RemoveControlsFromChangeGroupTool {
  return new RemoveControlsFromChangeGroupTool(controlSystem);
}

export function createClearChangeGroupTool(
  controlSystem: IControlSystem
): ClearChangeGroupTool {
  return new ClearChangeGroupTool(controlSystem);
}

export function createListChangeGroupsTool(
  controlSystem: IControlSystem
): ListChangeGroupsTool {
  return new ListChangeGroupsTool(controlSystem);
}

// BUG-132: EventCache-dependent tool removed
/*
export function createReadChangeGroupEventsTool(
  controlSystem: IControlSystem,
  eventCache?: EventCacheManager
): ReadChangeGroupEventsTool {
  return new ReadChangeGroupEventsTool(controlSystem, eventCache);
}
*/

// BUG-132: EventCache-dependent tool removed
/*
export function createSubscribeToChangeEventsTool(
  controlSystem: IControlSystem,
  eventCache?: EventCacheManager
): SubscribeToChangeEventsTool {
  return new SubscribeToChangeEventsTool(controlSystem, eventCache);
}
*/
