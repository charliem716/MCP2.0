/**
 * CLI Output Utility Tests
 */

import { CLIOutput } from '../../../src/cli/output.js';

describe('CLIOutput', () => {
  let cliOutput: CLIOutput;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    cliOutput = new CLIOutput();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('print', () => {
    it('should write to stdout with newline', () => {
      cliOutput.print('Hello World');
      expect(stdoutSpy).toHaveBeenCalledWith('Hello World\n');
    });
  });

  describe('printError', () => {
    it('should write to stderr with newline', () => {
      cliOutput.printError('Error message');
      expect(stderrSpy).toHaveBeenCalledWith('Error message\n');
    });
  });

  describe('printSuccess', () => {
    it('should print with success emoji', () => {
      cliOutput.printSuccess('Operation successful');
      expect(stdoutSpy).toHaveBeenCalledWith('✅ Operation successful\n');
    });
  });

  describe('printWarning', () => {
    it('should print with warning emoji', () => {
      cliOutput.printWarning('Warning message');
      expect(stdoutSpy).toHaveBeenCalledWith('⚠️  Warning message\n');
    });
  });

  describe('printFailure', () => {
    it('should print to stderr with failure emoji', () => {
      cliOutput.printFailure('Operation failed');
      expect(stderrSpy).toHaveBeenCalledWith('❌ Operation failed\n');
    });
  });

  describe('printHeader', () => {
    it('should print title with underline', () => {
      cliOutput.printHeader('Section Title');
      expect(stdoutSpy).toHaveBeenCalledWith('Section Title\n');
      expect(stdoutSpy).toHaveBeenCalledWith('=============\n');
    });
  });

  describe('printItem', () => {
    it('should print indented item with value', () => {
      cliOutput.printItem('Size', '10 MB');
      expect(stdoutSpy).toHaveBeenCalledWith('   Size: 10 MB\n');
    });

    it('should print indented item without value', () => {
      cliOutput.printItem('Item without value');
      expect(stdoutSpy).toHaveBeenCalledWith('   Item without value\n');
    });

    it('should handle boolean values', () => {
      cliOutput.printItem('Compressed', true);
      expect(stdoutSpy).toHaveBeenCalledWith('   Compressed: true\n');
    });

    it('should handle number values', () => {
      cliOutput.printItem('Count', 42);
      expect(stdoutSpy).toHaveBeenCalledWith('   Count: 42\n');
    });
  });

  describe('progress methods', () => {
    describe('when TTY is available', () => {
      beforeEach(() => {
        Object.defineProperty(process.stdout, 'isTTY', {
          value: true,
          writable: true,
          configurable: true
        });
        cliOutput = new CLIOutput();
      });

      it('should show progress bar', () => {
        cliOutput.showProgress(50, 100, 'Processing');
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('50%'));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Processing'));
      });

      it('should clear progress line', () => {
        cliOutput.clearProgress();
        expect(stdoutSpy).toHaveBeenCalledWith('\r' + ' '.repeat(80) + '\r');
      });
    });

    describe('when TTY is not available', () => {
      beforeEach(() => {
        Object.defineProperty(process.stdout, 'isTTY', {
          value: false,
          writable: true,
          configurable: true
        });
        cliOutput = new CLIOutput();
      });

      it('should not show progress bar', () => {
        cliOutput.showProgress(50, 100, 'Processing');
        expect(stdoutSpy).not.toHaveBeenCalled();
      });

      it('should not clear progress line', () => {
        cliOutput.clearProgress();
        expect(stdoutSpy).not.toHaveBeenCalled();
      });
    });
  });
});