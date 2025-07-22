import { describe, it, expect, beforeEach } from '@jest/globals';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { AddControlsToChangeGroupTool } from '../../src/mcp/tools/change-groups.js';

describe('BUG-067 Integration Test: Verify fix', () => {
  let adapter: QRWCClientAdapter;
  let tool: AddControlsToChangeGroupTool;

  beforeEach(() => {
    // Create adapter with mocked QRWC client
    const mockQrwcClient = {
      isConnected: () => true,
      close: () => {},
      components: {
        get: (name: string) => {
          // Only Gain1 components exist
          if (name === 'Gain1') {
            return {
              Name: 'Gain1',
              ID: 'gain1-id',
              Type: 'gain',
              Controls: [
                { Name: 'gain', ID: 'gain1.gain', Value: 0, String: '0dB' },
                { Name: 'mute', ID: 'gain1.mute', Value: false, String: 'false' }
              ]
            };
          }
          return undefined;
        },
        values: () => [
          {
            Name: 'Gain1',
            ID: 'gain1-id',
            Type: 'gain',
            Controls: [
              { Name: 'gain', ID: 'gain1.gain', Value: 0, String: '0dB' },
              { Name: 'mute', ID: 'gain1.mute', Value: false, String: 'false' }
            ]
          }
        ]
      },
      namedControls: {
        get: () => undefined,
        values: () => []
      }
    };

    adapter = new QRWCClientAdapter(mockQrwcClient as any, () => {});
    tool = new AddControlsToChangeGroupTool(adapter);
  });

  it('should return correct count when mixing valid and invalid controls', async () => {
    // Create change group first
    await adapter.sendCommand('ChangeGroup.AddControl', {
      Id: 'test-group',
      Controls: []
    });

    // Add mix of valid and invalid controls
    const result = await tool.execute({
      groupId: 'test-group',
      controlNames: ['Gain1.gain', 'InvalidControl.foo', 'Gain1.mute', 'BadComponent.bar']
    });

    const response = JSON.parse(result.content[0].text);
    
    // Should only count the 2 valid controls (Gain1.gain and Gain1.mute)
    expect(response.success).toBe(true);
    expect(response.controlsAdded).toBe(2);
    expect(response.message).toBe("Added 2 controls to change group 'test-group'");
  });

  it('should return 0 when all controls are invalid', async () => {
    // Create change group first
    await adapter.sendCommand('ChangeGroup.AddControl', {
      Id: 'test-group',
      Controls: []
    });

    // Add only invalid controls
    const result = await tool.execute({
      groupId: 'test-group',
      controlNames: ['Invalid1.foo', 'Invalid2.bar', 'NoSuchComponent.baz']
    });

    const response = JSON.parse(result.content[0].text);
    
    expect(response.success).toBe(true);
    expect(response.controlsAdded).toBe(0);
    expect(response.message).toBe("Added 0 controls to change group 'test-group'");
  });

  it('should not double-count when adding same control twice', async () => {
    // Create change group first
    await adapter.sendCommand('ChangeGroup.AddControl', {
      Id: 'test-group',
      Controls: []
    });

    // Add same control multiple times
    const result = await tool.execute({
      groupId: 'test-group',
      controlNames: ['Gain1.gain', 'Gain1.gain', 'Gain1.gain']
    });

    const response = JSON.parse(result.content[0].text);
    
    // Should only count once
    expect(response.success).toBe(true);
    expect(response.controlsAdded).toBe(1);
    expect(response.message).toBe("Added 1 controls to change group 'test-group'");
  });
});