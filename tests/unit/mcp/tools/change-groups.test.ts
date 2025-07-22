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
  ListChangeGroupsTool
} from '../../../../src/mcp/tools/change-groups.js';

describe('Change Group Tools', () => {
  let mockQrwcClient: jest.Mocked<QRWCClientInterface>;

  beforeEach(() => {
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
      listChangeGroups: jest.fn()
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

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('ChangeGroup.AddControl', {
        Id: 'test-group-1',
        Controls: []
      });
      expect(result.content[0].text).toContain('"success":true');
      expect(result.content[0].text).toContain('test-group-1');
    });

    it('should warn when creating a group with existing ID', async () => {
      const warning = "Change group 'test-group-1' already exists. Using existing group with 2 controls.";
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ 
        result: true,
        warning: warning
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
      expect(result.content[0].text).toContain('String must contain at least 1 character');
    });
  });

  describe('AddControlsToChangeGroupTool', () => {
    let tool: AddControlsToChangeGroupTool;

    beforeEach(() => {
      tool = new AddControlsToChangeGroupTool(mockQrwcClient);
    });

    it('should add controls to a change group', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ result: true });

      const result = await tool.execute({ 
        groupId: 'test-group-1',
        controlNames: ['Gain1.gain', 'Gain1.mute']
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('ChangeGroup.AddControl', {
        Id: 'test-group-1',
        Controls: ['Gain1.gain', 'Gain1.mute']
      });
      expect(result.content[0].text).toContain('"controlsAdded":2');
    });

    it('should require at least one control', async () => {
      const result = await tool.execute({ 
        groupId: 'test-group-1',
        controlNames: []
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
          Changes: [
            { Name: 'Gain1.gain', Value: -10, String: '-10dB' }
          ]
        }
      });

      const result = await tool.execute({ groupId: 'test-group-1' });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('ChangeGroup.Poll', {
        Id: 'test-group-1'
      });
      expect(result.content[0].text).toContain('"changeCount":1');
      expect(result.content[0].text).toContain('"hasChanges":true');
    });

    it('should handle no changes', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: {
          Id: 'test-group-1',
          Changes: []
        }
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

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('ChangeGroup.Destroy', {
        Id: 'test-group-1'
      });
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
        controlNames: ['Gain1.gain']
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('ChangeGroup.Remove', {
        Id: 'test-group-1',
        Controls: ['Gain1.gain']
      });
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

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('ChangeGroup.Clear', {
        Id: 'test-group-1'
      });
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
        intervalSeconds: 2.5
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('ChangeGroup.AutoPoll', {
        Id: 'test-group-1',
        Rate: 2.5
      });
      expect(result.content[0].text).toContain('"autoPollEnabled":true');
      expect(result.content[0].text).toContain('"intervalSeconds":2.5');
    });

    it('should enable auto-poll with default interval', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ result: true });

      const result = await tool.execute({ 
        groupId: 'test-group-1',
        enabled: true
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('ChangeGroup.AutoPoll', {
        Id: 'test-group-1',
        Rate: 1.0
      });
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
        enabled: false
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
        enabled: false
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
        { id: 'group2', controlCount: 1, hasAutoPoll: false }
      ];
      
      (mockQrwcClient as any).listChangeGroups = jest.fn().mockReturnValue(mockGroups);

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
        new ListChangeGroupsTool(mockQrwcClient)
      ];

      tools.forEach(tool => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });
});