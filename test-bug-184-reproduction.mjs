#!/usr/bin/env node

import { OfficialQRWCClient } from './dist/qrwc/officialClient.js';
import { QRWCClientAdapter } from './dist/mcp/qrwc/adapter.js';
import { ClearChangeGroupTool } from './dist/mcp/tools/change-groups.js';
import fs from 'fs';

console.log('BUG-184 Reproduction Test: clear_change_group implementation');
console.log('='.repeat(60));

async function test() {
  // Load config
  const config = JSON.parse(fs.readFileSync('./qsys-core.config.json', 'utf8'));
  
  // Create client
  const client = new OfficialQRWCClient({
    host: config.host,
    port: config.port || 443
  });
  const adapter = new QRWCClientAdapter(client);
  
  try {
    // Connect
    console.log('\n1. Connecting to Q-SYS Core...');
    await client.connect(
      config.host,
      config.port,
      config.username,
      config.password,
      {
        rejectUnauthorized: false,
      }
    );
    console.log('✓ Connected successfully');
    
    // Test the ChangeGroup.Clear command directly
    console.log('\n2. Testing ChangeGroup.Clear command directly...');
    
    // First create a change group
    const groupId = 'test-clear-group-' + Date.now();
    console.log(`Creating test group: ${groupId}`);
    
    await adapter.sendCommand('ChangeGroup.Create', { Id: groupId });
    console.log('✓ Group created');
    
    // Add some controls
    console.log('Adding controls to group...');
    await adapter.sendCommand('ChangeGroup.AddControl', {
      Id: groupId,
      Controls: [
        { Name: 'Gain1.gain' },
        { Name: 'Gain1.mute' }
      ]
    });
    console.log('✓ Controls added');
    
    // List groups to verify it exists with controls
    const groups1 = adapter.listChangeGroups();
    const group1 = groups1.find(g => g.id === groupId);
    console.log(`Group before clear: ${JSON.stringify(group1)}`);
    
    // Now try to clear it
    console.log('\n3. Testing ChangeGroup.Clear command...');
    try {
      const result = await adapter.sendCommand('ChangeGroup.Clear', { Id: groupId });
      console.log('✓ ChangeGroup.Clear executed successfully');
      console.log('Result:', JSON.stringify(result, null, 2));
      
      // Verify the group is empty
      const groups2 = adapter.listChangeGroups();
      const group2 = groups2.find(g => g.id === groupId);
      console.log(`Group after clear: ${JSON.stringify(group2)}`);
      
    } catch (error) {
      console.error('✗ ChangeGroup.Clear failed:', error.message);
      console.error('Error type:', error.constructor.name);
      console.error('Full error:', error);
    }
    
    // Test via MCP tool
    console.log('\n4. Testing via MCP tool (clear_change_group)...');
    const clearTool = new ClearChangeGroupTool(adapter);
    
    // Add controls again to test the tool
    await adapter.sendCommand('ChangeGroup.AddControl', {
      Id: groupId,
      Controls: [
        { Name: 'Gain1.gain' },
        { Name: 'Gain1.mute' }
      ]
    });
    console.log('✓ Controls re-added for tool test');
    
    try {
      const toolResult = await clearTool.execute({ groupId });
      console.log('✓ MCP tool executed successfully');
      console.log('Tool result:', JSON.stringify(toolResult, null, 2));
    } catch (error) {
      console.error('✗ MCP tool failed:', error.message);
      console.error('Full error:', error);
    }
    
    // Clean up
    console.log('\n5. Cleaning up...');
    await adapter.sendCommand('ChangeGroup.Destroy', { Id: groupId });
    console.log('✓ Test group destroyed');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.disconnect();
    console.log('\n✓ Disconnected from Q-SYS Core');
  }
}

test().catch(console.error);