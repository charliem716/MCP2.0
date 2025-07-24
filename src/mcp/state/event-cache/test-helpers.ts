/**
 * Test helpers for Event Cache module
 */

import { EventEmitter } from 'events';
import type { ChangeGroupEvent } from './event-types.js';

/**
 * Mock adapter for testing that satisfies the event cache requirements
 */
export class MockQRWCAdapter extends EventEmitter {
  isConnected(): boolean {
    return true;
  }
  
  executeCommand(_method: string, _params?: unknown): unknown {
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
  override on(event: 'changeGroup:changes', listener: (event: ChangeGroupEvent) => void): this;
  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }
  
  // Explicitly type the removeListener method to match the expected interface
  override removeListener(event: 'changeGroup:changes', listener: (event: ChangeGroupEvent) => void): this;
  override removeListener(event: string, listener: (...args: unknown[]) => void): this {
    return super.removeListener(event, listener);
  }
  
  // Helper method to emit change events properly
  emitChanges(groupId: string, changes: Array<{ Name: string; Value: unknown; String: string }>): void {
    const event: ChangeGroupEvent = {
      groupId,
      changes,
      timestamp: process.hrtime.bigint(),
      timestampMs: Date.now(),
      sequenceNumber: 0
    };
    this.emit('changeGroup:changes', event);
  }
}