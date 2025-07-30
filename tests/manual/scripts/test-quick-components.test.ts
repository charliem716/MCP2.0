import { describe, it, expect } from '@jest/globals';
import { OfficialQRWCClient } from '../../../src/qrwc/officialClient';
import { QRWCClientAdapter } from '../../../src/mcp/qrwc/adapter';
import { getQSysConfig } from '../../../src/config/index';

console.log('🧪 Quick component name test\n');

// BUG-138 FIX: Use ConfigManager instead of direct file read
const qsysConfig = getQSysConfig();
const client = new OfficialQRWCClient(qsysConfig);

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
