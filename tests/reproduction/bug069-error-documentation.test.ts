import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { QRWCClientInterface } from '../../src/mcp/qrwc/adapter.js';
import {
  CreateChangeGroupTool,
  AddControlsToChangeGroupTool,
  PollChangeGroupTool,
  DestroyChangeGroupTool,
  RemoveControlsFromChangeGroupTool,
  ClearChangeGroupTool,
  SetChangeGroupAutoPollTool,
  ListChangeGroupsTool,
} from '../../src/mcp/tools/change-groups.js';

describe('BUG-069: Change Group tools error scenarios', () => {
  let mockAdapter: jest.Mocked<QRWCClientInterface>;

  beforeEach(() => {
    mockAdapter = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
      listChangeGroups: jest.fn(),
    } as any;
  });

  describe('Error conditions not documented in tool descriptions', () => {
    it('CreateChangeGroupTool - throws on empty groupId', async () => {
      const tool = new CreateChangeGroupTool(mockAdapter);

      // This should throw validation error - not documented
      const result = await tool.execute({ groupId: '' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'String must contain at least 1 character'
      );
    });

    it('CreateChangeGroupTool - throws when disconnected', async () => {
      mockAdapter.isConnected.mockReturnValue(false);
      const tool = new CreateChangeGroupTool(mockAdapter);

      const result = await tool.execute({ groupId: 'test' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Q-SYS Core not connected');
    });

    it('PollChangeGroupTool - throws on non-existent group', async () => {
      mockAdapter.sendCommand.mockRejectedValue(
        new Error('Change group not found: test-group')
      );
      const tool = new PollChangeGroupTool(mockAdapter);

      const result = await tool.execute({ groupId: 'test-group' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Change group not found');
    });

    it('DestroyChangeGroupTool - behavior on already destroyed group', async () => {
      mockAdapter.sendCommand.mockRejectedValue(
        new Error('Change group not found')
      );
      const tool = new DestroyChangeGroupTool(mockAdapter);

      const result = await tool.execute({ groupId: 'non-existent' });
      expect(result.isError).toBe(true);
      // Error not documented in description
    });

    it('AddControlsToChangeGroupTool - throws on empty controls array', async () => {
      const tool = new AddControlsToChangeGroupTool(mockAdapter);

      const result = await tool.execute({ groupId: 'test', controlNames: [] });
      expect(result.isError).toBe(true);
      // Validation error not documented
    });

    it('SetChangeGroupAutoPollTool - throws on invalid interval', async () => {
      const tool = new SetChangeGroupAutoPollTool(mockAdapter);

      // Test interval below minimum
      const result = await tool.execute({
        groupId: 'test',
        enabled: true,
        intervalSeconds: 0.05, // Below 0.1
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Number must be greater than or equal to 0.1'
      );
    });

    it('SetChangeGroupAutoPollTool - throws on interval above maximum', async () => {
      const tool = new SetChangeGroupAutoPollTool(mockAdapter);

      const result = await tool.execute({
        groupId: 'test',
        enabled: true,
        intervalSeconds: 301, // Above 300
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Number must be less than or equal to 300'
      );
    });
  });

  describe('Tool descriptions NOW HAVE error information (BUG FIXED)', () => {
    it('should verify all tool descriptions NOW include error documentation', () => {
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
        // Check if description mentions errors
        const hasErrorDoc = tool.description.includes('Errors:');

        expect(hasErrorDoc).toBe(true);
        console.log(`${tool.name}: Error documentation found ✓`);
      });
    });
  });
});
