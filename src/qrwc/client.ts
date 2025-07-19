/**
 * Q-SYS Remote Control WebSocket Client
 * Modern WebSocket client with retry logic, heartbeat, and event-driven architecture
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { createLogger, type Logger } from '../shared/utils/logger.js';
import type { 
  QSysRequest, 
  QSysResponse, 
  QSysNotification,
  QSysConnectionState
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
  'message': [data: unknown];
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
export class QRWCClient extends EventEmitter<QRWCClientEvents> {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolve: (value: any) => void;
    reject: (reason?: unknown) => void;
    timeout: NodeJS.Timeout;
  }>();
  private isAlive = false;
  private shutdownInProgress = false;
  private isAuthenticated = false;

  constructor(options: QRWCClientOptions) {
    super();
    const baseOptions = {
      host: options.host,
      port: options.port,
      reconnectInterval: options.reconnectInterval,
      heartbeatInterval: options.heartbeatInterval,
      maxReconnectAttempts: options.maxReconnectAttempts,
      connectionTimeout: options.connectionTimeout,
      enableHeartbeat: options.enableHeartbeat,
      enableAutoReconnect: options.enableAutoReconnect
    };
    
    // Only add optional properties if they're defined
    this.options = {
      ...baseOptions,
      ...(options.username !== undefined && { username: options.username }),
      ...(options.password !== undefined && { password: options.password })
    };
    
    this.logger = createLogger(`qrwc-client-${options.host}`);
    this.setupGracefulShutdown();
  }

  /**
   * Connect to Q-SYS Core
   */
  /* eslint-disable max-statements */
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
      
      // Authenticate with Q-SYS Core
      await this.authenticate();
      
      // Start heartbeat if enabled
      if (this.options.enableHeartbeat) {
        this.startHeartbeat();
      }
      
      this.logger.info('Successfully connected and authenticated to Q-SYS Core');
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
        QSysErrorCode.CONNECTION_FAILED
      );
    }
  }
  /* eslint-enable max-statements */

  /**
   * Disconnect from Q-SYS Core
   */
  disconnect(): void {
    this.logger.info('Disconnecting from Q-SYS Core');
    this.shutdownInProgress = true;
    
    // Clear timers
    this.clearTimers();
    
    // Cancel pending requests
    this.cancelPendingRequests();
    
    // Reset authentication state
    this.isAuthenticated = false;
    
    // Close WebSocket connection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      delete this.ws;
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
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticatedClient(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Get next request ID with overflow protection and collision avoidance
   */
  private getNextRequestId(): number {
    // Check if we're approaching the safe integer limit
    if (this.requestId >= Number.MAX_SAFE_INTEGER - 1000) {
      this.requestId = 0;
    }
    
    // Increment and get candidate ID
    let candidateId = ++this.requestId;
    
    // Ensure we never use 0 as an ID
    if (candidateId === 0) {
      candidateId = ++this.requestId;
    }
    
    // Check for collision with pending requests
    while (this.pendingRequests.has(candidateId)) {
      candidateId = ++this.requestId;
      
      // If we've wrapped around again, reset to 1
      if (candidateId >= Number.MAX_SAFE_INTEGER - 1000) {
        this.requestId = 0;
        candidateId = ++this.requestId;
      }
    }
    
    this.requestId = candidateId;
    return candidateId;
  }

  /**
   * Authenticate with Q-SYS Core using username and password
   */
  private async authenticate(): Promise<void> {
    if (!this.options.username || !this.options.password) {
      throw new QSysError(
        'Username and password are required for authentication',
        QSysErrorCode.AUTHENTICATION_FAILED,
        { hasUsername: !!this.options.username, hasPassword: !!this.options.password }
      );
    }

    this.logger.debug('Authenticating with Q-SYS Core', { 
      username: this.options.username,
      hasPassword: !!this.options.password 
    });

    try {
      const response = await this.sendCommand({
        jsonrpc: '2.0',
        method: 'Logon',
        params: {
          User: this.options.username,
          Password: this.options.password
        }
      });

      // Check if authentication was successful
      // Q-SYS returns different response formats, check for common success indicators
      const responseObj = response as Record<string, unknown>;
      const isSuccess = response === 'login_success' || 
                       responseObj['result'] === 'login_success' ||
                       responseObj['success'] === true ||
                       !responseObj['error'];

      if (!isSuccess) {
        throw new QSysError(
          'Authentication failed - invalid credentials',
          QSysErrorCode.AUTHENTICATION_FAILED,
          { username: this.options.username, response }
        );
      }

      this.isAuthenticated = true;
      this.logger.info('Successfully authenticated with Q-SYS Core', { 
        username: this.options.username 
      });

    } catch (error) {
      this.isAuthenticated = false;
      
      if (error instanceof QSysError) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
      this.logger.error('Authentication failed', { 
        username: this.options.username,
        error: errorMessage 
      });
      
      throw new QSysError(
        `Authentication failed: ${errorMessage}`,
        QSysErrorCode.AUTHENTICATION_FAILED,
        { username: this.options.username, error: errorMessage }
      );
    }
  }

  /**
   * Send a command to the Q-SYS Core and await the response
   */
  async sendCommand<T = unknown>(request: Omit<QSysRequest, 'id'>): Promise<T> {
    if (!this.isConnected()) {
      throw new QSysError(
        'Not connected to Q-SYS Core',
        QSysErrorCode.WEBSOCKET_ERROR,
        { state: this.connectionState }
      );
    }

    // Check authentication for all commands except Logon and NoOp
    if (request.method !== 'Logon' && request.method !== 'NoOp' && !this.isAuthenticated) {
      throw new QSysError(
        'Not authenticated with Q-SYS Core',
        QSysErrorCode.AUTHENTICATION_FAILED,
        { method: request.method, authenticated: this.isAuthenticated }
      );
    }

    const id = this.getNextRequestId();
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
        if (this.ws) {
          this.ws.send(JSON.stringify(fullRequest));
          this.logger.debug('Sent command', { id, method: request.method });
        } else {
          this.pendingRequests.delete(id);
          reject(new QSysError('WebSocket connection not available', QSysErrorCode.CONNECTION_FAILED));
          return;
        }
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
      this.isAuthenticated = false; // Reset authentication state on connection loss
      this.clearTimers();
      
      if (this.connectionState === ConnectionState.CONNECTED) {
        this.setState(ConnectionState.DISCONNECTED);
        this.emit('disconnected', `Connection closed: ${code} ${String(reason)}`);
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
   * Handle incoming message
   */
  private handleMessage(data: unknown): void {
    this.logger.debug('Handling message:', data);
    
    const message = data as Record<string, unknown>;
    
    // Handle response
    if (typeof message['id'] === 'number' && this.pendingRequests.has(message['id'])) {
      const messageId = message['id'];
      const pendingRequest = this.pendingRequests.get(messageId);
      
      if (!pendingRequest) {
        this.logger.warn('Pending request not found', { messageId });
        return;
      }
      
      const { resolve, reject, timeout } = pendingRequest;
      
      clearTimeout(timeout);
      this.pendingRequests.delete(messageId);
      
      if (message['error']) {
        const errorData = message['error'] as Record<string, unknown>;
        const error = new QSysError(
          (errorData['message'] as string | null | undefined) ?? 'Unknown error', 
          (errorData['code'] as QSysErrorCode | null | undefined) ?? QSysErrorCode.COMMAND_FAILED
        );
        reject(error);
      } else {
        resolve(message['result']);
      }
      
      this.emit('response', message as unknown as QSysResponse);
    } else if (message['id'] === null) {
      // Handle notification
      this.emit('notification', message as unknown as QSysNotification);
    } else {
      // Handle unknown message
      this.logger.warn('Unknown message:', message);
    }
  }

  /**
   * Wait for WebSocket connection to open
   */
  private async waitForConnection(): Promise<void> {
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
      this.connect().catch((error: unknown) => {
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
      delete this.reconnectTimer;
    }
    
    this.clearHeartbeatTimers();
  }

  /**
   * Clear heartbeat timers
   */
  private clearHeartbeatTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      delete this.heartbeatTimer;
    }
    
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      delete this.heartbeatTimeout;
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
    const shutdown = (): void => {
      this.disconnect();
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
      return (result as {components?: unknown[]}).components ?? [];
    }
    
    async getComponent(name: string) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.Get',
        params: { Name: name }
      });
      return (result as {component?: unknown}).component;
    }
    
    async getControls(component: string) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.GetControls',
        params: { Name: component }
      });
      return (result as {controls?: unknown[]}).controls ?? [];
    }
    
    async getControlValue(control: string, component?: string) {
      const params: Record<string, unknown> = { Name: control };
      if (component) params['Component'] = component;
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Component.GetControlValue',
        params
      });
      return (result as {value?: unknown}).value;
    }
    
    async setControlValue(control: string, value: unknown, component?: string) {
      const params: Record<string, unknown> = { Name: control, Value: value };
      if (component) params['Component'] = component;
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Control.Set',
        params
      });
    }
    
    async getControlValues(controls: Array<{Name: string; Component?: string}>) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Control.GetMultiple',
        params: { Controls: controls }
      });
      return (result as {controls?: unknown[]}).controls ?? [];
    }
    
    async setControlValues(controls: Array<{Name: string; Value: unknown; Component?: string}>) {
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
      return (result as {inputs?: unknown[]}).inputs ?? [];
    }
    
    async getMixerOutputs(mixer: string) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Mixer.GetOutputs',
        params: { Name: mixer }
      });
      return (result as {outputs?: unknown[]}).outputs ?? [];
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
      return (result as {mute?: boolean}).mute ?? false;
    }
    
    async getCrosspointGain(mixer: string, input: number, output: number) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Mixer.GetCrosspointGain',
        params: { Name: mixer, Input: input, Output: output }
      });
      return (result as {gain?: number}).gain ?? 0;
    }
    
    async loadSnapshot(bank: number, snapshot: number, ramp?: number) {
      const params: Record<string, unknown> = { Bank: bank, Snapshot: snapshot };
      if (ramp !== undefined) params['Ramp'] = ramp;
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Snapshot.Load',
        params
      });
    }
    
    async saveSnapshot(bank: number, snapshot: number, name?: string) {
      const params: Record<string, unknown> = { Bank: bank, Snapshot: snapshot };
      if (name) params['Name'] = name;
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
      return (result as {banks?: unknown[]}).banks ?? [];
    }
    
    async getSnapshots(bank: number) {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Snapshot.Get',
        params: { Bank: bank }
      });
      return (result as {snapshots?: unknown[]}).snapshots ?? [];
    }
    
    async getStatus() {
      const result = await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'Status.Get',
        params: {}
      });
      return (result as {status?: unknown}).status;
    }
    
    async addControlToChangeGroup(control: string, component?: string) {
      const params: Record<string, unknown> = { Name: control };
      if (component) params['Component'] = component;
      await this.client.sendCommand({
        jsonrpc: '2.0',
        method: 'ChangeGroup.AddControl',
        params
      });
    }
    
    async removeControlFromChangeGroup(control: string, component?: string) {
      const params: Record<string, unknown> = { Name: control };
      if (component) params['Component'] = component;
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
      const params: Record<string, unknown> = { Enabled: enabled };
      if (rate) params['Rate'] = rate;
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
      return (result as {changes?: unknown[]}).changes ?? [];
    }
  })(this);

  // Delegate to QRC commands
  async getComponents() { return this.qrcCommands.getComponents(); }
  async getComponent(name: string) { return this.qrcCommands.getComponent(name); }
  async getControls(component: string) { return this.qrcCommands.getControls(component); }
  async getControlValue(control: string, component?: string) { return this.qrcCommands.getControlValue(control, component); }
  async setControlValue(control: string, value: unknown, component?: string) { return this.qrcCommands.setControlValue(control, value, component); }
  async getControlValues(controls: Array<{Name: string; Component?: string}>) { return this.qrcCommands.getControlValues(controls); }
  async setControlValues(controls: Array<{Name: string; Value: unknown; Component?: string}>) { return this.qrcCommands.setControlValues(controls); }
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