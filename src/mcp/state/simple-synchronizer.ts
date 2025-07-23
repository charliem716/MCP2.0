/**
 * Simple State Synchronizer
 * 
 * Provides basic synchronization between cache and Q-SYS Core
 * without unnecessary complexity.
 */
import { globalLogger as logger } from "../../shared/utils/logger.js";
import type { IStateRepository, ControlState } from "./repository.js";
import type { QRWCClientInterface } from "../qrwc/adapter.js";
import type { SyncSourceResult, SyncDetail } from "./synchronizer/types.js";

export class SimpleSynchronizer {
  private interval: NodeJS.Timeout | null = null;
  
  constructor(
    private repository: IStateRepository,
    private qrwcAdapter: QRWCClientInterface,
    private intervalMs: number = 5000
  ) {}
  
  /**
   * Start synchronization
   */
  start(): void {
    if (this.interval) {
      return; // Already running
    }
    
    this.interval = setInterval(() => {
      this.sync().catch(error => {
        logger.error('Sync failed', { error });
      });
    }, this.intervalMs);
    
    logger.info('Synchronizer started', { intervalMs: this.intervalMs });
  }
  
  /**
   * Stop synchronization
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Synchronizer stopped');
    }
  }
  
  /**
   * Perform synchronization (for compatibility with existing interface)
   */
  async synchronize(
    cacheStates?: Map<string, ControlState>,
    source: 'qsys' | 'persistence' = 'qsys'
  ): Promise<SyncSourceResult> {
    if (source !== 'qsys') {
      // We only support Q-SYS sync in the simple implementation
      return { updates: new Map(), conflicts: [] };
    }
    
    const updates = new Map<string, ControlState>();
    
    try {
      // Get components from Q-SYS
      const components = await this.qrwcAdapter.getComponents();
      
      // Get all controls from components
      for (const component of components) {
        const controls = await this.qrwcAdapter.getComponentControls(component.name);
        
        for (const control of controls) {
          const controlName = `${component.name}.${control.name}`;
          updates.set(controlName, {
            name: controlName,
            value: control.value,
            timestamp: new Date(),
            source: 'qsys'
          });
        }
      }
      
      logger.debug('Sync completed', { controlCount: updates.size });
      
    } catch (error) {
      logger.error('Sync failed', { error });
    }
    
    return { updates, conflicts: [] };
  }
  
  /**
   * Shutdown synchronizer
   */
  shutdown(): void {
    this.stop();
  }
  
  /**
   * Perform synchronization
   */
  private async sync(): Promise<void> {
    try {
      const result = await this.synchronize();
      
      if (result.updates.size > 0) {
        const updates = Array.from(result.updates.values());
        await this.repository.batchSet(updates);
      }
      
    } catch (error) {
      logger.error('Sync failed', { error });
      // Don't throw - just log and continue
    }
  }
}