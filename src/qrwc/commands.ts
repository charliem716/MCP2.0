/**
 * Q-SYS Remote Control Commands Interface
 * Implements all QRWC methods for Q-SYS control and monitoring
 */

import type { Logger } from '../shared/utils/logger.js';
import { createLogger } from '../shared/utils/logger.js';
import { QSysError, QSysErrorCode } from '../shared/types/errors.js';
import type { QRWCClient } from './client.js';
import type {
  QSysComponent,
  QSysControl,
  QSysControlValue,
  QSysSnapshot,
  QSysSnapshotBank,
  QSysCoreStatus,
  QSysMixerIO,
  QSysChangeGroup,
  QSysRequest,
  QSysResponse
} from '../shared/types/qsys.js';
import { QSysMethod } from '../shared/types/qsys.js';

/**
 * QRC Commands implementation
 */
export class QRCCommands {
  private logger: Logger;
  private client: QRWCClient;
  private changeGroups = new Map<string, QSysChangeGroup>();

  constructor(client: QRWCClient) {
    this.logger = createLogger('QRCCommands');
    this.client = client;
  }

  /**
   * Component Management
   */

  /**
   * Get all components in the design
   */
  async getComponents(): Promise<QSysComponent[]> {
    this.logger.debug('Getting all components');
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.COMPONENT_GET_COMPONENTS,
        params: {}
      });
      
      return result.components || [];
    } catch (error) {
      this.logger.error('Failed to get components', { error });
      throw new QSysError(
        'Failed to get components',
        QSysErrorCode.COMMAND_FAILED,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Get a specific component by name
   */
  async getComponent(name: string): Promise<QSysComponent> {
    this.logger.debug('Getting component', { name });
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.COMPONENT_GET,
        params: { Name: name }
      });
      
      if (!result.component) {
        throw new QSysError(
          `Component not found: ${name}`,
          QSysErrorCode.INVALID_COMPONENT,
          { componentName: name }
        );
      }
      
      return result.component;
    } catch (error) {
      this.logger.error('Failed to get component', { name, error });
      throw error instanceof QSysError ? error : new QSysError(
        'Failed to get component',
        QSysErrorCode.COMMAND_FAILED,
        { componentName: name, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Get all controls for a component
   */
  async getControls(componentName: string): Promise<QSysControl[]> {
    this.logger.debug('Getting controls for component', { componentName });
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.COMPONENT_GET_CONTROLS,
        params: { Name: componentName }
      });
      
      return result.controls || [];
    } catch (error) {
      this.logger.error('Failed to get controls', { componentName, error });
      throw new QSysError(
        'Failed to get controls',
        QSysErrorCode.COMMAND_FAILED,
        { componentName, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Control Value Operations
   */

  /**
   * Get a single control value
   */
  async getControlValue(controlName: string, componentName?: string): Promise<QSysControlValue> {
    this.logger.debug('Getting control value', { controlName, componentName });
    
    try {
      const params: any = { Name: controlName };
      if (componentName) {
        params.Component = componentName;
      }
      
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CONTROL_GET,
        params
      });
      
      return result.value;
    } catch (error) {
      this.logger.error('Failed to get control value', { controlName, componentName, error });
      throw new QSysError(
        'Failed to get control value',
        QSysErrorCode.INVALID_CONTROL,
        { controlName, componentName, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Set a single control value
   */
  async setControlValue(
    controlName: string, 
    value: QSysControlValue, 
    componentName?: string,
    ramp?: number
  ): Promise<void> {
    this.logger.debug('Setting control value', { controlName, value, componentName, ramp });
    
    try {
      const params: any = { 
        Name: controlName, 
        Value: value 
      };
      
      if (componentName) {
        params.Component = componentName;
      }
      
      if (ramp !== undefined) {
        params.Ramp = ramp;
      }
      
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CONTROL_SET,
        params
      });
      
      this.logger.info('Control value set successfully', { controlName, value, componentName });
    } catch (error) {
      this.logger.error('Failed to set control value', { controlName, value, componentName, error });
      throw new QSysError(
        'Failed to set control value',
        QSysErrorCode.COMMAND_FAILED,
        { controlName, value, componentName, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Get multiple control values
   */
  async getControlValues(controls: Array<{ control: string; component?: string }>): Promise<QSysControl[]> {
    this.logger.debug('Getting multiple control values', { controlCount: controls.length });
    
    try {
      const params = {
        Controls: controls.map(c => ({
          Name: c.control,
          Component: c.component
        }))
      };
      
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.CONTROL_GET_MULTIPLE,
        params
      });
      
      return result.controls || [];
    } catch (error) {
      this.logger.error('Failed to get multiple control values', { error });
      throw new QSysError(
        'Failed to get multiple control values',
        QSysErrorCode.COMMAND_FAILED,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
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
        method: QSysMethod.CONTROL_SET_MULTIPLE,
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
  async getMixerInputs(mixerName: string): Promise<QSysMixerIO[]> {
    this.logger.debug('Getting mixer inputs', { mixerName });
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.MIXER_GET_INPUTS,
        params: { Name: mixerName }
      });
      
      return result.inputs || [];
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
  async getMixerOutputs(mixerName: string): Promise<QSysMixerIO[]> {
    this.logger.debug('Getting mixer outputs', { mixerName });
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.MIXER_GET_OUTPUTS,
        params: { Name: mixerName }
      });
      
      return result.outputs || [];
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
      
      return result.mute;
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
      
      return result.gain;
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
      const params: any = { Bank: bank, Snapshot: snapshot };
      if (ramp !== undefined) {
        params.Ramp = ramp;
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
      const params: any = { Bank: bank, Snapshot: snapshot };
      if (name) {
        params.Name = name;
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
  async getSnapshotBanks(): Promise<QSysSnapshotBank[]> {
    this.logger.debug('Getting snapshot banks');
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.SNAPSHOT_GET_BANKS,
        params: {}
      });
      
      return result.banks || [];
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
      
      return result.snapshots || [];
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
  async getStatus(): Promise<QSysCoreStatus> {
    this.logger.debug('Getting Q-SYS Core status');
    
    try {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: QSysMethod.STATUS_GET,
        params: {}
      });
      
      return result.status;
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
      const params: any = { Name: controlName };
      if (componentName) {
        params.Component = componentName;
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
      const params: any = { Name: controlName };
      if (componentName) {
        params.Component = componentName;
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
   * Create a change group
   */
  createChangeGroup(id: string, controls: Array<{ control: string; component?: string }>): QSysChangeGroup {
    const changeGroup: QSysChangeGroup = {
      id,
      controls,
      autoPoll: false
    };
    
    this.changeGroups.set(id, changeGroup);
    this.logger.debug('Change group created', { id, controlCount: controls.length });
    
    return changeGroup;
  }

  /**
   * Get change group
   */
  getChangeGroup(id: string): QSysChangeGroup | undefined {
    return this.changeGroups.get(id);
  }

  /**
   * Delete change group
   */
  deleteChangeGroup(id: string): boolean {
    const deleted = this.changeGroups.delete(id);
    if (deleted) {
      this.logger.debug('Change group deleted', { id });
    }
    return deleted;
  }

  /**
   * Get all change groups
   */
  getAllChangeGroups(): QSysChangeGroup[] {
    return Array.from(this.changeGroups.values());
  }
} 