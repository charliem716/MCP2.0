# Module Configuration Documentation

## Overview

This document explains the module configuration setup for the MCP Voice/Text Q-SYS project, addressing the issues identified in BUG-133.

**Status**: ✅ RESOLVED - BUG-133 has been fully fixed.

## Module System

The project uses **ES Modules (ESM)** throughout, as specified by `"type": "module"` in package.json.

### Key Configuration Files

1. **package.json**
   - `"type": "module"` - Enables ESM for the entire project
   - Test scripts include `NODE_OPTIONS='--experimental-vm-modules'` for Jest ESM support

2. **tsconfig.json**
   - `"module": "ESNext"` - Outputs ES modules
   - `"target": "ES2022"` - Targets modern JavaScript
   - `"moduleResolution": "node"` - Node.js module resolution

3. **jest.config.ts**
   - `preset: 'ts-jest/presets/default-esm'` - ESM preset for ts-jest
   - `extensionsToTreatAsEsm: ['.ts']` - Treats TypeScript files as ESM
   - `useESM: true` in transform options

## Import Conventions

### TypeScript Source Files
- All relative imports MUST include the `.js` extension
- Example: `import { something } from './module.js'`
- This is required for ESM compatibility

### Test Files
- Test files use `.test.ts` or `.spec.ts` extensions
- No need for `.mjs` extensions anymore
- Jest is configured to handle TypeScript files as ESM

### Module Name Mapping
Jest's `moduleNameMapper` handles:
- Stripping `.js` extensions: `'^(\\.{1,2}/.*)\\.js$': '$1'`
- Path aliases: `'@/shared/*'`, `'@/mcp/*'`, etc.

## Migration from Mixed Module System

### Before (Mixed System)
- TypeScript files without extensions in imports
- Test files using `.mjs` extensions
- Jest configured for CommonJS
- Inconsistent module resolution
- Multiple scattered configuration files

### After (Pure ESM) - COMPLETED ✅
- All imports use `.js` extensions
- All 64 `.mjs` test files converted to `.test.ts`
- Jest configured for ESM with experimental VM modules
- Consistent module resolution
- Centralized configuration manager in `src/config/index.ts`

## Centralized Configuration

The new `ConfigManager` class provides:
- Single source of truth for all configuration
- Type-safe access to config values
- Environment variable precedence
- File-based config fallback
- Path-based config access (e.g., `configManager.getPath('qsys.host')`)

```typescript
import { configManager, getQSysConfig, getMCPConfig, getAPIConfig } from './config/index.js';

// Get full config
const config = configManager.getConfig();

// Get typed sections
const qsysConfig = getQSysConfig();
const mcpConfig = getMCPConfig();
const apiConfig = getAPIConfig();
```

## Running Tests

Tests now require the experimental VM modules flag:
```bash
NODE_OPTIONS='--experimental-vm-modules' jest
```

This is automatically included in npm scripts:
- `npm test`
- `npm run test:watch`
- `npm run test:coverage`

## Known Limitations

1. **Experimental Warning**: Node.js shows a warning about experimental VM modules. This is expected and will be removed when the feature stabilizes.

2. **Jest Mocking**: Some existing tests using `jest.mock()` may need updates for ESM compatibility. Consider using:
   - Dynamic imports
   - Manual mocks in `__mocks__` directories
   - `jest.unstable_mockModule()` for ESM

3. **IDE Support**: Some IDEs may show warnings about `.js` extensions in TypeScript imports. Configure your IDE to recognize this as valid for ESM.

## Benefits

1. **Consistency**: Single module system throughout the project
2. **Modern Standards**: Using native ES modules
3. **Better Tree Shaking**: ESM enables better optimization
4. **Future Proof**: ESM is the standard going forward
5. **Simplified Configuration**: No more `.mjs` workarounds

## Troubleshooting

### Import Errors
- Ensure all relative imports include `.js` extension
- Check that the file path is correct
- Verify the module exports what you're trying to import

### Jest Errors
- Make sure `NODE_OPTIONS='--experimental-vm-modules'` is set
- Check that test files use `.test.ts` or `.spec.ts` extensions
- Verify jest.config.ts has the ESM preset

### TypeScript Errors
- Ensure tsconfig.json has `"module": "ESNext"`
- Check that `"moduleResolution": "node"` is set
- Verify imports use `.js` extensions