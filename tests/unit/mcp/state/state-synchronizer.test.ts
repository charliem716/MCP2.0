import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { SimpleSynchronizer } from '../../../../src/mcp/state/simple-synchronizer.js';
import type {
  IStateRepository,
  ControlState,
} from '../../../../src/mcp/state/repository.js';
import type { QRWCClientInterface } from '../../../../src/mcp/qrwc/adapter.js';
import { EventEmitter } from 'events';

// Create mock implementations
class MockStateRepository extends EventEmitter implements IStateRepository {
  set = jest.fn().mockResolvedValue(undefined);
  get = jest.fn().mockResolvedValue(null);
  batchSet = jest.fn().mockResolvedValue(undefined);
  remove = jest.fn().mockResolvedValue(true);
  clear = jest.fn().mockResolvedValue(undefined);
  getStates = jest.fn().mockResolvedValue(new Map());
  getKeys = jest.fn().mockResolvedValue([]);
  getControlMetadata = jest.fn().mockResolvedValue(null);
  setStates = jest.fn().mockResolvedValue(undefined);
}

const createMockQrwcClient = (): jest.Mocked<QRWCClientInterface> => ({
  isConnected: jest.fn().mockReturnValue(true),
  sendCommand: jest.fn().mockImplementation((command, params) => {
    if (command === 'Component.GetComponents') {
      return Promise.resolve({
        Components: [
          { Name: 'TestComponent', Type: 'gain' },
          { Name: 'Mixer', Type: 'mixer' }
        ]
      });
    }
    if (command === 'Component.GetControls') {
      const componentName = params?.Name;
      if (componentName === 'TestComponent') {
        return Promise.resolve({
          Controls: [
            { Name: 'gain', Value: -10, String: '-10dB' },
            { Name: 'mute', Value: false, String: 'false' }
          ]
        });
      }
      if (componentName === 'Mixer') {
        return Promise.resolve({
          Controls: [
            { Name: 'level', Value: 0, String: '0dB' }
          ]
        });
      }
    }
    return Promise.resolve({});
  }),
  on: jest.fn(),
  emit: jest.fn(),
} as any);

describe('SimpleSynchronizer', () => {
  let synchronizer: SimpleSynchronizer;
  let mockRepository: MockStateRepository;
  let mockQrwcClient: ReturnType<typeof createMockQrwcClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRepository = new MockStateRepository();
    mockQrwcClient = createMockQrwcClient();

    synchronizer = new SimpleSynchronizer(
      mockRepository as any,
      mockQrwcClient,
      1000 // 1 second interval for testing
    );
  });

  afterEach(() => {
    synchronizer.shutdown();
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should create synchronizer with default interval', () => {
      const sync = new SimpleSynchronizer(
        mockRepository as any,
        mockQrwcClient
      );
      expect(sync).toBeDefined();
      sync.shutdown();
    });

    it('should create synchronizer with custom interval', () => {
      const sync = new SimpleSynchronizer(
        mockRepository as any,
        mockQrwcClient,
        5000
      );
      expect(sync).toBeDefined();
      sync.shutdown();
    });
  });

  describe('start and stop', () => {
    it('should start and stop without errors', () => {
      expect(() => synchronizer.start()).not.toThrow();
      expect(() => synchronizer.stop()).not.toThrow();
    });

    it('should handle multiple start calls', () => {
      synchronizer.start();
      synchronizer.start(); // Should not create another timer
      synchronizer.stop();
      // No errors expected
    });
  });

  describe('synchronize', () => {
    it('should sync components from Q-SYS', async () => {
      const result = await synchronizer.synchronize();

      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith('Component.GetComponents');
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.GetControls',
        { Name: 'TestComponent' }
      );
      expect(mockQrwcClient.sendCommand).toHaveBeenCalledWith(
        'Component.GetControls',
        { Name: 'Mixer' }
      );

      expect(result.updates.size).toBe(3); // 2 controls from TestComponent + 1 from Mixer
      expect(result.updates.has('TestComponent.gain')).toBe(true);
      expect(result.updates.has('TestComponent.mute')).toBe(true);
      expect(result.updates.has('Mixer.level')).toBe(true);
    });

    it('should handle multiple components', async () => {
      const result = await synchronizer.synchronize();

      const updates = result.updates;
      expect(updates.get('TestComponent.gain')).toMatchObject({
        name: 'TestComponent.gain',
        value: -10,
        source: 'qsys'
      });
      expect(updates.get('Mixer.level')).toMatchObject({
        name: 'Mixer.level',
        value: 0,
        source: 'qsys'
      });
    });

    it('should handle empty component list', async () => {
      mockQrwcClient.sendCommand.mockResolvedValueOnce({ Components: [] });

      const result = await synchronizer.synchronize();

      expect(result.updates.size).toBe(0);
      expect(result.conflicts).toEqual([]);
    });

    it('should handle component with no controls', async () => {
      mockQrwcClient.sendCommand
        .mockResolvedValueOnce({ 
          Components: [{ Name: 'EmptyComponent', Type: 'custom' }] 
        })
        .mockResolvedValueOnce({ Controls: [] });

      const result = await synchronizer.synchronize();

      expect(result.updates.size).toBe(0);
    });

    it('should only sync from qsys source', async () => {
      const result = await synchronizer.synchronize(undefined, 'persistence');

      expect(mockQrwcClient.sendCommand).not.toHaveBeenCalled();
      expect(result.updates.size).toBe(0);
      expect(result.conflicts).toEqual([]);
    });

    it('should handle sync errors gracefully', async () => {
      mockQrwcClient.sendCommand.mockRejectedValueOnce(new Error('Network error'));

      const result = await synchronizer.synchronize();

      expect(result.updates.size).toBe(0);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('shutdown', () => {
    it('should stop sync on shutdown', () => {
      synchronizer.start();
      synchronizer.shutdown();
      // Should complete without errors
    });
  });
});