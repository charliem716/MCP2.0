# Dependency Injection Refactoring Report

## Overview
This report documents the files that need to be refactored to use dependency injection (DI) for logger instances, based on the successful pattern established in `error-recovery.ts`. This refactoring is necessary to fix failing tests that cannot properly mock ES module imports due to Jest limitations.

## Background
- **Problem**: Jest's ES module mocking with `jest.unstable_mockModule` is unreliable
- **Solution**: Refactor code to use dependency injection for logger instances
- **Success Story**: `error-recovery.ts` was successfully refactored, fixing all 31 tests in `error-recovery.test.ts`

## Files Requiring DI Refactoring

### 1. High Priority - Direct Logger Creation

#### `src/shared/utils/errorHandler.ts`
**Current Implementation:**
```typescript
constructor(config: ErrorHandlerConfig = {}) {
  this.logger = createLogger('ErrorHandler');
  // ...
}
```

**Issues:**
- Creates logger directly in constructor
- Has singleton export: `export const globalErrorHandler = new GlobalErrorHandler();`
- Tests cannot mock the logger import

**Proposed Fix:**
```typescript
export interface ErrorHandlerConfig {
  logger?: Logger;
  // ... existing config
}

constructor(config: ErrorHandlerConfig = {}) {
  this.logger = config.logger ?? createLogger('ErrorHandler');
  // ...
}
```

#### `src/mcp/middleware/security.ts`
**Current Implementation:**
```typescript
constructor(config: SecurityConfig = {}) {
  try {
    this.logger = createLogger('mcp-security');
  } catch {
    // Fallback for test environment
    this.logger = {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
      child: () => this.logger,
    } as Logger;
  }
}
```

**Issues:**
- Creates logger with try-catch workaround
- Indicates existing testing problems
- Hacky fallback pattern

**Proposed Fix:**
```typescript
export interface SecurityConfig {
  logger?: Logger;
  // ... existing config
}

constructor(config: SecurityConfig = {}) {
  this.logger = config.logger ?? createLogger('mcp-security');
  // ...
}
```

### 2. Medium Priority - Test Files Needing Updates

These test files are failing because they don't provide required parameters to constructors:

#### `tests/unit/mcp/middleware/auth.coverage-boost.test.ts`
**Current Issue:**
```typescript
authenticator = new MCPAuthenticator(); // Missing required parameters
```

**Fix:**
```typescript
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

const config = {
  enabled: false,
  // ... other required config
};

authenticator = new MCPAuthenticator(config, mockLogger);
```

#### Other Failing Test Files:
- `tests/unit/mcp/middleware/validation.coverage-boost.test.ts`
- `tests/unit/mcp/server.simple-coverage.test.ts`
- `tests/unit/qrwc/officialClient.coverage-boost.test.ts`

### 3. Already Support DI - No Changes Needed

These files already implement proper dependency injection:

- ✅ `src/shared/utils/error-recovery.ts` - Refactored successfully
- ✅ `src/qrwc/officialClient.ts` - Accepts `logger` in options
- ✅ `src/mcp/middleware/auth.ts` - Requires logger in constructor

### 4. Files to Investigate

Based on grep results, these files import logger and may need DI refactoring:

#### State Management Files:
- `src/mcp/state/factory.ts`
- `src/mcp/state/simple-state-manager.ts`
- `src/mcp/state/lru-cache.ts`

#### QRWC Adapter Files:
- `src/mcp/qrwc/adapter.ts`
- `src/mcp/qrwc/command-handlers.ts`
- `src/mcp/qrwc/validators.ts`
- `src/mcp/qrwc/converters.ts`

#### Infrastructure Files:
- `src/mcp/infrastructure/container.ts`
- `src/mcp/factories/default-factory.ts`

## Refactoring Pattern

### Before (Direct Creation):
```typescript
class MyClass {
  private logger: Logger;
  
  constructor(options: MyOptions) {
    this.logger = createLogger('MyClass');
  }
}
```

### After (Dependency Injection):
```typescript
interface MyOptions {
  logger?: Logger;
  // ... other options
}

class MyClass {
  private logger: Logger;
  
  constructor(options: MyOptions) {
    this.logger = options.logger ?? createLogger('MyClass');
  }
}
```

### Test Pattern:
```typescript
const mockLogger: Logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

const instance = new MyClass({ logger: mockLogger });
```

## Benefits of DI Refactoring

1. **Testability**: Tests can inject mock loggers without complex ES module mocking
2. **Flexibility**: Different logger instances can be used in different contexts
3. **Maintainability**: Cleaner separation of concerns
4. **Performance**: No need for complex mocking setup in tests
5. **Reliability**: Avoids flaky `jest.unstable_mockModule` behavior

## Recommended Action Plan

1. **Phase 1**: Refactor high-priority files (`errorHandler.ts`, `security.ts`)
2. **Phase 2**: Fix failing test files by providing required parameters
3. **Phase 3**: Investigate and refactor remaining files that create loggers directly
4. **Phase 4**: Update any singleton patterns to support DI
5. **Phase 5**: Run full test suite to verify coverage meets 80% threshold

## Success Metrics

- All tests pass without ES module mocking errors
- Test coverage reaches or exceeds 80% threshold
- No `jest.mock` or `jest.unstable_mockModule` calls for logger imports
- Clean, consistent DI pattern across the codebase