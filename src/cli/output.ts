/**
 * CLI Output Utility
 * 
 * Provides structured output for CLI commands, separating user-facing output
 * from internal logging. This ensures clean, consistent CLI output while
 * maintaining proper logging for debugging and monitoring.
 */

export class CLIOutput {
  private readonly isInteractive: boolean;
  
  constructor() {
    this.isInteractive = process.stdout.isTTY ?? false;
  }
  
  /**
   * Print a message to stdout (user-facing output)
   */
  print(message: string): void {
    process.stdout.write(`${message}\n`);
  }
  
  /**
   * Print an error message to stderr
   */
  printError(message: string): void {
    process.stderr.write(`${message}\n`);
  }
  
  /**
   * Print a success message with emoji
   */
  printSuccess(message: string): void {
    this.print(`✅ ${message}`);
  }
  
  /**
   * Print a warning message with emoji
   */
  printWarning(message: string): void {
    this.print(`⚠️  ${message}`);
  }
  
  /**
   * Print an error with emoji
   */
  printFailure(message: string): void {
    this.printError(`❌ ${message}`);
  }
  
  /**
   * Show a progress bar for long operations (TTY only)
   */
  showProgress(current: number, total: number, label?: string): void {
    if (!this.isInteractive) return;
    
    const percentage = Math.round((current / total) * 100);
    const barLength = 50;
    const filled = Math.round((percentage / 100) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    
    process.stdout.write(`\r${bar} ${percentage}% ${label || ''}`);
  }
  
  /**
   * Clear the progress line
   */
  clearProgress(): void {
    if (this.isInteractive) {
      process.stdout.write(`\r${' '.repeat(80)}\r`);
    }
  }
  
  /**
   * Print a section header
   */
  printHeader(title: string): void {
    this.print(title);
    this.print('='.repeat(title.length));
  }
  
  /**
   * Print an indented item
   */
  printItem(label: string, value?: string | number | boolean): void {
    if (value !== undefined) {
      this.print(`   ${label}: ${value}`);
    } else {
      this.print(`   ${label}`);
    }
  }
}

// Singleton instance
export const cliOutput = new CLIOutput();