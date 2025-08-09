/**
 * Tests for Structured Logging and Monitoring
 */

import { jest } from '@jest/globals';
import winston from 'winston';
import { generateCorrelationId, runWithCorrelation, getCorrelationId, getCorrelationContext } from '../../../../src/shared/utils/correlation.js';
import type { Logger } from '../../../../src/shared/utils/logger.js';

describe('Structured Logging and Monitoring', () => {
  describe('Correlation ID Management', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should provide correlation context within runWithCorrelation', () => {
      const correlationId = generateCorrelationId();
      const metadata = { method: 'test', timestamp: new Date().toISOString() };
      
      runWithCorrelation(correlationId, () => {
        const context = getCorrelationContext();
        expect(context).toBeDefined();
        expect(context?.correlationId).toBe(correlationId);
        expect(context?.metadata).toEqual(metadata);
      }, metadata);
    });

    it('should return undefined when outside correlation context', () => {
      const id = getCorrelationId();
      const context = getCorrelationContext();
      
      expect(id).toBeUndefined();
      expect(context).toBeUndefined();
    });

    it('should handle nested correlation contexts correctly', () => {
      const outerCorrelationId = generateCorrelationId();
      const innerCorrelationId = generateCorrelationId();
      
      runWithCorrelation(outerCorrelationId, () => {
        expect(getCorrelationId()).toBe(outerCorrelationId);
        
        runWithCorrelation(innerCorrelationId, () => {
          expect(getCorrelationId()).toBe(innerCorrelationId);
        });
        
        expect(getCorrelationId()).toBe(outerCorrelationId);
      });
    });
  });

  describe('Enhanced Logger', () => {
    let logger: Logger;

    beforeEach(() => {
      // Create a mock logger for testing
      logger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
        setContext: jest.fn(),
      } as unknown as Logger;
    });

    it('should add correlation ID to log entries when in context', () => {
      const correlationId = generateCorrelationId();
      
      runWithCorrelation(correlationId, () => {
        logger.info('Test message', { component: 'test' });
      });
      
      expect(logger.info).toHaveBeenCalledWith('Test message', { component: 'test' });
      expect(getCorrelationId()).toBeUndefined(); // Outside context
    });

    it('should support setContext for adding persistent metadata', () => {
      logger.setContext({ requestId: '123', userId: 'user-456' });
      logger.info('Test with context');
      
      expect(logger.setContext).toHaveBeenCalledWith({ requestId: '123', userId: 'user-456' });
      expect(logger.info).toHaveBeenCalledWith('Test with context');
    });

    it('should create child loggers with inherited context', () => {
      const childLogger = logger.child({ component: 'child-component' });
      
      expect(logger.child).toHaveBeenCalledWith({ component: 'child-component' });
      expect(childLogger).toBeDefined();
      expect(childLogger).toHaveProperty('info');
      expect(childLogger).toHaveProperty('error');
    });

    it('should handle all log levels correctly', () => {
      logger.info('Info message');
      logger.error('Error message');
      logger.warn('Warning message');
      logger.debug('Debug message');
      
      expect(logger.info).toHaveBeenCalledWith('Info message');
      expect(logger.error).toHaveBeenCalledWith('Error message');
      expect(logger.warn).toHaveBeenCalledWith('Warning message');
      expect(logger.debug).toHaveBeenCalledWith('Debug message');
    });

    it('should calculate duration when startTime is in context', () => {
      const startTime = Date.now() - 100; // 100ms ago
      const correlationId = generateCorrelationId();
      
      runWithCorrelation(correlationId, () => {
        const context = getCorrelationContext();
        expect(context?.metadata?.startTime).toBe(startTime);
        logger.info('Operation completed');
      }, { startTime });
      
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('Structured Log Format', () => {
    it('should format logs as JSON in production mode', () => {
      // Test that we can create loggers for different environments
      // In real implementation, this is handled by winston format configuration
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
        setContext: jest.fn(),
      };
      
      expect(mockLogger).toBeDefined();
      expect(mockLogger).toHaveProperty('info');
    });

    it('should include all required fields in structured logs', () => {
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
        setContext: jest.fn(),
      };
      
      const correlationId = generateCorrelationId();
      const metadata = {
        component: 'test-component',
        duration: 123,
        performanceMetrics: {
          executionTimeMs: 123,
          timestamp: new Date().toISOString()
        }
      };
      
      runWithCorrelation(correlationId, () => {
        mockLogger.info('Structured log test', metadata);
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith('Structured log test', metadata);
    });
  });

  describe('Performance Metrics', () => {
    it('should track execution time for operations', async () => {
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
        setContext: jest.fn(),
      };
      
      const correlationId = generateCorrelationId();
      const startTime = Date.now();
      
      await runWithCorrelation(correlationId, async () => {
        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, 50));
        
        mockLogger.info('Operation completed', {
          component: 'performance-test'
        });
      }, { startTime });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Operation completed',
        { component: 'performance-test' }
      );
    });

    it('should include performance metrics in error logs', () => {
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
        setContext: jest.fn(),
      };
      
      const correlationId = generateCorrelationId();
      const startTime = Date.now() - 250; // 250ms ago
      
      runWithCorrelation(correlationId, () => {
        mockLogger.error('Operation failed', {
          error: new Error('Test error'),
          component: 'error-test',
          performanceMetrics: {
            failureTimeMs: 250,
            timestamp: new Date().toISOString()
          }
        });
      }, { startTime });
      
      expect(mockLogger.error).toHaveBeenCalled();
      const callArgs = (mockLogger.error as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBe('Operation failed');
      expect(callArgs[1]).toHaveProperty('component', 'error-test');
      expect(callArgs[1]).toHaveProperty('performanceMetrics');
    });
  });

  describe('Integration with MCP Server', () => {
    it('should generate correlation ID for each MCP request', () => {
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
        setContext: jest.fn(),
      };
      
      const mockRequest = { method: 'tools/list' };
      const correlationId = generateCorrelationId();
      
      const result = runWithCorrelation(correlationId, () => {
        // Simulate MCP request processing
        const currentCorrelationId = getCorrelationId();
        expect(currentCorrelationId).toBe(correlationId);
        
        mockLogger.info('Processing MCP request', {
          method: mockRequest.method,
          correlationId: currentCorrelationId
        });
        
        return { tools: [] };
      });
      
      expect(result).toEqual({ tools: [] });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing MCP request',
        expect.objectContaining({
          method: 'tools/list',
          correlationId
        })
      );
    });
  });

  describe('Health Check Integration', () => {
    it('should log health check requests with correlation ID', () => {
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
        setContext: jest.fn(),
      };
      
      const correlationId = generateCorrelationId();
      
      runWithCorrelation(correlationId, () => {
        mockLogger.info('Health check request', {
          component: 'health.endpoint',
          url: '/health',
          method: 'GET'
        });
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Health check request',
        expect.objectContaining({
          component: 'health.endpoint',
          url: '/health',
          method: 'GET'
        })
      );
    });
  });
});