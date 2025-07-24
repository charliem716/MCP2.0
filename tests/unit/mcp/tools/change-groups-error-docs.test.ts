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
} from '../../../../src/mcp/tools/change-groups.js';

describe('BUG-069 Fix: Change Group tools error documentation', () => {
  let mockAdapter: jest.Mocked<QRWCClientInterface>;

  beforeEach(() => {
    mockAdapter = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
      listChangeGroups: jest.fn(),
    } as any;
  });

  describe('Error documentation in tool descriptions', () => {
    it('all tools should document error conditions', () => {
      const tools = [
        new CreateChangeGroupTool(mockAdapter),
        new AddControlsToChangeGroupTool(mockAdapter),
        new PollChangeGroupTool(mockAdapter),
        new DestroyChangeGroupTool(mockAdapter),
        new RemoveControlsFromChangeGroupTool(mockAdapter),
        new ClearChangeGroupTool(mockAdapter),
        new SetChangeGroupAutoPollTool(mockAdapter),
        new ListChangeGroupsTool(mockAdapter),
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
      const tool = new CreateChangeGroupTool(mockAdapter);

      expect(tool.description).toContain('Errors:');
      expect(tool.description).toContain('groupId is empty');
      expect(tool.description).toContain('Q-SYS Core is not connected');
      expect(tool.description).toContain('communication fails');
      expect(tool.description).toContain('warning if group already exists');
    });

    it('AddControlsToChangeGroupTool should document control-specific errors', () => {
      const tool = new AddControlsToChangeGroupTool(mockAdapter);

      expect(tool.description).toContain('Errors:');
      expect(tool.description).toContain('controlNames array is empty');
      expect(tool.description).toContain("change group doesn't exist");
    });

    it('SetChangeGroupAutoPollTool should document interval validation errors', () => {
      const tool = new SetChangeGroupAutoPollTool(mockAdapter);

      expect(tool.description).toContain('Errors:');
      expect(tool.description).toContain(
        'intervalSeconds is outside 0.1-300 range'
      );
      expect(tool.description).toContain("change group doesn't exist");
    });

    it('ListChangeGroupsTool should document adapter support errors', () => {
      const tool = new ListChangeGroupsTool(mockAdapter);

      expect(tool.description).toContain('Errors:');
      expect(tool.description).toContain(
        "adapter doesn't support group listing"
      );
    });
  });

  describe('Error documentation accuracy', () => {
    it('documented errors should match actual behavior - empty groupId', async () => {
      const tool = new CreateChangeGroupTool(mockAdapter);
      const result = await tool.execute({ groupId: '' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'String must contain at least 1 character'
      );
    });

    it('documented errors should match actual behavior - disconnected', async () => {
      mockAdapter.isConnected.mockReturnValue(false);
      const tool = new PollChangeGroupTool(mockAdapter);
      const result = await tool.execute({ groupId: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Q-SYS Core not connected');
    });

    it('documented errors should match actual behavior - invalid interval', async () => {
      const tool = new SetChangeGroupAutoPollTool(mockAdapter);

      // Test below minimum
      const result1 = await tool.execute({
        groupId: 'test',
        enabled: true,
        intervalSeconds: 0.05,
      });
      expect(result1.isError).toBe(true);
      expect(result1.content[0].text).toContain('greater than or equal to 0.1');

      // Test above maximum
      const result2 = await tool.execute({
        groupId: 'test',
        enabled: true,
        intervalSeconds: 301,
      });
      expect(result2.isError).toBe(true);
      expect(result2.content[0].text).toContain('less than or equal to 300');
    });

    it('documented errors should match actual behavior - empty control names', async () => {
      const tool = new AddControlsToChangeGroupTool(mockAdapter);
      const result = await tool.execute({
        groupId: 'test',
        controlNames: [],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Array must contain at least 1 element'
      );
    });
  });
});
