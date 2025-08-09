import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { QRWCClientInterface } from '../../src/mcp/qrwc/adapter';
import { AddControlsToChangeGroupTool } from '../../src/mcp/tools/change-groups';

describe('add_controls_to_change_group returns correct control count', () => {
  let mockQrwcClient: jest.Mocked<QRWCClientInterface>;
  let tool: AddControlsToChangeGroupTool;

  beforeEach(() => {
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
    } as any;

    tool = new AddControlsToChangeGroupTool(mockQrwcClient);
  });

  it('should return correct count when invalid controls are included', async () => {
    // Simulate the adapter behavior where invalid controls are skipped
    // The adapter now returns the actual count of controls added
    mockQrwcClient.sendCommand.mockResolvedValueOnce({
      result: { addedCount: 2 },
    });

    const result = await tool.execute({
      groupId: 'test',
      controlNames: ['Gain1.gain', 'InvalidControl.foo', 'Gain1.mute'],
    });

    const response = JSON.parse(result.content[0].text);

    // Returns the actual count of controls added (excluding invalid)
    expect(response.controlsAdded).toBe(2);
    expect(response.message).toBe("Added 2 controls to change group 'test'");
  });

  it('should return correct count when all controls are valid', async () => {
    mockQrwcClient.sendCommand.mockResolvedValueOnce({
      result: { addedCount: 2 },
    });

    const result = await tool.execute({
      groupId: 'test',
      controlNames: ['Gain1.gain', 'Gain1.mute'],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.controlsAdded).toBe(2);
    expect(response.message).toBe("Added 2 controls to change group 'test'");
  });

  it('should return 0 when all controls are invalid', async () => {
    mockQrwcClient.sendCommand.mockResolvedValueOnce({
      result: { addedCount: 0 },
    });

    const result = await tool.execute({
      groupId: 'test',
      controlNames: ['Invalid1.foo', 'Invalid2.bar'],
    });

    const response = JSON.parse(result.content[0].text);

    // Correctly returns 0 when all controls are invalid
    expect(response.controlsAdded).toBe(0);
    expect(response.message).toBe("Added 0 controls to change group 'test'");
  });

  it('should handle backward compatibility when adapter does not return addedCount', async () => {
    // Old adapter behavior - doesn't return addedCount
    mockQrwcClient.sendCommand.mockResolvedValueOnce({ result: true });

    const result = await tool.execute({
      groupId: 'test',
      controlNames: ['Gain1.gain', 'Gain1.mute'],
    });

    const response = JSON.parse(result.content[0].text);

    // Falls back to params.controlNames.length for backward compatibility
    expect(response.controlsAdded).toBe(2);
  });
});
