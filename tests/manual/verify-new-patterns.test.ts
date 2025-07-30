import { describe, it, expect } from '@jest/globals';
import { QueryQSysAPITool } from '../../src/src/mcp/tools/qsys-api';

const mockClient = { isConnected: () => true };
const tool = new QueryQSysAPITool(mockClient);

// Test 1: Query Authentication methods
console.log('=== Authentication Methods ===');
const authResult = await tool.execute(
  {
    query_type: 'methods',
    method_category: 'Authentication',
  },
  { userId: 'test', timestamp: new Date().toISOString() }
);

const authResponse = JSON.parse(authResult.content[0].text);
console.log(`Found ${authResponse.count} authentication methods`);
authResponse.methods.forEach(m => {
  console.log(`- ${m.name}: ${m.description}`);
});

// Test 2: Search for GetControls pattern
console.log('\n=== GetControls Pattern ===');
const getControlsResult = await tool.execute(
  {
    query_type: 'methods',
    search: 'GetControls',
  },
  { userId: 'test', timestamp: new Date().toISOString() }
);

const getControlsResponse = JSON.parse(getControlsResult.content[0].text);
getControlsResponse.methods.forEach(m => {
  console.log(`\n${m.name}:`);
  console.log(`  Description: ${m.description}`);
  if (m.example?.response) {
    console.log(
      '  Response includes full metadata like Type, Position, Min/Max values'
    );
  }
});

// Test 3: Query ChangeGroup methods
console.log('\n=== ChangeGroup Methods ===');
const changeGroupResult = await tool.execute(
  {
    query_type: 'methods',
    method_category: 'ChangeGroup',
  },
  { userId: 'test', timestamp: new Date().toISOString() }
);

const changeGroupResponse = JSON.parse(changeGroupResult.content[0].text);
console.log(`Found ${changeGroupResponse.count} ChangeGroup methods:`);
changeGroupResponse.methods.forEach(m => {
  console.log(`- ${m.name}: ${m.description}`);
});

// Test 4: Get examples for Control.Set to see position pattern
console.log('\n=== Control.Set Examples (Value vs Position) ===');
const controlSetResult = await tool.execute(
  {
    query_type: 'examples',
    method_name: 'Control.Set',
  },
  { userId: 'test', timestamp: new Date().toISOString() }
);

const controlSetResponse = JSON.parse(controlSetResult.content[0].text);
controlSetResponse.examples.forEach((ex, i) => {
  console.log(
    `\nExample ${i + 1}${ex.description ? `: ${ex.description}` : ''}:`
  );
  console.log(JSON.stringify(ex.params, null, 2));
});

// Test 5: Query all control types
console.log('\n=== Control Types ===');
const controlTypesResult = await tool.execute(
  {
    query_type: 'controls',
  },
  { userId: 'test', timestamp: new Date().toISOString() }
);

const controlTypesResponse = JSON.parse(controlTypesResult.content[0].text);
console.log(`Found ${controlTypesResponse.count} control types:`);
controlTypesResponse.control_types.forEach(t => {
  console.log(`- ${t.type}: ${t.description}`);
});
