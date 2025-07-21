/**
 * BUG-012 Verification Test
 * Ensures only Phase 1 components are accessible from main entry point
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('BUG-012: Phase Separation Verification', () => {
  const srcPath = path.join(process.cwd(), 'src');
  
  it('should not have Phase 3-4 directories (agent, api, web)', async () => {
    const dirs = await fs.readdir(srcPath);
    
    expect(dirs).not.toContain('agent');
    expect(dirs).not.toContain('api');
    expect(dirs).not.toContain('web');
  });
  
  it('should have Phase 1 components (qrwc, shared)', async () => {
    const dirs = await fs.readdir(srcPath);
    
    expect(dirs).toContain('qrwc');
    expect(dirs).toContain('shared');
  });
  
  it('should have Phase 2 components preserved (mcp)', async () => {
    const dirs = await fs.readdir(srcPath);
    
    // Phase 2 components exist but are not used by default
    expect(dirs).toContain('mcp');
  });
  
  it('should have separate entry points for different phases', async () => {
    const files = await fs.readdir(srcPath);
    
    expect(files).toContain('index.ts');
    expect(files).toContain('index-phase1.ts');
    expect(files).toContain('index-phase2.ts');
  });
  
  it('main index.ts should not import MCP components', async () => {
    const indexContent = await fs.readFile(path.join(srcPath, 'index.ts'), 'utf-8');
    
    expect(indexContent).not.toContain("from './mcp");
    expect(indexContent).not.toContain('MCPServer');
    expect(indexContent).toContain('Phase 1');
    expect(indexContent).toContain('QRWC Client Demo');
  });
  
  it('index-phase2.ts should contain MCP components', async () => {
    const phase2Content = await fs.readFile(path.join(srcPath, 'index-phase2.ts'), 'utf-8');
    
    expect(phase2Content).toContain("from './mcp/server.js'");
    expect(phase2Content).toContain('MCPServer');
  });
});