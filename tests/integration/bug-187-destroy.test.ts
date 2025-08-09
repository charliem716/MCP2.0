import { DestroyChangeGroupTool } from '../../src/mcp/tools/change-groups.js';
import type { IControlSystem } from '../../src/mcp/interfaces/control-system.js';

describe('BUG-187: Destroy change group stops polling and recording', () => {
  let mockControlSystem: IControlSystem;
  let commandsSent: Array<{ method: string; params: any }> = [];

  beforeEach(() => {
    commandsSent = [];
    mockControlSystem = {
      sendCommand: jest.fn(async (method: string, params: any) => {
        commandsSent.push({ method, params });
        
        if (method === 'ChangeGroup.Destroy') {
          return { result: true };
        }
        return { result: true };
      }),
      getActiveChangeGroups: jest.fn(() => new Map()),
      isConnected: jest.fn(() => true),
    } as any;
  });

  it('should have updated description mentioning event recording', () => {
    const tool = new DestroyChangeGroupTool(mockControlSystem);
    
    // Check the description includes information about stopping recording
    expect(tool.description).toContain('stop polling');
    expect(tool.description).toContain('cease event recording');
    expect(tool.description).toContain('If event monitoring is enabled');
  });

  it('should destroy change group and stop all associated activities', async () => {
    const tool = new DestroyChangeGroupTool(mockControlSystem);
    
    const result = await tool.execute({
      groupId: 'test-destroy'
    });

    // Verify destroy command was sent
    expect(commandsSent).toHaveLength(1);
    expect(commandsSent[0].method).toBe('ChangeGroup.Destroy');
    expect(commandsSent[0].params.Id).toBe('test-destroy');
    
    // Check the response
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.message).toContain('destroyed');
  });
});