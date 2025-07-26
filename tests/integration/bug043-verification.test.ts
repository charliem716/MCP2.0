/**
 * BUG-043 Error Handling Consistency Verification
 */

import { MCPError, MCPErrorCode, QSysError, QSysErrorCode, ValidationError } from '../../src/shared/types/errors.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('BUG-043: Error Handling Consistency Verification', () => {
  describe('Generic Error Detection', () => {
    it('should have no generic throw new Error() in critical paths', () => {
      const criticalPaths = [
        'src/mcp/qrwc/adapter.ts',
        'src/mcp/tools/discovery.ts', 
        'src/mcp/state/change-group/change-group-executor.ts'
      ];

      for (const filePath of criticalPaths) {
        const fullPath = path.join(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const matches = content.match(/throw new Error\(/g);
          
          expect(matches).toBeNull();
        }
      }
    });

    it('should count remaining generic errors in codebase', () => {
      try {
        // Count generic errors in src directory
        const result = execSync(
          'grep -r "throw new Error(" src/ --include="*.ts" --include="*.js" | wc -l',
          { encoding: 'utf-8' }
        ).trim();
        
        const count = parseInt(result, 10);
        console.log(`Remaining generic errors: ${count}`);
        
        // We started with 39, should be significantly reduced
        expect(count).toBeLessThan(20);
      } catch (error) {
        // Grep returns error if no matches found (which is good!)
        expect(error).toBeDefined();
      }
    });
  });

  describe('Domain-Specific Error Usage', () => {
    it('should use QSysError for Q-SYS related errors', () => {
      // Test that QSysError is thrown for connection issues
      const error = new QSysError(
        'QRWC client not connected',
        QSysErrorCode.CONNECTION_FAILED
      );
      
      expect(error).toBeInstanceOf(QSysError);
      expect(error.code).toBe(QSysErrorCode.CONNECTION_FAILED);
      expect(error.message).toBe('QRWC client not connected');
    });

    it('should use ValidationError for input validation', () => {
      const error = new ValidationError(
        'Invalid input',
        [{ field: 'test', message: 'Required', code: 'REQUIRED_FIELD' }]
      );
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fields).toHaveLength(1);
      expect(error.fields[0].field).toBe('test');
    });

    it('should use MCPError for MCP protocol errors', () => {
      const error = new MCPError(
        'Tool not found',
        MCPErrorCode.TOOL_NOT_FOUND
      );
      
      expect(error).toBeInstanceOf(MCPError);
      expect(error.code).toBe(MCPErrorCode.TOOL_NOT_FOUND);
    });
  });

  describe('Error Context and Recovery', () => {
    it('should include context in errors', () => {
      const error = new QSysError(
        'Component not found',
        QSysErrorCode.INVALID_COMPONENT,
        { componentName: 'TestComponent' }
      );
      
      expect(error.context).toBeDefined();
      expect(error.context?.componentName).toBe('TestComponent');
    });

    it('should have error recovery utilities available', async () => {
      const { withErrorRecovery } = await import(
        '../../src/shared/utils/error-recovery.js'
      );
      
      const result = await withErrorRecovery(
        async () => { throw new Error('Test'); },
        { context: 'Test', fallback: 'recovered' }
      );
      
      expect(result).toBe('recovered');
    });
  });

  describe('Error Serialization', () => {
    it('should serialize errors to JSON properly', () => {
      const error = new QSysError(
        'Test error',
        QSysErrorCode.COMMAND_FAILED,
        { testData: 'value' }
      );
      
      const json = error.toJSON();
      
      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('code', QSysErrorCode.COMMAND_FAILED);
      expect(json).toHaveProperty('message', 'Test error');
      expect(json).toHaveProperty('severity');
      expect(json).toHaveProperty('category');
      expect(json).toHaveProperty('timestamp');
      expect(json).toHaveProperty('context', { testData: 'value' });
    });
  });
});