/**
 * Q-SYS Remote Control WebSocket Client
 * Modern WebSocket client with retry logic, heartbeat, and event-driven architecture
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { Logger } from '../shared/utils/logger.js';
import { createLogger } from '../shared/utils/logger.js';
import { globalErrorHandler } from '../shared/utils/errorHandler.js';
import { config } from '../shared/utils/env.js';
import type {
  QSysConnectionConfig,
  QSysConnectionState,
  QSysRequest,
  QSysResponse,
  QSysNotification,
  QSysMethod,
  QSysClient
} from '../shared/types/qsys.js';
import { QSysError, QSysErrorCode } from '../shared/types/errors.js';
import { ConnectionState } from '../shared/types/common.js';

/**
 * QRWC Client Events
 */
export interface QRWCClientEvents {
  'connected': [];
  'disconnected': [reason: string];
  'reconnecting': [attempt: number];
  'error': [error: Error];
  'message': [data: any];
  'response': [response: QSysResponse];
  'notification': [notification: QSysNotification];
  'state_change': [state: ConnectionState];
}

/**
 * QRWC Client Options
 */
export interface QRWCClientOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  reconnectInterval: number;
  heartbeatInterval: number;
  maxReconnectAttempts: number;
  connectionTimeout: number;
  enableHeartbeat: boolean;
  enableAutoReconnect: boolean;
}

/**
 * QRWC Client implementation with modern WebSocket patterns
 */
export class QRWCClient extends EventEmitter<QRWCClientEvents> implements QSysClient {
  private ws?: WebSocket;
  private logger: Logger;
  private options: QRWCClientOptions;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private heartbeatTimeout?: NodeJS.Timeout;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private isAlive = false;
  private shutdownInProgress = false;

  constructor(options: Partial<QRWCClientOptions> = {}) {
    super();
    this.logger = createLogger('QRWCClient');
    this.options = {
      host: options.host || config.qsys.host,
      port: options.port || config.qsys.port,
      username: options.username || config.qsys.username,
      password: options.password || config.qsys.password,
      reconnectInterval: options.reconnectInterval || config.qsys.reconnectInterval,
      heartbeatInterval: options.heartbeatInterval || config.qsys.heartbeatInterval,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
      connectionTimeout: options.connectionTimeout || 10000,
      enableHeartbeat: options.enableHeartbeat ?? true,
      enableAutoReconnect: options.enableAutoReconnect ?? true
    };

    this.setupGracefulShutdown();
  }

  /**
   * Connect to Q-SYS Core
   */
  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTING || this.connectionState === ConnectionState.CONNECTED) {
      return;
    }

    this.setState(ConnectionState.CONNECTING);
    this.logger.info('Connecting to Q-SYS Core', {
      host: this.options.host,
      port: this.options.port
    });

    try {
      const url = `ws://${this.options.host}:${this.options.port}`;
      this.ws = new WebSocket(url);

      // Set up event handlers
      this.setupWebSocketHandlers();

      // Wait for connection with timeout
      await this.waitForConnection();

      this.setState(ConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.isAlive = true;
      
      // Start heartbeat if enabled
      if (this.options.enableHeartbeat) {
        this.startHeartbeat();
      }

      this.logger.info('Successfully connected to Q-SYS Core');
      this.emit('connected');

    } catch (error) {
      this.setState(ConnectionState.DISCONNECTED);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to connect to Q-SYS Core', { error: errorMsg });
      
      if (this.options.enableAutoReconnect) {
        this.scheduleReconnect();
      }
      
      throw new QSysError(
        'Failed to connect to Q-SYS Core',
        QSysErrorCode.CONNECTION_FAILED,
        { host: this.options.host, port: this.options.port, error: errorMsg }
      );
    }
  }

  /**
   * Disconnect from Q-SYS Core
   */
  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from Q-SYS Core');
    this.shutdownInProgress = true;
    
    // Clear timers
    this.clearTimers();
    
    // Cancel pending requests
    this.cancelPendingRequests();
    
    // Close WebSocket connection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = undefined as any;
    }
    
    this.setState(ConnectionState.DISCONNECTED);
    this.emit('disconnected', 'Client disconnect');
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection state
   */
  getState(): QSysConnectionState {
    return {
      state: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      lastConnected: undefined as any,
      lastDisconnected: undefined as any
    };
  }

  /**
   * Send a command to Q-SYS Core
   */
  async sendCommand<T = any>(request: Omit<QSysRequest, 'id'>): Promise<T> {
    if (!this.isConnected()) {
      throw new QSysError(
        'Not connected to Q-SYS Core',
        QSysErrorCode.WEBSOCKET_ERROR,
        { state: this.connectionState }
      );
    }

    const id = ++this.requestId;
    const fullRequest: QSysRequest = { ...request, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new QSysError(
          'Request timeout',
          QSysErrorCode.TIMEOUT,
          { requestId: id, method: request.method }
        ));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(id, { resolve, reject, timeout });

      try {
        this.ws!.send(JSON.stringify(fullRequest));
        this.logger.debug('Sent command', { id, method: request.method });
      } catch (error) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(new QSysError(
          'Failed to send command',
          QSysErrorCode.WEBSOCKET_ERROR,
          { error: error instanceof Error ? error.message : 'Unknown error' }
        ));
      }
    });
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('error', (error) => {
      this.logger.error('WebSocket error', { error: error.message });
      this.emit('error', error);
    });

    this.ws.on('open', () => {
      this.logger.debug('WebSocket connection opened');
      this.isAlive = true;
      this.startHeartbeat();
    });

    this.ws.on('close', (code, reason) => {
      this.logger.info('WebSocket connection closed', { 
        code, 
        reason: reason.toString() 
      });
      
      this.isAlive = false;
      this.clearTimers();
      
      if (this.connectionState === ConnectionState.CONNECTED) {
        this.setState(ConnectionState.DISCONNECTED);
        this.emit('disconnected', `Connection closed: ${code} ${reason}`);
      }
      
      if (!this.shutdownInProgress && this.options.enableAutoReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('ping', () => {
      this.logger.debug('Received ping from server');
      this.heartbeat();
    });

    this.ws.on('pong', () => {
      this.logger.debug('Received pong from server');
      this.heartbeat();
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      this.logger.debug('Received message', { message });
      
      this.emit('message', message);

      // Handle responses to pending requests
      if (message.id && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);
        clearTimeout(pending.timeout);

        if (message.error) {
          pending.reject(new QSysError(
            message.error.message || 'Q-SYS error',
            message.error.code || 'QSYS_ERROR',
            { requestId: message.id, error: message.error }
          ));
        } else {
          pending.resolve(message.result);
        }
        
        this.emit('response', message);
      } else if (!message.id) {
        // Handle notifications (messages without ID)
        this.emit('notification', message);
      }
    } catch (error) {
      this.logger.error('Failed to parse message', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: data.toString() 
      });
    }
  }

  /**
   * Wait for WebSocket connection to open
   */
  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.connectionTimeout);

      this.ws.once('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (!this.options.enableHeartbeat) return;

    this.clearHeartbeatTimers();

    // Set up client-side heartbeat (from Context7 patterns)
    this.heartbeatTimer = setInterval(() => {
      if (this.isAlive === false) {
        this.logger.warn('Heartbeat failed - terminating connection');
        this.ws?.terminate();
        return;
      }

      this.isAlive = false;
      this.ws?.ping();
    }, this.options.heartbeatInterval);

    this.logger.debug('Heartbeat started', { 
      interval: this.options.heartbeatInterval 
    });
  }

  /**
   * Handle heartbeat response
   */
  private heartbeat(): void {
    this.isAlive = true;
    
    // Clear any existing timeout
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }

    // Set timeout for next heartbeat (from Context7 patterns)
    this.heartbeatTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.logger.warn('Heartbeat timeout - terminating connection');
        this.ws.terminate();
      }
    }, this.options.heartbeatInterval + 1000);
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.shutdownInProgress) return;
    
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    this.logger.info('Scheduling reconnection attempt', {
      attempt: this.reconnectAttempts,
      delay
    });

    this.emit('reconnecting', this.reconnectAttempts);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.logger.error('Reconnection attempt failed', { error });
      });
    }, delay);
  }

  /**
   * Set connection state
   */
  private setState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      const oldState = this.connectionState;
      this.connectionState = state;
      this.logger.debug('State changed', { from: oldState, to: state });
      this.emit('state_change', state);
    }
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined as any;
    }
    
    this.clearHeartbeatTimers();
  }

  /**
   * Clear heartbeat timers
   */
  private clearHeartbeatTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined as any;
    }
    
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined as any;
    }
  }

  /**
   * Cancel all pending requests
   */
  private cancelPendingRequests(): void {
    this.pendingRequests.forEach((pending, id) => {
      clearTimeout(pending.timeout);
      pending.reject(new QSysError(
        'Connection closed',
        QSysErrorCode.CONNECTION_CLOSED,
        { requestId: id }
      ));
    });
    this.pendingRequests.clear();
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      this.logger.info('Graceful shutdown initiated');
      await this.disconnect();
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('beforeExit', shutdown);
  }

  // QSysClient interface implementation using QRCCommands
  private qrcCommands = new (class {
    constructor(private client: QRWCClient) {}
    
    async getComponents() { 
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.GetComponents',
        params: {}
      });
      return result.components || [];
    }
    
    async getComponent(name: string) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.Get',
        params: { Name: name }
      });
      return result.component;
    }
    
    async getControls(component: string) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.GetControls',
        params: { Name: component }
      });
      return result.controls || [];
    }
    
    async getControlValue(control: string, component?: string) {
      const params: any = { Name: control };
      if (component) params.Component = component;
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Control.Get',
        params
      });
      return result.value;
    }
    
    async setControlValue(control: string, value: any, component?: string) {
      const params: any = { Name: control, Value: value };
      if (component) params.Component = component;
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Control.Set',
        params
      });
    }
    
    async getControlValues(controls: any[]) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Control.GetMultiple',
        params: { Controls: controls }
      });
      return result.controls || [];
    }
    
    async setControlValues(controls: any[]) {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Control.SetMultiple',
        params: { Controls: controls }
      });
    }
    
    async getMixerInputs(mixer: string) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Mixer.GetInputs',
        params: { Name: mixer }
      });
      return result.inputs || [];
    }
    
    async getMixerOutputs(mixer: string) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Mixer.GetOutputs',
        params: { Name: mixer }
      });
      return result.outputs || [];
    }
    
    async setCrosspointMute(mixer: string, input: number, output: number, mute: boolean) {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Mixer.SetCrosspointMute',
        params: { Name: mixer, Input: input, Output: output, Mute: mute }
      });
    }
    
    async setCrosspointGain(mixer: string, input: number, output: number, gain: number) {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Mixer.SetCrosspointGain',
        params: { Name: mixer, Input: input, Output: output, Gain: gain }
      });
    }
    
    async getCrosspointMute(mixer: string, input: number, output: number) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Mixer.GetCrosspointMute',
        params: { Name: mixer, Input: input, Output: output }
      });
      return result.mute;
    }
    
    async getCrosspointGain(mixer: string, input: number, output: number) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Mixer.GetCrosspointGain',
        params: { Name: mixer, Input: input, Output: output }
      });
      return result.gain;
    }
    
    async loadSnapshot(bank: number, snapshot: number, ramp?: number) {
      const params: any = { Bank: bank, Snapshot: snapshot };
      if (ramp !== undefined) params.Ramp = ramp;
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Snapshot.Load',
        params
      });
    }
    
    async saveSnapshot(bank: number, snapshot: number, name?: string) {
      const params: any = { Bank: bank, Snapshot: snapshot };
      if (name) params.Name = name;
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Snapshot.Save',
        params
      });
    }
    
    async getSnapshotBanks() {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Snapshot.GetBanks',
        params: {}
      });
      return result.banks || [];
    }
    
    async getSnapshots(bank: number) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Snapshot.Get',
        params: { Bank: bank }
      });
      return result.snapshots || [];
    }
    
    async getStatus() {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Status.Get',
        params: {}
      });
      return result.status;
    }
    
    async addControlToChangeGroup(control: string, component?: string) {
      const params: any = { Name: control };
      if (component) params.Component = component;
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'ChangeGroup.AddControl',
        params
      });
    }
    
    async removeControlFromChangeGroup(control: string, component?: string) {
      const params: any = { Name: control };
      if (component) params.Component = component;
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'ChangeGroup.RemoveControl',
        params
      });
    }
    
    async clearChangeGroup() {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'ChangeGroup.Clear',
        params: {}
      });
    }
    
    async invalidateChangeGroup() {
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'ChangeGroup.Invalidate',
        params: {}
      });
    }
    
    async setAutoPolling(enabled: boolean, rate?: number) {
      const params: any = { Enabled: enabled };
      if (rate) params.Rate = rate;
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'ChangeGroup.AutoPoll',
        params
      });
    }
    
    async poll() {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'ChangeGroup.Poll',
        params: {}
      });
      return result.changes || [];
    }
  })(this);

  // Delegate to QRC commands
  async getComponents() { return this.qrcCommands.getComponents(); }
  async getComponent(name: string) { return this.qrcCommands.getComponent(name); }
  async getControls(component: string) { return this.qrcCommands.getControls(component); }
  async getControlValue(control: string, component?: string) { return this.qrcCommands.getControlValue(control, component); }
  async setControlValue(control: string, value: any, component?: string) { return this.qrcCommands.setControlValue(control, value, component); }
  async getControlValues(controls: any[]) { return this.qrcCommands.getControlValues(controls); }
  async setControlValues(controls: any[]) { return this.qrcCommands.setControlValues(controls); }
  async getMixerInputs(mixer: string) { return this.qrcCommands.getMixerInputs(mixer); }
  async getMixerOutputs(mixer: string) { return this.qrcCommands.getMixerOutputs(mixer); }
  async setCrosspointMute(mixer: string, input: number, output: number, mute: boolean) { return this.qrcCommands.setCrosspointMute(mixer, input, output, mute); }
  async setCrosspointGain(mixer: string, input: number, output: number, gain: number) { return this.qrcCommands.setCrosspointGain(mixer, input, output, gain); }
  async getCrosspointMute(mixer: string, input: number, output: number) { return this.qrcCommands.getCrosspointMute(mixer, input, output); }
  async getCrosspointGain(mixer: string, input: number, output: number) { return this.qrcCommands.getCrosspointGain(mixer, input, output); }
  async loadSnapshot(bank: number, snapshot: number, ramp?: number) { return this.qrcCommands.loadSnapshot(bank, snapshot, ramp); }
  async saveSnapshot(bank: number, snapshot: number, name?: string) { return this.qrcCommands.saveSnapshot(bank, snapshot, name); }
  async getSnapshotBanks() { return this.qrcCommands.getSnapshotBanks(); }
  async getSnapshots(bank: number) { return this.qrcCommands.getSnapshots(bank); }
  async getStatus() { return this.qrcCommands.getStatus(); }
  async addControlToChangeGroup(control: string, component?: string) { return this.qrcCommands.addControlToChangeGroup(control, component); }
  async removeControlFromChangeGroup(control: string, component?: string) { return this.qrcCommands.removeControlFromChangeGroup(control, component); }
  async clearChangeGroup() { return this.qrcCommands.clearChangeGroup(); }
  async invalidateChangeGroup() { return this.qrcCommands.invalidateChangeGroup(); }
  async setAutoPolling(enabled: boolean, rate?: number) { return this.qrcCommands.setAutoPolling(enabled, rate); }
  async poll() { return this.qrcCommands.poll(); }
} 