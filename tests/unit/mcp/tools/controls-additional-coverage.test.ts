import { GetControlValuesTool, SetControlValuesTool } from '../../../../src/mcp/tools/controls';

describe('Controls Additional Coverage', () => {
  describe('GetControlValuesTool - Additional Coverage', () => {
    let mockQrwcClient: any;
    let tool: GetControlValuesTool;

    beforeEach(() => {
      mockQrwcClient = {
        sendCommand: jest.fn(),
        isConnected: jest.fn().mockReturnValue(true),
      };
      tool = new GetControlValuesTool(mockQrwcClient);
      // @ts-expect-error - accessing private property for testing
      tool.logger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      };
    });

    describe('formatControlValuesResponse', () => {
      it('should format control values response correctly', () => {
        const values = [
          { name: 'MainGain', value: -10, string: '-10 dB' },
          { name: 'Mute', value: false },
          { name: 'ErrorControl', value: 'N/A', error: 'Control not found' }
        ];

        // @ts-expect-error - accessing private method for testing
        const formatted = tool.formatControlValuesResponse(values);

        expect(formatted).toContain('Control Values:');
        expect(formatted).toContain('MainGain: -10 (-10 dB)');
        expect(formatted).toContain('Mute: false');
        expect(formatted).toContain('ErrorControl: Error - Control not found');
      });

      it('should handle empty values array', () => {
        // @ts-expect-error - accessing private method for testing
        const formatted = tool.formatControlValuesResponse([]);
        expect(formatted).toBe('No control values found');
      });
    });

    describe('parseControlValuesResponse edge cases', () => {
      it('should handle invalid response format', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue('string response');

        const result = await tool.execute({ controls: ['test'] });
        expect(result.isError).toBe(false);
        const values = JSON.parse(result.content[0].text);
        expect(values[0]).toMatchObject({
          name: 'test',
          value: 'N/A',
          error: 'Control not found'
        });
      });

      it('should handle response without result property', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue({});

        const result = await tool.execute({ controls: ['test'] });
        expect(result.isError).toBe(false);
        const values = JSON.parse(result.content[0].text);
        expect(values[0]).toMatchObject({
          name: 'test',
          value: 'N/A',
          error: 'Control not found'
        });
      });

      it('should handle null response', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue(null);

        const result = await tool.execute({ controls: ['test'] });
        expect(result.isError).toBe(false);
        const values = JSON.parse(result.content[0].text);
        expect(values[0]).toMatchObject({
          name: 'test',
          value: 'N/A',
          error: 'Control not found'
        });
      });

      it('should handle non-array result', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue({
          result: { notAnArray: true }
        });

        const result = await tool.execute({ controls: ['test'] });
        expect(result.isError).toBe(false);
        const values = JSON.parse(result.content[0].text);
        expect(values[0]).toMatchObject({
          name: 'test',
          value: 'N/A',
          error: 'Control not found'
        });
      });
    });

    describe('error handling', () => {
      it('should handle and format sendCommand errors', async () => {
        const error = new Error('Connection timeout');
        mockQrwcClient.sendCommand.mockRejectedValue(error);

        const result = await tool.execute({ controls: ['test'] });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Connection timeout');
        expect(tool.logger.error).toHaveBeenCalledWith(
          'Failed to get control values',
          expect.objectContaining({ error })
        );
      });

      it('should handle non-Error exceptions', async () => {
        mockQrwcClient.sendCommand.mockRejectedValue('String error');

        const result = await tool.execute({ controls: ['test'] });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Unknown error occurred');
      });
    });
  });

  describe('SetControlValuesTool - Additional Coverage', () => {
    let mockQrwcClient: any;
    let tool: SetControlValuesTool;

    beforeEach(() => {
      mockQrwcClient = {
        sendCommand: jest.fn(),
        isConnected: jest.fn().mockReturnValue(true),
      };
      tool = new SetControlValuesTool(mockQrwcClient);
      // @ts-expect-error - accessing private property for testing
      tool.logger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      };
    });

    describe('validateControls edge cases', () => {
      it('should handle validation response without result', async () => {
        mockQrwcClient.sendCommand
          .mockResolvedValueOnce({}) // Validation response without result
          .mockResolvedValueOnce({ success: true }); // Set response

        const result = await tool.execute({
          controls: [{ name: 'Test', value: 1 }]
        });

        expect(result.isError).toBe(true);
        const results = JSON.parse(result.content[0].text);
        expect(results[0].success).toBe(false);
        expect(results[0].error).toContain("Control 'Test' not found");
      });

      it('should handle validation response with non-array result', async () => {
        mockQrwcClient.sendCommand
          .mockResolvedValueOnce({ result: 'not an array' })
          .mockResolvedValueOnce({ success: true });

        const result = await tool.execute({
          controls: [{ name: 'Test', value: 1 }]
        });

        expect(result.isError).toBe(true);
        const results = JSON.parse(result.content[0].text);
        expect(results[0].success).toBe(false);
        expect(results[0].error).toContain("Control 'Test' not found");
      });

      it('should handle validation error', async () => {
        mockQrwcClient.sendCommand.mockRejectedValueOnce(new Error('Validation failed'));

        const result = await tool.execute({
          controls: [{ name: 'Test', value: 1 }]
        });

        expect(result.isError).toBe(true);
        const results = JSON.parse(result.content[0].text);
        expect(results[0].success).toBe(false);
        expect(results[0].error).toContain('Validation failed');
      });
    });

    describe('parseSetResponse edge cases', () => {
      it('should handle response without id property', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue({
          // No id property - invalid response format
          success: true
        });

        const result = await tool.execute({
          controls: [{ name: 'Test', value: 1 }],
          validate: false
        });

        // When ALL controls fail due to invalid response format, isError should be true
        expect(result.isError).toBe(true);
        const results = JSON.parse(result.content[0].text);
        // Should report failure due to unexpected response format
        expect(results[0].success).toBe(false);
        expect(results[0].error).toBe('Unexpected response format from Q-SYS');
      });

      it('should handle string response', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue('success');

        const result = await tool.execute({
          controls: [{ name: 'Test', value: 1 }],
          validate: false
        });

        // When ALL controls fail due to invalid response format, isError should be true
        expect(result.isError).toBe(true);
        const results = JSON.parse(result.content[0].text);
        // String response is invalid format, should report failure
        expect(results[0].success).toBe(false);
        expect(results[0].error).toBe('Unexpected response format from Q-SYS');
      });

      it('should handle null response', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue(null);

        const result = await tool.execute({
          controls: [{ name: 'Test', value: 1 }],
          validate: false
        });

        // When ALL controls fail due to invalid response format, isError should be true
        expect(result.isError).toBe(true);
        const results = JSON.parse(result.content[0].text);
        // Null response is invalid, should report failure
        expect(results[0].success).toBe(false);
        expect(results[0].error).toBe('Unexpected response format from Q-SYS');
      });

      it('should handle error property in response', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue({
          error: {
            code: -32602,
            message: 'Invalid control name'
          }
        });

        const result = await tool.execute({
          controls: [{ name: 'Test', value: 1 }],
          validate: false
        });

        // When ALL controls fail due to Q-SYS error, isError should be true
        expect(result.isError).toBe(true);
        const results = JSON.parse(result.content[0].text);
        expect(results[0].success).toBe(false);
        expect(results[0].error).toContain('Invalid control name');
      });
    });

    describe('groupControlsByComponent edge cases', () => {
      it('should handle controls with empty component name', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue({ 
          result: [{ Name: '.control', Result: 'Success' }]
        });

        await tool.execute({
          controls: [{ name: '.control', value: 1 }], // Starts with dot
          validate: false
        });

        // Should treat as named control with Controls array
        expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Control.Set', {
          Controls: [{ Name: '.control', Value: 1 }]
        });
      });

      it('should handle controls with trailing dots', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

        await tool.execute({
          controls: [{ name: 'Component.', value: 1 }], // Ends with dot
          validate: false
        });

        expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.Set', {
          Name: 'Component',
          Controls: [{ Name: '', Value: 1 }]
        });
      });
    });

    describe('convertValue edge cases', () => {
      it('should convert string boolean values', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue({ 
          result: [
            { Name: 'Test1', Result: 'Success' },
            { Name: 'Test2', Result: 'Success' },
            { Name: 'Test3', Result: 'Success' },
            { Name: 'Test4', Result: 'Success' },
            { Name: 'Test5', Result: 'Success' },
            { Name: 'Test6', Result: 'Success' }
          ]
        });

        await tool.execute({
          controls: [
            { name: 'Test1', value: 'true' as any },
            { name: 'Test2', value: 'false' as any },
            { name: 'Test3', value: 'yes' as any },
            { name: 'Test4', value: 'no' as any },
            { name: 'Test5', value: 'on' as any },
            { name: 'Test6', value: 'off' as any }
          ],
          validate: false
        });

        const calls = mockQrwcClient.sendCommand.mock.calls;
        // All controls are sent in a single batch with Controls array
        expect(calls[0][1].Controls).toEqual([
          { Name: 'Test1', Value: 1 }, // true -> 1
          { Name: 'Test2', Value: 0 }, // false -> 0
          { Name: 'Test3', Value: 1 }, // yes -> 1
          { Name: 'Test4', Value: 0 }, // no -> 0
          { Name: 'Test5', Value: 1 }, // on -> 1
          { Name: 'Test6', Value: 0 }  // off -> 0
        ]);
      });

      it('should handle numeric strings', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue({ 
          result: [
            { Name: 'Test1', Result: 'Success' },
            { Name: 'Test2', Result: 'Success' },
            { Name: 'Test3', Result: 'Success' }
          ]
        });

        await tool.execute({
          controls: [
            { name: 'Test1', value: '123' as any },
            { name: 'Test2', value: '-45.67' as any },
            { name: 'Test3', value: 'not-a-number' as any }
          ],
          validate: false
        });

        const calls = mockQrwcClient.sendCommand.mock.calls;
        // Numeric strings are kept as strings - Q-SYS handles the conversion
        expect(calls[0][1].Controls).toEqual([
          { Name: 'Test1', Value: '123' },      // Kept as string
          { Name: 'Test2', Value: '-45.67' },   // Kept as string
          { Name: 'Test3', Value: 'not-a-number' } // Kept as string
        ]);
      });
    });

    describe('error response from Q-SYS', () => {
      it('should handle Q-SYS error response during set', async () => {
        mockQrwcClient.sendCommand
          .mockResolvedValueOnce({ result: { Name: 'Test', Value: 0 } }) // Validation OK - single control
          .mockResolvedValueOnce({
            error: {
              code: -32603,
              message: 'Control is read-only'
            }
          });

        const result = await tool.execute({
          controls: [{ name: 'Test', value: 1 }]
        });

        // When ALL controls fail due to Q-SYS error, isError should be true
        expect(result.isError).toBe(true);
        const results = JSON.parse(result.content[0].text);
        expect(results[0].success).toBe(false);
        expect(results[0].error).toContain('Control is read-only');
      });

      it('should handle component controls with multiple segments', async () => {
        mockQrwcClient.sendCommand.mockResolvedValue({ success: true });

        await tool.execute({
          controls: [
            { name: 'Zone.1.Output.gain', value: -10 },
            { name: 'Zone.1.Output.mute', value: true }
          ],
          validate: false
        });

        expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.Set', {
          Name: 'Zone',
          Controls: [
            { Name: '1.Output.gain', Value: -10 },
            { Name: '1.Output.mute', Value: 1 }
          ]
        });
      });
    });

    describe('Result aggregation', () => {
      it('should handle mixed success and failure', async () => {
        mockQrwcClient.sendCommand.mockResolvedValueOnce({
          result: [
            { Name: 'Control1', Result: 'Success' },
            { Name: 'Control2', Result: 'Error', Error: 'Second control failed' },
            { Name: 'Control3', Result: 'Success' }
          ]
        });

        const result = await tool.execute({
          controls: [
            { name: 'Control1', value: 1 },
            { name: 'Control2', value: 2 },
            { name: 'Control3', value: 3 }
          ],
          validate: false
        });

        // Even with partial failures, overall operation succeeds
        expect(result.isError).toBe(false);
        const results = JSON.parse(result.content[0].text);
        expect(results).toHaveLength(3);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(false);
        expect(results[1].error).toBe('Second control failed');
        expect(results[2].success).toBe(true);
      });
    });
  });
});