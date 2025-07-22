import { describe, it, expect, beforeEach } from '@jest/globals';
import { GetAllControlsTool } from '../../../../dist/mcp/tools/discovery.js';

describe('GetAllControlsTool - BUG-058 Fix', () => {
  let tool;
  let mockQrwcClient;
  let mockContext;
  
  // Sample control data
  const sampleControls = [
    { Name: 'NC_12_80.input.1.gain', Component: 'NC_12_80', Type: 'Float', Value: -10 },
    { Name: 'NC_12_80.input.1.mute', Component: 'NC_12_80', Type: 'Boolean', Value: false },
    { Name: 'USB_Video_Bridge_Core-1_Q-SYS_NV-32-H.hdmi.input.select', Component: 'USB_Video_Bridge_Core-1_Q-SYS_NV-32-H', Type: 'Integer', Value: 1 },
    { Name: 'Status_NV-21-HU-1.status.text', Component: 'Status_NV-21-HU-1', Type: 'String', Value: 'OK' },
    { Name: '40_Display.trigger.power', Component: '40_Display', Type: 'Trigger', Value: 0 }
  ];

  beforeEach(() => {
    mockQrwcClient = {
      sendCommand: jest.fn()
    };
    
    mockContext = {
      clientId: 'test-client',
      toolCallId: 'test-call-123'
    };
    
    tool = new GetAllControlsTool(mockQrwcClient);
  });

  describe('Summary Mode (Default)', () => {
    it('should return summary statistics by default', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: { Controls: sampleControls }
      });
      
      const result = await tool.execute({}, mockContext);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.summary).toBeDefined();
      expect(response.summary.totalControls).toBe(5);
      expect(response.summary.totalComponents).toBe(4);
      expect(response.summary.controlsByType).toMatchObject({
        gain: 1,
        mute: 1,
        select: 1,
        text: 1,
        trigger: 1,
        other: 0
      });
      expect(response.summary.activeControls).toBe(3); // gain, select, text have non-default values
      expect(response.controls).toBeUndefined(); // No control data in summary mode
    });

    it('should return small response size in summary mode', async () => {
      // Generate 1000 controls to simulate real scenario
      const manyControls = [];
      for (let i = 0; i < 1000; i++) {
        manyControls.push({
          Name: `Component_${i % 10}.control.${i}`,
          Component: `Component_${i % 10}`,
          Type: ['Float', 'Boolean', 'String'][i % 3],
          Value: i % 5 === 0 ? 0 : i
        });
      }
      
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: { Controls: manyControls }
      });
      
      const result = await tool.execute({}, mockContext);
      const responseSize = result.content[0].text.length;
      
      // Summary should be much smaller than full data
      expect(responseSize).toBeLessThan(2000); // Less than 2KB
      const fullDataSize = JSON.stringify(manyControls).length;
      expect(responseSize).toBeLessThan(fullDataSize * 0.01); // Less than 1% of full data
    });
  });

  describe('Filtered Mode', () => {
    it('should require filter when mode is filtered', async () => {
      await expect(tool.execute({ mode: 'filtered' }, mockContext))
        .rejects.toThrow("Filter required when using 'filtered' mode");
    });

    it('should filter by component name', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: { Controls: sampleControls }
      });
      
      const result = await tool.execute({
        mode: 'filtered',
        filter: { component: 'NC_12_80' }
      }, mockContext);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.mode).toBe('filtered');
      expect(response.summary.filteredControls).toBe(2);
      expect(response.controls).toHaveLength(2);
      expect(response.controls.every(c => c.component === 'NC_12_80')).toBe(true);
    });

    it('should filter by control type', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: { Controls: sampleControls }
      });
      
      const result = await tool.execute({
        mode: 'filtered',
        filter: { type: 'gain' }
      }, mockContext);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.summary.filteredControls).toBe(1);
      expect(response.controls[0].name).toContain('gain');
    });

    it('should support regex pattern in component filter', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: { Controls: sampleControls }
      });
      
      const result = await tool.execute({
        mode: 'filtered',
        filter: { component: 'USB.*Video' }
      }, mockContext);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.summary.filteredControls).toBe(1);
      expect(response.controls[0].component).toContain('USB_Video_Bridge');
    });

    it('should filter by non-default values', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: { Controls: sampleControls }
      });
      
      const result = await tool.execute({
        mode: 'filtered',
        filter: { hasNonDefaultValue: true }
      }, mockContext);
      
      const response = JSON.parse(result.content[0].text);
      // gain (-10), select (1), text ('OK') have non-default values
      expect(response.summary.filteredControls).toBe(3);
    });
  });

  describe('Full Mode', () => {
    it('should return all controls in full mode', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: { Controls: sampleControls }
      });
      
      const result = await tool.execute({ mode: 'full' }, mockContext);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.mode).toBe('full');
      expect(response.controls).toHaveLength(5);
      expect(response.summary.totalControls).toBe(5);
      expect(response.summary.returnedControls).toBe(5);
    });

    it('should support pagination in full mode', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: { Controls: sampleControls }
      });
      
      const result = await tool.execute({
        mode: 'full',
        pagination: { limit: 2, offset: 1 }
      }, mockContext);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.controls).toHaveLength(2);
      expect(response.summary.offset).toBe(1);
      expect(response.summary.limit).toBe(2);
      expect(response.controls[0].name).toBe(sampleControls[1].Name);
    });
  });

  describe('Control Type Inference', () => {
    it('should correctly infer control types', async () => {
      const typeTestControls = [
        { Name: 'mixer.gain', Component: 'Mixer', Type: 'Float', Value: 0 },
        { Name: 'channel.level', Component: 'Channel', Type: 'Float', Value: 0 },
        { Name: 'input.mute', Component: 'Input', Type: 'Boolean', Value: false },
        { Name: 'source.input.select', Component: 'Source', Type: 'Integer', Value: 1 },
        { Name: 'scene.trigger', Component: 'Scene', Type: 'Trigger', Value: 0 },
        { Name: 'display.text', Component: 'Display', Type: 'String', Value: '' },
        { Name: 'random.control', Component: 'Random', Type: 'Unknown', Value: null }
      ];
      
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: { Controls: typeTestControls }
      });
      
      const result = await tool.execute({}, mockContext);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.summary.controlsByType).toMatchObject({
        gain: 2,    // gain and level
        mute: 1,    // mute
        select: 1,  // input.select
        trigger: 1, // trigger
        text: 1,    // text
        other: 1    // random.control
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should support legacy componentFilter parameter', async () => {
      mockQrwcClient.sendCommand.mockResolvedValue({
        result: { Controls: sampleControls }
      });
      
      const result = await tool.execute({
        mode: 'filtered',
        componentFilter: 'NC_12_80'
      }, mockContext);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.summary.filteredControls).toBe(2);
      expect(response.controls.every(c => c.component === 'NC_12_80')).toBe(true);
    });
  });
});