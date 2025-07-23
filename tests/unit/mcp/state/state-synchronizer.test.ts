import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SimpleSynchronizer } from '../../../../src/mcp/state/simple-synchronizer.js';
import { SyncStrategy, ConflictResolutionPolicy, SyncEvent } from '../../../../src/mcp/state/synchronizer/types.js';
import { StateRepositoryEvent } from '../../../../src/mcp/state/repository.js';
import type { IStateRepository, ControlState } from '../../../../src/mcp/state/repository.js';
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
}

const createMockQrwcClient = (): jest.Mocked<QRWCClientInterface> => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  sendCommand: jest.fn(),
  getComponents: jest.fn().mockResolvedValue([
    { name: 'TestComponent', type: 'gain' }
  ]),
  getComponentControls: jest.fn().mockResolvedValue([
    { name: 'gain', value: -10, string: '-10dB' }
  ]),
  setComponentControl: jest.fn(),
  setComponentControls: jest.fn(),
  createChangeGroup: jest.fn(),
  destroyChangeGroup: jest.fn(),
  getChangeGroupDetails: jest.fn(),
  setChangeGroupAutoPoll: jest.fn(),
  pollChangeGroup: jest.fn(),
  addComponentControlToChangeGroup: jest.fn(),
  removeComponentControlFromChangeGroup: jest.fn(),
  clearChangeGroup: jest.fn(),
  getAllChangeGroups: jest.fn(),
  listChangeGroupControls: jest.fn(),
  destroyAllChangeGroups: jest.fn(),
  getStatus: jest.fn(),
  keepAlive: jest.fn(),
  onConnectionChange: jest.fn(),
  onError: jest.fn(),
  removeConnectionChangeHandler: jest.fn(),
  removeErrorHandler: jest.fn(),
  on: jest.fn(),
  emit: jest.fn(),
  logon: jest.fn()
} as any);

describe('SimpleSynchronizer', () => {
  let synchronizer: SimpleSynchronizer;
  let mockRepository: MockStateRepository;
  let mockQrwcClient: ReturnType<typeof createMockQrwcClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    mockRepository = new MockStateRepository();
    mockQrwcClient = createMockQrwcClient();
    
    synchronizer = new SimpleSynchronizer(
      mockRepository as any,
      mockQrwcClient,
      1000
    );
  });

  afterEach(() => {
    synchronizer.shutdown();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create synchronizer with default interval', () => {
      const sync = new SimpleSynchronizer(mockRepository as any, mockQrwcClient);
      expect(sync).toBeDefined();
    });

    it('should create synchronizer with custom interval', () => {
      const sync = new SimpleSynchronizer(mockRepository as any, mockQrwcClient, 5000);
      expect(sync).toBeDefined();
    });
  });

  describe('start and stop', () => {
    it('should start periodic sync', () => {
      synchronizer.start();
      
      expect(mockQrwcClient.getComponents).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(1000);
      
      expect(mockQrwcClient.getComponents).toHaveBeenCalledTimes(1);
    });

    it('should stop periodic sync', () => {
      synchronizer.start();
      jest.advanceTimersByTime(1000);
      expect(mockQrwcClient.getComponents).toHaveBeenCalledTimes(1);
      
      synchronizer.stop();
      jest.advanceTimersByTime(2000);
      
      expect(mockQrwcClient.getComponents).toHaveBeenCalledTimes(1);
    });

    it('should not start multiple timers', () => {
      synchronizer.start();
      synchronizer.start();
      
      jest.advanceTimersByTime(1000);
      expect(mockQrwcClient.getComponents).toHaveBeenCalledTimes(1);
    });
  });

  describe('synchronize', () => {
    it('should sync components from Q-SYS', async () => {
      const result = await synchronizer.synchronize();
      
      expect(mockQrwcClient.getComponents).toHaveBeenCalled();
      expect(mockQrwcClient.getComponentControls).toHaveBeenCalledWith('TestComponent');
      
      expect(result.updates.size).toBe(1);
      expect(result.updates.get('TestComponent.gain')).toMatchObject({
        name: 'TestComponent.gain',
        value: -10,
        source: 'qsys'
      });
      expect(result.conflicts).toEqual([]);
    });

    it('should return empty result for persistence source', async () => {
      const result = await synchronizer.synchronize(new Map(), 'persistence');
      
      expect(mockQrwcClient.getComponents).not.toHaveBeenCalled();
      expect(result.updates.size).toBe(0);
      expect(result.conflicts).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockQrwcClient.getComponents.mockRejectedValue(new Error('Connection failed'));
      
      const result = await synchronizer.synchronize();
      
      expect(result.updates.size).toBe(0);
      expect(result.conflicts).toEqual([]);
    });

    it('should handle multiple components', async () => {
      mockQrwcClient.getComponents.mockResolvedValue([
        { name: 'Component1', type: 'gain' },
        { name: 'Component2', type: 'mixer' }
      ]);
      
      mockQrwcClient.getComponentControls
        .mockResolvedValueOnce([{ name: 'gain', value: -10, string: '-10dB' }])
        .mockResolvedValueOnce([{ name: 'level', value: 0, string: '0dB' }]);
      
      const result = await synchronizer.synchronize();
      
      expect(result.updates.size).toBe(2);
      expect(result.updates.has('Component1.gain')).toBe(true);
      expect(result.updates.has('Component2.level')).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should stop sync on shutdown', () => {
      synchronizer.start();
      synchronizer.shutdown();
      
      jest.advanceTimersByTime(2000);
      expect(mockQrwcClient.getComponents).not.toHaveBeenCalled();
    });
  });

  // Compatibility tests for interface
  describe('interface compatibility', () => {
    it('should have required methods', () => {
      expect(typeof synchronizer.start).toBe('function');
      expect(typeof synchronizer.stop).toBe('function');
      expect(typeof synchronizer.synchronize).toBe('function');
      expect(typeof synchronizer.shutdown).toBe('function');
    });

    it('should accept cache states parameter', async () => {
      const cacheStates = new Map<string, ControlState>([
        ['existing.control', { name: 'existing.control', value: 5, timestamp: new Date(), source: 'cache' }]
      ]);
      
      const result = await synchronizer.synchronize(cacheStates);
      
      expect(result).toBeDefined();
      expect(result.updates).toBeInstanceOf(Map);
      expect(result.conflicts).toBeInstanceOf(Array);
    });
  });
});