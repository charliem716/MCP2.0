/**
 * Test adapter specifically for Event Cache tests
 */

import { EventEmitter } from 'events';
import type { QRWCClientAdapter } from '../../qrwc/adapter.js';

/**
 * Minimal test adapter that extends EventEmitter and satisfies type requirements
 */
export class TestEventCacheAdapter extends EventEmitter {
  // This adapter only needs to emit 'changeGroup:changes' events
  // It doesn't need to implement the full QRWCClientAdapter interface
}

/**
 * Create a properly typed test adapter for event cache tests
 */
export function createTestAdapter(): TestEventCacheAdapter {
  return new TestEventCacheAdapter();
}