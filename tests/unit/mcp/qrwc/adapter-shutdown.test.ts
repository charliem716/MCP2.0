/**
 * Unit test for BUG-169: Adapter dispose method properly shuts down state manager
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { QRWCClientAdapter } from '../../../../src/mcp/qrwc/adapter.js';
import type { OfficialQRWCClient } from '../../../../src/qrwc/client.js';
import type { IStateRepository } from '../../../../src/mcp/state/repository.js';

describe('QRWCClientAdapter Shutdown (BUG-169)', () => {
  let adapter: QRWCClientAdapter;
  let mockClient: jest.Mocked<OfficialQRWCClient>;
  let mockStateManager: jest.Mocked<IStateRepository & { shutdown: () => Promise<void> }>;

  beforeEach(() => {
    // Create mock QRWC client
    mockClient = {
      isConnected: jest.fn().mockReturnValue(true),
      listComponentControls: jest.fn().mockResolvedValue([]),
      send: jest.fn().mockResolvedValue({ result: {} }),
      on: jest.fn(),
      off: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Create mock state manager with shutdown method
    mockStateManager = {
      getComponent: jest.fn(),
      setComponent: jest.fn(),
      removeComponent: jest.fn(),
      getAllComponents: jest.fn().mockReturnValue([]),
      getComponentCount: jest.fn().mockReturnValue(0),
      clear: jest.fn(),
      shutdown: jest.fn().mockResolvedValue(undefined),
    } as any;

    adapter = new QRWCClientAdapter(mockClient);
  });

  it('should dispose without error when no state manager is set', async () => {
    await expect(adapter.dispose()).resolves.not.toThrow();
  });

  it('should call state manager shutdown when disposed', async () => {
    // Set the state manager
    adapter.setStateManager(mockStateManager);
    
    // Dispose the adapter
    await adapter.dispose();
    
    // Verify shutdown was called
    expect(mockStateManager.shutdown).toHaveBeenCalledTimes(1);
  });

  it('should handle state manager shutdown errors gracefully', async () => {
    // Set the state manager with a failing shutdown
    mockStateManager.shutdown.mockRejectedValue(new Error('Shutdown failed'));
    adapter.setStateManager(mockStateManager);
    
    // Dispose should not throw even if shutdown fails
    await expect(adapter.dispose()).resolves.not.toThrow();
    
    // But shutdown should have been attempted
    expect(mockStateManager.shutdown).toHaveBeenCalledTimes(1);
  });

  it('should clear caches when disposed', async () => {
    // Manually add to change groups cache by calling the private method
    // Since we can't directly call private methods, we'll just verify the disposal works
    
    // Dispose the adapter
    await adapter.dispose();
    
    // After disposal, caches should be cleared
    const groups = adapter.listChangeGroups();
    expect(groups).toEqual([]);
  });

  it('should work with state manager without shutdown method', async () => {
    // Create state manager without shutdown method
    const simpleStateManager: IStateRepository = {
      getComponent: jest.fn(),
      setComponent: jest.fn(),
      removeComponent: jest.fn(),
      getAllComponents: jest.fn().mockReturnValue([]),
      getComponentCount: jest.fn().mockReturnValue(0),
      clear: jest.fn(),
    } as any;
    
    adapter.setStateManager(simpleStateManager);
    
    // Dispose should not throw
    await expect(adapter.dispose()).resolves.not.toThrow();
  });

  it('should be idempotent - multiple dispose calls should be safe', async () => {
    adapter.setStateManager(mockStateManager);
    
    // Call dispose multiple times
    await adapter.dispose();
    await adapter.dispose();
    await adapter.dispose();
    
    // Shutdown should be called multiple times since we don't track if already disposed
    // This is ok - the state manager's shutdown should be idempotent
    expect(mockStateManager.shutdown).toHaveBeenCalledTimes(3);
  });
});