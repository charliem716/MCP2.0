import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createReadChangeGroupEventsTool } from '../../../../src/mcp/tools/change-groups.js';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/adapter.js';
import type { EventCacheManager } from '../../../../src/mcp/state/event-cache/manager.js';

describe('BUG-105: read_change_group_events timeout protection', () => {
  let mockQrwcClient: jest.Mocked<QRWCClientInterface>;
  let mockEventCache: jest.Mocked<EventCacheManager>;
  let tool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockQrwcClient = {
      isConnected: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn(),
    } as any;

    mockEventCache = {
      query: jest.fn(),
    } as any;

    tool = createReadChangeGroupEventsTool(mockQrwcClient, mockEventCache);
    tool.setEventCache(mockEventCache);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should timeout with configured timeout value', async () => {
    // Create a query that never resolves
    const queryPromise = new Promise(() => {});
    mockEventCache.query.mockReturnValue(queryPromise);

    const startTime = Date.now();
    
    // This should timeout after 2 seconds  
    const result = await tool.execute({
      groupId: 'test-group',
      startTime: Date.now() - 3600000,
      endTime: Date.now(),
      timeout: 2000, // 2 second timeout
    });

    const duration = Date.now() - startTime;
    
    // Should timeout after ~2 seconds
    expect(duration).toBeGreaterThanOrEqual(1900);
    expect(duration).toBeLessThan(2500);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('2000ms');
    expect(result.content[0].text).toContain('timeout');
  });

  it('should complete normally when query finishes before timeout', async () => {
    const testEvents = [
      {
        groupId: 'test-group',
        controlName: 'test.control',
        timestamp: BigInt(Date.now()),
        timestampMs: Date.now(),
        value: 1,
        string: '1',
        sequenceNumber: 1,
      },
    ];

    // Simulate a query that resolves immediately
    mockEventCache.query.mockResolvedValue(testEvents);

    const result = await tool.execute({
      groupId: 'test-group',
      startTime: Date.now() - 3600000,
      endTime: Date.now(),
      timeout: 5000, // 5 second timeout
    });

    expect(result.isError ?? false).toBe(false);
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const response = JSON.parse(result.content[0].text!);
    expect(response.success).toBe(true);
    expect(response.events).toHaveLength(1);
    expect(response.count).toBe(1);
  });

  it('should handle timeout errors properly', async () => {
    // Create a slow query
    let queryResolved = false;
    mockEventCache.query.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10000));
      queryResolved = true;
      return [];
    });

    const result = await tool.execute({
      groupId: 'test-group',
      timeout: 1000, // 1 second timeout
    });

    expect(result.isError).toBe(true);
    const errorResponse = JSON.parse(result.content[0].text!);
    expect(errorResponse.error).toContain('Query timeout after 1000ms');
    expect(errorResponse.timeout).toBe(1000);
    expect(errorResponse.suggestion).toBeDefined();
    expect(queryResolved).toBe(false);
  });

  it('should use default timeout of 30 seconds when not specified', async () => {
    // Create a query that resolves quickly
    mockEventCache.query.mockResolvedValue([]);

    const result = await tool.execute({
      groupId: 'test-group',
    });

    // Should complete successfully before default timeout
    expect(result.isError ?? false).toBe(false);
    expect(result.content).toBeDefined();
    const response = JSON.parse(result.content[0].text!);
    expect(response.success).toBe(true);
  });

  it('should not interfere with fast queries', async () => {
    // Create multiple events
    const events = Array.from({ length: 100 }, (_, i) => ({
      groupId: 'test-group',
      controlName: `control-${i}`,
      timestamp: BigInt(Date.now() - i * 1000),
      timestampMs: Date.now() - i * 1000,
      value: i,
      string: i.toString(),
      sequenceNumber: i,
    }));

    mockEventCache.query.mockResolvedValue(events);

    const result = await tool.execute({
      groupId: 'test-group',
      timeout: 30000, // 30 second timeout
    });

    expect(result.isError ?? false).toBe(false);
    expect(result.content).toBeDefined();
    const response = JSON.parse(result.content[0].text!);
    expect(response.success).toBe(true);
    expect(response.events).toHaveLength(100);
    expect(response.count).toBe(100);
  });
});