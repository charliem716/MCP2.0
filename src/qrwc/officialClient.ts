/**
 * Official Q-SYS QRWC Client Wrapper
 * Modern WebSocket-based interface using the official @q-sys/qrwc library
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Qrwc } from '@q-sys/qrwc';
import { createLogger, type Logger } from '../shared/utils/logger.js';
import { config as envConfig } from '../shared/utils/env.js';
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
  connected: [data: { requiresCacheInvalidation: boolean; downtimeMs: number }];
  disconnected: [reason: string];
  reconnecting: [attempt: number];
  error: [error: Error];
  state_change: [state: ConnectionState];
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
  private disconnectTime: Date | null = null;
  private shutdownHandler?: (() => void) | undefined;
  private signalHandlersInstalled = false;

  constructor(options: OfficialQRWCClientOptions) {
    super();

    this.options = {
      host: options.host,
      port: options.port ?? 443,
      pollingInterval: options.pollingInterval ?? 350,
      reconnectInterval: options.reconnectInterval ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      connectionTimeout: options.connectionTimeout ?? envConfig.performance.qsysConnectionTimeout,
      enableAutoReconnect: options.enableAutoReconnect ?? true,
    };

    this.logger = createLogger(`official-qrwc-client-${options.host}`);
    this.setupGracefulShutdown();
  }

  /**
   * Connect to Q-SYS Core using the official QRWC library
   */
  async connect(): Promise<void> {
    if (
      this.connectionState === ConnectionState.CONNECTING ||
      this.connectionState === ConnectionState.CONNECTED
    ) {
      return;
    }

    this.setState(ConnectionState.CONNECTING);
    this.logger.info('Connecting to Q-SYS Core using official QRWC library', {
      host: this.options.host,
      port: this.options.port,
    });

    try {
      const url = `wss://${this.options.host}:${this.options.port}/qrc-public-api/v0`;
      this.ws = new WebSocket(url, {
        rejectUnauthorized: false, // Allow self-signed certificates
      });

      // Wait for WebSocket to open
      await this.waitForConnection();

      // Create QRWC instance with the open WebSocket
      this.qrwc = await Qrwc.createQrwc({
        socket: this.ws,
        pollingInterval: this.options.pollingInterval,
      });

      this.setState(ConnectionState.CONNECTED);
      this.reconnectAttempts = 0;

      // Calculate downtime and emit appropriate event
      const downtime = this.disconnectTime
        ? Date.now() - this.disconnectTime.getTime()
        : 0;

      if (downtime > 0) {
        this.logger.info('Q-SYS Core reconnected after downtime', {
          downtimeMs: downtime,
          requiresCacheInvalidation: downtime > 30000,
        });
      }

      this.setupWebSocketHandlers();

      this.logger.info(
        'Successfully connected to Q-SYS Core using official QRWC library'
      );

      // Emit appropriate event based on downtime
      if (downtime > 30000) {
        this.emit('connected', {
          requiresCacheInvalidation: true,
          downtimeMs: downtime,
        });
      } else {
        this.emit('connected', {
          requiresCacheInvalidation: false,
          downtimeMs: downtime,
        });
      }

      this.disconnectTime = null;
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
    // Always clean up signal handlers, even if already disconnected
    this.removeGracefulShutdownHandlers();
    
    // Prevent multiple disconnect calls
    if (
      this.shutdownInProgress ||
      this.connectionState === ConnectionState.DISCONNECTED
    ) {
      this.logger.debug('Already disconnected or shutting down');
      return;
    }

    this.logger.debug('Disconnecting from Q-SYS Core...');
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

    this.logger.info('Disconnected successfully from Q-SYS Core');

    // Reset shutdown flag to allow future connections
    this.shutdownInProgress = false;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return (
      this.connectionState === ConnectionState.CONNECTED &&
      this.ws?.readyState === WebSocket.OPEN &&
      this.qrwc !== undefined
    );
  }

  /**
   * Get the QRWC instance for direct access to components and controls
   */
  getQrwc(): Qrwc<Record<string, string>> | undefined {
    return this.qrwc;
  }

  /**
   * Send a raw command through the WebSocket
   * Used for commands not directly supported by the QRWC library
   */
  async sendRawCommand(method: string, params: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new QSysError(
        'WebSocket not connected',
        QSysErrorCode.CONNECTION_FAILED
      );
    }

    return new Promise((resolve, reject) => {
      const id = Date.now();
      const message = JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id,
      });

      const timeout = setTimeout(() => {
        reject(
          new QSysError(
            `Command timeout: ${method}`,
            QSysErrorCode.COMMAND_FAILED
          )
        );
      }, 5000);

      const messageHandler = (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === id) {
            clearTimeout(timeout);
            this.ws?.off('message', messageHandler);

            if (response.error) {
              reject(
                new QSysError(
                  `Command failed: ${response.error.message}`,
                  QSysErrorCode.COMMAND_FAILED,
                  response.error
                )
              );
            } else {
              resolve(response.result);
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      this.ws!.on('message', messageHandler);
      this.ws!.send(message);

      this.logger.debug('Sent raw command', { method, params });
    });
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get connection options (host and port)
   */
  getConnectionOptions(): { host: string; port: number } {
    return {
      host: this.options.host,
      port: this.options.port,
    };
  }

  /**
   * Get component by name
   */
  getComponent(componentName: string) {
    if (!this.qrwc) {
      throw new QSysError(
        'Not connected to Q-SYS Core',
        QSysErrorCode.CONNECTION_FAILED
      );
    }
    return this.qrwc.components[componentName];
  }

  /**
   * Get control from a component
   */
  getControl(componentName: string, controlName: string) {
    const component = this.getComponent(componentName);
    if (!component) {
      throw new QSysError(
        `Component '${componentName}' not found`,
        QSysErrorCode.COMMAND_FAILED
      );
    }
    return component.controls[controlName];
  }

  /**
   * Set control value
   */
  async setControlValue(
    componentName: string,
    controlName: string,
    value: number | string | boolean
  ): Promise<void> {
    const control = this.getControl(componentName, controlName);
    if (!control) {
      throw new QSysError(
        `Control '${controlName}' not found on component '${componentName}'`,
        QSysErrorCode.COMMAND_FAILED
      );
    }

    await control.update(value);
    this.logger.debug('Control value updated', {
      componentName,
      controlName,
      value,
    });
  }

  /**
   * Get control value
   */
  getControlValue(componentName: string, controlName: string) {
    const control = this.getControl(componentName, controlName);
    if (!control) {
      throw new QSysError(
        `Control '${controlName}' not found on component '${componentName}'`,
        QSysErrorCode.COMMAND_FAILED
      );
    }

    return control.state;
  }

  /**
   * Listen for control updates
   */
  onControlUpdate(
    componentName: string,
    controlName: string,
    listener: (state: unknown) => void
  ): void {
    const control = this.getControl(componentName, controlName);
    if (!control) {
      throw new QSysError(
        `Control '${controlName}' not found on component '${componentName}'`,
        QSysErrorCode.COMMAND_FAILED
      );
    }

    control.on('update', listener);
    this.logger.debug('Added control update listener', {
      componentName,
      controlName,
    });
  }

  /**
   * Remove control update listener
   */
  offControlUpdate(
    componentName: string,
    controlName: string,
    listener: (state: unknown) => void
  ): void {
    const control = this.getControl(componentName, controlName);
    if (control) {
      control.removeListener('update', listener);
      this.logger.debug('Removed control update listener', {
        componentName,
        controlName,
      });
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

      this.ws.once('error', error => {
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

    this.ws.on('error', error => {
      this.logger.error('WebSocket error', { error: error.message });
      this.emit('error', error);
    });

    this.ws.on('close', (code, reason) => {
      this.logger.info('WebSocket connection closed', {
        code,
        reason: reason.toString(),
      });

      if (this.connectionState === ConnectionState.CONNECTED) {
        this.setState(ConnectionState.DISCONNECTED);
        this.disconnectTime = new Date();
        this.emit(
          'disconnected',
          `Connection closed: ${code} ${String(reason)}`
        );
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

    // Switch to long-term reconnection mode after initial attempts
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.logger.warn('Switching to long-term reconnection mode');
      const longTermDelay = 60000; // 1 minute intervals

      this.logger.info('Scheduling long-term reconnection attempt', {
        nextAttempt: new Date(Date.now() + longTermDelay).toISOString(),
      });

      this.emit('reconnecting', this.reconnectAttempts + 1);

      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++; // Continue counting attempts
        this.connect().catch((error: unknown) => {
          this.logger.error('Long-term reconnection attempt failed', {
            error,
            attempt: this.reconnectAttempts,
          });
        });
      }, longTermDelay);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    this.logger.info('Scheduling reconnection attempt', {
      attempt: this.reconnectAttempts,
      delay,
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
    // Avoid duplicate handler installation
    if (this.signalHandlersInstalled) {
      return;
    }

    // Create and store the shutdown handler with bound context
    this.shutdownHandler = () => {
      this.logger.debug('Graceful shutdown signal received');
      this.disconnect();
    };

    // Add handlers
    process.on('SIGTERM', this.shutdownHandler);
    process.on('SIGINT', this.shutdownHandler);
    process.on('beforeExit', this.shutdownHandler);
    
    this.signalHandlersInstalled = true;
    this.logger.debug('Signal handlers installed');
  }
  
  /**
   * Remove graceful shutdown handlers
   */
  private removeGracefulShutdownHandlers(): void {
    if (!this.signalHandlersInstalled || !this.shutdownHandler) {
      return;
    }

    process.removeListener('SIGTERM', this.shutdownHandler);
    process.removeListener('SIGINT', this.shutdownHandler);
    process.removeListener('beforeExit', this.shutdownHandler);
    
    this.signalHandlersInstalled = false;
    this.shutdownHandler = undefined;
    this.logger.debug('Signal handlers removed');
  }
}
