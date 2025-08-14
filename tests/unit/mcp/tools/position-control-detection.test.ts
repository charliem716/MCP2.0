import { ListControlsTool } from '../../../../src/mcp/tools/controls.js';
import type { IControlSystem } from '../../../../src/mcp/interfaces/control-system.js';
import type { ToolExecutionContext } from '../../../../src/mcp/tools/base.js';

describe('Position Control Detection', () => {
  let mockQrwcClient: jest.Mocked<IControlSystem>;
  let tool: ListControlsTool;
  let context: ToolExecutionContext;

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn(),
      getStatus: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      off: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      destroy: jest.fn(),
    } as unknown as jest.Mocked<IControlSystem>;

    tool = new ListControlsTool(mockQrwcClient);
    context = { requestId: 'test-123', timestamp: new Date() };
  });

  describe('inferControlType', () => {
    it('should identify stepper controls as position type', async () => {
      const mockResponse = {
        result: {
          Name: 'Test Component',
          Controls: [
            {
              Name: 'stepper.value',
              Value: 0.5,
              String: '0.5',
              Type: 'Float',
              ValueMin: 0,
              ValueMax: 1,
            },
            {
              Name: 'gain',
              Value: -6,
              String: '-6.00dB',
              Type: 'Float',
              ValueMin: -100,
              ValueMax: 20,
            },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute(
        { component: 'Test Component' },
        context
      );

      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      
      const stepperControl = controls.find((c: any) => c.name === 'stepper.value');
      expect(stepperControl).toBeDefined();
      expect(stepperControl.type).toBe('position');
      
      const gainControl = controls.find((c: any) => c.name === 'gain');
      expect(gainControl).toBeDefined();
      expect(gainControl.type).toBe('gain');
    });

    it('should identify position controls', async () => {
      const mockResponse = {
        result: {
          Name: 'Test Component',
          Controls: [
            {
              Name: 'position',
              Value: 0.75,
              String: '75%',
              Type: 'Float',
              ValueMin: 0,
              ValueMax: 1,
            },
            {
              Name: 'crossfader.position',
              Value: 0.5,
              String: '50%',
              Type: 'Float',
              ValueMin: 0,
              ValueMax: 1,
            },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute(
        { component: 'Test Component' },
        context
      );

      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      
      expect(controls).toHaveLength(2);
      controls.forEach((control: any) => {
        expect(control.type).toBe('position');
      });
    });

    it('should identify fader and slider controls as position type', async () => {
      const mockResponse = {
        result: {
          Name: 'Test Component',
          Controls: [
            {
              Name: 'master.fader',
              Value: 0.8,
              String: '80%',
              Type: 'Float',
              ValueMin: 0,
              ValueMax: 1,
            },
            {
              Name: 'volume.slider',
              Value: 0.6,
              String: '60%',
              Type: 'Float',
              ValueMin: 0,
              ValueMax: 1,
            },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute(
        { component: 'Test Component' },
        context
      );

      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      
      const faderControl = controls.find((c: any) => c.name === 'master.fader');
      expect(faderControl).toBeDefined();
      expect(faderControl.type).toBe('position');
      
      const sliderControl = controls.find((c: any) => c.name === 'volume.slider');
      expect(sliderControl).toBeDefined();
      expect(sliderControl.type).toBe('position');
    });

    it('should identify 0-1 range Float controls as position when no name hint', async () => {
      const mockResponse = {
        result: {
          Name: 'Test Component',
          Controls: [
            {
              Name: 'control1',
              Value: 0.3,
              String: '30%',
              Type: 'Float',
              ValueMin: 0,
              ValueMax: 1,
            },
            {
              Name: 'control2',
              Value: -10,
              String: '-10.00dB',
              Type: 'Float',
              ValueMin: -100,
              ValueMax: 20,
            },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute(
        { component: 'Test Component' },
        context
      );

      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      
      const control1 = controls.find((c: any) => c.name === 'control1');
      expect(control1).toBeDefined();
      expect(control1.type).toBe('position'); // 0-1 range indicates position
      
      const control2 = controls.find((c: any) => c.name === 'control2');
      expect(control2).toBeDefined();
      expect(control2.type).toBe('gain'); // dB string indicates gain
    });

    it('should not misidentify level controls as position when they are gain', async () => {
      const mockResponse = {
        result: {
          Name: 'Test Component',
          Controls: [
            {
              Name: 'output.level',
              Value: -12,
              String: '-12.00dB',
              Type: 'Float',
              ValueMin: -100,
              ValueMax: 20,
            },
            {
              Name: 'position.level', // Contains both keywords
              Value: 0.7,
              String: '70%',
              Type: 'Float',
              ValueMin: 0,
              ValueMax: 1,
            },
          ],
        },
      };

      mockQrwcClient.sendCommand.mockResolvedValue(mockResponse);

      const result = await tool.execute(
        { component: 'Test Component' },
        context
      );

      expect(result.isError).toBe(false);
      const controls = JSON.parse(result.content[0].text);
      
      const outputLevel = controls.find((c: any) => c.name === 'output.level');
      expect(outputLevel).toBeDefined();
      expect(outputLevel.type).toBe('gain'); // level with dB is gain
      
      const positionLevel = controls.find((c: any) => c.name === 'position.level');
      expect(positionLevel).toBeDefined();
      expect(positionLevel.type).toBe('position'); // position takes precedence
    });
  });
});