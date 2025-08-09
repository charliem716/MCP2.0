import { CreateChangeGroupTool } from '../../src/mcp/tools/change-groups.js';
import type { IControlSystem } from '../../src/mcp/interfaces/control-system.js';

describe('BUG-187: Automatic polling on change group creation', () => {
  let mockControlSystem: IControlSystem;
  let commandsSent: Array<{ method: string; params: any }> = [];

  beforeEach(() => {
    commandsSent = [];
    mockControlSystem = {
      sendCommand: jest.fn(async (method: string, params: any) => {
        commandsSent.push({ method, params });
        
        if (method === 'ChangeGroup.AddControl') {
          return { result: true };
        } else if (method === 'ChangeGroup.AutoPoll') {
          return { result: true };
        }
        return { result: true };
      }),
      getActiveChangeGroups: jest.fn(() => new Map()),
      isConnected: jest.fn(() => true),
    } as any;
  });

  it('should automatically enable AutoPoll when creating a change group with pollRate', async () => {
    const tool = new CreateChangeGroupTool(mockControlSystem);
    
    const result = await tool.execute({
      groupId: 'test-auto-poll',
      pollRate: 0.5  // 2Hz
    });

    // Verify commands were sent in correct order
    expect(commandsSent).toHaveLength(2);
    
    // First command should create the group
    expect(commandsSent[0].method).toBe('ChangeGroup.AddControl');
    expect(commandsSent[0].params.Id).toBe('test-auto-poll');
    expect(commandsSent[0].params.Controls).toEqual([]);
    
    // Second command should enable AutoPoll
    expect(commandsSent[1].method).toBe('ChangeGroup.AutoPoll');
    expect(commandsSent[1].params.Id).toBe('test-auto-poll');
    expect(commandsSent[1].params.Rate).toBe(0.5);
    
    // Check the response includes polling info
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.pollRate).toBe(0.5);
    expect(response.frequency).toBe('2.0Hz');
    expect(response.message).toContain('auto-polling');
  });

  it('should use default poll rate of 1Hz when not specified', async () => {
    const tool = new CreateChangeGroupTool(mockControlSystem);
    
    const result = await tool.execute({
      groupId: 'test-default-rate'
      // No pollRate specified
    });

    // Verify AutoPoll was called with default rate
    expect(commandsSent[1].method).toBe('ChangeGroup.AutoPoll');
    expect(commandsSent[1].params.Rate).toBe(1);
    
    const response = JSON.parse(result.content[0].text);
    expect(response.pollRate).toBe(1);
    expect(response.frequency).toBe('1.0Hz');
  });

  it('should handle 33Hz (0.03s) rate correctly', async () => {
    const tool = new CreateChangeGroupTool(mockControlSystem);
    
    const result = await tool.execute({
      groupId: 'test-33hz',
      pollRate: 0.03
    });

    expect(commandsSent[1].params.Rate).toBe(0.03);
    
    const response = JSON.parse(result.content[0].text);
    expect(response.frequency).toBe('33Hz');
  });

  it('should indicate recording status based on EVENT_MONITORING_ENABLED', async () => {
    const tool = new CreateChangeGroupTool(mockControlSystem);
    
    // Test with monitoring disabled
    delete process.env.EVENT_MONITORING_ENABLED;
    let result = await tool.execute({
      groupId: 'test-recording-off',
      pollRate: 1
    });
    
    let response = JSON.parse(result.content[0].text);
    expect(response.recording).toBe(false);
    
    // Test with monitoring enabled
    process.env.EVENT_MONITORING_ENABLED = 'true';
    result = await tool.execute({
      groupId: 'test-recording-on',
      pollRate: 1
    });
    
    response = JSON.parse(result.content[0].text);
    expect(response.recording).toBe(true);
    
    // Clean up
    delete process.env.EVENT_MONITORING_ENABLED;
  });
});