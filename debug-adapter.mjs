import { OfficialQRWCClient } from './dist/src/qrwc/officialClient.js';
import fs from 'fs';

console.log('🔍 Debugging adapter state values\n');

const config = JSON.parse(fs.readFileSync('qsys-core.config.json', 'utf-8'));
const client = new OfficialQRWCClient(config.qsysCore);

await client.connect();
console.log('Connected\n');

const qrwc = client.getQrwc();
const components = Object.keys(qrwc.components).slice(0, 2);

for (const compName of components) {
  const component = qrwc.components[compName];
  console.log(`Component: ${compName}`);
  
  const controls = Object.keys(component.controls).slice(0, 2);
  for (const ctrlName of controls) {
    const control = component.controls[ctrlName];
    console.log(`  Control: ${ctrlName}`);
    console.log(`    State:`, control.state);
    console.log(`    State type:`, typeof control.state);
    console.log(`    Is object:`, control.state && typeof control.state === 'object');
    console.log('');
  }
}

await client.disconnect();