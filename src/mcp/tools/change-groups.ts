import { z } from "zod";
import { BaseQSysTool, BaseToolParamsSchema } from "./base.js";
import type { QRWCClientInterface } from "../qrwc/adapter.js";
import type { ToolCallResult } from "../handlers/index.js";

/**
 * Change Group Tools for Q-SYS
 * 
 * Provides MCP tool access to Change Group functionality for efficient
 * monitoring of control value changes in Q-SYS systems.
 */

// ===== Tool 1: Create Change Group =====

const CreateChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe("Unique identifier for the change group")
});

type CreateChangeGroupParams = z.infer<typeof CreateChangeGroupParamsSchema>;

export class CreateChangeGroupTool extends BaseQSysTool<CreateChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      "create_change_group",
      "Create a new change group for monitoring control value changes. Groups allow efficient polling of multiple controls at once. Example: {groupId:'mixer-controls'} creates a group for monitoring mixer-related controls. Group IDs must be unique and non-empty. Errors: Throws if groupId is empty, if Q-SYS Core is not connected, or if communication fails. Returns warning if group already exists.",
      CreateChangeGroupParamsSchema
    );
  }

  protected async executeInternal(params: CreateChangeGroupParams): Promise<ToolCallResult> {
    const result = await this.qrwcClient.sendCommand("ChangeGroup.AddControl", {
      Id: params.groupId,
      Controls: [] // Initialize with empty controls
    }) as { result: boolean; warning?: string };

    const response: any = {
      success: true,
      groupId: params.groupId
    };

    if (result.warning) {
      response.warning = result.warning;
      response.message = result.warning;
    } else {
      response.message = `Change group '${params.groupId}' created successfully`;
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response)
      }]
    };
  }
}

// ===== Tool 2: Add Controls to Change Group =====

const AddControlsToChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe("Change group identifier"),
  controlNames: z.array(z.string()).min(1).describe("Array of control names to add (e.g., 'Gain1.gain')")
});

type AddControlsToChangeGroupParams = z.infer<typeof AddControlsToChangeGroupParamsSchema>;

export class AddControlsToChangeGroupTool extends BaseQSysTool<AddControlsToChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      "add_controls_to_change_group",
      "Add Named Controls to a change group for monitoring. Controls must exist in Q-SYS (e.g., 'Gain1.gain', 'Mixer.level'). Invalid controls are skipped. Example: {groupId:'mixer-controls',controlNames:['MainMixer.gain','MainMixer.mute']} adds gain and mute controls to the mixer-controls group. Errors: Throws if groupId is empty, controlNames array is empty, Q-SYS Core is not connected, or if the change group doesn't exist.",
      AddControlsToChangeGroupParamsSchema
    );
  }

  protected async executeInternal(params: AddControlsToChangeGroupParams): Promise<ToolCallResult> {
    const result = await this.qrwcClient.sendCommand("ChangeGroup.AddControl", {
      Id: params.groupId,
      Controls: params.controlNames
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          groupId: params.groupId,
          controlsAdded: params.controlNames.length,
          message: `Added ${params.controlNames.length} controls to change group '${params.groupId}'`
        })
      }]
    };
  }
}

// ===== Tool 3: Poll Change Group =====

const PollChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe("Change group identifier to poll")
});

type PollChangeGroupParams = z.infer<typeof PollChangeGroupParamsSchema>;

export class PollChangeGroupTool extends BaseQSysTool<PollChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      "poll_change_group",
      "Poll a change group for control value changes since last poll. Returns only controls whose values changed. First poll returns all controls as changed. Example: {groupId:'mixer-controls'} returns array of changed controls with Name, Value, and String properties. Use for efficient UI updates or state monitoring. Errors: Throws if groupId is empty, Q-SYS Core is not connected, or if the change group doesn't exist.",
      PollChangeGroupParamsSchema
    );
  }

  protected async executeInternal(params: PollChangeGroupParams): Promise<ToolCallResult> {
    const response = await this.qrwcClient.sendCommand("ChangeGroup.Poll", {
      Id: params.groupId
    });

    const result = response as { result: { Id: string; Changes: Array<{
      Name: string;
      Value: unknown;
      String?: string;
    }> } };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          groupId: result.result.Id,
          changes: result.result.Changes,
          changeCount: result.result.Changes.length,
          hasChanges: result.result.Changes.length > 0
        })
      }]
    };
  }
}

// ===== Tool 4: Destroy Change Group =====

const DestroyChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe("Change group identifier to destroy")
});

type DestroyChangeGroupParams = z.infer<typeof DestroyChangeGroupParamsSchema>;

export class DestroyChangeGroupTool extends BaseQSysTool<DestroyChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      "destroy_change_group",
      "Destroy a change group and clean up all resources including auto-poll timers. Always destroy groups when no longer needed to prevent memory leaks. Example: {groupId:'mixer-controls'} destroys the group and stops any associated polling. Errors: Throws if groupId is empty, Q-SYS Core is not connected, or if the change group doesn't exist.",
      DestroyChangeGroupParamsSchema
    );
  }

  protected async executeInternal(params: DestroyChangeGroupParams): Promise<ToolCallResult> {
    await this.qrwcClient.sendCommand("ChangeGroup.Destroy", {
      Id: params.groupId
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          groupId: params.groupId,
          message: `Change group '${params.groupId}' destroyed successfully`
        })
      }]
    };
  }
}

// ===== Tool 5: Remove Controls from Change Group =====

const RemoveControlsFromChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe("Change group identifier"),
  controlNames: z.array(z.string()).min(1).describe("Array of control names to remove")
});

type RemoveControlsFromChangeGroupParams = z.infer<typeof RemoveControlsFromChangeGroupParamsSchema>;

export class RemoveControlsFromChangeGroupTool extends BaseQSysTool<RemoveControlsFromChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      "remove_controls_from_change_group",
      "Remove specific controls from a change group without destroying the group. Example: {groupId:'mixer-controls',controlNames:['MainMixer.input_1_gain']} removes the specified control. Use when dynamically adjusting monitored controls. Errors: Throws if groupId is empty, controlNames array is empty, Q-SYS Core is not connected, or if the change group doesn't exist.",
      RemoveControlsFromChangeGroupParamsSchema
    );
  }

  protected async executeInternal(params: RemoveControlsFromChangeGroupParams): Promise<ToolCallResult> {
    await this.qrwcClient.sendCommand("ChangeGroup.Remove", {
      Id: params.groupId,
      Controls: params.controlNames
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          groupId: params.groupId,
          controlsRemoved: params.controlNames.length,
          message: `Removed ${params.controlNames.length} controls from change group '${params.groupId}'`
        })
      }]
    };
  }
}

// ===== Tool 6: Clear Change Group =====

const ClearChangeGroupParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe("Change group identifier to clear")
});

type ClearChangeGroupParams = z.infer<typeof ClearChangeGroupParamsSchema>;

export class ClearChangeGroupTool extends BaseQSysTool<ClearChangeGroupParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      "clear_change_group",
      "Remove all controls from a change group while keeping it active. Useful for reconfiguring monitoring without destroying/recreating the group. Example: {groupId:'mixer-controls'} clears all controls but keeps the group ready for new additions. Errors: Throws if groupId is empty, Q-SYS Core is not connected, or if the change group doesn't exist.",
      ClearChangeGroupParamsSchema
    );
  }

  protected async executeInternal(params: ClearChangeGroupParams): Promise<ToolCallResult> {
    await this.qrwcClient.sendCommand("ChangeGroup.Clear", {
      Id: params.groupId
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          groupId: params.groupId,
          message: `All controls cleared from change group '${params.groupId}'`
        })
      }]
    };
  }
}

// ===== Tool 7: Set Change Group Auto Poll =====

const SetChangeGroupAutoPollParamsSchema = BaseToolParamsSchema.extend({
  groupId: z.string().min(1).describe("Change group identifier"),
  enabled: z.boolean().describe("Enable or disable automatic polling"),
  intervalSeconds: z.number().min(0.1).max(300).optional()
    .describe("Polling interval in seconds (default: 1.0)")
});

type SetChangeGroupAutoPollParams = z.infer<typeof SetChangeGroupAutoPollParamsSchema>;

export class SetChangeGroupAutoPollTool extends BaseQSysTool<SetChangeGroupAutoPollParams> {
  constructor(qrwcClient: QRWCClientInterface) {
    super(
      qrwcClient,
      "set_change_group_auto_poll",
      "Configure automatic polling for a change group. When enabled, polls at specified interval (0.1-300 seconds). Auto-stops after 10 consecutive failures. Example: {groupId:'mixer-controls',enabled:true,intervalSeconds:0.5} polls every 500ms. Set enabled:false to stop polling. Errors: Throws if groupId is empty, intervalSeconds is outside 0.1-300 range, Q-SYS Core is not connected, or if the change group doesn't exist.",
      SetChangeGroupAutoPollParamsSchema
    );
  }

  protected async executeInternal(params: SetChangeGroupAutoPollParams): Promise<ToolCallResult> {
    if (params.enabled) {
      // Enable auto polling
      await this.qrwcClient.sendCommand("ChangeGroup.AutoPoll", {
        Id: params.groupId,
        Rate: params.intervalSeconds || 1.0
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            groupId: params.groupId,
            autoPollEnabled: true,
            intervalSeconds: params.intervalSeconds || 1.0,
            message: `Auto-poll enabled for change group '${params.groupId}' at ${params.intervalSeconds || 1.0}s intervals`
          })
        }]
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
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            groupId: params.groupId,
            autoPollEnabled: false,
            message: `Auto-poll disabled for change group '${params.groupId}'`
          })
        }]
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
      "list_change_groups",
      "List all active change groups showing ID, control count, and auto-poll status. No parameters needed. Example: {} returns [{id:'mixer-controls',controlCount:4,hasAutoPoll:true}]. Use to monitor system state and verify cleanup. Errors: Throws if Q-SYS Core is not connected or if the adapter doesn't support group listing.",
      ListChangeGroupsParamsSchema
    );
  }

  protected async executeInternal(params: ListChangeGroupsParams): Promise<ToolCallResult> {
    // Cast the client to access the listChangeGroups method
    const adapter = this.qrwcClient as any;
    
    if (typeof adapter.listChangeGroups !== 'function') {
      throw new Error("Change group listing not supported by this adapter");
    }

    const groups = adapter.listChangeGroups();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          groups,
          totalGroups: groups.length,
          message: groups.length > 0 
            ? `Found ${groups.length} active change group(s)` 
            : "No active change groups"
        })
      }]
    };
  }
}

// ===== Factory Functions =====

export function createCreateChangeGroupTool(qrwcClient: QRWCClientInterface): CreateChangeGroupTool {
  return new CreateChangeGroupTool(qrwcClient);
}

export function createAddControlsToChangeGroupTool(qrwcClient: QRWCClientInterface): AddControlsToChangeGroupTool {
  return new AddControlsToChangeGroupTool(qrwcClient);
}

export function createPollChangeGroupTool(qrwcClient: QRWCClientInterface): PollChangeGroupTool {
  return new PollChangeGroupTool(qrwcClient);
}

export function createDestroyChangeGroupTool(qrwcClient: QRWCClientInterface): DestroyChangeGroupTool {
  return new DestroyChangeGroupTool(qrwcClient);
}

export function createRemoveControlsFromChangeGroupTool(qrwcClient: QRWCClientInterface): RemoveControlsFromChangeGroupTool {
  return new RemoveControlsFromChangeGroupTool(qrwcClient);
}

export function createClearChangeGroupTool(qrwcClient: QRWCClientInterface): ClearChangeGroupTool {
  return new ClearChangeGroupTool(qrwcClient);
}

export function createSetChangeGroupAutoPollTool(qrwcClient: QRWCClientInterface): SetChangeGroupAutoPollTool {
  return new SetChangeGroupAutoPollTool(qrwcClient);
}

export function createListChangeGroupsTool(qrwcClient: QRWCClientInterface): ListChangeGroupsTool {
  return new ListChangeGroupsTool(qrwcClient);
}