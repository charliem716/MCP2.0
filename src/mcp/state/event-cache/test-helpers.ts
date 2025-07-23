/**
 * Test helpers for Event Cache module
 */

import { EventEmitter } from 'events';
import type { QRWCClientAdapter } from '../../qrwc/adapter.js';

/**
 * Mock adapter for testing that satisfies the event cache requirements
 */
export class MockQRWCAdapter extends EventEmitter {
  isConnected(): boolean {
    return true;
  }
  
  async executeCommand(method: string, params?: unknown): Promise<unknown> {
    // Mock implementation
    return { success: true };
  }
  
  async connect(): Promise<void> {
    // Mock implementation
  }
  
  async disconnect(): Promise<void> {
    // Mock implementation
  }
  
  // Explicitly type the on method to match the expected interface
  override on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
  
  // Explicitly type the removeListener method to match the expected interface
  override removeListener(event: string, listener: (...args: any[]) => void): this {
    return super.removeListener(event, listener);
  }
}