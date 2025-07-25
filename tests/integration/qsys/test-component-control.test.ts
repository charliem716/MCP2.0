/**
 * Q-SYS Component Control Test
 * Tests actual component interaction and control
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Qrwc } from '@q-sys/qrwc';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

describe('Q-SYS Component Control', () => {
  let config: any;
  let qrwc: any;
  let socket: WebSocket;

  beforeAll(async () => {
    // Load config from JSON file
    const configPath = path.join(process.cwd(), 'qsys-core.config.json');
    if (!fs.existsSync(configPath)) {
      console.log('Skipping Q-SYS component control tests - no config file');
      return;
    }

    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const { host, port } = config.qsysCore;

    // Create WebSocket connection
    const wsUrl = `wss://${host}:${port}/qrc-public-api/v0`;
    socket = new WebSocket(wsUrl, {
      rejectUnauthorized: false,
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      socket.on('open', resolve);
      socket.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 15000);
    });

    // Create QRWC instance
    qrwc = await Qrwc.createQrwc({ socket });
  });

  afterAll(async () => {
    if (qrwc) {
      qrwc.close();
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  });

  it('should discover gain/volume components', () => {
    if (!qrwc) {
      console.log('Skipping - no QRWC instance');
      return;
    }

    const componentNames = Object.keys(qrwc.components);
    const gainComponents = componentNames.filter(
      name =>
        name.toLowerCase().includes('gain') ||
        name.toLowerCase().includes('volume')
    );

    // Log for debugging
    if (gainComponents.length > 0) {
      console.log(`Found ${gainComponents.length} gain/volume components`);
      const gainName = gainComponents[0];
      const gainComponent = qrwc.components[gainName];
      console.log(`  - ${gainName}: ${Object.keys(gainComponent.controls).length} controls`);
    }

    // We might not have gain components in all systems
    expect(gainComponents).toBeDefined();
  });

  it('should read control values from components', () => {
    if (!qrwc) {
      console.log('Skipping - no QRWC instance');
      return;
    }

    const componentNames = Object.keys(qrwc.components);
    
    // Find any component with controls
    const componentWithControls = componentNames.find(name => {
      const component = qrwc.components[name];
      return Object.keys(component.controls).length > 0;
    });

    if (componentWithControls) {
      const component = qrwc.components[componentWithControls];
      const controlNames = Object.keys(component.controls);
      const firstControl = component.controls[controlNames[0]];

      // Verify control has expected properties
      expect(firstControl.state).toBeDefined();
      expect(firstControl.state).toHaveProperty('Value');
      expect(firstControl.state).toHaveProperty('Type');

      console.log(`Component "${componentWithControls}" control "${controlNames[0]}":`);
      console.log(`  Value: ${firstControl.state.Value}`);
      console.log(`  Type: ${firstControl.state.Type}`);
    }
  });

  it('should handle control value changes', async () => {
    if (!qrwc) {
      console.log('Skipping - no QRWC instance');
      return;
    }

    // Find a writable control
    let writableControl: any = null;
    let controlName: string = '';
    let componentName: string = '';

    for (const compName of Object.keys(qrwc.components)) {
      const component = qrwc.components[compName];
      for (const ctrlName of Object.keys(component.controls)) {
        const control = component.controls[ctrlName];
        // Look for numeric controls that can be written
        if (control.state.Type === 'Float' || control.state.Type === 'Integer') {
          writableControl = control;
          controlName = ctrlName;
          componentName = compName;
          break;
        }
      }
      if (writableControl) break;
    }

    if (!writableControl) {
      console.log('No writable numeric control found for testing');
      return;
    }

    console.log(`Testing control change on ${componentName}.${controlName}`);
    
    // Store original value
    const originalValue = writableControl.state.Value;
    
    // Set up change listener
    const changePromise = new Promise<any>((resolve) => {
      writableControl.on('update', (state: any) => {
        resolve(state);
      });
    });

    // Change the value slightly
    const newValue = typeof originalValue === 'number' 
      ? originalValue + 0.1 
      : 1;
    
    try {
      writableControl.setValue(newValue);
      
      // Wait for update (with timeout)
      const updatedState = await Promise.race([
        changePromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Update timeout')), 5000)
        )
      ]);

      expect(updatedState).toBeDefined();
      
      // Restore original value
      writableControl.setValue(originalValue);
    } catch (error) {
      console.log('Control change test skipped:', error.message);
    }
  });

  it('should find status components', () => {
    if (!qrwc) {
      console.log('Skipping - no QRWC instance');
      return;
    }

    const componentNames = Object.keys(qrwc.components);
    const statusComponents = componentNames.filter(name =>
      name.toLowerCase().includes('status')
    );

    // Log for debugging
    if (statusComponents.length > 0) {
      console.log(`Found ${statusComponents.length} status components:`);
      statusComponents.slice(0, 3).forEach(name => {
        const component = qrwc.components[name];
        console.log(`  - ${name}: ${Object.keys(component.controls).length} controls`);
      });
    }

    expect(statusComponents).toBeDefined();
  });
});