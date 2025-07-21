import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('BUG-054: Q-SYS API Response Type Safety', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  
  it('should have no TS4111 errors in tools directory', () => {
    try {
      const output = execSync('npm run type-check 2>&1', {
        cwd: projectRoot,
        encoding: 'utf8'
      });
      
      const ts4111Count = (output.match(/TS4111/g) || []).length;
      expect(ts4111Count).toBe(0);
    } catch (error: any) {
      // Type check failed - check for TS4111 errors
      const output = error.stdout || error.stderr || '';
      const ts4111Count = (output.match(/TS4111/g) || []).length;
      
      if (ts4111Count > 0) {
        console.log(`Found ${ts4111Count} TS4111 errors`);
        const ts4111Lines = output.split('\n').filter(line => line.includes('TS4111'));
        console.log('TS4111 errors:', ts4111Lines.slice(0, 5).join('\n'));
      }
      
      expect(ts4111Count).toBe(0);
    }
  });
  
  it('should have proper Q-SYS API response types defined', () => {
    const typesFile = path.join(projectRoot, 'src/mcp/types/qsys-api-responses.ts');
    expect(fs.existsSync(typesFile)).toBe(true);
    
    const content = fs.readFileSync(typesFile, 'utf8');
    
    // Check for key interfaces
    expect(content).toMatch(/export interface QSysStatusGetResponse/);
    expect(content).toMatch(/export interface QSysComponentInfo/);
    expect(content).toMatch(/export interface QSysControlGetResponse/);
    expect(content).toMatch(/export interface QSysComponentControlsResponse/);
    
    // Check for proper property definitions
    expect(content).toMatch(/Platform: string;/);
    expect(content).toMatch(/DesignName: string;/);
    expect(content).toMatch(/Status: {[^}]+Code: number;[^}]+String: string;/s);
  });
  
  it('should use dot notation for Q-SYS API properties', () => {
    const statusFile = fs.readFileSync(path.join(projectRoot, 'src/mcp/tools/status.ts'), 'utf8');
    
    // Should use dot notation for API properties
    expect(statusFile).toMatch(/result\.Platform/);
    expect(statusFile).toMatch(/result\.DesignName/);
    expect(statusFile).toMatch(/result\.Status/);
    
    // Should NOT use bracket notation for known API properties
    expect(statusFile).not.toMatch(/result\['Platform'\]/);
    expect(statusFile).not.toMatch(/result\["Platform"\]/);
  });
  
  it('should have no type errors in modified files', () => {
    try {
      const output = execSync('npm run type-check 2>&1', {
        cwd: projectRoot,
        encoding: 'utf8'
      });
      
      // Check for type errors in the specific files we modified
      const modifiedFiles = ['status.ts', 'components.ts', 'controls.ts', 'api-reference.ts'];
      let errorsInModifiedFiles = 0;
      
      modifiedFiles.forEach(file => {
        const regex = new RegExp(`src/mcp/tools/${file}.*error TS4111`, 'g');
        const matches = output.match(regex) || [];
        errorsInModifiedFiles += matches.length;
      });
      
      expect(errorsInModifiedFiles).toBe(0);
    } catch (error: any) {
      // Type check failed - check for TS4111 in our files
      const output = error.stdout || error.stderr || '';
      const modifiedFiles = ['status.ts', 'components.ts', 'controls.ts', 'api-reference.ts'];
      let errorsInModifiedFiles = 0;
      
      modifiedFiles.forEach(file => {
        const regex = new RegExp(`src/mcp/tools/${file}.*error TS4111`, 'g');
        const matches = output.match(regex) || [];
        errorsInModifiedFiles += matches.length;
      });
      
      expect(errorsInModifiedFiles).toBe(0);
    }
  });
});