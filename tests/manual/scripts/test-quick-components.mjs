import { OfficialQRWCClient } from './dist/src/qrwc/officialClient.js';
import { QRWCClientAdapter } from './dist/src/mcp/qrwc/adapter.js';
import fs from 'fs';

console.log('🧪 Quick component name test\n');

const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf-8'));
const client = new OfficialQRWCClient(config.qsysCore);

try {
  await client.connect();
  const adapter = new QRWCClientAdapter(client);
  
  const response = await adapter.sendCommand('Component.GetAllControls');
  const controls = response.result.Controls;
  
  // Check first 3 controls
  console.log('First 3 controls with component info:');
  controls.slice(0, 3).forEach(ctrl => {
    console.log(`- ${ctrl.Name}`);
    console.log(`  Component: ${ctrl.Component || 'MISSING!'}`);
    console.log(`  Value: ${ctrl.Value}\n`);
  });
  
  // Count unique components
  const components = new Set(controls.map(c => c.Component));
  console.log(`Total unique components: ${components.size}`);
  
  if (components.size === 1 && components.has(undefined)) {
    console.log('❌ Component property is missing from all controls!');
  } else {
    console.log('✅ Controls have component names!');
    console.log('Sample components:', Array.from(components).slice(0, 5));
  }
  
} finally {
  await client.disconnect();
}