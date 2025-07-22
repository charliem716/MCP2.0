import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { QRWCClientAdapter } from '../../src/mcp/qrwc/adapter';
import { MCPServer } from '../../src/mcp/server';
import { CoreCache } from '../../src/mcp/state/cache/core-cache';
import { PersistenceManager } from '../../src/mcp/state/persistence/manager';
import { BaseQSysTool } from '../../src/mcp/tools/base';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

describe('BUG-052: Integration Test - Type Safety in Core Components', () => {
  const testDir = path.join(__dirname, 'test-persistence');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should handle unknown types properly in adapter', async () => {
    // This would normally fail with TS2304/TS18046 errors
    const mockClient = {
      isConnected: () => true,
      getQrwc: () => null,
      getComponent: () => null,
      setControlValue: jest.fn()
    };
    
    const adapter = new QRWCClientAdapter(mockClient as any);
    
    // Test handling of unknown control specifications
    const result = await adapter.sendCommand('Control.SetValues', {
      Controls: [
        { Name: 'test.control', Value: 123 },
        { name: 'other.control', value: 'test' } // lowercase variant
      ]
    });
    
    expect(result).toBeDefined();
  });

  it('should use correct LRUCache method (delete not remove)', async () => {
    const cache = new CoreCache({ maxSize: 10 });
    await cache.initialize();
    
    // Add a control
    await cache.set({
      name: 'test.control',
      value: 42,
      timestamp: new Date(),
      source: 'user'
    });
    
    // This used to fail with TS2339: Property 'remove' does not exist
    const removed = await cache.removeControl('test.control');
    expect(removed).toBe(true);
    
    // Verify it's gone
    const control = await cache.get('test.control');
    expect(control).toBeNull();
  });

  it('should handle event handlers with proper signatures', () => {
    // This would fail with TS2345 errors if not fixed
    const config = {
      name: 'test-server',
      version: '1.0.0',
      qrwc: {
        host: 'localhost',
        port: 443
      }
    };
    
    const server = new MCPServer(config);
    
    // Test that error handlers work
    process.emit('unhandledRejection', new Error('test'), Promise.resolve());
    
    // Server should still be created successfully
    expect(server).toBeDefined();
    expect(server.getStatus().name).toBe('test-server');
  });

  it('should handle persistence with proper type guards', async () => {
    const manager = new PersistenceManager({
      filePath: path.join(testDir, 'test-state.json'),
      saveInterval: 1000
    });
    
    // Create test state file with generic object
    const testState = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      controlCount: 1,
      controls: {
        'test.control': { value: 42 }
      }
    };
    
    fs.writeFileSync(
      path.join(testDir, 'test-state.json'),
      JSON.stringify(testState)
    );
    
    // This would fail with TS2339 errors on generic object
    const loaded = await manager.load();
    expect(loaded).toBeDefined();
    expect(loaded.size).toBe(1);
  });

  it('should handle Zod schema introspection safely', () => {
    // Test schema that would cause TS2352 errors
    const TestSchema = z.object({
      name: z.string(),
      value: z.number()
    });
    
    class TestTool extends BaseQSysTool<z.infer<typeof TestSchema>> {
      constructor() {
        super({
          name: 'test-tool',
          description: 'Test tool',
          paramsSchema: TestSchema
        });
      }
      
      async execute(args: z.infer<typeof TestSchema>) {
        return this.success({
          result: `${args.name}: ${args.value}`
        });
      }
    }
    
    const tool = new TestTool();
    const schema = tool.inputSchema;
    
    // Should have proper schema structure without type errors
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
    expect(schema.properties.name).toBeDefined();
    expect(schema.properties.value).toBeDefined();
    expect(schema.required).toContain('name');
    expect(schema.required).toContain('value');
  });
});