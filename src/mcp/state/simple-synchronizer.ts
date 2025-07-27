/**
 * Simple State Synchronizer
 *
 * Provides basic synchronization between cache and Q-SYS Core
 * without unnecessary complexity.
 */
import { globalLogger as logger } from '../../shared/utils/logger.js';
import type { IStateRepository, ControlState } from './repository.js';
import type { QRWCClientInterface } from '../qrwc/adapter.js';
import type { SyncSourceResult, SyncDetail } from './synchronizer/types.js';
import { 
  isQSysApiResponse,
  type QSysApiResponse,
  type QSysComponentGetResponse,
  type QSysComponentControlsResponse,
  type QSysComponentInfo
} from '../types/qsys-api-responses.js';

export class SimpleSynchronizer {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private repository: IStateRepository,
    private qrwcAdapter: QRWCClientInterface,
    private intervalMs = 5000
  ) {}

  /**
   * Start synchronization
   */
  start(): void {
    if (this.interval) {
      return; // Already running
    }

    this.interval = setInterval(() => {
      this.sync().catch((error: unknown) => {
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
  // eslint-disable-next-line max-statements -- Full state synchronization with Q-SYS Core
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
      // Get components from Q-SYS using sendCommand
      const componentsResponse = await this.qrwcAdapter.sendCommand(
        'Component.GetComponents'
      );
      
      // Type guard and extract components array
      if (!isQSysApiResponse<QSysComponentInfo[]>(componentsResponse)) {
        logger.warn('Invalid components response format');
        return { updates, conflicts: [] };
      }
      
      if (componentsResponse.error) {
        logger.error('Failed to get components', { error: componentsResponse.error });
        return { updates, conflicts: [] };
      }
      
      const components = componentsResponse.result ?? [];

      // Get all controls from components
      for (const component of components) {
        const controlsResponse = await this.qrwcAdapter.sendCommand(
          'Component.GetControls',
          {
            Name: component.Name,
          }
        );
        
        // Type guard for controls response
        if (!isQSysApiResponse<QSysComponentControlsResponse>(controlsResponse)) {
          logger.warn('Invalid controls response format', { component: component.Name });
          continue;
        }
        
        if (controlsResponse.error) {
          logger.error('Failed to get controls', { 
            component: component.Name, 
            error: controlsResponse.error 
          });
          continue;
        }
        
        const controlsData = controlsResponse.result;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime safety check
        if (!controlsData.Controls) {
          continue;
        }

        for (const control of controlsData.Controls) {
          const controlName = `${component.Name}.${control.Name}`;
          updates.set(controlName, {
            name: controlName,
            value: control.Value,
            timestamp: new Date(),
            source: 'qsys',
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
        // Convert to Map<string, ControlState> for setStates
        await this.repository.setStates(result.updates);
      }
    } catch (error) {
      logger.error('Sync failed', { error });
      // Don't throw - just log and continue
    }
  }
}
