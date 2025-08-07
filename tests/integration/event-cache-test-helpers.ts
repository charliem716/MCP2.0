import { jest } from '@jest/globals';

// Create mock functions that can be used in tests
export const mockFs = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  unlinkSync: jest.fn(),
  statSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    rm: jest.fn(),
  },
  // Add default export for ESM compatibility
  default: {
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(),
    unlinkSync: jest.fn(),
    statSync: jest.fn(),
  }
};

export const mockBetterSqlite3 = jest.fn(() => ({
  prepare: jest.fn((sql: string) => ({
    run: jest.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
    get: jest.fn().mockReturnValue({
      total_events: 0,
      unique_controls: 0,
      unique_change_groups: 0,
      oldest_event: null,
      newest_event: null,
      size: 0
    }),
    all: jest.fn(() => [])
  })),
  exec: jest.fn().mockReturnValue(undefined),
  close: jest.fn(),
  pragma: jest.fn().mockReturnValue(undefined),
  transaction: jest.fn((fn: Function) => fn)
}));