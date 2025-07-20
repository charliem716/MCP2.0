import WebSocket from 'ws';
import { QSysError, QSysErrorCode } from '../shared/types/errors.js';
import { createLogger } from '../shared/utils/logger.js';

/**
 * A separate WebSocket client specifically for raw commands
 * This bypasses the QRWC library entirely to avoid conflicts
 */
export class RawCommandClient {
  private ws?: WebSocket;
  private logger;
  private messageHandlers = new Map<number, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(
    private host: string,
    private port: number
  ) {
    this.logger = createLogger(`raw-command-client-${host}`);
  }

  /**
   * Connect to Q-SYS Core
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    const url = `wss://${this.host}:${this.port}/qrc-public-api/v0`;
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        rejectUnauthorized: false // Allow self-signed certificates
      });

      // Set connection timeout
      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new QSysError('Connection timeout', QSysErrorCode.TIMEOUT));
      }, 10000);

      const handleOpen = () => {
        clearTimeout(timeout);
        this.logger.info('Raw command client connected');
        resolve();
      };

      const handleError = (error: Error) => {
        clearTimeout(timeout);
        this.logger.error('Connection error', { error: error.message });
        reject(new QSysError('Failed to connect', QSysErrorCode.CONNECTION_FAILED));
      };

      // Set up handlers immediately after creating WebSocket
      this.setupHandlers();
      
      this.ws.once('open', handleOpen);
      this.ws.once('error', handleError);
    });
  }

  /**
   * Set up message handlers
   */
  private setupHandlers(): void {
    if (!this.ws) return;

    // Handle incoming messages
    this.ws.on('message', (data) => {
      try {
        const msgStr = data.toString();
        this.logger.debug('Received WebSocket message', { 
          message: msgStr.substring(0, 200) 
        });
        
        const response = JSON.parse(msgStr);
        
        // Skip non-response messages (like EngineStatus)
        if (response.id === undefined || response.id === null) {
          this.logger.debug('Received non-response message', { 
            method: response.method,
            hasError: !!response.error,
            hasResult: response.result !== undefined
          });
          // Check if this is a response with null id (Q-SYS bug)
          if (response.result !== undefined || response.error) {
            this.logger.warn('Response with null ID - checking pending handlers');
            // Try to match with the oldest pending handler
            const handlers = Array.from(this.messageHandlers.entries());
            if (handlers.length > 0) {
              const firstHandler = handlers[0];
              if (firstHandler) {
                const [id, handler] = firstHandler;
                this.logger.info('Matching null ID response with pending request', { id });
                clearTimeout(handler.timeout);
                this.messageHandlers.delete(id);
                
                if (response.error) {
                  handler.reject(new QSysError(
                    response.error.message,
                    QSysErrorCode.COMMAND_FAILED,
                    response.error
                  ));
                } else {
                  handler.resolve(response.result);
                }
              }
            }
          }
          return;
        }

        this.logger.info('Received response', { 
          id: response.id,
          hasError: !!response.error,
          hasResult: response.result !== undefined
        });

        // Find and resolve the pending request
        const handler = this.messageHandlers.get(response.id);
        if (handler) {
          clearTimeout(handler.timeout);
          this.messageHandlers.delete(response.id);

          if (response.error) {
            handler.reject(new QSysError(
              response.error.message,
              QSysErrorCode.COMMAND_FAILED,
              response.error
            ));
          } else {
            handler.resolve(response.result);
          }
        } else {
          this.logger.warn('No handler found for response', { 
            id: response.id,
            pendingIds: Array.from(this.messageHandlers.keys())
          });
        }
      } catch (error) {
        this.logger.debug('Failed to parse message', { 
          error,
          data: data.toString().substring(0, 100)
        });
      }
    });

    this.ws.on('error', (error) => {
      this.logger.error('WebSocket error', { error: error.message });
    });

    this.ws.on('close', () => {
      this.logger.info('WebSocket closed');
      // Reject all pending requests
      this.messageHandlers.forEach((handler) => {
        clearTimeout(handler.timeout);
        handler.reject(new QSysError(
          'Connection closed',
          QSysErrorCode.CONNECTION_FAILED
        ));
      });
      this.messageHandlers.clear();
    });
  }

  /**
   * Send a raw command
   */
  async sendCommand(method: string, params: any = {}, timeoutMs: number = 5000): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Try to reconnect
      await this.connect();
    }

    const id = Date.now() + Math.floor(Math.random() * 1000);
    const message = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageHandlers.delete(id);
        this.logger.error('Command timeout', { 
          method, 
          id,
          pendingHandlers: this.messageHandlers.size 
        });
        reject(new QSysError(
          `Command timeout: ${method}`,
          QSysErrorCode.COMMAND_FAILED
        ));
      }, timeoutMs);

      this.messageHandlers.set(id, { resolve, reject, timeout });
      
      const messageStr = JSON.stringify(message);
      this.ws!.send(messageStr);
      this.logger.info('Sent raw command', { 
        method, 
        id, 
        message: messageStr 
      });
    });
  }

  /**
   * Disconnect from Q-SYS Core
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      delete this.ws;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}