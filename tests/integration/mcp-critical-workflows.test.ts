import { QSysCoreMock } from '../mocks/qsys-core-mock.js';
import { OfficialQRWCClient } from '../../src/qrwc/officialClient.js';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter.js';
import { MCPToolRegistry } from '../../src/mcp/handlers/index.js';
import { EventCacheManager } from '../../src/mcp/state/event-cache/manager.js';
import { logger } from '../../src/shared/logger.js';

describe('MCP Critical Workflows Integration Tests', () => {
  let coreMock: QSysCoreMock;
  let qrwcClient: OfficialQRWCClient;
  let qrwcAdapter: QRWCClientAdapter;
  let toolRegistry: MCPToolRegistry;
  let eventCacheManager: EventCacheManager;
  
  const mockConfig = {
    host: 'localhost',
    port: 443,
    username: '',
    password: ''
  };

  beforeEach(async () => {
    // Create mock and connect
    coreMock = new QSysCoreMock(mockConfig);
    
    // Create QRWC client with mock
    qrwcClient = new OfficialQRWCClient(mockConfig);
    
    // Mock the connection methods to use our core mock
    qrwcClient.connect = jest.fn().mockResolvedValue(undefined);
    qrwcClient.disconnect = jest.fn().mockResolvedValue(undefined);
    qrwcClient.isConnected = jest.fn().mockReturnValue(true);
    qrwcClient.sendCommand = jest.fn().mockImplementation((method, params) => 
      coreMock.sendCommand(method, params)
    );
    
    // Create adapter
    qrwcAdapter = new QRWCClientAdapter(qrwcClient);
    
    // Mock adapter methods too
    qrwcAdapter.isConnected = jest.fn().mockReturnValue(true);
    qrwcAdapter.sendCommand = jest.fn().mockImplementation((method, params) => 
      coreMock.sendCommand(method, params)
    );
    
    // Initialize event cache
    eventCacheManager = new EventCacheManager({
      maxEvents: 100000,
      maxAgeMs: 3600000
    });
    eventCacheManager.attachToAdapter(qrwcAdapter);
    
    // Create and initialize tool registry
    toolRegistry = new MCPToolRegistry(qrwcAdapter, eventCacheManager);
    toolRegistry.initialize();

    await coreMock.connect();
  });

  afterEach(async () => {
    await coreMock.disconnect();
    eventCacheManager.destroy();
  });

  describe('Component Discovery Workflow', () => {
    it('should discover all components via MCP tools', async () => {
      const result = await toolRegistry.callTool('list_components', {});

      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      
      // The tool returns an array directly, not an object with components property
      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThan(0);
      expect(response).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Name: 'AudioPlayer1', Type: 'Audio Player' }),
          expect.objectContaining({ Name: 'Mixer1', Type: 'Mixer' }),
          expect.objectContaining({ Name: 'Gain1', Type: 'Gain' })
        ])
      );
    });

    it('should filter components by type', async () => {
      const result = await toolRegistry.callTool('list_components', {
        filter: 'Audio Player'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.every((c: any) => c.Type === 'Audio Player')).toBe(true);
    });

    it('should search components by name pattern', async () => {
      const result = await toolRegistry.callTool('list_components', {
        filter: 'Mix'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.every((c: any) => c.Name.includes('Mix'))).toBe(true);
    });

    it('should validate response format for component discovery', async () => {
      const result = await toolRegistry.callTool('list_components', {
        includeProperties: true
      });

      const response = JSON.parse(result.content[0].text);
      
      // Validate it's an array
      expect(Array.isArray(response)).toBe(true);
      
      // Validate component structure
      response.forEach((component: any) => {
        expect(component).toHaveProperty('Name');
        expect(component).toHaveProperty('Type');
        expect(component).toHaveProperty('Properties');
      });
    });
  });

  describe('Control Change Workflow', () => {
    it('should handle single control changes', async () => {
      // Set a single control value
      const setResult = await toolRegistry.callTool('set_control_values', {
        controls: [
          { name: 'Gain1.gain', value: -10 }
        ]
      });

      const setResponse = JSON.parse(setResult.content[0].text);
      expect(setResponse.success).toBe(true);
      expect(setResponse.updated[0]).toMatchObject({
        name: 'Gain1.gain',
        value: -10
      });

      // Verify the change
      const getResult = await toolRegistry.callTool('get_control_values', {
        controls: ['Gain1.gain']
      });

      const getResponse = JSON.parse(getResult.content[0].text);
      expect(getResponse.controls[0].value).toBe(-10);
    });

    it('should handle batch control changes', async () => {
      const controls = [
        { name: 'Mixer1.input.1.gain', value: -5 },
        { name: 'Mixer1.input.2.gain', value: -10 },
        { name: 'Mixer1.input.1.mute', value: true },
        { name: 'AudioPlayer1.play', value: true }
      ];

      const result = await toolRegistry.callTool('set_control_values', {
        controls
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.updated).toHaveLength(4);
      
      // Verify all changes were applied
      const verifyResult = await toolRegistry.callTool('get_control_values', {
        controls: controls.map(c => c.name)
      });

      const verifyResponse = JSON.parse(verifyResult.content[0].text);
      expect(verifyResponse.controls).toHaveLength(4);
      controls.forEach((control, index) => {
        expect(verifyResponse.controls[index].value).toBe(control.value);
      });
    });

    it('should verify state synchronization', async () => {
      // Create a change group and monitor changes
      const groupResult = await toolRegistry.callTool('create_change_group', {
        group_id: 'sync-test',
        controls: ['Gain1.gain', 'Gain1.mute']
      });

      expect(JSON.parse(groupResult.content[0].text).success).toBe(true);

      // Make changes
      await toolRegistry.callTool('set_control_values', {
        controls: [
          { name: 'Gain1.gain', value: -20 },
          { name: 'Gain1.mute', value: true }
        ]
      });

      // Poll for changes
      const pollResult = await toolRegistry.callTool('poll_change_group', {
        group_id: 'sync-test'
      });

      const pollResponse = JSON.parse(pollResult.content[0].text);
      expect(pollResponse.changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Gain1.gain', value: -20 }),
          expect.objectContaining({ name: 'Gain1.mute', value: true })
        ])
      );

      // Cleanup
      await toolRegistry.callTool('destroy_change_group', {
        group_id: 'sync-test'
      });
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle connection loss and reconnection', async () => {
      // Verify initial connection
      const statusResult = await toolRegistry.callTool('query_core_status', {});
      
      expect(JSON.parse(statusResult.content[0].text).connected).toBe(true);

      // Simulate disconnect
      coreMock.simulateDisconnect();
      (qrwcClient.isConnected as jest.Mock).mockReturnValue(false);
      
      // Wait for disconnect to propagate
      await new Promise(resolve => setTimeout(resolve, 100));

      // Try to get status - should show disconnected
      const disconnectedResult = await toolRegistry.callTool('query_core_status', {});
      
      const disconnectedStatus = JSON.parse(disconnectedResult.content[0].text);
      expect(disconnectedStatus.connected).toBe(false);
      expect(disconnectedStatus.error).toBeDefined();

      // Reconnect
      await coreMock.connect();
      (qrwcClient.isConnected as jest.Mock).mockReturnValue(true);

      // Verify reconnection
      const reconnectedResult = await toolRegistry.callTool('query_core_status', {});
      
      expect(JSON.parse(reconnectedResult.content[0].text).connected).toBe(true);
    });

    it('should handle invalid command gracefully', async () => {
      // Try to set a non-existent control
      const result = await toolRegistry.callTool('set_control_values', {
        controls: [
          { name: 'NonExistent.control', value: 1 }
        ]
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.errors).toBeDefined();
      expect(response.errors.length).toBeGreaterThan(0);
    });

    it('should recover from timeout errors', async () => {
      // Inject timeout failure
      coreMock.injectFailure('timeout');

      // Try to list components - should timeout
      try {
        await toolRegistry.callTool('list_components', {});
        fail('Should have thrown timeout error');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Clear failure mode
      coreMock.injectFailure('none');

      // Should work now
      const result = await toolRegistry.callTool('list_components', {});
      expect(JSON.parse(result.content[0].text).components).toBeDefined();
    });
  });

  describe('Multi-Client Consistency', () => {
    let secondClient: OfficialQRWCClient;
    let secondAdapter: QRWCClientAdapter;
    let secondRegistry: MCPToolRegistry;

    beforeEach(async () => {
      // Create second client
      secondClient = new OfficialQRWCClient(mockConfig);
      
      // Mock the connection methods for second client
      secondClient.connect = jest.fn().mockResolvedValue(undefined);
      secondClient.disconnect = jest.fn().mockResolvedValue(undefined);
      secondClient.isConnected = jest.fn().mockReturnValue(true);
      secondClient.sendCommand = jest.fn().mockImplementation((method, params) => 
        coreMock.sendCommand(method, params)
      );
      
      secondAdapter = new QRWCClientAdapter(secondClient);
      secondRegistry = new MCPToolRegistry(secondAdapter, eventCacheManager);
      secondRegistry.initialize();
      
      coreMock.registerClient('client2');
    });

    afterEach(async () => {
      // Cleanup
    });

    it('should handle concurrent state changes from multiple clients', async () => {
      // Both clients create change groups for the same controls
      await toolRegistry.callTool('create_change_group', {
        group_id: 'client1-group',
        controls: ['Mixer1.input.1.gain', 'Mixer1.input.2.gain']
      });

      await secondRegistry.callTool('create_change_group', {
        group_id: 'client2-group',
        controls: ['Mixer1.input.1.gain', 'Mixer1.input.2.gain']
      });

      // Make concurrent changes
      const changes = await Promise.all([
        toolRegistry.callTool('set_control_values', {
          controls: [{ name: 'Mixer1.input.1.gain', value: -5 }]
        }),
        secondRegistry.callTool('set_control_values', {
          controls: [{ name: 'Mixer1.input.2.gain', value: -10 }]
        })
      ]);

      // Both changes should succeed
      expect(JSON.parse(changes[0].content[0].text).success).toBe(true);
      expect(JSON.parse(changes[1].content[0].text).success).toBe(true);

      // Verify both clients see all changes
      const client1Poll = await toolRegistry.callTool('poll_change_group', {
        group_id: 'client1-group'
      });

      const client2Poll = await secondRegistry.callTool('poll_change_group', {
        group_id: 'client2-group'
      });

      const client1Changes = JSON.parse(client1Poll.content[0].text).changes;
      const client2Changes = JSON.parse(client2Poll.content[0].text).changes;

      // Both should see the final state
      expect(client1Changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Mixer1.input.1.gain', value: -5 }),
          expect.objectContaining({ name: 'Mixer1.input.2.gain', value: -10 })
        ])
      );

      expect(client2Changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Mixer1.input.1.gain', value: -5 }),
          expect.objectContaining({ name: 'Mixer1.input.2.gain', value: -10 })
        ])
      );
    });

    it('should verify state propagation between clients', async () => {
      // Client 1 makes a change
      await toolRegistry.callTool('set_control_values', {
        controls: [{ name: 'AudioPlayer1.play', value: true }]
      });

      // Client 2 should see the change
      const client2Result = await secondRegistry.callTool('get_control_values', {
        controls: ['AudioPlayer1.play']
      });

      const response = JSON.parse(client2Result.content[0].text);
      expect(response.controls[0].value).toBe(true);
    });

    it('should prevent race conditions in control updates', async () => {
      const controlName = 'Router1.select.1';
      const iterations = 10;

      // Multiple clients trying to update the same control rapidly
      const updates = [];
      for (let i = 0; i < iterations; i++) {
        const value = i + 1;
        const clientPromise = i % 2 === 0 
          ? toolRegistry.callTool('set_control_values', {
              controls: [{ name: controlName, value }]
            })
          : secondRegistry.callTool('set_control_values', {
              controls: [{ name: controlName, value }]
            });
        
        updates.push(clientPromise.then(() => value));
      }

      // Wait for all updates
      const completedValues = await Promise.all(updates);

      // Get final value
      const finalResult = await toolRegistry.callTool('get_control_values', {
        controls: [controlName]
      });

      const finalValue = JSON.parse(finalResult.content[0].text).controls[0].value;

      // Final value should be one of the values we set
      expect(completedValues).toContain(finalValue);
      
      // All updates should have completed successfully
      expect(completedValues).toHaveLength(iterations);
    });
  });
});