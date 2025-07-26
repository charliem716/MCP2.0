import { SubscribeToChangeEventsTool } from '../../../../src/mcp/tools/change-groups';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/types';

describe('BUG-109: ESLint fix verification', () => {
  it('should still access private properties for cache configuration', async () => {
    const mockAdapter: QRWCClientInterface = {
      isConnected: jest.fn().mockReturnValue(true),
    } as any;

    const mockEventCache = {
      groupPriorities: new Map(),
      buffers: new Map(),
      clearGroup: jest.fn(),
    } as any;

    const tool = new SubscribeToChangeEventsTool(mockAdapter, mockEventCache);

    // Test enabling cache with priority
    const enableResult = await tool.execute({
      groupId: 'test-group',
      enableCache: true,
      cacheConfig: {
        priority: 'high'
      }
    });

    // Verify private property access still works
    expect(mockEventCache.groupPriorities.get('test-group')).toBe('high');
    expect(enableResult.content[0].text).toContain('Event caching enabled');

    // Test disabling cache
    mockEventCache.buffers.set('test-group', {});
    
    const disableResult = await tool.execute({
      groupId: 'test-group',
      enableCache: false
    });

    // Verify private method access still works
    expect(mockEventCache.clearGroup).toHaveBeenCalledWith('test-group');
    expect(disableResult.content[0].text).toContain('Event caching disabled');
  });
});