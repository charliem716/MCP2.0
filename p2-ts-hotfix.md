# TypeScript Hotfix Plan for MCP2.0

**Priority**: P0 - Critical  
**Estimated Time**: 2-4 hours  
**Goal**: Restore TypeScript compilation and achieve 0 type errors

## Phase 1: Fix Build Configuration (15 mins)

### Problem
TypeScript is trying to overwrite `.d.ts` input files with compilation output:
```
error TS5055: Cannot write file because it would overwrite input file
```

### Root Cause Analysis
The TypeScript compiler is including `.d.ts` files from the source directories as both input and output files.

### Solution Steps

1. **Update tsconfig.json**
   ```json
   {
     "compilerOptions": {
       // existing options...
     },
     "exclude": [
       "node_modules",
       "dist",
       "**/*.d.ts",     // Exclude all .d.ts files
       "**/*.test.ts",  // Exclude test files
       "**/*.spec.ts"   // Exclude spec files
     ]
   }
   ```

2. **Alternative: Move Declaration Files**
   If `.d.ts` files need to be included:
   ```bash
   mkdir -p src/types
   mv src/mcp/types/qsys.d.ts src/types/
   mv src/qrwc/types.d.ts src/types/
   mv src/shared/types/mcp.d.ts src/types/
   mv src/shared/types/qsys.d.ts src/types/
   ```

3. **Verify Build**
   ```bash
   npm run build
   ```

## Phase 2: Fix ESLint Configuration (30 mins)

### Problem
ESLint configuration type mismatch preventing proper linting.

### Files to Fix
- `eslint.config.mjs`

### Solution Steps

1. **Update ESLint Config Types**
   ```javascript
   // eslint.config.mjs
   import type { Linter } from 'eslint';
   
   const config: Linter.FlatConfig[] = [
     // configuration
   ];
   
   export default config;
   ```

2. **Ensure TypeScript ESLint Parser Compatibility**
   - Check `@typescript-eslint/parser` version matches `@typescript-eslint/eslint-plugin`
   - Update both to latest compatible versions if needed

## Phase 3: Fix Test File Type Errors (1-2 hours)

### Priority Order (easiest to hardest)

#### 3.1 Missing Type Imports (Quick Fixes)
**Files**: Most test files  
**Pattern**: Missing imports for types used in tests

**Fix Template**:
```typescript
// Add missing imports at the top of test files
import type { ComponentState, ControlState } from '@/shared/types/qsys';
import type { MCPError } from '@/shared/types/mcp';
```

#### 3.2 Mock Implementation Errors
**Files**: 
- `tests/unit/mcp/state/event-cache/buffer.test.ts`
- `tests/unit/mcp/state/event-cache/manager.test.ts`

**Common Issues**:
1. Incorrect mock return types
2. Missing mock properties
3. Type 'never' assignments

**Fix Template**:
```typescript
// Instead of partial mocks
jest.mock('./module', () => ({
  method: jest.fn()
}));

// Use complete mocks with proper types
jest.mock('./module', () => ({
  method: jest.fn().mockReturnValue(expectedType),
  // Include all required properties
}));
```

#### 3.3 Async/Await Test Issues
**Files**: 
- `tests/unit/bugs/bug081-fix.test.ts`
- Event cache test files

**Fix Pattern**:
```typescript
// Incorrect
it('test', () => {
  expect(async () => await method()).rejects.toThrow();
});

// Correct
it('test', async () => {
  await expect(method()).rejects.toThrow();
});
```

## Phase 4: Fix Source File Type Errors (1-2 hours)

### High-Impact Files (Fix First)

1. **Core Server Files**
   - `src/mcp/server.ts`
   - `src/index.ts`
   - `src/index-mcp.ts`

2. **API Layer**
   - `src/api/server.ts`
   - `src/api/websocket/handler.ts`

3. **Q-SYS Integration**
   - `src/qrwc/officialClient.ts`
   - `src/qrwc/types.ts`

### Common Type Error Patterns

#### Pattern 1: Unsafe Any Operations
**Fix**:
```typescript
// Before
const data: any = getData();
console.log(data.property); // unsafe

// After
const data = getData() as KnownType;
// or better
const data = validateData(getData());
```

#### Pattern 2: Non-null Assertions
**Fix**:
```typescript
// Before
const value = map.get(key)!;

// After
const value = map.get(key);
if (!value) {
  throw new Error(`Key ${key} not found`);
}
```

#### Pattern 3: Property Access Errors
**Fix**:
```typescript
// Before
if (obj.nested.property) { }

// After
if (obj?.nested?.property) { }
// or with type guards
if (isValidObject(obj) && obj.nested.property) { }
```

## Phase 5: Verification & Cleanup (30 mins)

### 1. Run Full Type Check
```bash
npm run type-check
```

### 2. Run ESLint
```bash
npm run lint
```

### 3. Run Tests
```bash
npm test
```

### 4. Build Project
```bash
npm run clean
npm run build
```

## Automated Fix Script

Create `scripts/fix-typescript.sh`:
```bash
#!/bin/bash

echo "🔧 Starting TypeScript fixes..."

# Step 1: Update tsconfig
echo "📝 Updating tsconfig.json..."
# Add exclude patterns for .d.ts files

# Step 2: Fix ESLint config
echo "🔍 Fixing ESLint configuration..."
npm install --save-dev @typescript-eslint/parser@latest @typescript-eslint/eslint-plugin@latest

# Step 3: Auto-fix what we can
echo "🤖 Running automatic fixes..."
npx eslint . --fix --ext .ts,.tsx,.mjs

# Step 4: Type check
echo "✅ Running type check..."
npm run type-check

echo "✨ TypeScript fixes complete!"
```

## Success Criteria

- [ ] `npm run build` completes without errors
- [ ] `npm run type-check` shows 0 errors
- [ ] All test files compile successfully
- [ ] ESLint runs without configuration errors
- [ ] No more TS5055 errors

## Rollback Plan

If issues persist:
1. Git stash changes: `git stash`
2. Review specific error messages
3. Apply fixes incrementally
4. Test after each change

## Post-Fix Actions

1. **Update CI/CD**
   - Ensure build pipeline includes type checking
   - Add pre-commit hooks for type safety

2. **Document Changes**
   - Update CLAUDE.md with new type patterns
   - Add troubleshooting guide for common type errors

3. **Team Communication**
   - Share type safety best practices
   - Review any new type patterns introduced

## Notes

- Focus on fixing build-blocking errors first
- Type assertions are acceptable temporarily but should be replaced with proper types
- Keep track of any `@ts-ignore` comments added - these need follow-up
- Consider enabling `strict` mode in tsconfig.json after initial fixes