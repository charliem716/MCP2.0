/**
 * SDK Event Bridge
 * 
 * Bridges QRWC SDK control events to our event monitoring system.
 * Instead of simulating change groups, we listen directly to SDK control events.
 */

import { EventEmitter } from 'events';
import type { OfficialQRWCClient } from '../../../qrwc/officialClient.js';
import { globalLogger as logger } from '../../../shared/utils/logger.js';

export interface SDKControlEvent {
  groupId: string;
  controlPath: string;
  componentName: string;
  controlName: string;
  value: number;
  stringValue: string;
  timestamp: number;
  source: 'sdk-control-event';
}

export interface ChangeGroupConfig {
  id: string;
  controls: string[];  // Full paths like "TableMicMeter.meter.1"
  rate: number;        // Polling rate in seconds
  active: boolean;
}

export class SDKEventBridge extends EventEmitter {
  private controlListeners = new Map<string, (state: any) => void>();
  private changeGroups = new Map<string, ChangeGroupConfig>();
  private client: OfficialQRWCClient;
  
  constructor(client: OfficialQRWCClient) {
    super();
    this.client = client;
  }
  
  /**
   * Register a change group and start listening to its controls
   */
  registerChangeGroup(groupId: string, controls: string[], rate: number): void {
    logger.info('Registering SDK event listeners for change group', { 
      groupId, 
      controlCount: controls.length,
      rate: `${(1/rate).toFixed(1)}Hz`
    });
    
    // Store change group config
    this.changeGroups.set(groupId, {
      id: groupId,
      controls,
      rate,
      active: true
    });
    
    const qrwc = this.client.getQrwc();
    if (!qrwc) {
      logger.error('QRWC instance not available');
      return;
    }
    
    // Register listeners for each control
    for (const controlPath of controls) {
      const [componentName, controlName] = controlPath?.split('.') || [];
      
      if (!componentName || !controlName) {
        logger.warn('Invalid control path', { controlPath });
        continue;
      }
      
      // Get the control from SDK
      const component = qrwc.components[componentName];
      if (!component) {
        logger.warn('Component not found in SDK', { componentName });
        continue;
      }
      
      const control = component.controls[controlName];
      if (!control) {
        logger.warn('Control not found in SDK', { componentName, controlName });
        continue;
      }
      
      // Create unique listener for this control in this group
      const listenerKey = `${groupId}:${controlPath}`;
      
      // Remove existing listener if any
      if (this.controlListeners.has(listenerKey)) {
        const oldListener = this.controlListeners.get(listenerKey)!;
        control.removeListener('update', oldListener);
      }
      
      // Create new listener
      const listener = (state: any) => {
        // Emit event for recording
        const event: SDKControlEvent = {
          groupId,
          controlPath,
          componentName,
          controlName,
          value: state.Value,
          stringValue: state.String || String(state.Value),
          timestamp: Date.now(),
          source: 'sdk-control-event'
        };
        
        this.emit('control:update', event);
      };
      
      // Attach listener to SDK control
      control.on('update', listener);
      this.controlListeners.set(listenerKey, listener);
      
      // Also emit initial value immediately
      const initialEvent: SDKControlEvent = {
        groupId,
        controlPath,
        componentName,
        controlName,
        value: control.state.Value ?? 0,
        stringValue: control.state.String || String(control.state.Value),
        timestamp: Date.now(),
        source: 'sdk-control-event'
      };
      
      this.emit('control:update', initialEvent);
      
      logger.debug('SDK listener registered', { 
        groupId, 
        controlPath,
        currentValue: control.state.Value 
      });
    }
    
    // Emit event that group is now active
    this.emit('changeGroup:activated', groupId);
  }
  
  /**
   * Unregister a change group and remove its listeners
   */
  unregisterChangeGroup(groupId: string): void {
    const group = this.changeGroups.get(groupId);
    if (!group) {
      logger.warn('Change group not found', { groupId });
      return;
    }
    
    logger.info('Unregistering SDK event listeners for change group', { groupId });
    
    const qrwc = this.client.getQrwc();
    if (!qrwc) {
      return;
    }
    
    // Remove all listeners for this group
    for (const controlPath of group.controls) {
      const [componentName, controlName] = controlPath?.split('.') || [];
      
      if (!componentName || !controlName) continue;
      
      const component = qrwc.components[componentName];
      if (!component) continue;
      
      const control = component.controls[controlName];
      if (!control) continue;
      
      const listenerKey = `${groupId}:${controlPath}`;
      const listener = this.controlListeners.get(listenerKey);
      
      if (listener) {
        control.removeListener('update', listener);
        this.controlListeners.delete(listenerKey);
        logger.debug('SDK listener removed', { groupId, controlPath });
      }
    }
    
    // Mark group as inactive
    group.active = false;
    
    // Emit event that group is now inactive
    this.emit('changeGroup:deactivated', groupId);
  }
  
  /**
   * Get all active change groups
   */
  getActiveGroups(): Map<string, ChangeGroupConfig> {
    const active = new Map<string, ChangeGroupConfig>();
    for (const [id, config] of this.changeGroups) {
      if (config.active) {
        active.set(id, config);
      }
    }
    return active;
  }
  
  /**
   * Clean up all listeners
   */
  cleanup(): void {
    logger.info('Cleaning up SDK event bridge');
    
    // Remove all control listeners
    const qrwc = this.client.getQrwc();
    if (qrwc) {
      for (const [listenerKey, listener] of this.controlListeners) {
        const [, controlPath] = listenerKey.split(':');
        const [componentName, controlName] = controlPath?.split('.') || [];
        
        if (!componentName || !controlName) continue;
        
        const component = qrwc.components[componentName];
        if (!component) continue;
        
        const control = component.controls[controlName];
        if (!control) continue;
        
        control.removeListener('update', listener);
      }
    }
    
    this.controlListeners.clear();
    this.changeGroups.clear();
    this.removeAllListeners();
  }
}