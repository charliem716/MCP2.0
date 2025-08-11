import { QueryCoreStatusTool } from '../../src/mcp/tools/status';

describe('BUG-204: query_core_status when disconnected', () => {
  let mockQrwcClient: any;
  let tool: QueryCoreStatusTool;

  beforeEach(() => {
    // Create mock QRWC client that is NOT connected
    mockQrwcClient = {
      sendCommand: jest.fn(),
      isConnected: jest.fn().mockReturnValue(false), // Key: returns false
    };
    
    tool = new QueryCoreStatusTool(mockQrwcClient);
    
    // Mock logger
    // @ts-expect-error - accessing private property for testing
    tool.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return disconnected status without throwing error', async () => {
    const result = await tool.execute({});
    
    // Should NOT be an error (this is the key fix for BUG-204)
    expect(result.isError).toBe(false);
    
    // Should have valid content
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    
    // Parse the status
    const status = JSON.parse(result.content[0].text);
    
    // Verify disconnected state
    expect(status.connectionStatus.connected).toBe(false);
    expect(status.systemHealth.status).toBe('disconnected');
    expect(status._metadata.error).toBe('Q-SYS Core not connected');
  });

  it('should handle all parameter combinations when disconnected', async () => {
    const paramCombinations = [
      {},
      { includeDetails: true },
      { includeNetworkInfo: true },
      { includePerformance: true },
      { includeDetails: true, includeNetworkInfo: true, includePerformance: true }
    ];

    for (const params of paramCombinations) {
      const result = await tool.execute(params);
      
      // Should always succeed with disconnected status
      expect(result.isError).toBe(false);
      
      const status = JSON.parse(result.content[0].text);
      expect(status.connectionStatus.connected).toBe(false);
      expect(status.systemHealth.status).toBe('disconnected');
    }
  });

  it('should skip connection check via override', () => {
    // Verify the tool overrides skipConnectionCheck
    // This allows it to work when disconnected
    // @ts-ignore - accessing protected method for testing
    expect(tool.skipConnectionCheck()).toBe(true);
  });

  it('should NOT call sendCommand when disconnected', async () => {
    await tool.execute({});
    
    // Should not attempt to send commands when disconnected
    expect(mockQrwcClient.sendCommand).not.toHaveBeenCalled();
  });
});