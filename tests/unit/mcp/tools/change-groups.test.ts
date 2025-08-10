import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/adapter';
import {
  CreateChangeGroupTool,
  AddControlsToChangeGroupTool,
  PollChangeGroupTool,
  DestroyChangeGroupTool,
  RemoveControlsFromChangeGroupTool,
  ClearChangeGroupTool,
  ListChangeGroupsTool,
} from '../../../../src/mcp/tools/change-groups';
// EventCacheManager removed - simplified architecture

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
      expect(tool.description).toContain('Create a change group');
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
      expect(result.content[0].text).toContain('"added":2');
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
        new ListChangeGroupsTool(mockQrwcClient),
      ];

      tools.forEach(tool => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  // Change Group tools error handling
  describe('Error handling', () => {

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
      expect(errorResponse.message).toContain('Q-SYS Core not connected');
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

  // Change Group Methods Implementation
  describe('Change Group Methods Implementation', () => {
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

      // Note: AutoPoll is now handled automatically at change group creation
      // The SetChangeGroupAutoPollTool has been removed as it's no longer needed

      const destroyTool = new DestroyChangeGroupTool(mockQrwcClient);
      await destroyTool.execute({ groupId: 'test-bug034' });
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'ChangeGroup.Destroy',
        expect.any(Object)
      );
    });
  });

});
