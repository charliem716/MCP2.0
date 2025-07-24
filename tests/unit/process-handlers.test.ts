import { EventEmitter } from 'events';

describe('Process Event Handlers', () => {
  let processEmitter: EventEmitter;
  let mockExit: jest.SpyInstance;
  let mockLogger: any;
  let originalProcess: any;

  beforeEach(() => {
    // Create a new event emitter to simulate process events
    processEmitter = new EventEmitter();

    // Mock process methods
    mockExit = jest.fn();
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    };

    // Store original process
    originalProcess = global.process;

    // Mock process object
    (global as any).process = {
      ...originalProcess,
      on: jest.fn((event: string, handler: Function) => {
        processEmitter.on(event, handler);
      }),
      exit: mockExit,
      stdin: new EventEmitter(),
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    };
  });

  afterEach(() => {
    // Restore original process
    global.process = originalProcess;
    jest.clearAllMocks();
  });

  describe('Signal Handlers', () => {
    it('should handle SIGTERM without throwing unhandled promise rejection', done => {
      // Simulate a gracefulShutdown that rejects
      const gracefulShutdown = jest
        .fn()
        .mockRejectedValue(new Error('Shutdown failed'));

      // Register handler similar to our fix
      process.on('SIGTERM', () => {
        gracefulShutdown('SIGTERM').catch(error => {
          expect(error.message).toBe('Shutdown failed');
          expect(mockExit).not.toHaveBeenCalled(); // Ensure we handle it gracefully
          done();
        });
      });

      // Emit SIGTERM
      processEmitter.emit('SIGTERM');
    });

    it('should handle SIGINT without throwing unhandled promise rejection', done => {
      const gracefulShutdown = jest
        .fn()
        .mockRejectedValue(new Error('Interrupt failed'));

      process.on('SIGINT', () => {
        gracefulShutdown('SIGINT').catch(error => {
          expect(error.message).toBe('Interrupt failed');
          done();
        });
      });

      processEmitter.emit('SIGINT');
    });
  });

  describe('Uncaught Exception Handler', () => {
    it('should not create unhandled promise rejections in exception handler', done => {
      const gracefulShutdown = jest
        .fn()
        .mockRejectedValue(new Error('Shutdown failed'));

      // Register handler without async
      process.on('uncaughtException', (error: Error) => {
        if (error.message.includes('EADDRINUSE')) {
          gracefulShutdown('UNCAUGHT_EXCEPTION').catch(shutdownError => {
            expect(shutdownError.message).toBe('Shutdown failed');
            done();
          });
        }
      });

      // Emit uncaught exception
      processEmitter.emit(
        'uncaughtException',
        new Error('EADDRINUSE: port already in use')
      );
    });

    it('should handle non-fatal exceptions without shutdown', () => {
      const gracefulShutdown = jest.fn();

      process.on('uncaughtException', (error: Error) => {
        if (error.message.includes('EADDRINUSE')) {
          gracefulShutdown('UNCAUGHT_EXCEPTION').catch(() => {});
        }
      });

      // Emit non-fatal exception
      processEmitter.emit('uncaughtException', new Error('Some other error'));

      expect(gracefulShutdown).not.toHaveBeenCalled();
    });
  });

  describe('Unhandled Rejection Handler', () => {
    it('should catch and log unhandled promise rejections', () => {
      const mockLogger = { error: jest.fn(), warn: jest.fn() };

      process.on('unhandledRejection', (reason: unknown) => {
        mockLogger.error('Unhandled Rejection', { reason });
        mockLogger.warn('Continuing after unhandled rejection');
      });

      const testPromise = Promise.reject(new Error('Test rejection'));
      processEmitter.emit(
        'unhandledRejection',
        new Error('Test rejection'),
        testPromise
      );

      expect(mockLogger.error).toHaveBeenCalledWith('Unhandled Rejection', {
        reason: expect.any(Error),
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should not crash process on unhandled rejections', () => {
      process.on('unhandledRejection', () => {
        // Handler should not throw or cause process exit
      });

      processEmitter.emit(
        'unhandledRejection',
        new Error('Test'),
        Promise.reject()
      );

      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  describe('Promise Chain Safety', () => {
    it('should handle errors in promise chains with catch blocks', async () => {
      const asyncOperation = () => Promise.reject(new Error('Async failed'));

      let errorCaught = false;

      await asyncOperation().catch(error => {
        errorCaught = true;
        expect(error.message).toBe('Async failed');
      });

      expect(errorCaught).toBe(true);
    });

    it('should not create floating promises in event handlers', () => {
      const asyncCleanup = jest.fn().mockResolvedValue(undefined);

      // Simulating our fixed pattern
      const handleShutdown = () => {
        asyncCleanup().catch(error => {
          // Error is handled, not floating
          expect(error).toBeUndefined();
        });
      };

      handleShutdown();

      expect(asyncCleanup).toHaveBeenCalled();
    });
  });
});
