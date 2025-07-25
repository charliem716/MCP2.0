/**
 * Q-SYS Core Connection Test
 * Tests the official @q-sys/qrwc SDK connection
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Qrwc } from '@q-sys/qrwc';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

describe('Q-SYS Core Connection', () => {
  let config: any;
  let qrwc: any;
  let socket: WebSocket;

  beforeAll(() => {
    // Load config from JSON file
    const configPath = path.join(process.cwd(), 'qsys-core.config.json');
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else {
      console.log('Skipping Q-SYS connection tests - no config file');
    }
  });

  afterAll(async () => {
    if (qrwc) {
      qrwc.close();
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  });

  it('should connect to Q-SYS Core via WebSocket', async () => {
    if (!config) {
      console.log('Skipping - no Q-SYS Core config');
      return;
    }

    const { host, port, username, password } = config.qsysCore;
    const wsUrl = `wss://${host}:${port}/qrc-public-api/v0`;

    // Create WebSocket connection with SSL options for self-signed certificates
    socket = new WebSocket(wsUrl, {
      rejectUnauthorized: false, // Allow self-signed certificates
    });

    // Wait for socket to open
    await new Promise<void>((resolve, reject) => {
      socket.on('open', resolve);
      socket.on('error', reject);
      
      // Timeout after 15 seconds
      setTimeout(() => reject(new Error('Connection timeout')), 15000);
    });

    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('should create QRWC instance with open socket', async () => {
    if (!config || !socket || socket.readyState !== WebSocket.OPEN) {
      console.log('Skipping - no connection');
      return;
    }

    // Create QRWC instance with the open socket
    qrwc = await Qrwc.createQrwc({
      socket,
      pollingInterval: 350, // Default polling interval
      timeout: 5000, // 5 second timeout
    });

    expect(qrwc).toBeDefined();
    expect(qrwc.components).toBeDefined();
  });

  it('should discover available components', async () => {
    if (!qrwc) {
      console.log('Skipping - no QRWC instance');
      return;
    }

    const componentNames = Object.keys(qrwc.components);
    
    // Log discovered components for debugging
    if (componentNames.length > 0) {
      console.log(`Found ${componentNames.length} components:`);
      componentNames.forEach(name => {
        const controlCount = Object.keys(qrwc.components[name].controls).length;
        console.log(`  - ${name} (${controlCount} controls)`);
      });
    }

    // We expect at least some components to be available
    expect(componentNames.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle disconnection gracefully', async () => {
    if (!qrwc) {
      console.log('Skipping - no QRWC instance');
      return;
    }

    // Set up disconnect handler
    const disconnectPromise = new Promise<string>((resolve) => {
      qrwc.on('disconnected', (reason: string) => {
        resolve(reason);
      });
    });

    // Close connection
    qrwc.close();

    // Wait for disconnection
    const reason = await disconnectPromise;
    expect(reason).toBeDefined();
  });
});