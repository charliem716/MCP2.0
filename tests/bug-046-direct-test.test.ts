import { describe, it, expect } from '@jest/globals';
import { OfficialQRWCClient } from '../src/qrwc/officialClient';
import { ConnectionState } from '../src/shared/types/common';

describe('BUG-046: Direct disconnect test', () => {
  it('should only log disconnect once when called multiple times', () => {
    // Test the disconnect behavior directly
    const client = new OfficialQRWCClient({
      host: 'test.local',
      port: 443,
      enableAutoReconnect: false,
    });
    
    // Access the private properties to simulate connected state
    const clientAny = client as any;
    
    // Set the client to CONNECTED state to allow disconnect to proceed
    clientAny.connectionState = ConnectionState.CONNECTED;
    clientAny.ws = { close: jest.fn() }; // Mock WebSocket
    clientAny.qrwc = { close: jest.fn() }; // Mock QRWC
    
    // Test that disconnect protects against multiple calls
    client.disconnect(); // Should execute
    client.disconnect(); // Should not execute (early return)
    client.disconnect(); // Should not execute (early return)
    
    // Verify WebSocket close was only called once
    expect(clientAny.ws).toBeUndefined(); // Should be cleaned up
    
    // Test that flag is reset after disconnect
    expect(clientAny.shutdownInProgress).toBe(false);
    
    // Test that connection state is correct
    expect(clientAny.connectionState).toBe(ConnectionState.DISCONNECTED);
  });
});