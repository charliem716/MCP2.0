import { PollChangeGroupTool } from '../../../../src/mcp/tools/change-groups';
import { IControlSystem } from '../../../../src/mcp/types/control-system';

describe('PollChangeGroupTool showAll parameter validation', () => {
  let mockControlSystem: IControlSystem;
  let tool: PollChangeGroupTool;

  beforeEach(() => {
    mockControlSystem = {
      sendCommand: jest.fn().mockResolvedValue({
        result: {
          Id: 'test-group',
          Changes: []
        }
      }),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      emit: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
      getCoreStatus: jest.fn(),
      getComponentStatus: jest.fn()
    };

    tool = new PollChangeGroupTool(mockControlSystem);
  });

  describe('showAll parameter type validation', () => {
    it('should accept boolean true', async () => {
      const params = { groupId: 'test-group', showAll: true };
      const result = await tool.execute(params);
      
      expect(result.isError).toBeFalsy();
      expect(mockControlSystem.sendCommand).toHaveBeenCalledWith('ChangeGroup.Poll', {
        Id: 'test-group',
        showAll: true
      });
    });

    it('should accept boolean false', async () => {
      const params = { groupId: 'test-group', showAll: false };
      const result = await tool.execute(params);
      
      expect(result.isError).toBeFalsy();
      expect(mockControlSystem.sendCommand).toHaveBeenCalledWith('ChangeGroup.Poll', {
        Id: 'test-group',
        showAll: false
      });
    });

    it('should accept undefined (omitted parameter)', async () => {
      const params = { groupId: 'test-group' };
      const result = await tool.execute(params);
      
      expect(result.isError).toBeFalsy();
      expect(mockControlSystem.sendCommand).toHaveBeenCalledWith('ChangeGroup.Poll', {
        Id: 'test-group',
        showAll: undefined
      });
    });

    it('should reject string "true"', async () => {
      const params = { groupId: 'test-group', showAll: 'true' as any };
      const result = await tool.execute(params);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('showAll');
      expect(result.content[0].text).toMatch(/boolean|type|Expected boolean/i);
    });

    it('should reject string "false"', async () => {
      const params = { groupId: 'test-group', showAll: 'false' as any };
      const result = await tool.execute(params);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('showAll');
      expect(result.content[0].text).toMatch(/boolean|type|Expected boolean/i);
    });

    it('should reject number 1', async () => {
      const params = { groupId: 'test-group', showAll: 1 as any };
      const result = await tool.execute(params);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('showAll');
      expect(result.content[0].text).toMatch(/boolean|type|Expected boolean/i);
    });

    it('should reject number 0', async () => {
      const params = { groupId: 'test-group', showAll: 0 as any };
      const result = await tool.execute(params);
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('showAll');
      expect(result.content[0].text).toMatch(/boolean|type|Expected boolean/i);
    });
  });

  describe('tool description accuracy', () => {
    it('should have accurate description with boolean example', () => {
      const description = tool.description;
      
      // Check that description mentions showAll:true (boolean, not string)
      expect(description).toContain('showAll:true');
      
      // Should not suggest string values
      expect(description).not.toContain('showAll:"true"');
      expect(description).not.toContain("showAll:'true'");
    });
  });
});