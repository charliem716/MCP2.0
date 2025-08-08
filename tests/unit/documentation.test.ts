import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Documentation', () => {
  const docsPath = path.join(process.cwd(), 'docs');

  describe('Required documentation files', () => {
    const requiredDocs = [
      'DEPLOYMENT.md',
      'TROUBLESHOOTING.md',
      'CONFIGURATION.md',
      'api/MCP_TOOLS.md',
    ];

    requiredDocs.forEach(doc => {
      it(`should have ${doc} file`, () => {
        const filePath = path.join(docsPath, doc);
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it(`${doc} should not be empty`, () => {
        const filePath = path.join(docsPath, doc);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          expect(content.length).toBeGreaterThan(100);
        }
      });

      it(`${doc} should contain proper markdown headers`, () => {
        const filePath = path.join(docsPath, doc);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          expect(content).toMatch(/^#\s+.+/m); // Has at least one H1 header
        }
      });
    });
  });

  describe('Documentation content validation', () => {
    it('DEPLOYMENT.md should contain essential sections', () => {
      const filePath = path.join(docsPath, 'DEPLOYMENT.md');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for essential sections
        expect(content).toContain('Prerequisites');
        expect(content).toContain('Environment Variables');
        expect(content).toContain('Installation Steps');
        expect(content).toContain('Deployment Methods');
        expect(content).toContain('Health Checks');
        expect(content).toContain('PM2');
        expect(content).toContain('systemd');
        expect(content).toContain('Docker');
      }
    });

    it('TROUBLESHOOTING.md should contain common issues', () => {
      const filePath = path.join(docsPath, 'TROUBLESHOOTING.md');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for common troubleshooting sections
        expect(content).toContain('Connection Issues');
        expect(content).toContain('Performance Issues');
        expect(content).toContain('Event Monitoring Issues');
        expect(content).toContain('Diagnostic Commands');
        expect(content).toContain('Solutions');
      }
    });

    it('api/MCP_TOOLS.md should document all MCP tools', () => {
      const filePath = path.join(docsPath, 'api', 'MCP_TOOLS.md');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for tool documentation
        expect(content).toContain('list_components');
        expect(content).toContain('get_control_values');
        expect(content).toContain('set_control_values');
        expect(content).toContain('create_change_group');
        expect(content).toContain('query_change_events');
        expect(content).toContain('Parameters');
        expect(content).toContain('Example');
        expect(content).toContain('Error Handling');
      }
    });

    it('CONFIGURATION.md should explain all config options', () => {
      const filePath = path.join(docsPath, 'CONFIGURATION.md');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for configuration sections
        expect(content).toContain('qsys-core.config.json');
        expect(content).toContain('.env');
        expect(content).toContain('Configuration');
      }
    });
  });

  describe('README.md documentation links', () => {
    it('should have links to all new documentation', () => {
      const readmePath = path.join(process.cwd(), 'README.md');
      if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf-8');
        
        // Check for documentation links
        expect(content).toContain('[**Production Deployment Guide**](docs/DEPLOYMENT.md)');
        expect(content).toContain('[**MCP Tools API Reference**](docs/api/MCP_TOOLS.md)');
        expect(content).toContain('[**Troubleshooting Guide**](docs/TROUBLESHOOTING.md)');
        expect(content).toContain('[**Configuration Reference**](docs/CONFIGURATION.md)');
        expect(content).toContain('Production & Operations');
      }
    });
  });

  describe('Documentation formatting', () => {
    const docsToCheck = [
      'DEPLOYMENT.md',
      'TROUBLESHOOTING.md',
      'api/MCP_TOOLS.md',
    ];

    docsToCheck.forEach(doc => {
      it(`${doc} should have proper code blocks`, () => {
        const filePath = path.join(docsPath, doc);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for code blocks with language specification
          const codeBlockRegex = /```(bash|json|javascript|typescript|sql|ini|dockerfile)/g;
          const matches = content.match(codeBlockRegex);
          expect(matches).toBeTruthy();
          expect(matches!.length).toBeGreaterThan(0);
        }
      });

      it(`${doc} should have section separators`, () => {
        const filePath = path.join(docsPath, doc);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for horizontal rules or clear section breaks
          expect(content).toMatch(/---/);
        }
      });
    });
  });

  describe('Documentation completeness', () => {
    it('should cover all deployment scenarios', () => {
      const filePath = path.join(docsPath, 'DEPLOYMENT.md');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for comprehensive deployment coverage
        const deploymentMethods = ['PM2', 'systemd', 'Docker'];
        deploymentMethods.forEach(method => {
          expect(content).toContain(method);
        });
        
        // Check for security considerations
        expect(content).toContain('Security');
        expect(content).toContain('Backup');
        expect(content).toContain('Recovery');
        expect(content).toContain('Monitoring');
      }
    });

    it('should provide actionable troubleshooting steps', () => {
      const filePath = path.join(docsPath, 'TROUBLESHOOTING.md');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for actionable content
        expect(content).toMatch(/npm run/);
        expect(content).toMatch(/sudo systemctl/);
        expect(content).toMatch(/pm2 logs/);
        expect(content).toMatch(/sqlite3/);
        expect(content).toMatch(/curl/);
      }
    });

    it('should include all MCP tools with examples', () => {
      const filePath = path.join(docsPath, 'api', 'MCP_TOOLS.md');
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Count tool documentation sections
        const toolSections = content.match(/###\s+\d+\.\s+`\w+`/g);
        expect(toolSections).toBeTruthy();
        expect(toolSections!.length).toBeGreaterThanOrEqual(15); // At least 15 tools documented
        
        // Check for comprehensive examples
        const exampleBlocks = content.match(/```json/g);
        expect(exampleBlocks).toBeTruthy();
        expect(exampleBlocks!.length).toBeGreaterThan(20); // Many JSON examples
      }
    });
  });
});