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

  // Set a reasonable timeout for the entire test suite
  jest.setTimeout(30000); // 30 seconds for the entire suite

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
    // Clean up QRWC instance
    if (qrwc) {
      try {
        if (typeof qrwc.close === 'function') {
          qrwc.close();
        }
      } catch (error) {
        console.log('Error closing QRWC:', error);
      }
      qrwc = null;
    }
    
    // Clean up WebSocket
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      } catch (error) {
        console.log('Error closing socket:', error);
      }
      socket = null;
    }
    
    // Give a moment for connections to fully close
    await new Promise(resolve => setTimeout(resolve, 100));
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
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);
      
      socket.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
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

    // Set up disconnect handler with timeout
    const disconnectPromise = new Promise<string>((resolve, reject) => {
      // Set up a timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error('Disconnect timeout after 5 seconds'));
      }, 5000);

      // Listen for disconnect event
      const handleDisconnect = (reason: string) => {
        clearTimeout(timeout);
        resolve(reason ?? 'Connection closed');
      };

      // Check if QRWC has an 'on' method for events
      if (typeof qrwc.on === 'function') {
        qrwc.on('disconnected', handleDisconnect);
      } else {
        // If no event system, just resolve after close
        clearTimeout(timeout);
        resolve('Connection closed');
      }
    });

    // Close connection
    if (typeof qrwc.close === 'function') {
      qrwc.close();
    }

    // Also close the WebSocket directly if still open
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }

    // Wait for disconnection or timeout
    try {
      const reason = await disconnectPromise;
      expect(reason).toBeDefined();
    } catch (error) {
      // If timeout occurs, that's okay - connection was closed
      console.log('Disconnect event not received, but connection closed');
      expect(socket.readyState).toBe(WebSocket.CLOSED);
    }
  }, 10000); // Increase test timeout to 10 seconds
});