import { ListControlsTool, GetControlValuesTool, SetControlValuesTool } from '../../../../src/mcp/tools/controls.js';
import { globalLogger } from '../../../../src/shared/utils/logger.js';

jest.mock('../../../../src/shared/utils/logger.js', () => ({
  globalLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

describe('Controls Tools - 100% Coverage Edge Cases', () => {
  let mockQrwcClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn()
    };
  });

  describe('ListControlsTool - error paths', () => {
    it('should log and throw error when sendCommand fails', async () => {
      const tool = new ListControlsTool(mockQrwcClient);
      const error = new Error('Network failure');
      mockQrwcClient.sendCommand.mockRejectedValueOnce(error);

      const result = await tool.execute({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Network failure');
    });

    it('should handle control without component prefix', async () => {
      const tool = new ListControlsTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'SimpleControl', Value: 1 } // No dot in name
        ]
      });

      const result = await tool.execute({ component: 'TestComponent' });
      expect(result.content[0].text).toContain('Found 1 control'); // Not filtered when no dot
    });

    it('should handle Position property edge cases', async () => {
      const tool = new ListControlsTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'Control1', Value: 0, Position: null },
          { Name: 'Control2', Value: 1, Position: undefined },
          { Name: 'Control3', Value: 2 } // No Position property
        ]
      });

      const result = await tool.execute({});
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Found 3 controls');
    });
  });

  describe('GetControlValuesTool - edge cases', () => {
    it('should handle undefined/null in response', async () => {
      const tool = new GetControlValuesTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({
        result: [
          { Name: 'Control1', Value: null, String: null },
          { Name: 'Control2' } // Missing Value and String
        ]
      });

      const result = await tool.execute({ controls: ['Control1', 'Control2'] });
      expect(result.content[0].text).toContain('Control1: null');
      expect(result.content[0].text).toContain('Control2:');
    });
  });

  describe('SetControlValuesTool - error handling', () => {
    it('should handle error during command preparation', async () => {
      const tool = new SetControlValuesTool(mockQrwcClient);
      
      // Pass invalid control structure to trigger error in prepareCommand
      const result = await tool.execute({
        controls: [
          { name: null as any, value: 1 } // Invalid name
        ]
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Parameter validation failed');
    });

    it('should handle component controls with dot notation edge case', async () => {
      const tool = new SetControlValuesTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ id: '123' });

      await tool.execute({
        controls: [
          { name: 'Comp.Sub.control', value: 1 } // Multiple dots
        ]
      });

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.Set',
        expect.objectContaining({
          Name: 'Comp',
          Controls: expect.arrayContaining([
            expect.objectContaining({ Name: 'Sub.control' })
          ])
        })
      );
    });

    it('should catch and format non-Error exceptions', async () => {
      const tool = new SetControlValuesTool(mockQrwcClient);
      mockQrwcClient.sendCommand.mockImplementationOnce(() => {
        throw 'String exception'; // Non-Error throw
      });

      const result = await tool.execute({
        controls: [{ name: 'Test', value: 1 }]
      });

      expect(result.content[0].text).toContain('Failed - String exception');
    });
  });
});