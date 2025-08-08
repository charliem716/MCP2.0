#!/usr/bin/env node

/**
 * Event Database Backup CLI
 * 
 * Command-line utility for managing event database backups
 */

import { Command } from 'commander';
import { SQLiteEventMonitor } from '../mcp/state/event-monitor/sqlite-event-monitor.js';
import { globalLogger as logger } from '../shared/utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('event-backup')
  .description('Event database backup and restore utility')
  .version('1.0.0');

program
  .command('backup')
  .description('Create a backup of the event database')
  .option('-d, --db <path>', 'Database path', './data/events')
  .action(async (options) => {
    try {
      const monitor = new SQLiteEventMonitor();
      await monitor.initialize();
      
      const backupInfo = await monitor.performBackup();
      console.log('✅ Backup created successfully');
      console.log(`   File: ${backupInfo.filename}`);
      console.log(`   Size: ${(backupInfo.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Events: ${backupInfo.eventsCount ?? 'unknown'}`);
      console.log(`   Compressed: ${backupInfo.compressed ? 'Yes' : 'No'}`);
      
      await monitor.close();
      process.exit(0);
    } catch (error) {
      console.error('❌ Backup failed:', error);
      process.exit(1);
    }
  });

program
  .command('restore <backup-file>')
  .description('Restore database from a backup file')
  .option('-t, --target <path>', 'Target database path', './data/events')
  .option('-f, --force', 'Force restore without confirmation')
  .action(async (backupFile, options) => {
    try {
      if (!fs.existsSync(backupFile)) {
        throw new Error(`Backup file not found: ${backupFile}`);
      }
      
      // Check if target exists and warn
      const targetPath = options.target;
      if (fs.existsSync(targetPath) && !options.force) {
        console.warn(`⚠️  Target database exists: ${targetPath}`);
        console.warn('   Use --force to overwrite');
        process.exit(1);
      }
      
      const monitor = new SQLiteEventMonitor();
      await monitor.restoreFromBackup(backupFile);
      
      console.log('✅ Database restored successfully');
      console.log(`   From: ${backupFile}`);
      console.log(`   To: ${targetPath}`);
      
      await monitor.close();
      process.exit(0);
    } catch (error) {
      console.error('❌ Restore failed:', error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List available backups')
  .action(async () => {
    try {
      const monitor = new SQLiteEventMonitor();
      const backups = await monitor.listBackups();
      
      if (backups.length === 0) {
        console.log('No backups found');
        process.exit(0);
      }
      
      console.log('Available backups:');
      console.log('==================');
      
      for (const backup of backups) {
        const sizeMB = (backup.size / 1024 / 1024).toFixed(2);
        const date = backup.createdAt.toISOString().split('T')[0];
        const timePart = backup.createdAt.toISOString().split('T')[1];
        const time = timePart ? timePart.split('.')[0] : '';
        
        console.log(`\n📦 ${backup.filename}`);
        console.log(`   Date: ${date} ${time}`);
        console.log(`   Size: ${sizeMB} MB`);
        console.log(`   Compressed: ${backup.compressed ? 'Yes' : 'No'}`);
      }
      
      process.exit(0);
    } catch (error) {
      console.error('❌ Failed to list backups:', error);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export event data to JSON')
  .option('-s, --start <timestamp>', 'Start timestamp (Unix ms)', parseInt)
  .option('-e, --end <timestamp>', 'End timestamp (Unix ms)', parseInt)
  .option('-d, --days <days>', 'Export last N days', parseInt)
  .action(async (options) => {
    try {
      const monitor = new SQLiteEventMonitor();
      await monitor.initialize();
      
      let startTime = options.start;
      let endTime = options.end;
      
      // If days specified, calculate time range
      if (options.days) {
        endTime = Date.now();
        startTime = endTime - (options.days * 24 * 60 * 60 * 1000);
      }
      
      const exportPath = await monitor.exportData(startTime, endTime);
      
      console.log('✅ Data exported successfully');
      console.log(`   File: ${exportPath}`);
      
      if (startTime || endTime) {
        console.log(`   Time range:`);
        if (startTime) console.log(`     From: ${new Date(startTime).toISOString()}`);
        if (endTime) console.log(`     To: ${new Date(endTime).toISOString()}`);
      }
      
      await monitor.close();
      process.exit(0);
    } catch (error) {
      console.error('❌ Export failed:', error);
      process.exit(1);
    }
  });

program
  .command('import <export-file>')
  .description('Import event data from JSON export')
  .action(async (exportFile) => {
    try {
      if (!fs.existsSync(exportFile)) {
        throw new Error(`Export file not found: ${exportFile}`);
      }
      
      const monitor = new SQLiteEventMonitor();
      await monitor.initialize();
      
      const count = await monitor.importData(exportFile);
      
      console.log('✅ Data imported successfully');
      console.log(`   File: ${exportFile}`);
      console.log(`   Events imported: ${count}`);
      
      await monitor.close();
      process.exit(0);
    } catch (error) {
      console.error('❌ Import failed:', error);
      process.exit(1);
    }
  });

program
  .command('verify <database-file>')
  .description('Verify database integrity')
  .action(async (databaseFile) => {
    try {
      if (!fs.existsSync(databaseFile)) {
        throw new Error(`Database file not found: ${databaseFile}`);
      }
      
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(databaseFile, { readonly: true });
      
      const integrityCheck = db.prepare('PRAGMA integrity_check').get() as any;
      const stats = db.prepare('SELECT COUNT(*) as count FROM events').get() as any;
      
      db.close();
      
      if (integrityCheck.integrity_check === 'ok') {
        console.log('✅ Database integrity check passed');
        console.log(`   Events: ${stats.count}`);
        process.exit(0);
      } else {
        console.error('❌ Database integrity check failed');
        console.error(`   Result: ${integrityCheck.integrity_check}`);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Verification failed:', error);
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}