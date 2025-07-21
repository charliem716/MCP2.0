import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StatePersistenceManager } from '../../../../src/mcp/state/persistence/manager.js';
import { PersistenceFormat, CompressionType } from '../../../../src/mcp/state/persistence/types.js';
import type { ControlState } from '../../../../src/mcp/state/repository.js';
import * as fs from 'fs/promises';

// Mock the fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

// Helper to create test control states
const createTestState = (name: string, value: any): ControlState => ({
  name,
  value,
  timestamp: new Date('2024-01-20T10:00:00Z'),
  source: 'cache',
  metadata: {
    type: 'test',
    min: 0,
    max: 100
  }
});

// Helper to create test persisted state
const createTestPersistedState = (controls: Record<string, ControlState>) => ({
  version: '1.0.0',
  timestamp: new Date('2024-01-20T10:00:00Z'),
  controlCount: Object.keys(controls).length,
  controls
});

describe('StatePersistenceManager', () => {
  let manager: StatePersistenceManager;
  const testFilePath = './test-cache-state.json';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Setup default file system mocks
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify(createTestPersistedState({})));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({
      size: 1024,
      isFile: () => true,
      isDirectory: () => false
    } as any);
    
    manager = new StatePersistenceManager({
      filePath: testFilePath,
      format: PersistenceFormat.JSON,
      compression: CompressionType.None,
      backupCount: 3,
      autoSave: false,
      pretty: true
    });
  });

  afterEach(() => {
    manager.shutdown();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create manager with default config', () => {
      const defaultManager = new StatePersistenceManager();
      expect(defaultManager).toBeInstanceOf(StatePersistenceManager);
      
      const config = defaultManager.getConfig();
      expect(config.filePath).toBe('./cache-state.json');
      expect(config.format).toBe(PersistenceFormat.JSON);
      expect(config.compression).toBe(CompressionType.None);
      expect(config.backupCount).toBe(3);
      expect(config.autoSave).toBe(false);
      
      defaultManager.shutdown();
    });

    it('should create manager with custom config', () => {
      const customManager = new StatePersistenceManager({
        filePath: './custom-state.json',
        backupCount: 5,
        autoSave: true,
        saveIntervalMs: 30000,
        pretty: false
      });
      
      const config = customManager.getConfig();
      expect(config.filePath).toBe('./custom-state.json');
      expect(config.backupCount).toBe(5);
      expect(config.autoSave).toBe(true);
      expect(config.saveIntervalMs).toBe(30000);
      expect(config.pretty).toBe(false);
      
      customManager.shutdown();
    });
  });

  describe('start and stop', () => {
    it('should start auto-save timer when enabled', () => {
      const autoSaveManager = new StatePersistenceManager({
        autoSave: true,
        saveIntervalMs: 1000
      });
      
      autoSaveManager.start();
      
      // Verify timer is created
      jest.advanceTimersByTime(1000);
      // Timer runs but actual save is triggered by cache manager
      
      autoSaveManager.shutdown();
    });

    it('should not start timer when auto-save is disabled', () => {
      manager.start();
      
      jest.advanceTimersByTime(60000);
      // No timer should be running
      
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should stop auto-save timer', () => {
      const autoSaveManager = new StatePersistenceManager({
        autoSave: true,
        saveIntervalMs: 1000
      });
      
      autoSaveManager.start();
      autoSaveManager.stop();
      
      jest.advanceTimersByTime(5000);
      // Timer should be stopped
      
      autoSaveManager.shutdown();
    });
  });

  describe('saveState', () => {
    it('should save state successfully', async () => {
      const controls = new Map([
        ['control1', createTestState('control1', 42)],
        ['control2', createTestState('control2', 'ON')]
      ]);
      
      await manager.saveState(controls);
      
      expect(mockFs.writeFile).toHaveBeenCalled();
      
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      
      expect(writtenData.version).toBe('1.0.0');
      expect(writtenData.controlCount).toBe(2);
      expect(writtenData.controls.control1.value).toBe(42);
      expect(writtenData.controls.control2.value).toBe('ON');
      
      const stats = manager.getStatistics();
      expect(stats.totalSaves).toBe(1);
      expect(stats.saveErrors).toBe(0);
    });

    it('should save state with metadata', async () => {
      const controls = new Map([
        ['control1', createTestState('control1', 42)]
      ]);
      
      const metadata = {
        sessionId: 'test-session',
        userId: 'test-user'
      };
      
      await manager.saveState(controls, metadata);
      
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      
      expect(writtenData.metadata).toEqual(metadata);
    });

    it('should create backup before save', async () => {
      // First save to create a file
      mockFs.access.mockResolvedValueOnce(undefined);
      
      const controls = new Map([
        ['control1', createTestState('control1', 42)]
      ]);
      
      await manager.saveState(controls);
      
      // Verify backup operations
      expect(mockFs.readFile).toHaveBeenCalled(); // Read existing for backup
    });

    it('should handle save errors', async () => {
      const error = new Error('Write failed');
      mockFs.writeFile.mockRejectedValueOnce(error);
      
      const controls = new Map([
        ['control1', createTestState('control1', 42)]
      ]);
      
      await expect(manager.saveState(controls)).rejects.toThrow('Write failed');
      
      const stats = manager.getStatistics();
      expect(stats.saveErrors).toBe(1);
    });

    it('should use atomic writes when configured', async () => {
      const atomicManager = new StatePersistenceManager({
        filePath: testFilePath,
        atomicWrites: true
      });
      
      const controls = new Map([
        ['control1', createTestState('control1', 42)]
      ]);
      
      await atomicManager.saveState(controls);
      
      // With atomic writes, should write to temp file first
      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall[0]).toContain('.tmp');
      
      atomicManager.shutdown();
    });

    it('should format JSON with pretty print', async () => {
      const controls = new Map([
        ['control1', createTestState('control1', 42)]
      ]);
      
      await manager.saveState(controls);
      
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenData = writeCall[1] as string;
      
      // Pretty printed JSON should have newlines and indentation
      expect(writtenData).toContain('\n');
      expect(writtenData).toContain('  '); // Indentation
    });

    it('should update file size statistics', async () => {
      mockFs.stat.mockResolvedValueOnce({
        size: 2048,
        isFile: () => true,
        isDirectory: () => false
      } as any);
      
      const controls = new Map([
        ['control1', createTestState('control1', 42)]
      ]);
      
      await manager.saveState(controls);
      
      const stats = manager.getStatistics();
      expect(stats.fileSizeBytes).toBe(2048);
    });
  });

  describe('loadState', () => {
    it('should load state successfully', async () => {
      const persistedState = createTestPersistedState({
        control1: createTestState('control1', 42),
        control2: createTestState('control2', 'OFF')
      });
      
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(persistedState));
      
      const controls = await manager.loadState();
      
      expect(controls).not.toBeNull();
      expect(controls?.size).toBe(2);
      expect(controls?.get('control1')?.value).toBe(42);
      expect(controls?.get('control2')?.value).toBe('OFF');
      
      const stats = manager.getStatistics();
      expect(stats.totalLoads).toBe(1);
      expect(stats.loadErrors).toBe(0);
    });

    it('should return null if file does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));
      
      const controls = await manager.loadState();
      
      expect(controls).toBeNull();
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    it('should validate loaded state', async () => {
      const invalidState = {
        // Missing version
        timestamp: new Date(),
        controlCount: 1,
        controls: { control1: createTestState('control1', 42) }
      };
      
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(invalidState));
      
      const controls = await manager.loadState();
      
      expect(controls).toBeNull();
      
      const stats = manager.getStatistics();
      expect(stats.loadErrors).toBe(1);
    });

    it('should validate control count matches', async () => {
      const invalidState = {
        version: '1.0.0',
        timestamp: new Date(),
        controlCount: 2, // Says 2 but only has 1
        controls: { control1: createTestState('control1', 42) }
      };
      
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(invalidState));
      
      const controls = await manager.loadState();
      
      expect(controls).toBeNull();
    });

    it('should recover from backup on load failure', async () => {
      const manager = new StatePersistenceManager({
        filePath: testFilePath,
        backupCount: 3
      });
      
      // Main file is corrupted
      mockFs.readFile.mockRejectedValueOnce(new Error('Invalid JSON'));
      
      // Backup file is valid
      const backupState = createTestPersistedState({
        control1: createTestState('control1', 100)
      });
      
      // Mock backup directory listing
      mockFs.readdir.mockResolvedValueOnce(['test-cache-state.json.backup1'] as any);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(backupState));
      
      const controls = await manager.loadState();
      
      expect(controls).not.toBeNull();
      expect(controls?.get('control1')?.value).toBe(100);
      
      manager.shutdown();
    });

    it('should handle JSON parse errors', async () => {
      mockFs.readFile.mockResolvedValueOnce('invalid json');
      
      const controls = await manager.loadState();
      
      expect(controls).toBeNull();
      
      const stats = manager.getStatistics();
      expect(stats.loadErrors).toBe(1);
    });

    it('should update last load time', async () => {
      const persistedState = createTestPersistedState({
        control1: createTestState('control1', 42)
      });
      
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(persistedState));
      
      await manager.loadState();
      
      const stats = manager.getStatistics();
      expect(stats.lastLoadTime).toBeInstanceOf(Date);
    });
  });

  describe('clearState', () => {
    it('should delete main file and backups', async () => {
      mockFs.readdir.mockResolvedValueOnce([
        'test-cache-state.json.backup1',
        'test-cache-state.json.backup2'
      ] as any);
      
      await manager.clearState();
      
      // Should delete main file
      expect(mockFs.unlink).toHaveBeenCalledWith(testFilePath);
      
      // Should delete backup files
      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('backup1'));
      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('backup2'));
    });

    it('should handle missing files gracefully', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));
      mockFs.readdir.mockResolvedValueOnce([]);
      
      await expect(manager.clearState()).resolves.not.toThrow();
      
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should handle delete errors', async () => {
      const error = new Error('Permission denied');
      mockFs.unlink.mockRejectedValueOnce(error);
      
      await expect(manager.clearState()).rejects.toThrow('Permission denied');
    });
  });

  describe('getStatistics', () => {
    it('should return copy of statistics', async () => {
      const controls = new Map([
        ['control1', createTestState('control1', 42)]
      ]);
      
      await manager.saveState(controls);
      
      const stats1 = manager.getStatistics();
      const stats2 = manager.getStatistics();
      
      expect(stats1).not.toBe(stats2); // Different objects
      expect(stats1).toEqual(stats2); // Same values
      expect(stats1.totalSaves).toBe(1);
    });

    it('should track all statistics correctly', async () => {
      const controls = new Map([
        ['control1', createTestState('control1', 42)]
      ]);
      
      // Successful save
      await manager.saveState(controls);
      
      // Failed save
      mockFs.writeFile.mockRejectedValueOnce(new Error('Write error'));
      await expect(manager.saveState(controls)).rejects.toThrow();
      
      // Successful load
      const persistedState = createTestPersistedState({
        control1: createTestState('control1', 42)
      });
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(persistedState));
      await manager.loadState();
      
      // Failed load
      mockFs.readFile.mockRejectedValueOnce(new Error('Read error'));
      await manager.loadState();
      
      const stats = manager.getStatistics();
      expect(stats.totalSaves).toBe(1);
      expect(stats.saveErrors).toBe(1);
      expect(stats.totalLoads).toBe(1);
      expect(stats.loadErrors).toBe(1);
    });
  });

  describe('getConfig', () => {
    it('should return copy of configuration', () => {
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();
      
      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same values
      expect(config1.filePath).toBe(testFilePath);
    });
  });

  describe('shutdown', () => {
    it('should stop auto-save timer on shutdown', () => {
      const autoSaveManager = new StatePersistenceManager({
        autoSave: true,
        saveIntervalMs: 1000
      });
      
      autoSaveManager.start();
      autoSaveManager.shutdown();
      
      // Timer should be stopped
      jest.advanceTimersByTime(5000);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('error recovery', () => {
    it('should handle corrupted state files', async () => {
      // Simulate various corruption scenarios
      const corruptedStates = [
        'null',
        '{}',
        '{"version": "1.0.0"}', // Missing controls
        '{"version": "1.0.0", "controls": "not-an-object"}',
        '{"version": 123, "controls": {}}', // Wrong type for version
      ];
      
      for (const corrupted of corruptedStates) {
        mockFs.readFile.mockResolvedValueOnce(corrupted);
        
        const controls = await manager.loadState();
        expect(controls).toBeNull();
      }
      
      const stats = manager.getStatistics();
      expect(stats.loadErrors).toBe(corruptedStates.length);
    });

    it('should handle file system errors gracefully', async () => {
      // EACCES - Permission denied
      mockFs.readFile.mockRejectedValueOnce({ code: 'EACCES' });
      const result1 = await manager.loadState();
      expect(result1).toBeNull();
      
      // EISDIR - Is a directory
      mockFs.readFile.mockRejectedValueOnce({ code: 'EISDIR' });
      const result2 = await manager.loadState();
      expect(result2).toBeNull();
    });
  });
});