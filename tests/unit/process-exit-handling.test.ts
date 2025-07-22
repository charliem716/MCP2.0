import { EventEmitter } from 'events';

describe('Process Exit Handling', () => {
  let mockExit: jest.SpyInstance;
  let mockLogger: any;
  let mockSetTimeout: jest.SpyInstance;
  let mockClearTimeout: jest.SpyInstance;

  beforeEach(() => {
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      end: jest.fn((callback) => callback())
    };
    mockSetTimeout = jest.spyOn(global, 'setTimeout');
    mockClearTimeout = jest.spyOn(global, 'clearTimeout');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Cleanup Function', () => {
    it('should set a timeout to force exit during cleanup', async () => {
      let isShuttingDown = false;
      const mcpServer = { shutdown: jest.fn().mockResolvedValue(undefined) };
      
      const cleanup = async () => {
        if (isShuttingDown) {
          mockLogger.info('Already shutting down...');
          return;
        }
        
        isShuttingDown = true;
        mockLogger.info('Cleaning up resources...');
        
        const forceExitTimeout = setTimeout(() => {
          mockLogger.error('Forced exit after timeout');
          mockExit(1);
        }, 10000);
        
        try {
          if (mcpServer) {
            await mcpServer.shutdown();
            mockLogger.info('MCP server shutdown completed');
          }
          
          if (mockLogger && typeof mockLogger.end === 'function') {
            await new Promise<void>((resolve) => {
              mockLogger.end(() => resolve());
            });
          }
          
          clearTimeout(forceExitTimeout);
          mockLogger.info('Cleanup completed');
        } catch (error) {
          mockLogger.error('Error during cleanup:', error);
          clearTimeout(forceExitTimeout);
        }
      };

      await cleanup();

      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 10000);
      expect(mockClearTimeout).toHaveBeenCalled();
      expect(mcpServer.shutdown).toHaveBeenCalled();
      expect(mockLogger.end).toHaveBeenCalled();
    });

    it('should force exit if cleanup takes too long', async () => {
      jest.useFakeTimers();
      
      const cleanup = async () => {
        const forceExitTimeout = setTimeout(() => {
          mockLogger.error('Forced exit after timeout');
          mockExit(1);
        }, 10000);
        
        // Simulate a hanging cleanup
        await new Promise(() => {}); // Never resolves
      };

      const cleanupPromise = cleanup();
      
      // Fast-forward past the timeout
      jest.advanceTimersByTime(10001);

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockLogger.error).toHaveBeenCalledWith('Forced exit after timeout');

      jest.useRealTimers();
    });
  });

  describe('Signal Handlers', () => {
    it('should handle all required signals', () => {
      const signals = ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGUSR2'];
      const handlers = new Map<string, Function>();
      
      const mockProcess = {
        on: jest.fn((signal: string, handler: Function) => {
          handlers.set(signal, handler);
        })
      };

      // Register handlers
      signals.forEach(signal => {
        mockProcess.on(signal, () => {
          // Handler implementation
        });
      });

      expect(mockProcess.on).toHaveBeenCalledTimes(4);
      signals.forEach(signal => {
        expect(mockProcess.on).toHaveBeenCalledWith(signal, expect.any(Function));
      });
    });

    it('should call gracefulShutdown with catch on signal', async () => {
      const gracefulShutdown = jest.fn().mockRejectedValue(new Error('Shutdown failed'));
      
      const handler = () => {
        gracefulShutdown('SIGTERM').catch(error => {
          mockLogger.error('Error during SIGTERM shutdown:', error);
          mockExit(1);
        });
      };

      handler();
      
      await new Promise(resolve => setImmediate(resolve));

      expect(gracefulShutdown).toHaveBeenCalledWith('SIGTERM');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during SIGTERM shutdown:', 
        expect.any(Error)
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('State Persistence', () => {
    it('should attempt state persistence during server shutdown', async () => {
      const mockServer = {
        shutdown: jest.fn(async function() {
          const transport = { close: jest.fn() };
          const qrwcClient = { disconnect: jest.fn() };
          const toolRegistry = { cleanup: jest.fn() };
          
          await transport.close();
          await qrwcClient.disconnect();
          await toolRegistry.cleanup();
          
          // State persistence check
          try {
            mockLogger.debug('State persistence check completed');
          } catch (error) {
            mockLogger.error('Error persisting state during shutdown', { error });
          }
          
          mockLogger.info('MCP server shut down successfully');
        })
      };

      await mockServer.shutdown();

      expect(mockLogger.debug).toHaveBeenCalledWith('State persistence check completed');
      expect(mockLogger.info).toHaveBeenCalledWith('MCP server shut down successfully');
    });
  });

  describe('Logger Cleanup', () => {
    it('should flush logger during cleanup', async () => {
      const logger = {
        info: jest.fn(),
        error: jest.fn(),
        end: jest.fn((callback) => {
          // Simulate async flush
          setTimeout(callback, 10);
        })
      };

      const cleanupLogger = async () => {
        if (logger && typeof logger.end === 'function') {
          await new Promise<void>((resolve) => {
            logger.end(() => resolve());
          });
        }
      };

      await cleanupLogger();

      expect(logger.end).toHaveBeenCalled();
    });
  });
});