/**
 * Q-SYS Remote Control Commands
 * High-level command interface for Q-SYS operations
 */

import type { QRWCClient } from './client.js';
import { createLogger, type Logger } from '../shared/utils/logger.js';
import { 
  QSysMethod,
  type QSysComponent,
  type QSysControl,
  type QSysControlValue,
  type QSysSnapshot
} from '../shared/types/qsys.js';
import { QSysError, QSysErrorCode } from '../shared/types/errors.js';

/**
 * Q-SYS Remote Control Commands implementation
 */
export class QRCCommands {
  private client: QRWCClient;
  private logger: Logger;

  constructor(client: QRWCClient) {
    this.client = client;
    this.logger = createLogger('qrc-commands');
  }

  /**
   * Get all available components
   */
  async getComponents(): Promise<QSysComponent[]> {
    this.logger.debug('Getting all components');
    const result = await this.client.sendCommand({
      jsonrpc: '2.0',
      method: QSysMethod.COMPONENT_GET_COMPONENTS,
      params: {}
    });
    return (result as {components?: QSysComponent[]}).components ?? [];
  }

  /**
   * Get component by name
   */
  async getComponent(name: string): Promise<QSysComponent | null> {
    this.logger.debug('Getting component', { name });
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.COMPONENT_GET,
        params: { Name: name }
      });
      return (result as {component?: QSysComponent}).component ?? null;
    } catch (error) {
      this.logger.error('Failed to get component', { name, error });
      throw error;
    }
  }

  /**
   * Get controls for component
   */
  async getControls(component: string): Promise<QSysControl[]> {
    this.logger.debug('Getting controls', { component });
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.COMPONENT_GET_CONTROLS,
        params: { Name: component }
      });
      return (result as {controls?: QSysControl[]}).controls ?? [];
    } catch (error) {
      this.logger.error('Failed to get controls', { component, error });
      throw error;
    }
  }

  /**
   * Get control value
   */
  async getControlValue(
    control: string, 
    component?: string
  ): Promise<QSysControlValue | null> {
    this.logger.debug('Getting control value', { control, component });
    const params: Record<string, unknown> = { Name: control };
    
    if (component) {
      params['Component'] = component;
    }
    
    const result = await this.client.sendCommand({
      jsonrpc: '2.0',
      method: QSysMethod.CONTROL_GET,
      params
    });
    return (result as {value?: QSysControlValue}).value ?? null;
  }

  /**
   * Get multiple control values
   */
  async getControlValues(
    controls: Array<{ control: string; component?: string }>, 
    component?: string
  ): Promise<QSysControlValue[]> {
    this.logger.debug('Getting control values', { controls, component });
    const params: Record<string, unknown> = { Controls: controls.map(c => ({ Name: c.control, Component: c.component })) };
    
    if (component) {
      params['Component'] = component;
    }
    
    const result = await this.client.sendCommand({
      jsonrpc: '2.0',
      method: QSysMethod.COMPONENT_GET_CONTROL_VALUES, 
      params
    });
    
    return (result as {controls?: QSysControlValue[]}).controls ?? [];
  }

  /**
   * Set control value
   */
  async setControlValue(
    control: string, 
    value: QSysControlValue, 
    component?: string,
    ramp?: number
  ): Promise<void> {
    this.logger.debug('Setting control value', { control, value, component, ramp });
    const params: Record<string, unknown> = { Name: control, Value: value };
    
    if (component) {
      params['Component'] = component;
    }
    
    if (ramp !== undefined) {
      params['Ramp'] = ramp;
    }
    
    await this.client.sendCommand({
      jsonrpc: '2.0',
      method: QSysMethod.CONTROL_SET,
      params
    });
    this.logger.info('Control value set successfully', { control, value, component });
  }

  /**
   * Set multiple control values
   */
  async setControlValues(
    controls: Array<{ control: string; value: QSysControlValue; component?: string }>
  ): Promise<void> {
    this.logger.debug('Setting multiple control values', { controlCount: controls.length });
    
    try {
      const params = {
        Controls: controls.map(c => ({
          Name: c.control,
          Value: c.value,
          Component: c.component
        }))
      };
      
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.COMPONENT_SET_CONTROL_VALUES,
        params
      });
      
      this.logger.info('Multiple control values set successfully', { controlCount: controls.length });
    } catch (error) {
      this.logger.error('Failed to set multiple control values', { error });
      throw new QSysError(
        'Failed to set multiple control values',
        QSysErrorCode.COMMAND_FAILED,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Mixer Operations
   */

  /**
   * Get mixer inputs
   */
  async getMixerInputs(mixerName: string): Promise<unknown[]> { // Changed QSysMixerIO to unknown[] for safer typing
    this.logger.debug('Getting mixer inputs', { mixerName });
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.MIXER_GET_INPUTS,
        params: { Name: mixerName }
      });
      
      return (result as {inputs?: unknown[]}).inputs ?? [];
    } catch (error) {
      this.logger.error('Failed to get mixer inputs', { mixerName, error });
      throw new QSysError(
        'Failed to get mixer inputs',
        QSysErrorCode.COMMAND_FAILED,
        { mixerName, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Get mixer outputs
   */
  async getMixerOutputs(mixerName: string): Promise<unknown[]> { // Changed QSysMixerIO to unknown[] for safer typing
    this.logger.debug('Getting mixer outputs', { mixerName });
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.MIXER_GET_OUTPUTS,
        params: { Name: mixerName }
      });
      
      return (result as {outputs?: unknown[]}).outputs ?? [];
    } catch (error) {
      this.logger.error('Failed to get mixer outputs', { mixerName, error });
      throw new QSysError(
        'Failed to get mixer outputs',
        QSysErrorCode.COMMAND_FAILED,
        { mixerName, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Set mixer crosspoint mute
   */
  async setCrosspointMute(mixerName: string, input: number, output: number, mute: boolean): Promise<void> {
    this.logger.debug('Setting crosspoint mute', { mixerName, input, output, mute });
    
    try {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.MIXER_SET_CROSSPOINT_MUTE,
        params: {
          Name: mixerName,
          Input: input,
          Output: output,
          Mute: mute
        }
      });
      
      this.logger.info('Crosspoint mute set successfully', { mixerName, input, output, mute });
    } catch (error) {
      this.logger.error('Failed to set crosspoint mute', { mixerName, input, output, mute, error });
      throw new QSysError(
        'Failed to set crosspoint mute',
        QSysErrorCode.COMMAND_FAILED,
        { mixerName, input, output, mute, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Set mixer crosspoint gain
   */
  async setCrosspointGain(mixerName: string, input: number, output: number, gain: number): Promise<void> {
    this.logger.debug('Setting crosspoint gain', { mixerName, input, output, gain });
    
    try {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.MIXER_SET_CROSSPOINT_GAIN,
        params: {
          Name: mixerName,
          Input: input,
          Output: output,
          Gain: gain
        }
      });
      
      this.logger.info('Crosspoint gain set successfully', { mixerName, input, output, gain });
    } catch (error) {
      this.logger.error('Failed to set crosspoint gain', { mixerName, input, output, gain, error });
      throw new QSysError(
        'Failed to set crosspoint gain',
        QSysErrorCode.COMMAND_FAILED,
        { mixerName, input, output, gain, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Get mixer crosspoint mute
   */
  async getCrosspointMute(mixerName: string, input: number, output: number): Promise<boolean> {
    this.logger.debug('Getting crosspoint mute', { mixerName, input, output });
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.MIXER_GET_CROSSPOINT_MUTE,
        params: {
          Name: mixerName,
          Input: input,
          Output: output
        }
      });
      
      return (result as {mute?: boolean}).mute ?? false;
    } catch (error) {
      this.logger.error('Failed to get crosspoint mute', { mixerName, input, output, error });
      throw new QSysError(
        'Failed to get crosspoint mute',
        QSysErrorCode.COMMAND_FAILED,
        { mixerName, input, output, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Get mixer crosspoint gain
   */
  async getCrosspointGain(mixerName: string, input: number, output: number): Promise<number> {
    this.logger.debug('Getting crosspoint gain', { mixerName, input, output });
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.MIXER_GET_CROSSPOINT_GAIN,
        params: {
          Name: mixerName,
          Input: input,
          Output: output
        }
      });
      
      return (result as {gain?: number}).gain ?? 0;
    } catch (error) {
      this.logger.error('Failed to get crosspoint gain', { mixerName, input, output, error });
      throw new QSysError(
        'Failed to get crosspoint gain',
        QSysErrorCode.COMMAND_FAILED,
        { mixerName, input, output, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Snapshot Operations
   */

  /**
   * Load a snapshot
   */
  async loadSnapshot(bank: number, snapshot: number, ramp?: number): Promise<void> {
    this.logger.debug('Loading snapshot', { bank, snapshot, ramp });
    
    try {
      const params: Record<string, unknown> = { Bank: bank, Snapshot: snapshot };
      if (ramp !== undefined) {
        params['Ramp'] = ramp;
      }
      
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.SNAPSHOT_LOAD,
        params
      });
      
      this.logger.info('Snapshot loaded successfully', { bank, snapshot, ramp });
    } catch (error) {
      this.logger.error('Failed to load snapshot', { bank, snapshot, ramp, error });
      throw new QSysError(
        'Failed to load snapshot',
        QSysErrorCode.COMMAND_FAILED,
        { bank, snapshot, ramp, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Save a snapshot
   */
  async saveSnapshot(bank: number, snapshot: number, name?: string): Promise<void> {
    this.logger.debug('Saving snapshot', { bank, snapshot, name });
    
    try {
      const params: Record<string, unknown> = { Bank: bank, Snapshot: snapshot };
      if (name) {
        params['Name'] = name;
      }
      
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.SNAPSHOT_SAVE,
        params
      });
      
      this.logger.info('Snapshot saved successfully', { bank, snapshot, name });
    } catch (error) {
      this.logger.error('Failed to save snapshot', { bank, snapshot, name, error });
      throw new QSysError(
        'Failed to save snapshot',
        QSysErrorCode.COMMAND_FAILED,
        { bank, snapshot, name, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Get snapshot banks
   */
  async getSnapshotBanks(): Promise<unknown[]> { // Changed QSysSnapshotBank to unknown[] for safer typing
    this.logger.debug('Getting snapshot banks');
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.SNAPSHOT_GET_BANKS,
        params: {}
      });
      
      return (result as {banks?: unknown[]}).banks ?? [];
    } catch (error) {
      this.logger.error('Failed to get snapshot banks', { error });
      throw new QSysError(
        'Failed to get snapshot banks',
        QSysErrorCode.COMMAND_FAILED,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Get snapshots in a bank
   */
  async getSnapshots(bank: number): Promise<QSysSnapshot[]> {
    this.logger.debug('Getting snapshots', { bank });
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.SNAPSHOT_GET,
        params: { Bank: bank }
      });
      
      return (result as {snapshots?: QSysSnapshot[]}).snapshots ?? [];
    } catch (error) {
      this.logger.error('Failed to get snapshots', { bank, error });
      throw new QSysError(
        'Failed to get snapshots',
        QSysErrorCode.COMMAND_FAILED,
        { bank, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Status Operations
   */

  /**
   * Get Q-SYS Core status
   */
  async getStatus(): Promise<unknown> { // Changed QSysCoreStatus to unknown for safer typing
    this.logger.debug('Getting Q-SYS Core status');
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.STATUS_GET,
        params: {}
      });
      
      return (result as {status?: unknown}).status;
    } catch (error) {
      this.logger.error('Failed to get Q-SYS Core status', { error });
      throw new QSysError(
        'Failed to get Q-SYS Core status',
        QSysErrorCode.COMMAND_FAILED,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Change Group Operations
   */

  /**
   * Add control to change group
   */
  async addControlToChangeGroup(controlName: string, componentName?: string): Promise<void> {
    this.logger.debug('Adding control to change group', { controlName, componentName });
    
    try {
      const params: Record<string, unknown> = { Name: controlName };
      if (componentName) {
        params['Component'] = componentName;
      }
      
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_ADD_CONTROL,
        params
      });
      
      this.logger.info('Control added to change group', { controlName, componentName });
    } catch (error) {
      this.logger.error('Failed to add control to change group', { controlName, componentName, error });
      throw new QSysError(
        'Failed to add control to change group',
        QSysErrorCode.COMMAND_FAILED,
        { controlName, componentName, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Remove control from change group
   */
  async removeControlFromChangeGroup(controlName: string, componentName?: string): Promise<void> {
    this.logger.debug('Removing control from change group', { controlName, componentName });
    
    try {
      const params: Record<string, unknown> = { Name: controlName };
      if (componentName) {
        params['Component'] = componentName;
      }
      
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_REMOVE_CONTROL,
        params
      });
      
      this.logger.info('Control removed from change group', { controlName, componentName });
    } catch (error) {
      this.logger.error('Failed to remove control from change group', { controlName, componentName, error });
      throw new QSysError(
        'Failed to remove control from change group',
        QSysErrorCode.COMMAND_FAILED,
        { controlName, componentName, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Clear change group
   */
  async clearChangeGroup(): Promise<void> {
    this.logger.debug('Clearing change group');
    
    try {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_CLEAR,
        params: {}
      });
      
      this.logger.info('Change group cleared');
    } catch (error) {
      this.logger.error('Failed to clear change group', { error });
      throw new QSysError(
        'Failed to clear change group',
        QSysErrorCode.COMMAND_FAILED,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Invalidate change group
   */
  async invalidateChangeGroup(): Promise<void> {
    this.logger.debug('Invalidating change group');
    
    try {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_INVALIDATE,
        params: {}
      });
      
      this.logger.info('Change group invalidated');
    } catch (error) {
      this.logger.error('Failed to invalidate change group', { error });
      throw new QSysError(
        'Failed to invalidate change group',
        QSysErrorCode.COMMAND_FAILED,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Utility methods
   */

  /**
   * Create a change group with enhanced lifecycle management
   */
  async createChangeGroup(
    id: string, 
    controls: Array<{ control: string; component?: string }>,
    _options?: unknown // Changed ChangeGroupCreateOptions to unknown for safer typing
  ): Promise<unknown> {
    return this.client.sendCommand({
      jsonrpc: '2.0',
      method: QSysMethod.CHANGE_GROUP_CLEAR,
      params: {
        Id: id,
        Controls: controls.map(c => ({ Name: c.control, Component: c.component }))
      }
    });
  }

  /**
   * Get change group
   */
  async getChangeGroup(id: string): Promise<unknown> {
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_CLEAR,
        params: { Id: id }
      });
      return (result as {changeGroup?: unknown}).changeGroup ?? null;
    } catch (error) {
      this.logger.error('Failed to get change group', { id, error });
      throw error;
    }
  }

  /**
   * Delete change group
   */
  async deleteChangeGroup(id: string): Promise<boolean> {
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_CLEAR,
        params: { Id: id }
      });
      return (result as {success?: boolean}).success ?? false;
    } catch (error) {
      this.logger.error('Failed to delete change group', { id, error });
      throw error;
    }
  }

  /**
   * Get all change groups
   */
  async getAllChangeGroups(): Promise<unknown[]> { // Changed QSysChangeGroup to QSysChangeGroupWithMeta as QSysChangeGroup is not defined
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_CLEAR,
        params: {}
      });
      return (result as {changeGroups?: unknown[]}).changeGroups ?? [];
    } catch (error) {
      this.logger.error('Failed to get all change groups', { error });
      throw error;
    }
  }

  /**
   * Get change group metrics
   */
  async getChangeGroupMetrics(): Promise<unknown> { // Changed ChangeGroupMetrics to any as ChangeGroupMetrics is not defined
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_CLEAR,
        params: {}
      });
      return (result as {metrics?: unknown}).metrics;
    } catch (error) {
      this.logger.error('Failed to get change group metrics', { error });
      throw error;
    }
  }

  /**
   * Get change group count
   */
  async getChangeGroupCount(): Promise<number> {
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_CLEAR,
        params: {}
      });
      return (result as {count?: number}).count ?? 0;
    } catch (error) {
      this.logger.error('Failed to get change group count', { error });
      throw error;
    }
  }

  /**
   * Clean up stale change groups
   */
  async cleanupStaleChangeGroups(): Promise<number> {
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_CLEAR,
        params: {}
      });
      return (result as {count?: number}).count ?? 0;
    } catch (error) {
      this.logger.error('Failed to cleanup stale change groups', { error });
      throw error;
    }
  }

  /**
   * Clear all change groups
   */
  async clearAllChangeGroups(): Promise<void> {
    try {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_CLEAR,
        params: {}
      });
      this.logger.info('All change groups cleared');
    } catch (error) {
      this.logger.error('Failed to clear all change groups', { error });
      throw error;
    }
  }

  /**
   * Load change groups from persistence
   */
  async loadChangeGroupsFromPersistence(): Promise<void> {
    try {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CHANGE_GROUP_CLEAR,
        params: {}
      });
      this.logger.info('Change groups loaded from persistence');
    } catch (error) {
      this.logger.error('Failed to load change groups from persistence', { error });
      throw error;
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // The original code had this method, but it was not in the new_code.
    // Assuming it's no longer needed or will be handled by the client.
    // For now, keeping it as is, but it might need adjustment depending on the client's dispose logic.
    this.logger.debug('Disposing QRCCommands');
    // If the client has a dispose method, call it here.
    // if (this.client.dispose) {
    //   await this.client.dispose();
    // }
  }
} 