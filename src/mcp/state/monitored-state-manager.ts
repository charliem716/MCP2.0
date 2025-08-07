import { SimpleStateManager } from './simple-state-manager.js';
import { SQLiteEventMonitor } from './event-monitor/sqlite-event-monitor.js';
import type { QRWCClientAdapter } from '../qrwc/adapter.js';
import type { CacheConfig } from './repository.js';

export interface EventMonitoringConfig {
  enabled: boolean;
  dbPath?: string;
  retentionDays?: number;
  bufferSize?: number;
  flushInterval?: number;
}

export interface MonitoredStateConfig extends CacheConfig {
  eventMonitoring?: EventMonitoringConfig;
}

export class MonitoredStateManager extends SimpleStateManager {
  private eventMonitor?: SQLiteEventMonitor;
  private qrwcAdapter?: QRWCClientAdapter | undefined;

  /**
   * Initialize with configuration and QRWC adapter
   */
  override async initialize(
    config: CacheConfig,
    qrwcAdapter?: QRWCClientAdapter
  ): Promise<void> {
    // Initialize base state manager
    await super.initialize(config);

    // Store adapter reference
    this.qrwcAdapter = qrwcAdapter;
    
    // Cast config to check for event monitoring
    const monitoredConfig = config as MonitoredStateConfig;

    // Initialize event monitoring if enabled and adapter is available
    if (monitoredConfig.eventMonitoring?.enabled && qrwcAdapter) {
      // Pass the adapter directly for polling-based monitoring
      this.eventMonitor = new SQLiteEventMonitor(
        qrwcAdapter,
        monitoredConfig.eventMonitoring
      );
      await this.eventMonitor.initialize();
    } else if (monitoredConfig.eventMonitoring?.enabled && !qrwcAdapter) {
      // Log warning if monitoring is enabled but no adapter is available
      console.warn('Event monitoring enabled but no QRWC adapter provided');
    }
  }

  /**
   * Get the event monitor instance
   */
  getEventMonitor(): SQLiteEventMonitor | undefined {
    return this.eventMonitor;
  }

  /**
   * Get the QRWC adapter instance
   */
  getQRWCAdapter(): QRWCClientAdapter | undefined {
    return this.qrwcAdapter;
  }

  /**
   * Shutdown - clean up resources including event monitor
   */
  override async shutdown(): Promise<void> {
    if (this.eventMonitor) {
      await this.eventMonitor.close();
    }
    await super.shutdown();
  }

  /**
   * Alias for shutdown to match expected interface
   */
  async close(): Promise<void> {
    await this.shutdown();
  }
}