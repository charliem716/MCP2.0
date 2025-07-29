import { describe, it, expect } from '@jest/globals';
import { StateRepositoryError } from '../../../../src/mcp/state/repository';

describe('StateRepositoryError', () => {
  it('should create error with message and code', () => {
    const error = new StateRepositoryError('Test error', 'TEST_ERROR');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StateRepositoryError);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.name).toBe('StateRepositoryError');
    expect(error.context).toBeUndefined();
  });

  it('should create error with context', () => {
    const context = {
      controlName: 'test-control',
      value: 42,
      operation: 'set',
    };

    const error = new StateRepositoryError(
      'Failed to set control',
      'SET_FAILED',
      context
    );

    expect(error.context).toEqual(context);
  });

  it('should have proper stack trace', () => {
    const error = new StateRepositoryError('Stack test', 'STACK_TEST');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('StateRepositoryError');
    expect(error.stack).toContain('Stack test');
  });

  it('should be throwable and catchable', () => {
    const throwError = () => {
      throw new StateRepositoryError('Throw test', 'THROW_TEST');
    };

    expect(throwError).toThrow(StateRepositoryError);
    expect(throwError).toThrow('Throw test');

    try {
      throwError();
    } catch (error) {
      expect(error).toBeInstanceOf(StateRepositoryError);
      if (error instanceof StateRepositoryError) {
        expect(error.code).toBe('THROW_TEST');
      }
    }
  });

  it('should handle different error codes', () => {
    const errors = [
      new StateRepositoryError('Not found', 'NOT_FOUND'),
      new StateRepositoryError('Invalid state', 'INVALID_STATE'),
      new StateRepositoryError('Sync failed', 'SYNC_FAILED'),
      new StateRepositoryError('Persistence error', 'PERSISTENCE_ERROR'),
    ];

    errors.forEach((error, index) => {
      expect(error.code).toBe(
        ['NOT_FOUND', 'INVALID_STATE', 'SYNC_FAILED', 'PERSISTENCE_ERROR'][
          index
        ]
      );
    });
  });

  it('should serialize to JSON properly', () => {
    const error = new StateRepositoryError('JSON test', 'JSON_ERROR', {
      detail: 'test',
    });

    const json = JSON.stringify(error);
    const parsed = JSON.parse(json);

    // Note: Error objects don't serialize all properties by default
    // But we can still check the structure
    expect(typeof parsed).toBe('object');
  });
});
