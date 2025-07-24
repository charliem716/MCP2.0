/**
 * Test helpers for Event Cache module
 */

import { EventEmitter } from 'events';
import type { ChangeGroupEvent } from './types.js';
import type { ControlChange } from './event-types.js';

/**
 * Mock adapter for testing that satisfies the event cache requirements
 */
export class MockQRWCAdapter extends EventEmitter {
  private sequenceNumber = 0;
  
  isConnected(): boolean {
    return true;
  }
  
  sendCommand(_command: string, _params?: Record<string, unknown>): Promise<unknown> {
    // Mock implementation
    return Promise.resolve({ success: true });
  }
  
  async connect(): Promise<void> {
    // Mock implementation
  }
  
  async disconnect(): Promise<void> {
    // Mock implementation
  }
  
  // Override the on method with proper typing to match QRWCClientAdapter
  override on(event: string, listener: (...args: any[]) => void): this {
    super.on(event, listener);
    return this;
  }
  
  // Override the removeListener method with proper typing to match QRWCClientAdapter
  override removeListener(event: string, listener: (...args: any[]) => void): this {
    super.removeListener(event, listener);
    return this;
  }
  
  // Helper method to emit change events properly
  emitChanges(groupId: string, changes: Array<{ Name: string; Value: unknown; String?: string }>): void {
    const now = Date.now();
    // Ensure unique timestamps by adding sequence number as nanoseconds
    const timestamp = BigInt(now) * 1000000n + BigInt(this.sequenceNumber);
    
    const event: ChangeGroupEvent = {
      groupId,
      changes: changes as ControlChange[],
      timestamp,
      timestampMs: now,
      sequenceNumber: this.sequenceNumber++
    };
    this.emit('changeGroup:changes', event);
  }
}