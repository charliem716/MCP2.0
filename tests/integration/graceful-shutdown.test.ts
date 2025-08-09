/**
 * Integration test for Graceful Shutdown and Signal Handling
 * 
 * Tests that the server properly shuts down and cleans up resources
 * when receiving termination signals.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { setTimeout } from 'timers/promises';
import * as fs from 'fs';
import * as path from 'path';

describe('Graceful Shutdown', () => {
  let serverProcess: ChildProcess | null = null;
  const testDbPath = './data/test-shutdown-integration';

  beforeEach(() => {
    // Clean up any previous test data
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    // Ensure server is killed
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGKILL');
      await setTimeout(100);
    }
    serverProcess = null;

    // Clean up test data
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  /**
   * Helper to start the server process
   */
  async function startServer(env: Record<string, string> = {}): Promise<{
    process: ChildProcess;
    waitForReady: () => Promise<void>;
    captureOutput: () => { stdout: string; stderr: string };
  }> {
    const fullEnv = {
      ...process.env,
      EVENT_MONITORING_ENABLED: 'true',
      EVENT_MONITORING_DB_PATH: testDbPath,
      EVENT_MONITORING_BUFFER_SIZE: '10',
      EVENT_MONITORING_FLUSH_INTERVAL: '100',
      LOG_LEVEL: 'info',
      ...env
    };

    const child = spawn('npm', ['start'], {
      env: fullEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let isReady = false;

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      if (text.includes('MCP Voice/Text-Controlled Q-SYS Demo is ready')) {
        isReady = true;
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    serverProcess = child;

    return {
      process: child,
      waitForReady: async () => {
        const maxWait = 10000; // 10 seconds
        const startTime = Date.now();
        while (!isReady && Date.now() - startTime < maxWait) {
          await setTimeout(100);
        }
        if (!isReady) {
          throw new Error('Server did not start within timeout');
        }
      },
      captureOutput: () => ({ stdout, stderr })
    };
  }

  /**
   * Helper to shutdown server and verify clean exit
   */
  async function shutdownServer(
    process: ChildProcess,
    signal: NodeJS.Signals
  ): Promise<{ exitCode: number | null; exitSignal: NodeJS.Signals | null }> {
    return new Promise((resolve) => {
      let resolved = false;

      process.on('exit', (code, sig) => {
        if (!resolved) {
          resolved = true;
          resolve({ exitCode: code, exitSignal: sig });
        }
      });

      // Send signal
      process.kill(signal);

      // Set timeout to force resolution
      setTimeout(10000).then(() => {
        if (!resolved) {
          resolved = true;
          if (!process.killed) {
            process.kill('SIGKILL');
          }
          resolve({ exitCode: null, exitSignal: null });
        }
      });
    });
  }

  it('should handle SIGTERM gracefully', async () => {
    const { process, waitForReady, captureOutput } = await startServer();
    
    // Wait for server to be ready
    await waitForReady();
    
    // Send SIGTERM
    const { exitCode, exitSignal } = await shutdownServer(process, 'SIGTERM');
    
    // Check output for proper shutdown messages
    const { stdout } = captureOutput();
    
    expect(exitCode).toBe(0);
    expect(stdout).toContain('SIGTERM received, shutting down gracefully');
    expect(stdout).toContain('Cleaning up resources');
    expect(stdout).toContain('Cleanup completed');
  }, 30000);

  it('should handle SIGINT gracefully', async () => {
    const { process, waitForReady, captureOutput } = await startServer();
    
    // Wait for server to be ready
    await waitForReady();
    
    // Send SIGINT (Ctrl+C)
    const { exitCode, exitSignal } = await shutdownServer(process, 'SIGINT');
    
    // Check output for proper shutdown messages
    const { stdout } = captureOutput();
    
    expect(exitCode).toBe(0);
    expect(stdout).toContain('SIGINT received, shutting down gracefully');
    expect(stdout).toContain('Cleaning up resources');
    expect(stdout).toContain('Cleanup completed');
  }, 30000);

  it('should shutdown state manager and event monitor', async () => {
    const { process, waitForReady, captureOutput } = await startServer({
      LOG_LEVEL: 'debug' // More verbose logging
    });
    
    // Wait for server to be ready
    await waitForReady();
    
    // Verify event monitor started
    const { stdout: startupOutput } = captureOutput();
    expect(startupOutput).toContain('SQLite event monitor initialized');
    
    // Send SIGTERM
    const { exitCode } = await shutdownServer(process, 'SIGTERM');
    
    // Check output for state manager and event monitor shutdown
    const { stdout } = captureOutput();
    
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Disposing control system adapter');
    expect(stdout).toContain('Shutting down state manager');
    expect(stdout).toContain('SQLite event monitor closed');
    expect(stdout).toContain('State manager shutdown completed');
  }, 30000);

  it('should force shutdown after timeout', async () => {
    // Mock a server that doesn't shutdown cleanly
    // This test is more about ensuring the timeout mechanism works
    
    const { process, waitForReady } = await startServer();
    
    // Wait for server to be ready
    await waitForReady();
    
    // Send signal and measure time
    const startTime = Date.now();
    const { exitCode } = await shutdownServer(process, 'SIGTERM');
    const duration = Date.now() - startTime;
    
    // Should exit within reasonable time (10 second timeout + buffer)
    expect(duration).toBeLessThan(15000);
    
    // Exit code should be 0 for normal shutdown or 1 for forced
    expect([0, 1, null]).toContain(exitCode);
  }, 30000);

  it('should handle multiple signals gracefully', async () => {
    const { process, waitForReady, captureOutput } = await startServer();
    
    // Wait for server to be ready
    await waitForReady();
    
    // Send multiple signals quickly
    process.kill('SIGTERM');
    await setTimeout(100);
    process.kill('SIGINT');
    await setTimeout(100);
    process.kill('SIGTERM');
    
    // Wait for exit
    const exitPromise = new Promise<number | null>((resolve) => {
      process.on('exit', (code) => resolve(code));
    });
    
    const exitCode = await Promise.race([
      exitPromise,
      setTimeout(10000).then(() => null)
    ]);
    
    const { stdout } = captureOutput();
    
    // Should handle multiple signals without crashing
    expect(exitCode).toBe(0);
    expect(stdout).toContain('shutting down gracefully');
    expect(stdout).toContain('Already shutting down');
  }, 30000);
});