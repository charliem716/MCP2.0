import { describe, it, expect, jest } from '@jest/globals';
import { Qrwc } from '@q-sys/qrwc';
import WebSocket from 'ws';
import fs from 'fs';

describe.skip('Q-SYS Connection Test - requires live Q-SYS connection', () => {
  jest.setTimeout(30000); // 30 second timeout for integration tests
  it('should connect to Q-SYS Core and discover components', async () => {
    // Load config from JSON file
    const configPath = 'qsys-core.config.json';
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const { host, port, username, password } = config.qsysCore;

    // Create WebSocket URL
    const wsUrl = `wss://${host}:${port}/qrc-public-api/v0`;
    
    // Create WebSocket connection with SSL options for self-signed certificates
    const socket = new WebSocket(wsUrl, {
      rejectUnauthorized: false, // Allow self-signed certificates
    });

    await new Promise<void>((resolve, reject) => {
      let qrwc: any;
      
      socket.on('open', async () => {
        try {
          // Create QRWC instance with the open socket
          qrwc = await Qrwc.createQrwc({
            socket,
            pollingInterval: 350,
            timeout: 5000,
          });

          // Verify connection
          expect(qrwc).toBeDefined();
          expect(Object.keys(qrwc.components).length).toBeGreaterThan(0);

          // Set up disconnect handler
          qrwc.on('disconnected', (reason: string) => {
            console.log('QRWC disconnected:', reason);
          });

          // Close connection after test
          setTimeout(() => {
            qrwc.close();
            resolve();
          }, 1000);
        } catch (error: any) {
          socket.close();
          reject(error);
        }
      });

      socket.on('error', (error: any) => {
        reject(new Error(`WebSocket error: ${error.message}`));
      });

      socket.on('close', (code: number, reason: string) => {
        if (code !== 1000) {
          reject(new Error(`WebSocket closed unexpectedly: ${code} - ${reason}`));
        }
      });

      // Timeout if connection takes too long
      setTimeout(() => {
        socket.close();
        reject(new Error('Connection timeout after 15 seconds'));
      }, 15000);
    });
  }, 60000); // 60 second timeout for integration tests
});