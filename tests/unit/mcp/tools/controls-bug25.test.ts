import { SetControlValuesTool } from '../../../../src/mcp/tools/controls.js';

describe('BUG-025: SetControlValuesTool Command Fix', () => {
  let mockQrwcClient: any;
  let tool: SetControlValuesTool;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true)
    };
    tool = new SetControlValuesTool(mockQrwcClient);
    // @ts-ignore - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  it('should use Control.Set for named controls', async () => {
    mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

    await tool.execute({ 
      controls: [{ name: 'TestControl', value: 50 }]
    });
    
    // Verify the correct command for named controls
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
      'Control.Set',
      {
        Name: 'TestControl',
        Value: 50
      }
    );
  });

  it('should use Component.Set for component controls', async () => {
    mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

    await tool.execute({ 
      controls: [{ name: 'TestComponent.testControl', value: 50 }]
    });
    
    // Verify the correct command for component controls
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
      'Component.Set',
      {
        Name: 'TestComponent',
        Controls: [
          { Name: 'testControl', Value: 50 }
        ]
      }
    );
  });

  it('should pass ramp parameter correctly for both control types', async () => {
    mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

    await tool.execute({ 
      controls: [
        { name: 'FaderControl', value: -6, ramp: 1.5 },
        { name: 'Mixer.fader', value: -3, ramp: 2.0 }
      ]
    });
    
    // Named control with ramp
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
      'Control.Set',
      {
        Name: 'FaderControl',
        Value: -6,
        Ramp: 1.5
      }
    );
    
    // Component control with ramp
    expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
      'Component.Set',
      {
        Name: 'Mixer',
        Controls: [
          { Name: 'fader', Value: -3, Ramp: 2.0 }
        ]
      }
    );
  });
});