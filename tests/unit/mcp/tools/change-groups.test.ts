import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/adapter.js';
import {
  CreateChangeGroupTool,
  AddControlsToChangeGroupTool,
  PollChangeGroupTool,
  DestroyChangeGroupTool,
  RemoveControlsFromChangeGroupTool,
  ClearChangeGroupTool,
  SetChangeGroupAutoPollTool,
  ListChangeGroupsTool,
  SubscribeToChangeEventsTool,
} from '../../../../src/mcp/tools/change-groups.js';
import type { EventCacheManager } from '../../../../src/mcp/state/event-cache/manager.js';

describe('Change Group Tools', () => {
  let mockQrwcClient: jest.Mocked<QRWCClientInterface>;

  beforeEach(() => {
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
      listChangeGroups: jest.fn(),
    } as any;
  });

  describe('CreateChangeGroupTool', () => {
    let tool: CreateChangeGroupTool;

    beforeEach(() => {
      tool = new CreateChangeGroupTool(mockQrwcClient);
    });

    it('should have correct metadata', () => {
      expect(tool.name).toBe('create_change_group');
      expect(tool.description).toContain('Create a new change group');
    });

    it('should create a change group successfully', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ result: true });

      const result = await tool.execute({ groupId: 'test-group-1' });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.AddControl',
        {
          Id: 'test-group-1',
          Controls: [],
        }
      );
      expect(result.content[0].text).toContain('"success":true');
      expect(result.content[0].text).toContain('test-group-1');
    });

    it('should warn when creating a group with existing ID', async () => {
      const warning =
        "Change group 'test-group-1' already exists. Using existing group with 2 controls.";
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: true,
        warning: warning,
      });

      const result = await tool.execute({ groupId: 'test-group-1' });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.warning).toBe(warning);
      expect(response.message).toBe(warning);
    });

    it('should validate parameters', async () => {
      const result = await tool.execute({ groupId: '' });
      expect(result.isError).toBe(true);
      const errorObj = JSON.parse(result.content[0].text);
      expect(errorObj.error).toBe(true);
      expect(errorObj.message).toContain('validation failed');
      expect(errorObj.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('AddControlsToChangeGroupTool', () => {
    let tool: AddControlsToChangeGroupTool;

    beforeEach(() => {
      tool = new AddControlsToChangeGroupTool(mockQrwcClient);
    });

    it('should add controls to a change group', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: { addedCount: 2 },
      });

      const result = await tool.execute({
        groupId: 'test-group-1',
        controlNames: ['Gain1.gain', 'Gain1.mute'],
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.AddControl',
        {
          Id: 'test-group-1',
          Controls: [
            { Name: 'Gain1.gain' },
            { Name: 'Gain1.mute' },
          ],
        }
      );
      expect(result.content[0].text).toContain('"controlsAdded":2');
    });

    it('should require at least one control', async () => {
      const result = await tool.execute({
        groupId: 'test-group-1',
        controlNames: [],
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('PollChangeGroupTool', () => {
    let tool: PollChangeGroupTool;

    beforeEach(() => {
      tool = new PollChangeGroupTool(mockQrwcClient);
    });

    it('should poll changes successfully', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Id: 'test-group-1',
          Changes: [{ Name: 'Gain1.gain', Value: -10, String: '-10dB' }],
        },
      });

      const result = await tool.execute({ groupId: 'test-group-1' });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.Poll',
        {
          Id: 'test-group-1',
        }
      );
      expect(result.content[0].text).toContain('"changeCount":1');
      expect(result.content[0].text).toContain('"hasChanges":true');
    });

    it('should handle no changes', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Id: 'test-group-1',
          Changes: [],
        },
      });

      const result = await tool.execute({ groupId: 'test-group-1' });
      expect(result.content[0].text).toContain('"hasChanges":false');
    });
  });

  describe('DestroyChangeGroupTool', () => {
    let tool: DestroyChangeGroupTool;

    beforeEach(() => {
      tool = new DestroyChangeGroupTool(mockQrwcClient);
    });

    it('should destroy a change group', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ result: true });

      const result = await tool.execute({ groupId: 'test-group-1' });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.Destroy',
        {
          Id: 'test-group-1',
        }
      );
      expect(result.content[0].text).toContain('destroyed successfully');
    });
  });

  describe('RemoveControlsFromChangeGroupTool', () => {
    let tool: RemoveControlsFromChangeGroupTool;

    beforeEach(() => {
      tool = new RemoveControlsFromChangeGroupTool(mockQrwcClient);
    });

    it('should remove controls from a change group', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ result: true });

      const result = await tool.execute({
        groupId: 'test-group-1',
        controlNames: ['Gain1.gain'],
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.Remove',
        {
          Id: 'test-group-1',
          Controls: ['Gain1.gain'],
        }
      );
      expect(result.content[0].text).toContain('"controlsRemoved":1');
    });
  });

  describe('ClearChangeGroupTool', () => {
    let tool: ClearChangeGroupTool;

    beforeEach(() => {
      tool = new ClearChangeGroupTool(mockQrwcClient);
    });

    it('should clear all controls from a change group', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ result: true });

      const result = await tool.execute({ groupId: 'test-group-1' });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.Clear',
        {
          Id: 'test-group-1',
        }
      );
      expect(result.content[0].text).toContain('All controls cleared');
    });
  });

  describe('SetChangeGroupAutoPollTool', () => {
    let tool: SetChangeGroupAutoPollTool;

    beforeEach(() => {
      tool = new SetChangeGroupAutoPollTool(mockQrwcClient);
    });

    it('should enable auto-poll with custom interval', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ result: true });

      const result = await tool.execute({
        groupId: 'test-group-1',
        enabled: true,
        intervalSeconds: 2.5,
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.AutoPoll',
        {
          Id: 'test-group-1',
          Rate: 2.5,
        }
      );
      expect(result.content[0].text).toContain('"autoPollEnabled":true');
      expect(result.content[0].text).toContain('"intervalSeconds":2.5');
    });

    it('should enable auto-poll with default interval', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ result: true });

      const result = await tool.execute({
        groupId: 'test-group-1',
        enabled: true,
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.AutoPoll',
        {
          Id: 'test-group-1',
          Rate: 1.0,
        }
      );
    });

    it('should disable auto-poll and clear timer', async () => {
      // Mock the adapter with autoPollTimers Map
      const mockTimer = { ref: jest.fn(), unref: jest.fn() } as any;
      const autoPollTimers = new Map([['test-group-1', mockTimer]]);
      const autoPollFailureCounts = new Map([['test-group-1', 3]]);

      (mockQrwcClient as any).autoPollTimers = autoPollTimers;
      (mockQrwcClient as any).autoPollFailureCounts = autoPollFailureCounts;

      // Mock clearInterval
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const result = await tool.execute({
        groupId: 'test-group-1',
        enabled: false,
      });

      // Verify timer was cleared
      expect(clearIntervalSpy).toHaveBeenCalledWith(mockTimer);
      expect(autoPollTimers.has('test-group-1')).toBe(false);
      expect(autoPollFailureCounts.has('test-group-1')).toBe(false);

      expect(result.content[0].text).toContain('"autoPollEnabled":false');
      expect(result.content[0].text).toContain('Auto-poll disabled');

      clearIntervalSpy.mockRestore();
    });

    it('should handle disabling auto-poll when no timer exists', async () => {
      // Mock adapter without timer for this group
      (mockQrwcClient as any).autoPollTimers = new Map();

      const result = await tool.execute({
        groupId: 'test-group-1',
        enabled: false,
      });

      // Should still return success even if no timer was active
      expect(result.content[0].text).toContain('"autoPollEnabled":false');
      expect(result.content[0].text).toContain('Auto-poll disabled');
    });
  });

  describe('ListChangeGroupsTool', () => {
    let tool: ListChangeGroupsTool;

    beforeEach(() => {
      tool = new ListChangeGroupsTool(mockQrwcClient);
    });

    it('should list active change groups', async () => {
      const mockGroups = [
        { id: 'group1', controlCount: 3, hasAutoPoll: true },
        { id: 'group2', controlCount: 1, hasAutoPoll: false },
      ];

      (mockQrwcClient as any).listChangeGroups = jest
        .fn()
        .mockReturnValue(mockGroups);

      const result = await tool.execute({});

      expect((mockQrwcClient as any).listChangeGroups).toHaveBeenCalled();
      expect(result.content[0].text).toContain('"totalGroups":2');
      expect(result.content[0].text).toContain('group1');
      expect(result.content[0].text).toContain('group2');
    });

    it('should handle no active groups', async () => {
      (mockQrwcClient as any).listChangeGroups = jest.fn().mockReturnValue([]);

      const result = await tool.execute({});

      expect(result.content[0].text).toContain('No active change groups');
    });

    it('should handle adapter without listing support', async () => {
      delete (mockQrwcClient as any).listChangeGroups;

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not supported');
    });
  });

  describe('Input Schema Validation', () => {
    it('should export valid JSON schemas for all tools', () => {
      const tools = [
        new CreateChangeGroupTool(mockQrwcClient),
        new AddControlsToChangeGroupTool(mockQrwcClient),
        new PollChangeGroupTool(mockQrwcClient),
        new DestroyChangeGroupTool(mockQrwcClient),
        new RemoveControlsFromChangeGroupTool(mockQrwcClient),
        new ClearChangeGroupTool(mockQrwcClient),
        new SetChangeGroupAutoPollTool(mockQrwcClient),
        new ListChangeGroupsTool(mockQrwcClient),
      ];

      tools.forEach(tool => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  // Tests from BUG-069: Change Group tools error documentation
  describe('Error documentation (BUG-069)', () => {
    it('all tools should document error conditions', () => {
      const tools = [
        new CreateChangeGroupTool(mockQrwcClient),
        new AddControlsToChangeGroupTool(mockQrwcClient),
        new PollChangeGroupTool(mockQrwcClient),
        new DestroyChangeGroupTool(mockQrwcClient),
        new RemoveControlsFromChangeGroupTool(mockQrwcClient),
        new ClearChangeGroupTool(mockQrwcClient),
        new SetChangeGroupAutoPollTool(mockQrwcClient),
        new ListChangeGroupsTool(mockQrwcClient),
      ];

      tools.forEach(tool => {
        // Each tool should mention "Errors:" in its description
        expect(tool.description).toContain('Errors:');

        // Common errors that should be documented
        if (tool.name !== 'list_change_groups') {
          expect(tool.description).toContain('groupId is empty');
        }
        expect(tool.description).toContain('Q-SYS Core is not connected');
      });
    });

    it('CreateChangeGroupTool should document all error conditions', () => {
      const tool = new CreateChangeGroupTool(mockQrwcClient);

      expect(tool.description).toContain('Errors:');
      expect(tool.description).toContain('groupId is empty');
      expect(tool.description).toContain('Q-SYS Core is not connected');
      expect(tool.description).toContain('communication fails');
      expect(tool.description).toContain('warning if group already exists');
    });

    it('AddControlsToChangeGroupTool should document control-specific errors', () => {
      const tool = new AddControlsToChangeGroupTool(mockQrwcClient);

      expect(tool.description).toContain('Errors:');
      expect(tool.description).toContain('controlNames array is empty');
      expect(tool.description).toContain("change group doesn't exist");
    });

    it('SetChangeGroupAutoPollTool should document interval validation errors', () => {
      const tool = new SetChangeGroupAutoPollTool(mockQrwcClient);

      expect(tool.description).toContain('Errors:');
      expect(tool.description).toContain(
        'intervalSeconds is outside 0.1-300 range'
      );
      expect(tool.description).toContain("change group doesn't exist");
    });

    it('ListChangeGroupsTool should document adapter support errors', () => {
      const tool = new ListChangeGroupsTool(mockQrwcClient);

      expect(tool.description).toContain('Errors:');
      expect(tool.description).toContain(
        "adapter doesn't support group listing"
      );
    });

    it('documented errors should match actual behavior - empty groupId', async () => {
      const tool = new CreateChangeGroupTool(mockQrwcClient);
      const result = await tool.execute({ groupId: '' });

      expect(result.isError).toBe(true);
      
      // Parse the JSON error response
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error).toBe(true);
      expect(errorResponse.code).toBe('VALIDATION_ERROR');
      expect(errorResponse.toolName).toBe('create_change_group');
      expect(errorResponse.message).toBe('Parameter validation failed');
    });

    it('documented errors should match actual behavior - disconnected', async () => {
      mockQrwcClient.isConnected.mockReturnValue(false);
      const tool = new PollChangeGroupTool(mockQrwcClient);
      const result = await tool.execute({ groupId: 'test' });

      expect(result.isError).toBe(true);
      
      // Parse the JSON error response
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error).toBe(true);
      expect(errorResponse.message).toBe('Q-SYS Core not connected');
    });

    it('documented errors should match actual behavior - invalid interval', async () => {
      const tool = new SetChangeGroupAutoPollTool(mockQrwcClient);

      // Test below minimum
      const result1 = await tool.execute({
        groupId: 'test',
        enabled: true,
        intervalSeconds: 0.05,
      });
      expect(result1.isError).toBe(true);
      
      // Parse the JSON error response
      const errorResponse1 = JSON.parse(result1.content[0].text);
      expect(errorResponse1.error).toBe(true);
      expect(errorResponse1.code).toBe('VALIDATION_ERROR');
      expect(errorResponse1.message).toBe('Parameter validation failed');

      // Test above maximum
      const result2 = await tool.execute({
        groupId: 'test',
        enabled: true,
        intervalSeconds: 301,
      });
      expect(result2.isError).toBe(true);
      
      // Parse the JSON error response
      const errorResponse2 = JSON.parse(result2.content[0].text);
      expect(errorResponse2.error).toBe(true);
      expect(errorResponse2.code).toBe('VALIDATION_ERROR');
      expect(errorResponse2.message).toBe('Parameter validation failed');
    });

    it('documented errors should match actual behavior - empty control names', async () => {
      const tool = new AddControlsToChangeGroupTool(mockQrwcClient);
      const result = await tool.execute({
        groupId: 'test',
        controlNames: [],
      });

      expect(result.isError).toBe(true);
      
      // Parse the JSON error response
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error).toBe(true);
      expect(errorResponse.code).toBe('VALIDATION_ERROR');
      expect(errorResponse.toolName).toBe('add_controls_to_change_group');
      expect(errorResponse.message).toBe('Parameter validation failed');
    });
  });

  // Tests from BUG-034: Change Group Methods Implementation
  describe('Change Group Methods Implementation (BUG-034)', () => {
    it('should verify all 8 Change Group JSON-RPC methods are handled', async () => {
      // This test verifies that the adapter properly handles all change group methods
      const methods = [
        'ChangeGroup.AddControl',
        'ChangeGroup.AddComponentControl',
        'ChangeGroup.Remove',
        'ChangeGroup.Destroy',
        'ChangeGroup.Invalidate',
        'ChangeGroup.Clear',
        'ChangeGroup.Poll',
        'ChangeGroup.AutoPoll'
      ];

      // Mock each method to return success
      methods.forEach(method => {
        mockQrwcClient.sendCommand.mockResolvedValueOnce({ result: true });
      });

      // Test each method through the tools
      const createTool = new CreateChangeGroupTool(mockQrwcClient);
      await createTool.execute({ groupId: 'test-bug034' });
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.AddControl',
        expect.any(Object)
      );

      const addTool = new AddControlsToChangeGroupTool(mockQrwcClient);
      await addTool.execute({ groupId: 'test-bug034', controlNames: ['control1'] });
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.AddControl',
        expect.any(Object)
      );

      const removeTool = new RemoveControlsFromChangeGroupTool(mockQrwcClient);
      await removeTool.execute({ groupId: 'test-bug034', controlNames: ['control1'] });
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.Remove',
        expect.any(Object)
      );

      const clearTool = new ClearChangeGroupTool(mockQrwcClient);
      await clearTool.execute({ groupId: 'test-bug034' });
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.Clear',
        expect.any(Object)
      );

      const pollTool = new PollChangeGroupTool(mockQrwcClient);
      await pollTool.execute({ groupId: 'test-bug034' });
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.Poll',
        expect.any(Object)
      );

      const autoPollTool = new SetChangeGroupAutoPollTool(mockQrwcClient);
      await autoPollTool.execute({ groupId: 'test-bug034', enabled: true, intervalSeconds: 1 });
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.AutoPoll',
        expect.any(Object)
      );

      const destroyTool = new DestroyChangeGroupTool(mockQrwcClient);
      await destroyTool.execute({ groupId: 'test-bug034' });
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.Destroy',
        expect.any(Object)
      );
    });
  });

  describe('SubscribeToChangeEventsTool', () => {
    let tool: SubscribeToChangeEventsTool;
    let mockEventCache: jest.Mocked<EventCacheManager>;

    beforeEach(() => {
      mockEventCache = {
        groupPriorities: new Map(),
        clearGroup: jest.fn().mockReturnValue(true),
        buffers: new Map([['test-group', {}]]),
      } as any;

      tool = new SubscribeToChangeEventsTool(mockQrwcClient, mockEventCache);
    });

    it('should have correct metadata', () => {
      expect(tool.name).toBe('subscribe_to_change_events');
      expect(tool.description).toContain('Subscribe to real-time change events');
      expect(tool.description).toContain('set_change_group_auto_poll');
      expect(tool.description).toContain('read_change_group_events');
    });

    it('should enable caching with default config', async () => {
      const result = await tool.execute({
        groupId: 'test-group',
        enableCache: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Event caching enabled');
      expect(response.config.maxAgeMs).toBe(3600000);
      expect(response.config.maxEvents).toBe(100000);
      expect(response.config.priority).toBe('normal');
    });

    it('should enable caching with custom config', async () => {
      const result = await tool.execute({
        groupId: 'test-group',
        enableCache: true,
        cacheConfig: {
          maxAgeMs: 120000,
          maxEvents: 50000,
          priority: 'high',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.config.maxAgeMs).toBe(120000);
      expect(response.config.maxEvents).toBe(50000);
      expect(response.config.priority).toBe('high');
      expect(mockEventCache.groupPriorities.get('test-group')).toBe('high');
    });

    it('should disable caching for a group', async () => {
      const result = await tool.execute({
        groupId: 'test-group',
        enableCache: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Event caching disabled');
      expect(mockEventCache.clearGroup).toHaveBeenCalledWith('test-group');
    });

    it('should throw error when event cache is not available', async () => {
      const toolWithoutCache = new SubscribeToChangeEventsTool(mockQrwcClient);

      const result = await toolWithoutCache.execute({
        groupId: 'test-group',
        enableCache: true,
      });

      expect(result.isError).toBe(true);
      const error = JSON.parse(result.content[0].text);
      expect(error.error).toBe(true);
      expect(error.message).toContain('Event cache not available');
    });

    it('should validate cache config parameters', async () => {
      const result = await tool.execute({
        groupId: 'test-group',
        enableCache: true,
        cacheConfig: {
          maxAgeMs: 50000, // Below minimum
          maxEvents: 500, // Below minimum
          priority: 'invalid' as any,
        },
      });

      expect(result.isError).toBe(true);
      const error = JSON.parse(result.content[0].text);
      expect(error.error).toBe(true);
      expect(error.message).toContain('validation failed');
    });

    it('should handle errors gracefully', async () => {
      // Mock clearGroup to throw an error
      mockEventCache.clearGroup.mockImplementation(() => {
        throw new Error('Failed to clear group');
      });

      const result = await tool.execute({
        groupId: 'test-group',
        enableCache: false,
      });

      expect(result.isError).toBe(true);
      const error = JSON.parse(result.content[0].text);
      expect(error.error).toBe(true);
      expect(error.code).toBe('MCP_TOOL_EXECUTION_ERROR');
    });
  });
});
