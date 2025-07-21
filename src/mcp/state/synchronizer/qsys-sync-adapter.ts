import { globalLogger as logger } from "../../../shared/utils/logger.js";
import type { ControlState } from "../repository.js";
import type { QRWCClientInterface } from "../../qrwc/adapter.js";

/**
 * Q-SYS Sync Adapter
 * 
 * Handles Q-SYS specific sync operations
 */
export class QSysSyncAdapter {
  constructor(private qrwcClient: QRWCClientInterface) {}

  /**
   * Get all controls from Q-SYS Core
   */
  async getQSysControls(): Promise<Map<string, ControlState>> {
    const result = new Map<string, ControlState>();
    
    try {
      const components = await this.qrwcClient.sendCommand('Component.GetComponents') as {
        result?: Array<{ Name: string; Type?: string }>
      };
      
      if (!components?.result || !Array.isArray(components.result)) {
        logger.warn('No components returned from Q-SYS');
        return result;
      }
      
      // Get controls for each component
      for (const comp of components.result) {
        const controls = await this.getComponentControls(comp.Name);
        controls.forEach((state, name) => result.set(name, state));
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to get Q-SYS controls', { error });
      return result;
    }
  }

  /**
   * Get specific controls from Q-SYS Core by names
   */
  async getQSysControlsByNames(names: string[]): Promise<Map<string, ControlState>> {
    const result = new Map<string, ControlState>();
    
    try {
      const response = await this.qrwcClient.sendCommand('Control.GetValues', {
        Names: names
      }) as {
        controls?: Array<{ Name: string; Value: unknown }>
      };
      
      if (response?.controls && Array.isArray(response.controls)) {
        for (const ctrl of response.controls) {
          if (ctrl.Name && ctrl.Value !== undefined) {
            const value = ctrl.Value;
            // Validate that the value is of the expected type
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
              result.set(ctrl.Name, {
                name: ctrl.Name,
                value: value,
                timestamp: new Date(),
                source: 'qsys'
              });
            }
          }
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to get Q-SYS controls by names', { error });
      return result;
    }
  }

  /**
   * Get controls for a specific component
   */
  private async getComponentControls(componentName: string): Promise<Map<string, ControlState>> {
    const result = new Map<string, ControlState>();
    
    try {
      const response = await this.qrwcClient.sendCommand('Component.GetControls', {
        Name: componentName
      }) as {
        result?: Array<{ Name: string; Value: unknown }>
      };
      
      if (response?.result && Array.isArray(response.result)) {
        for (const ctrl of response.result) {
          const controlName = `${componentName}.${ctrl.Name}`;
          const value = ctrl.Value;
          // Validate that the value is of the expected type
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            result.set(controlName, {
              name: controlName,
              value: value,
              timestamp: new Date(),
              source: 'qsys'
            });
          }
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to get component controls', { componentName, error });
      return result;
    }
  }
}