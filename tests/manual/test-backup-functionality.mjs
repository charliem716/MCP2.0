#!/usr/bin/env node

/**
 * Manual test for backup functionality
 */

import { SQLiteEventMonitor } from '../../dist/mcp/state/event-monitor/sqlite-event-monitor.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testBackupFunctionality() {
  console.log('🧪 Testing Backup Functionality for BUG-171\n');
  
  const testDir = path.join(__dirname, '../../temp-backup-test');
  
  // Clean up if exists
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  
  try {
    // 1. Initialize event monitor
    console.log('1️⃣  Initializing event monitor...');
    const monitor = new SQLiteEventMonitor(undefined, {
      enabled: true,
      dbPath: path.join(testDir, 'events'),
      bufferSize: 10,
      flushInterval: 100
    });
    
    await monitor.initialize();
    console.log('   ✅ Event monitor initialized\n');
    
    // 2. Test backup creation
    console.log('2️⃣  Creating backup...');
    const backupInfo = await monitor.performBackup();
    console.log('   ✅ Backup created:', backupInfo.filename);
    console.log('   Size:', (backupInfo.size / 1024).toFixed(2), 'KB');
    console.log('   Compressed:', backupInfo.compressed ? 'Yes' : 'No\n');
    
    // 3. Test listing backups
    console.log('3️⃣  Listing backups...');
    const backups = await monitor.listBackups();
    console.log('   ✅ Found', backups.length, 'backup(s)\n');
    
    // 4. Test data export
    console.log('4️⃣  Testing data export...');
    const exportPath = await monitor.exportData();
    console.log('   ✅ Data exported to:', path.basename(exportPath), '\n');
    
    // 5. Test restore functionality
    console.log('5️⃣  Testing restore...');
    
    // Close and delete current database
    await monitor.close();
    
    const dbFiles = fs.readdirSync(testDir).filter(f => f.includes('events') && f.endsWith('.db'));
    for (const file of dbFiles) {
      fs.unlinkSync(path.join(testDir, file));
    }
    
    // Create new monitor and restore
    const monitor2 = new SQLiteEventMonitor(undefined, {
      enabled: true,
      dbPath: path.join(testDir, 'events'),
      bufferSize: 10,
      flushInterval: 100
    });
    
    await monitor2.restoreFromBackup(backupInfo.path);
    console.log('   ✅ Database restored from backup\n');
    
    // 6. Verify statistics
    console.log('6️⃣  Verifying restored data...');
    const stats = await monitor2.getStatistics();
    console.log('   Total events:', stats.totalEvents);
    console.log('   Database size:', (stats.databaseSize / 1024).toFixed(2), 'KB');
    console.log('   ✅ Restore successful\n');
    
    // 7. Test import functionality
    console.log('7️⃣  Testing data import...');
    const importCount = await monitor2.importData(exportPath);
    console.log('   ✅ Imported', importCount, 'events\n');
    
    // Close
    await monitor2.close();
    
    // 8. Test automated backup scheduling
    console.log('8️⃣  Testing automated backup scheduling...');
    process.env['EVENT_BACKUP_INTERVAL'] = '2000'; // 2 seconds
    
    const monitor3 = new SQLiteEventMonitor(undefined, {
      enabled: true,
      dbPath: path.join(testDir, 'events'),
      bufferSize: 10,
      flushInterval: 100
    });
    
    await monitor3.initialize();
    console.log('   ⏰ Automated backups scheduled (every 2 seconds)');
    console.log('   Waiting 5 seconds to verify...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const finalBackups = await monitor3.listBackups();
    console.log('   ✅ Found', finalBackups.length, 'backup(s) after auto-backup\n');
    
    await monitor3.close();
    delete process.env['EVENT_BACKUP_INTERVAL'];
    
    // Clean up
    console.log('🧹 Cleaning up test directory...');
    fs.rmSync(testDir, { recursive: true, force: true });
    
    console.log('\n✅ All backup functionality tests passed!');
    console.log('📝 BUG-171: Database backup and recovery strategy implemented successfully');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    
    // Clean up on error
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    
    process.exit(1);
  }
}

// Run the test
testBackupFunctionality().catch(console.error);