/**
 * Official Q-SYS QRWC Client Wrapper
 * Modern WebSocket-based interface using the official @q-sys/qrwc library
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Qrwc } from '@q-sys/qrwc';
import { createLogger, type Logger } from '../shared/utils/logger.js';
import { getCorrelationId } from '../shared/utils/correlation.js';
import { config as envConfig } from '../shared/utils/env.js';
import { ConnectionState } from '../shared/types/common.js';
import { QSysError, QSysErrorCode, type ErrorContext } from '../shared/types/errors.js';
import { ConnectionManager, type ConnectionHealth } from './connection/ConnectionManager.js';

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
  logger?: Logger;
}

/**
 * Events emitted by the Official QRWC Client
 */
export interface OfficialQRWCClientEvents {
  connected: [data: { requiresCacheInvalidation: boolean; downtimeMs: number }];
  disconnected: [reason: string];
  reconnecting: [data: { attempt: number }];
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
  private options: Required<Omit<OfficialQRWCClientOptions, 'logger'>>;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private shutdownInProgress = false;
  private disconnectTime: Date | null = null;
  private shutdownHandler?: (() => void) | undefined;
  private signalHandlersInstalled = false;
  private connectionManager: ConnectionManager;

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

    // Use provided logger or create a new one
    const noop = () => { /* no-op */ };
    const fallbackLogger: Logger = { 
      info: noop, 
      error: noop, 
      warn: noop, 
      debug: noop,
      child: () => fallbackLogger,
      setContext: () => { /* no-op */ },
    };
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- createLogger might return undefined in test environment
      this.logger = options.logger ?? createLogger(`official-qrwc-client-${options.host}`) ?? fallbackLogger;
    } catch (error) {
      // Fallback for test environment where logger creation might fail
      this.logger = fallbackLogger;
    }

    // Initialize connection manager with resilience features
    this.connectionManager = new ConnectionManager({
      maxRetries: this.options.maxReconnectAttempts,
      initialRetryDelay: this.options.reconnectInterval,
      connectionTimeout: this.options.connectionTimeout,
      logger: this.logger.child({ component: 'connection-manager' }),
    });

    // Forward retry events from connection manager
    this.connectionManager.on('retry', (attempt, delay) => {
      this.emit('reconnecting', { attempt });
    });

    this.connectionManager.on('health_check', (isHealthy) => {
      if (!isHealthy && this.connectionState === ConnectionState.CONNECTED) {
        this.logger.warn('Connection health degraded');
      }
    });
    
    this.setupGracefulShutdown();
  }

  /**
   * Connect to Q-SYS Core using the official QRWC library with resilience
  // eslint-disable-next-line max-statements -- Complex connection sequence with error handling   */
  async connect(): Promise<void> {
    if (
      this.connectionState === ConnectionState.CONNECTING ||
      this.connectionState === ConnectionState.CONNECTED
    ) {
      return;
    }

    this.logger.info('Connecting to Q-SYS Core using official QRWC library', {
      host: this.options.host,
      port: this.options.port,
    });

    // Use connection manager for resilient connection
    if (this.options.enableAutoReconnect) {
      try {
        await this.connectionManager.connectWithRetry(async () => {
          await this.performConnection();
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        throw new QSysError(
          'Failed to connect to Q-SYS Core',
          QSysErrorCode.CONNECTION_FAILED,
          { error: errorMsg }
        );
      }
    } else {
      // Direct connection without retry logic
      await this.performConnection();
    }
  }

  /**
   * Perform the actual connection to Q-SYS Core
   */
  private async performConnection(): Promise<void> {
    const url = `wss://${this.options.host}:${this.options.port}/qrc-public-api/v0`;
    
    // Set state to connecting
    this.setState(ConnectionState.CONNECTING);
    
    try {
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

      this.reconnectAttempts = 0;
      this.setState(ConnectionState.CONNECTED);
      this.handleConnectionSuccess();
    } catch (error) {
      // Clean up WebSocket if connection failed
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.close();
        delete this.ws;
      }
      this.setState(ConnectionState.DISCONNECTED);
      throw error;
    }
  }

  /**
   * Handle successful connection
   */
  private handleConnectionSuccess(): void {
    // Calculate downtime and emit appropriate event
    const downtime = this.disconnectTime
      ? Date.now() - this.disconnectTime.getTime()
      : 0;

    const correlationId = getCorrelationId();

    if (downtime > 0) {
      this.logger.info('Q-SYS Core reconnected after downtime', {
        downtimeMs: downtime,
        requiresCacheInvalidation: downtime > 30000,
        correlationId,
        component: 'qrwc.client'
      });
    }

    this.setupWebSocketHandlers();

    this.logger.info('Successfully connected to Q-SYS Core using official QRWC library', {
      correlationId,
      component: 'qrwc.client',
      host: this.options.host,
      port: this.options.port
    });

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
  }

  /**
   * Disconnect from Q-SYS Core
   */
  disconnect(): void {
    this.logger.debug('disconnect() called');
    
    // Always clean up signal handlers, even if already disconnected
    this.removeGracefulShutdownHandlers();
    
    // Prevent multiple disconnect calls
    if (
      this.shutdownInProgress ||
      this.connectionState === ConnectionState.DISCONNECTED
    ) {
      this.logger.debug('Already disconnected');
      return;
    }

    this.setState(ConnectionState.DISCONNECTING);
    this.logger.info('Disconnecting from Q-SYS Core', {
      correlationId: getCorrelationId(),
      component: 'qrwc.client'
    });
    this.shutdownInProgress = true;

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      delete this.reconnectTimer;
    }

    // Disconnect connection manager
    this.connectionManager.disconnect();

    // Close QRWC instance first
    if (this.qrwc) {
      try {
        this.qrwc.close();
      } catch (error) {
        this.logger.debug('Error closing QRWC instance', { error });
      }
      delete this.qrwc;
    }

    // Close WebSocket connection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      delete this.ws;
    }

    this.setState(ConnectionState.DISCONNECTED);
    this.emit('disconnected', 'Client disconnect');

    this.logger.info('Disconnected from Q-SYS Core', {
      correlationId: getCorrelationId(),
      component: 'qrwc.client'
    });

    // Reset shutdown flag to allow future connections
    this.shutdownInProgress = false;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.connectionState;
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
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
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
          const dataStr = typeof data === 'string' ? data : 
            data instanceof Buffer ? data.toString('utf8') : 
            data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') :
            JSON.stringify(data);
          const response = JSON.parse(dataStr) as { id?: string | number; error?: unknown; result?: unknown };
          if (response.id === id) {
            clearTimeout(timeout);
            this.ws?.off('message', messageHandler);

            if (response.error) {
              const errorObj = response.error as { message?: string };
              reject(
                new QSysError(
                  `Command failed: ${errorObj.message ?? 'Unknown error'}`,
                  QSysErrorCode.COMMAND_FAILED,
                  response.error as ErrorContext
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

      ws.on('message', messageHandler);
      ws.send(message);

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
        // Clean up event listeners before rejecting
        this.ws?.removeAllListeners('open');
        this.ws?.removeAllListeners('error');
        reject(new Error('Connection timeout'));
      }, this.options.connectionTimeout);

      const handleOpen = () => {
        clearTimeout(timeout);
        this.ws?.removeListener('error', handleError);
        resolve();
      };

      const handleError = (error: Error) => {
        clearTimeout(timeout);
        this.ws?.removeListener('open', handleOpen);
        reject(error);
      };

      this.ws.once('open', handleOpen);
      this.ws.once('error', handleError);
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
        // Use connection manager for resilient reconnection
        this.connectionManager.connectWithRetry(async () => {
          await this.performConnection();
        }).catch((error) => {
          this.logger.error('Reconnection failed', { error });
        });
      }
    });
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
      void this.disconnect();
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

  /**
   * Get connection health status
   */
  getHealthStatus(): ConnectionHealth {
    return this.connectionManager.getHealthStatus();
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    return this.connectionManager.isHealthy();
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): 'closed' | 'open' | 'half-open' {
    return this.connectionManager.getCircuitBreakerState();
  }

  /**
   * Manually trigger a health check
   */
  checkHealth(): ConnectionHealth {
    return this.connectionManager.checkHealth();
  }
}
