import { describe, it, expect } from '@jest/globals';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('BUG-052: Critical TypeScript Type Safety Verification', () => {
  it('should have no TS2304 errors (undefined variables)', () => {
    try {
      const output = execSync('npm run type-check 2>&1', { encoding: 'utf8' });
      const ts2304Errors = output.match(/TS2304/g) || [];
      expect(ts2304Errors.length).toBe(0);
    } catch (error) {
      const output = (error as any).stdout || '';
      const ts2304Errors = output.match(/TS2304/g) || [];
      expect(ts2304Errors.length).toBe(0);
    }
  });

  it('should have no TS18046 errors (unknown type access)', () => {
    try {
      const output = execSync('npm run type-check 2>&1', { encoding: 'utf8' });
      const ts18046Errors = output.match(/TS18046/g) || [];
      expect(ts18046Errors.length).toBe(0);
    } catch (error) {
      const output = (error as any).stdout || '';
      const ts18046Errors = output.match(/TS18046/g) || [];
      expect(ts18046Errors.length).toBe(0);
    }
  });

  it('should verify LRUCache uses delete method instead of remove', () => {
    const coreCache = fs.readFileSync(
      path.join(__dirname, '../../../src/mcp/state/cache/core-cache.ts'),
      'utf8'
    );
    expect(coreCache).toContain('this.cache.delete(controlName)');
    expect(coreCache).not.toContain('this.cache.remove(controlName)');
  });

  it('should verify error handlers use spread parameters', () => {
    const server = fs.readFileSync(
      path.join(__dirname, '../../../src/mcp/server.ts'),
      'utf8'
    );
    expect(server).toContain('(...args: unknown[])');
    expect(server).not.toContain('(error: Error) =>');
  });

  it('should verify persistence manager uses bracket notation', () => {
    const persistence = fs.readFileSync(
      path.join(__dirname, '../../../src/mcp/state/persistence/manager.ts'),
      'utf8'
    );
    expect(persistence).toContain("stateObj['version']");
    expect(persistence).toContain("stateObj['timestamp']");
    expect(persistence).toContain("stateObj['controlCount']");
    expect(persistence).toContain("stateObj['controls']");
  });

  it('should verify adapter.ts has no undefined variables', () => {
    const adapter = fs.readFileSync(
      path.join(__dirname, '../../../src/mcp/qrwc/adapter.ts'),
      'utf8'
    );
    // Should use ctrl or name, not ctrlObj
    expect(adapter).not.toContain('ctrlObj.Name');
    expect(adapter).not.toContain('ctrlObj.name');
  });

  it('should verify Zod type handling uses instanceof checks', () => {
    const baseTool = fs.readFileSync(
      path.join(__dirname, '../../../src/mcp/tools/base.ts'),
      'utf8'
    );
    expect(baseTool).toContain('instanceof z.ZodObject');
    expect(baseTool).not.toContain('as z.ZodObject<Record<string, z.ZodTypeAny>>)._def');
  });
});