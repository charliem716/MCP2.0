#!/usr/bin/env node

/**
 * Event Database Backup CLI
 * 
 * Command-line utility for managing event database backups
 */

import { Command } from 'commander';
import { SQLiteEventMonitor } from '../mcp/state/event-monitor/sqlite-event-monitor.js';
import { globalLogger as logger } from '../shared/utils/logger.js';
import { cliOutput } from './output.js';
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
      cliOutput.printSuccess('Backup created successfully');
      cliOutput.printItem('File', backupInfo.filename);
      cliOutput.printItem('Size', `${(backupInfo.size / 1024 / 1024).toFixed(2)} MB`);
      cliOutput.printItem('Events', backupInfo.eventsCount ?? 'unknown');
      cliOutput.printItem('Compressed', backupInfo.compressed ? 'Yes' : 'No');
      
      // Also log for debugging/monitoring
      logger.info('Backup completed', { 
        filename: backupInfo.filename, 
        size: backupInfo.size,
        eventsCount: backupInfo.eventsCount,
        compressed: backupInfo.compressed
      });
      
      await monitor.close();
      process.exit(0);
    } catch (error) {
      cliOutput.printFailure(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error('Backup failed', { error });
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
        cliOutput.printWarning(`Target database exists: ${targetPath}`);
        cliOutput.printItem('Use --force to overwrite');
        logger.warn('Restore blocked - target exists', { targetPath });
        process.exit(1);
      }
      
      const monitor = new SQLiteEventMonitor();
      await monitor.restoreFromBackup(backupFile);
      
      cliOutput.printSuccess('Database restored successfully');
      cliOutput.printItem('From', backupFile);
      cliOutput.printItem('To', targetPath);
      
      logger.info('Database restored', { backupFile, targetPath });
      
      await monitor.close();
      process.exit(0);
    } catch (error) {
      cliOutput.printFailure(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error('Restore failed', { error });
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
        cliOutput.print('No backups found');
        process.exit(0);
      }
      
      cliOutput.printHeader('Available backups');
      
      for (const backup of backups) {
        const sizeMB = (backup.size / 1024 / 1024).toFixed(2);
        const date = backup.createdAt.toISOString().split('T')[0];
        const timePart = backup.createdAt.toISOString().split('T')[1];
        const time = timePart ? timePart.split('.')[0] : '';
        
        cliOutput.print(`\n📦 ${backup.filename}`);
        cliOutput.printItem('Date', `${date} ${time}`);
        cliOutput.printItem('Size', `${sizeMB} MB`);
        cliOutput.printItem('Compressed', backup.compressed ? 'Yes' : 'No');
      }
      
      logger.info('Listed backups', { count: backups.length });
      
      process.exit(0);
    } catch (error) {
      cliOutput.printFailure(`Failed to list backups: ${error instanceof Error ? error.message : String(error)}`);
      logger.error('Failed to list backups', { error });
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
      
      cliOutput.printSuccess('Data exported successfully');
      cliOutput.printItem('File', exportPath);
      
      if (startTime || endTime) {
        cliOutput.printItem('Time range', '');
        if (startTime) cliOutput.print(`     From: ${new Date(startTime).toISOString()}`);
        if (endTime) cliOutput.print(`     To: ${new Date(endTime).toISOString()}`);
      }
      
      logger.info('Data exported', { exportPath, startTime, endTime });
      
      await monitor.close();
      process.exit(0);
    } catch (error) {
      cliOutput.printFailure(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error('Export failed', { error });
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
      
      cliOutput.printSuccess('Data imported successfully');
      cliOutput.printItem('File', exportFile);
      cliOutput.printItem('Events imported', count);
      
      logger.info('Data imported', { exportFile, count });
      
      await monitor.close();
      process.exit(0);
    } catch (error) {
      cliOutput.printFailure(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error('Import failed', { error });
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
        cliOutput.printSuccess('Database integrity check passed');
        cliOutput.printItem('Events', stats.count);
        logger.info('Database verification passed', { eventsCount: stats.count });
        process.exit(0);
      } else {
        cliOutput.printFailure('Database integrity check failed');
        cliOutput.printItem('Result', integrityCheck.integrity_check);
        logger.error('Database verification failed', { result: integrityCheck.integrity_check });
        process.exit(1);
      }
    } catch (error) {
      cliOutput.printFailure(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
      logger.error('Verification failed', { error });
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}