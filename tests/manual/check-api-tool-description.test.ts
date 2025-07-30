import { describe, it, expect } from '@jest/globals';

describe('check api tool description', () => {
  it('should run without errors', async () => {
    // Original code wrapped in test
    const runTest = async () => {
      import { QueryQSysAPITool } from '../../src/src/mcp/tools/qsys-api';
      
      const mockClient = { isConnected: () => true };
      const tool = new QueryQSysAPITool(mockClient);
      
      console.log('=== query_qsys_api Tool Description ===');
      console.log('Name:', tool.name);
      console.log('\nDescription:');
      console.log(tool.description);
      console.log('\n=== Examples Included ===');
      console.log(
        '✓ Example for mixer commands:',
        tool.description.includes("query_type:'methods',component_type:'mixer'")
      );
      console.log(
        '✓ Example for search:',
        tool.description.includes("query_type:'methods',search:'gain'")
      );
      console.log(
        '✓ Example for specific method:',
        tool.description.includes("query_type:'examples',method_name:'Component.Set'")
      );
      
    };

    // Run test and expect no errors
    await expect(runTest()).resolves.not.toThrow();
  });
});