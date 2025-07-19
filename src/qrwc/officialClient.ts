/**
 * Official Q-SYS QRWC Client Wrapper
 * Modern WebSocket-based interface using the official @q-sys/qrwc library
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Qrwc } from '@q-sys/qrwc';
import { createLogger, type Logger } from '../shared/utils/logger.js';
import { ConnectionState } from '../shared/types/common.js';
import { QSysError, QSysErrorCode } from '../shared/types/errors.js';

/**
 * Configuration options for the Official QRWC Client
 */
export interface OfficialQRWCClientOptions {
  host: string;
  port?: number;
  pollingInterval?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  connectionTimeout?: number;
  enableAutoReconnect?: boolean;
}

/**
 * Events emitted by the Official QRWC Client
 */
export interface OfficialQRWCClientEvents {
  'connected': [];
  'disconnected': [reason: string];
  'reconnecting': [attempt: number];
  'error': [error: Error];
  'state_change': [state: ConnectionState];
}

/**
 * Official Q-SYS QRWC Client - uses the official @q-sys/qrwc library
 */
export class OfficialQRWCClient extends EventEmitter<OfficialQRWCClientEvents> {
  private ws?: WebSocket;
  private qrwc?: Qrwc<Record<string, string>>;
  private logger: Logger;
  private options: Required<OfficialQRWCClientOptions>;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private shutdownInProgress = false;

  constructor(options: OfficialQRWCClientOptions) {
    super();
    
    this.options = {
      host: options.host,
      port: options.port ?? 443,
      pollingInterval: options.pollingInterval ?? 350,
      reconnectInterval: options.reconnectInterval ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      connectionTimeout: options.connectionTimeout ?? 10000,
      enableAutoReconnect: options.enableAutoReconnect ?? true
    };
    
    this.logger = createLogger(`official-qrwc-client-${options.host}`);
    this.setupGracefulShutdown();
  }

  /**
   * Connect to Q-SYS Core using the official QRWC library
   */
  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTING || this.connectionState === ConnectionState.CONNECTED) {
      return;
    }
    
    this.setState(ConnectionState.CONNECTING);
    this.logger.info('Connecting to Q-SYS Core using official QRWC library', {
      host: this.options.host,
      port: this.options.port
    });

    try {
      const url = `ws://${this.options.host}:${this.options.port}/qrc-public-api/v0`;
      this.ws = new WebSocket(url);

      // Wait for WebSocket to open
      await this.waitForConnection();

      // Create QRWC instance with the open WebSocket
      this.qrwc = await Qrwc.createQrwc({
        socket: this.ws,
        pollingInterval: this.options.pollingInterval
      });

      this.setState(ConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      
      this.setupWebSocketHandlers();
      
      this.logger.info('Successfully connected to Q-SYS Core using official QRWC library');
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
        { error: errorMsg }
      );
    }
  }

  /**
   * Disconnect from Q-SYS Core
   */
  disconnect(): void {
    this.logger.info('Disconnecting from Q-SYS Core');
    this.shutdownInProgress = true;
    
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      delete this.reconnectTimer;
    }
    
    // Close WebSocket connection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      delete this.ws;
    }
    
    // Clear QRWC instance
    delete this.qrwc;
    
    this.setState(ConnectionState.DISCONNECTED);
    this.emit('disconnected', 'Client disconnect');
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED && 
           this.ws?.readyState === WebSocket.OPEN &&
           this.qrwc !== undefined;
  }

  /**
   * Get the QRWC instance for direct access to components and controls
   */
  getQrwc(): Qrwc<Record<string, string>> | undefined {
    return this.qrwc;
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get component by name
   */
  getComponent(componentName: string) {
    if (!this.qrwc) {
      throw new QSysError('Not connected to Q-SYS Core', QSysErrorCode.CONNECTION_FAILED);
    }
    return this.qrwc.components[componentName];
  }

  /**
   * Get control from a component
   */
  getControl(componentName: string, controlName: string) {
    const component = this.getComponent(componentName);
    if (!component) {
      throw new QSysError(`Component '${componentName}' not found`, QSysErrorCode.COMMAND_FAILED);
    }
    return component.controls[controlName];
  }

  /**
   * Set control value
   */
  async setControlValue(componentName: string, controlName: string, value: number | string | boolean): Promise<void> {
    const control = this.getControl(componentName, controlName);
    if (!control) {
      throw new QSysError(`Control '${controlName}' not found on component '${componentName}'`, QSysErrorCode.COMMAND_FAILED);
    }
    
    await control.update(value);
    this.logger.debug('Control value updated', { componentName, controlName, value });
  }

  /**
   * Get control value
   */
  getControlValue(componentName: string, controlName: string) {
    const control = this.getControl(componentName, controlName);
    if (!control) {
      throw new QSysError(`Control '${controlName}' not found on component '${componentName}'`, QSysErrorCode.COMMAND_FAILED);
    }
    
    return control.state;
  }

  /**
   * Listen for control updates
   */
  onControlUpdate(componentName: string, controlName: string, listener: (state: unknown) => void): void {
    const control = this.getControl(componentName, controlName);
    if (!control) {
      throw new QSysError(`Control '${controlName}' not found on component '${componentName}'`, QSysErrorCode.COMMAND_FAILED);
    }
    
    control.on('update', listener);
    this.logger.debug('Added control update listener', { componentName, controlName });
  }

  /**
   * Remove control update listener
   */
  offControlUpdate(componentName: string, controlName: string, listener: (state: unknown) => void): void {
    const control = this.getControl(componentName, controlName);
    if (control) {
      control.removeListener('update', listener);
      this.logger.debug('Removed control update listener', { componentName, controlName });
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
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('error', (error) => {
      this.logger.error('WebSocket error', { error: error.message });
      this.emit('error', error);
    });

    this.ws.on('close', (code, reason) => {
      this.logger.info('WebSocket connection closed', { 
        code, 
        reason: reason.toString() 
      });
      
      if (this.connectionState === ConnectionState.CONNECTED) {
        this.setState(ConnectionState.DISCONNECTED);
        this.emit('disconnected', `Connection closed: ${code} ${String(reason)}`);
      }
      
      // Clean up QRWC instance
      delete this.qrwc;
      
      if (!this.shutdownInProgress && this.options.enableAutoReconnect) {
        this.scheduleReconnect();
      }
    });
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
} 