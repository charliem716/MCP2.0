/**
 * Q-SYS specific types for QRWC API and Q-SYS components
 */

import type { ID, Timestamp, ConnectionState } from './common.js';

/**
 * Q-SYS component types
 */
export type QSysComponentType =
  | 'mixer'
  | 'router'
  | 'gain'
  | 'mute'
  | 'eq'
  | 'delay'
  | 'snapshot'
  | 'virtual_microphone'
  | 'virtual_speaker'
  | 'custom';

/**
 * Q-SYS control types
 */
export type QSysControlType =
  | 'button'
  | 'knob'
  | 'fader'
  | 'meter'
  | 'text'
  | 'led'
  | 'position'
  | 'rich_text';

/**
 * Q-SYS control data types
 */
export type QSysControlValue = string | number | boolean;

/**
 * Q-SYS position data (for 2D controls)
 */
export interface QSysPosition {
  x: number;
  y: number;
}

/**
 * Q-SYS control information
 */
export interface QSysControl {
  name: string;
  type: QSysControlType;
  value: QSysControlValue;
  position?: QSysPosition;
  string?: string;
  prettyName?: string;
  tags?: string[];
  direction?: 'input' | 'output';
}

/**
 * Q-SYS component information
 */
export interface QSysComponent {
  name: string;
  type: QSysComponentType;
  prettyName?: string;
  controls: QSysControl[];
  tags?: string[];
}

/**
 * Q-SYS core status
 */
export interface QSysCoreStatus {
  isRedundant: boolean;
  isEmulator: boolean;
  status: 'ok' | 'compromised' | 'fault';
  platform: string;
  designName: string;
  coreId: string;
  isActive: boolean;
  coreVersion: string;
  designCode: string;
  lastBackup?: Timestamp;
  uptimeSeconds: number;
}

/**
 * Q-SYS QRWC JSON-RPC request structure
 */
export interface QSysRequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
  id: ID;
}

/**
 * Q-SYS QRWC JSON-RPC response structure
 */
export interface QSysResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: ID;
}

/**
 * Q-SYS QRWC JSON-RPC notification structure
 */
export interface QSysNotification {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
}

/**
 * Q-SYS QRWC method names
 */
export enum QSysMethod {
  // Authentication
  LOGON = 'Logon',

  // Component methods
  COMPONENT_GET = 'Component.Get',
  COMPONENT_GET_COMPONENTS = 'Component.GetComponents',
  COMPONENT_GET_CONTROLS = 'Component.GetControls',
  COMPONENT_SET = 'Component.Set',
  COMPONENT_GET_CONTROL_VALUES = 'Component.GetControlValues',
  COMPONENT_SET_CONTROL_VALUES = 'Component.SetControlValues',

  // Control methods
  CONTROL_GET = 'Control.Get',
  CONTROL_SET = 'Control.Set',
  CONTROL_GET_MULTIPLE = 'Control.GetMultiple',
  CONTROL_SET_MULTIPLE = 'Control.SetMultiple',

  // Mixer methods
  MIXER_GET_INPUTS = 'Mixer.GetInputs',
  MIXER_GET_OUTPUTS = 'Mixer.GetOutputs',
  MIXER_SET_CROSSPOINT_MUTE = 'Mixer.SetCrosspointMute',
  MIXER_SET_CROSSPOINT_GAIN = 'Mixer.SetCrosspointGain',
  MIXER_GET_CROSSPOINT_MUTE = 'Mixer.GetCrosspointMute',
  MIXER_GET_CROSSPOINT_GAIN = 'Mixer.GetCrosspointGain',

  // Snapshot methods
  SNAPSHOT_LOAD = 'Snapshot.Load',
  SNAPSHOT_SAVE = 'Snapshot.Save',
  SNAPSHOT_GET = 'Snapshot.Get',
  SNAPSHOT_GET_BANKS = 'Snapshot.GetBanks',
  SNAPSHOT_GET_SNAPSHOTS = 'Snapshot.GetSnapshots',

  // Status methods
  STATUS_GET = 'StatusGet',

  // Change group methods
  CHANGE_GROUP_ADD_CONTROL = 'ChangeGroup.AddControl',
  CHANGE_GROUP_REMOVE_CONTROL = 'ChangeGroup.RemoveControl',
  CHANGE_GROUP_ADD_COMPONENT_CONTROL = 'ChangeGroup.AddComponentControl',
  CHANGE_GROUP_REMOVE_COMPONENT_CONTROL = 'ChangeGroup.RemoveComponentControl',
  CHANGE_GROUP_CLEAR = 'ChangeGroup.Clear',
  CHANGE_GROUP_INVALIDATE = 'ChangeGroup.Invalidate',
  CHANGE_GROUP_AUTO_POLL = 'ChangeGroup.AutoPoll',
  CHANGE_GROUP_POLL = 'ChangeGroup.Poll',

  // Notification methods
  ENGINE_STATUS = 'EngineStatus',
  CONTROL_CHANGE = 'ControlChange',
  COMPONENT_CHANGE = 'ComponentChange',
}

/**
 * Q-SYS connection configuration
 */
export interface QSysConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  secure?: boolean;
  timeout?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  maxReconnectAttempts?: number;
}

/**
 * Q-SYS connection state
 */
export interface QSysConnectionState {
  state: ConnectionState;
  lastConnected?: Timestamp;
  lastDisconnected?: Timestamp;
  reconnectAttempts: number;
  error?: string;
}

/**
 * Q-SYS change group configuration
 */
export interface QSysChangeGroup {
  id: string;
  controls: Array<{
    component?: string;
    control: string;
  }>;
  autoPoll: boolean;
  pollRate?: number;
}

/**
 * Enhanced Q-SYS change group with metadata for lifecycle management
 */
export interface QSysChangeGroupWithMeta extends QSysChangeGroup {
  createdAt: number;
  lastAccessed: number;
  ttl?: number;
  accessCount: number;
}

/**
 * Change group metrics
 */
export interface ChangeGroupMetrics {
  totalGroups: number;
  activeGroups: number;
  totalAccesses: number;
  averageGroupSize: number;
  oldestGroupAge: number;
  memoryUsageBytes: number;
}

/**
 * Change group creation options
 */
export interface ChangeGroupCreateOptions {
  ttl?: number;
  autoPoll?: boolean;
  pollRate?: number;
}

/**
 * Q-SYS control change notification
 */
export interface QSysControlChange {
  name: string;
  value: QSysControlValue;
  position?: QSysPosition;
  string?: string;
  component?: string;
  timestamp: Timestamp;
}

/**
 * Q-SYS component change notification
 */
export interface QSysComponentChange {
  component: string;
  controls: Array<{
    name: string;
    value: QSysControlValue;
    position?: QSysPosition;
    string?: string;
  }>;
  timestamp: Timestamp;
}

/**
 * Q-SYS snapshot bank
 */
export interface QSysSnapshotBank {
  name: string;
  id: number;
  snapshots: QSysSnapshot[];
}

/**
 * Q-SYS snapshot
 */
export interface QSysSnapshot {
  name: string;
  bank: number;
  id: number;
  ramp?: number;
  description?: string;
  lastModified?: Timestamp;
}

/**
 * Q-SYS mixer input/output
 */
export interface QSysMixerIO {
  name: string;
  index: number;
  label?: string;
  type: 'input' | 'output';
}

/**
 * Q-SYS mixer crosspoint
 */
export interface QSysMixerCrosspoint {
  input: number;
  output: number;
  mute: boolean;
  gain: number;
}

/**
 * Q-SYS named control (legacy)
 */
export interface QSysNamedControl {
  name: string;
  value: QSysControlValue;
  position?: QSysPosition;
  string?: string;
  tags?: string[];
}

/**
 * Q-SYS engine status
 */
export interface QSysEngineStatus {
  state: 'active' | 'standby' | 'compromised' | 'fault';
  timestamp: Timestamp;
  designName: string;
  coreId: string;
  isRedundant: boolean;
  isEmulator: boolean;
}

/**
 * Q-SYS client interface
 */
export interface QSysClient {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getState(): QSysConnectionState;

  // Component methods
  getComponents(): Promise<QSysComponent[]>;
  getComponent(name: string): Promise<QSysComponent>;
  getControls(component: string): Promise<QSysControl[]>;

  // Control methods
  getControlValue(
    control: string,
    component?: string
  ): Promise<QSysControlValue>;
  setControlValue(
    control: string,
    value: QSysControlValue,
    component?: string
  ): Promise<void>;
  getControlValues(
    controls: Array<{ control: string; component?: string }>
  ): Promise<QSysControl[]>;
  setControlValues(
    controls: Array<{
      control: string;
      value: QSysControlValue;
      component?: string;
    }>
  ): Promise<void>;

  // Mixer methods
  getMixerInputs(mixer: string): Promise<QSysMixerIO[]>;
  getMixerOutputs(mixer: string): Promise<QSysMixerIO[]>;
  setCrosspointMute(
    mixer: string,
    input: number,
    output: number,
    mute: boolean
  ): Promise<void>;
  setCrosspointGain(
    mixer: string,
    input: number,
    output: number,
    gain: number
  ): Promise<void>;
  getCrosspointMute(
    mixer: string,
    input: number,
    output: number
  ): Promise<boolean>;
  getCrosspointGain(
    mixer: string,
    input: number,
    output: number
  ): Promise<number>;

  // Snapshot methods
  loadSnapshot(bank: number, snapshot: number, ramp?: number): Promise<void>;
  saveSnapshot(bank: number, snapshot: number, name?: string): Promise<void>;
  getSnapshotBanks(): Promise<QSysSnapshotBank[]>;
  getSnapshots(bank: number): Promise<QSysSnapshot[]>;

  // Status methods
  getStatus(): Promise<QSysCoreStatus>;

  // Change group methods
  addControlToChangeGroup(control: string, component?: string): Promise<void>;
  removeControlFromChangeGroup(
    control: string,
    component?: string
  ): Promise<void>;
  clearChangeGroup(): Promise<void>;
  invalidateChangeGroup(): Promise<void>;
  setAutoPolling(enabled: boolean, rate?: number): Promise<void>;
  poll(): Promise<QSysControlChange[]>;

  // Event handling
  on(event: 'connected', listener: () => void): void;
  on(event: 'disconnected', listener: (error?: Error) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(
    event: 'controlChange',
    listener: (change: QSysControlChange) => void
  ): void;
  on(
    event: 'componentChange',
    listener: (change: QSysComponentChange) => void
  ): void;
  on(event: 'engineStatus', listener: (status: QSysEngineStatus) => void): void;

  off(event: string, listener: (...args: unknown[]) => void): void;
  removeAllListeners(event?: string): void;
}
