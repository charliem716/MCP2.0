# Strategy for Fixing Unsafe Any Warnings

## Overview
474 total warnings, with ~300 related to unsafe any usage (63% of all warnings)

## Root Cause Analysis

### 1. API Response Handling (40% of unsafe any)
**Pattern**: `const resp = response as any;`
**Issue**: Casting unknown API responses to `any` instead of using proper types
**Files affected**: All tool files, command handlers

### 2. Zod Internal API Access (20% of unsafe any)
**Pattern**: `(schema as z.ZodTypeAny)._def`
**Issue**: Accessing Zod's internal properties without proper typing
**File affected**: src/mcp/tools/base.ts

### 3. Error Object Handling (15% of unsafe any)
**Pattern**: `error.errors.map((err: any) => ...)`
**Issue**: Using `any` for known error types (Zod errors, Q-SYS errors)
**Files affected**: base.ts, error handlers

### 4. Dynamic Property Access (25% of unsafe any)
**Pattern**: `resp.result.Name`, `component.controls`
**Issue**: Accessing nested properties without type guards
**Files affected**: All files handling Q-SYS responses

## Fix Strategy

### Phase 1: Create Response Type System

1. **Define wrapper types for all API responses**:
```typescript
interface QSysApiResponse<T> {
  result?: T;
  error?: QSysErrorResponse;
  warning?: string;
}

type ComponentGetControlsResponse = QSysApiResponse<QSysComponentControlsResponse>;
type ControlGetResponse = QSysApiResponse<QSysControlGetResponse[]>;
```

2. **Create type guards for responses**:
```typescript
function isComponentControlsResponse(response: unknown): response is ComponentGetControlsResponse {
  return typeof response === 'object' && 
         response !== null && 
         'result' in response;
}
```

### Phase 2: Fix Zod Internal Access

1. **Use zod-to-json-schema library** instead of manual conversion
2. **Or create proper typed interface for Zod internals**:
```typescript
interface ZodDefWithType {
  typeName: z.ZodFirstPartyTypeKind;
  description?: string;
  // ... other properties
}
```

### Phase 3: Type Error Objects

1. **Import and use Zod's error types**:
```typescript
import { z } from 'zod';
// z.ZodError is the proper type
error.errors.map((err: z.ZodIssue) => ...)
```

2. **Create union types for known errors**:
```typescript
type KnownError = z.ZodError | QSysError | ValidationError | Error;
```

### Phase 4: Safe Property Access

1. **Use optional chaining with type narrowing**:
```typescript
if (resp && typeof resp === 'object' && 'result' in resp) {
  const result = resp.result;
  if (result && typeof result === 'object' && 'Name' in result) {
    // Now TypeScript knows result has Name property
  }
}
```

2. **Create helper functions**:
```typescript
function getNestedProperty<T>(obj: unknown, path: string[]): T | undefined {
  // Safe nested property access with type checking
}
```

## Implementation Order

1. **Start with response types** (highest impact)
   - Update qsys-api-responses.ts with wrapper types
   - Add type guards
   - Fix one tool file as proof of concept

2. **Fix error handling** (easiest)
   - Import proper Zod types
   - Remove `any` from error handlers

3. **Address Zod internals** (most complex)
   - Evaluate zod-to-json-schema library
   - Or create typed wrapper

4. **Safe property access** (most tedious)
   - Create helper functions
   - Apply systematically

## Verification Strategy

1. Fix one file completely
2. Run tests to ensure no regression
3. Check ESLint warning reduction
4. Apply pattern to similar files
5. Create automated script for common patterns

## Risk Assessment

- **Low Risk**: Type guards and error typing
- **Medium Risk**: Response type changes (need thorough testing)
- **High Risk**: Zod internal changes (could break with Zod updates)

## Time Estimate

- Response types: 3-4 hours
- Error handling: 1 hour
- Zod internals: 2-3 hours
- Property access: 2-3 hours
- Testing: 2 hours

Total: 10-13 hours