import { QueryQSysAPITool } from '../../dist/src/mcp/tools/qsys-api.js';

const mockClient = { isConnected: () => true };
const tool = new QueryQSysAPITool(mockClient);

// Test getting examples for Component.Set
const result = await tool.execute(
  {
    query_type: 'examples',
    method_name: 'Component.Set',
  },
  { userId: 'test', timestamp: new Date().toISOString() }
);

const response = JSON.parse(result.content[0].text);
console.log('=== Component.Set Examples ===');
console.log(`Total examples found: ${response.count}`);
console.log('\nExamples:');
response.examples.forEach((ex, i) => {
  console.log(`\nExample ${i + 1}${ex.variant ? ` (${ex.variant})` : ''}:`);
  console.log(JSON.stringify(ex, null, 2));
});

// Test getting examples for Control.Get
const result2 = await tool.execute(
  {
    query_type: 'examples',
    method_name: 'Control.Get',
  },
  { userId: 'test', timestamp: new Date().toISOString() }
);

const response2 = JSON.parse(result2.content[0].text);
console.log('\n=== Control.Get Examples ===');
console.log(`Total examples found: ${response2.count}`);
console.log('\nExamples:');
response2.examples.forEach((ex, i) => {
  console.log(`\nExample ${i + 1}${ex.variant ? ` (${ex.variant})` : ''}:`);
  console.log(JSON.stringify(ex, null, 2));
});

// Show the enhanced tool description
console.log('\n=== Enhanced Tool Description ===');
console.log(tool.description);
