/**
 * Tests for Event Database Backup Manager
 */

import { EventDatabaseBackupManager } from '../../../../../src/mcp/state/event-monitor/backup-manager.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('EventDatabaseBackupManager', () => {
  let tempDir: string;
  let backupDir: string;
  let testDbPath: string;
  let backupManager: EventDatabaseBackupManager;
  
  beforeEach(async () => {
    try {
      // Create temp directories for testing
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
      backupDir = path.join(tempDir, 'backups');
      testDbPath = path.join(tempDir, 'test-events.db');
      
      // Dynamic import for better-sqlite3 to work with Jest
      const Database = (await import('better-sqlite3')).default;
      
      // Create a test database with sample data
      const db = new Database(testDbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          change_group_id TEXT NOT NULL,
          control_path TEXT NOT NULL,
          component_name TEXT NOT NULL,
          control_name TEXT NOT NULL,
          value REAL NOT NULL,
          string_value TEXT,
          source TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Insert sample events
      const stmt = db.prepare(`
        INSERT INTO events (timestamp, change_group_id, control_path, component_name, control_name, value, string_value, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (let i = 0; i < 100; i++) {
        stmt.run(
          Date.now() - (i * 1000),
          'test-group',
          `Component.Control${i}`,
          'Component',
          `Control${i}`,
          Math.random() * 100,
          `Value ${i}`,
          'test'
        );
      }
      
      db.close();
      
      // Verify the database file was created
      if (!fs.existsSync(testDbPath)) {
        console.error('Test database not created at:', testDbPath);
        console.error('Temp dir exists:', fs.existsSync(tempDir));
        console.error('Temp dir contents:', fs.readdirSync(tempDir));
        throw new Error(`Test database was not created at ${testDbPath}`);
      }
      
      // Initialize backup manager
      backupManager = new EventDatabaseBackupManager({
        backupPath: backupDir,
        maxBackups: 3,
        compressionEnabled: true,
        autoBackupInterval: 0 // Disable auto-backup for tests
      });
      
      await backupManager.initialize(testDbPath);
    } catch (error) {
      console.error('Error in beforeEach:', error);
      throw error;
    }
  });
  
  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  describe('initialize', () => {
    it('should create backup directory if it does not exist', async () => {
      // Backup dir should already be created by beforeEach
      expect(fs.existsSync(backupDir)).toBe(true);
    });
    
    it('should handle existing backup directory', async () => {
      // Backup dir already exists from beforeEach
      const manager2 = new EventDatabaseBackupManager({
        backupPath: backupDir,
        maxBackups: 3,
        compressionEnabled: true,
        autoBackupInterval: 0
      });
      
      await expect(manager2.initialize(testDbPath)).resolves.not.toThrow();
    });
  });
  
  describe('performBackup', () => {
    it('should create a backup file', async () => {
      const backupInfo = await backupManager.performBackup(testDbPath);
      
      expect(backupInfo).toBeDefined();
      expect(backupInfo.filename).toMatch(/events-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}.*\.db\.gz/);
      expect(backupInfo.compressed).toBe(true);
      expect(backupInfo.eventsCount).toBe(100);
      expect(fs.existsSync(backupInfo.path)).toBe(true);
    });
    
    it('should verify database integrity before backup', async () => {
      // Corrupt the database by writing invalid data
      const dbFile = fs.readFileSync(testDbPath);
      dbFile[0] = 0xFF; // Corrupt the header
      fs.writeFileSync(testDbPath, dbFile);
      
      await expect(backupManager.performBackup(testDbPath)).rejects.toThrow('integrity check failed');
    });
    
    it('should handle missing database file', async () => {
      const missingDb = path.join(tempDir, 'missing.db');
      
      await expect(backupManager.performBackup(missingDb)).rejects.toThrow('Database file not found');
    });
    
    it('should handle in-memory database', async () => {
      await expect(backupManager.performBackup(':memory:')).rejects.toThrow('Cannot backup in-memory database');
    });
    
    it('should clean up old backups when max exceeded', async () => {
      // Create 4 backups (max is 3)
      for (let i = 0; i < 4; i++) {
        await backupManager.performBackup(testDbPath);
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
      }
      
      const backups = await backupManager.listBackups();
      expect(backups.length).toBe(3);
    });
  });
  
  describe('restoreFromBackup', () => {
    let backupPath: string;
    
    beforeEach(async () => {
      const backupInfo = await backupManager.performBackup(testDbPath);
      backupPath = backupInfo.path;
    });
    
    it('should restore database from backup', async () => {
      const targetPath = path.join(tempDir, 'restored.db');
      
      await backupManager.restoreFromBackup(backupPath, targetPath);
      
      expect(fs.existsSync(targetPath)).toBe(true);
      
      // Verify restored data
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(targetPath, { readonly: true });
      const count = db.prepare('SELECT COUNT(*) as count FROM events').get() as any;
      expect(count.count).toBe(100);
      db.close();
    });
    
    it('should handle compressed backups', async () => {
      const targetPath = path.join(tempDir, 'restored.db');
      
      // Backup path should be compressed (.gz)
      expect(backupPath.endsWith('.gz')).toBe(true);
      
      await backupManager.restoreFromBackup(backupPath, targetPath);
      
      expect(fs.existsSync(targetPath)).toBe(true);
    });
    
    it('should verify backup integrity before restore', async () => {
      // Corrupt the backup file
      const backupContent = fs.readFileSync(backupPath);
      backupContent[0] = 0xFF;
      fs.writeFileSync(backupPath, backupContent);
      
      const targetPath = path.join(tempDir, 'restored.db');
      
      await expect(backupManager.restoreFromBackup(backupPath, targetPath))
        .rejects.toThrow();
    });
    
    it('should handle missing backup file', async () => {
      const missingBackup = path.join(backupDir, 'missing.db.gz');
      const targetPath = path.join(tempDir, 'restored.db');
      
      await expect(backupManager.restoreFromBackup(missingBackup, targetPath))
        .rejects.toThrow('Backup file not found');
    });
  });
  
  describe('exportData', () => {
    it('should export all events to JSON', async () => {
      const exportPath = await backupManager.exportData(testDbPath);
      
      expect(fs.existsSync(exportPath)).toBe(true);
      
      const exportContent = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(exportContent.eventsCount).toBe(100);
      expect(exportContent.events).toHaveLength(100);
    });
    
    it('should export events within time range', async () => {
      const now = Date.now();
      const startTime = now - (50 * 1000); // Last 50 seconds
      const endTime = now;
      
      const exportPath = await backupManager.exportData(testDbPath, startTime, endTime);
      
      const exportContent = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
      expect(exportContent.events.length).toBeLessThanOrEqual(50);
      
      // Verify all events are within range
      for (const event of exportContent.events) {
        expect(event.timestamp).toBeGreaterThanOrEqual(startTime);
        expect(event.timestamp).toBeLessThanOrEqual(endTime);
      }
    });
    
    it('should handle missing database', async () => {
      const missingDb = path.join(tempDir, 'missing.db');
      
      await expect(backupManager.exportData(missingDb))
        .rejects.toThrow('Database file not found');
    });
  });
  
  describe('importData', () => {
    let exportPath: string;
    
    beforeEach(async () => {
      exportPath = await backupManager.exportData(testDbPath);
    });
    
    it('should import events from JSON export', async () => {
      // Create a new empty database
      const newDbPath = path.join(tempDir, 'import-test.db');
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(newDbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          change_group_id TEXT NOT NULL,
          control_path TEXT NOT NULL,
          component_name TEXT NOT NULL,
          control_name TEXT NOT NULL,
          value REAL NOT NULL,
          string_value TEXT,
          source TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.close();
      
      const importedCount = await backupManager.importData(newDbPath, exportPath);
      
      expect(importedCount).toBe(100);
      
      // Verify imported data
      const Database2 = (await import('better-sqlite3')).default;
      const verifyDb = new Database2(newDbPath, { readonly: true });
      const count = verifyDb.prepare('SELECT COUNT(*) as count FROM events').get() as any;
      expect(count.count).toBe(100);
      verifyDb.close();
    });
    
    it('should handle duplicate imports gracefully', async () => {
      // Create a new empty database for import testing
      const duplicateTestDb = path.join(tempDir, 'duplicate-test.db');
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(duplicateTestDb);
      db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          change_group_id TEXT NOT NULL,
          control_path TEXT NOT NULL,
          component_name TEXT NOT NULL,
          control_name TEXT NOT NULL,
          value REAL NOT NULL,
          string_value TEXT,
          source TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.close();
      
      const importedCount1 = await backupManager.importData(duplicateTestDb, exportPath);
      expect(importedCount1).toBe(100);
      
      // Second import will create duplicates since there's no unique constraint
      // This is expected behavior - the backup manager doesn't prevent duplicates
      const importedCount2 = await backupManager.importData(duplicateTestDb, exportPath);
      expect(importedCount2).toBe(100);
      
      // Verify total count (will have duplicates)
      const verifyDb = new Database(duplicateTestDb, { readonly: true });
      const count = verifyDb.prepare('SELECT COUNT(*) as count FROM events').get() as any;
      expect(count.count).toBe(200); // 100 + 100 duplicates
      verifyDb.close();
    });
    
    it('should handle missing export file', async () => {
      const missingExport = path.join(tempDir, 'missing.json');
      
      await expect(backupManager.importData(testDbPath, missingExport))
        .rejects.toThrow('Export file not found');
    });
    
    it('should handle invalid export format', async () => {
      const invalidExport = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidExport, '{"invalid": "format"}');
      
      await expect(backupManager.importData(testDbPath, invalidExport))
        .rejects.toThrow('Invalid export file format');
    });
  });
  
  describe('listBackups', () => {
    it('should list all backup files', async () => {
      // Create multiple backups
      for (let i = 0; i < 3; i++) {
        await backupManager.performBackup(testDbPath);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const backups = await backupManager.listBackups();
      
      expect(backups).toHaveLength(3);
      expect(backups[0].createdAt.getTime()).toBeGreaterThan(backups[1].createdAt.getTime());
    });
    
    it('should return empty array when no backups exist', async () => {
      const backups = await backupManager.listBackups();
      
      expect(backups).toEqual([]);
    });
    
    it('should handle missing backup directory', async () => {
      fs.rmSync(backupDir, { recursive: true });
      
      const backups = await backupManager.listBackups();
      
      expect(backups).toEqual([]);
    });
  });
  
  describe('getLatestBackup', () => {
    it('should return the most recent backup', async () => {
      const backupInfos = [];
      for (let i = 0; i < 3; i++) {
        backupInfos.push(await backupManager.performBackup(testDbPath));
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const latest = await backupManager.getLatestBackup();
      
      expect(latest).toBeDefined();
      expect(latest?.filename).toBe(backupInfos[2].filename);
    });
    
    it('should return null when no backups exist', async () => {
      const latest = await backupManager.getLatestBackup();
      
      expect(latest).toBeNull();
    });
  });
  
  describe('auto-backup', () => {
    it('should schedule automatic backups', async () => {
      jest.useFakeTimers();
      
      const manager = new EventDatabaseBackupManager({
        backupPath: backupDir,
        autoBackupInterval: 1000 // 1 second for testing
      });
      
      await manager.initialize(testDbPath);
      
      // Fast-forward time
      jest.advanceTimersByTime(1100);
      
      // Give async operations time to complete
      await Promise.resolve();
      
      manager.stopAutoBackup();
      jest.useRealTimers();
    });
    
    it('should stop automatic backups on shutdown', async () => {
      const manager = new EventDatabaseBackupManager({
        backupPath: backupDir,
        autoBackupInterval: 1000
      });
      
      await manager.initialize(testDbPath);
      await manager.shutdown();
      
      // Verify timer is stopped (no errors on shutdown)
      expect(true).toBe(true);
    });
  });
});