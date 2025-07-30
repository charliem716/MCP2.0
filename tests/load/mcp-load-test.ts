/**
 * Load Testing for MCP Server
 * 
 * Tests the production readiness features under load including:
 * - Rate limiting behavior
 * - Circuit breaker activation
 * - Performance under stress
 */

import { MCPServer } from '../../src/mcp/server.js';
import { performance } from 'perf_hooks';

interface LoadTestConfig {
  targetRPS: number;         // Requests per second
  duration: number;          // Test duration in seconds
  rampUpTime: number;        // Time to reach target RPS
  apiKey?: string;           // API key for authentication
}

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitErrors: number;
  authErrors: number;
  circuitBreakerErrors: number;
  otherErrors: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  requestsPerSecond: number;
}

class MCPLoadTester {
  private server: MCPServer;
  private results: LoadTestResult = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitErrors: 0,
    authErrors: 0,
    circuitBreakerErrors: 0,
    otherErrors: 0,
    avgLatency: 0,
    p95Latency: 0,
    p99Latency: 0,
    requestsPerSecond: 0,
  };
  private latencies: number[] = [];

  constructor(private config: LoadTestConfig) {
    // Create MCP server with production config
    this.server = new MCPServer({
      name: 'load-test-server',
      version: '1.0.0',
      transport: 'stdio',
      qrwc: {
        host: 'test.local',
        port: 443,
      },
      rateLimiting: {
        requestsPerMinute: 60,
        burstSize: 10,
        perClient: false,
      },
      authentication: {
        enabled: !!config.apiKey,
        apiKeys: config.apiKey ? [config.apiKey] : [],
        allowAnonymous: ['echo'],
      },
    });
  }

  async run(): Promise<LoadTestResult> {
    console.log('Starting load test...');
    console.log(`Target RPS: ${this.config.targetRPS}`);
    console.log(`Duration: ${this.config.duration}s`);
    console.log(`Ramp-up: ${this.config.rampUpTime}s`);

    const startTime = performance.now();
    const endTime = startTime + (this.config.duration * 1000);
    const requestInterval = 1000 / this.config.targetRPS;

    // Simulate tool registry
    const mockToolRegistry = {
      callTool: async (name: string, args: any) => {
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        return {
          content: [{ type: 'text', text: `Echo: ${args.message}` }],
          isError: false,
        };
      },
    };

    // Replace server's tool registry with mock
    (this.server as any).toolRegistry = mockToolRegistry;

    // Start sending requests
    const sendRequest = async () => {
      const requestStart = performance.now();
      
      try {
        // Simulate MCP request
        const request = {
          params: {
            name: 'echo',
            arguments: { message: 'test' },
          },
          headers: this.config.apiKey ? {
            'x-api-key': this.config.apiKey,
          } : undefined,
        };

        // Call the tool through server's request handler
        const handler = (this.server as any).server.requestHandlers?.get('tools/call');
        if (handler) {
          await handler(request);
          this.results.successfulRequests++;
        }
      } catch (error: any) {
        this.results.failedRequests++;
        
        // Categorize errors
        if (error.code === -32005) {
          this.results.rateLimitErrors++;
        } else if (error.code === -32001) {
          this.results.authErrors++;
        } else if (error.message?.includes('Circuit breaker')) {
          this.results.circuitBreakerErrors++;
        } else {
          this.results.otherErrors++;
        }
      }

      const requestEnd = performance.now();
      const latency = requestEnd - requestStart;
      this.latencies.push(latency);
      this.results.totalRequests++;
    };

    // Send requests with ramping
    let currentRPS = 1;
    const rampIncrement = (this.config.targetRPS - 1) / (this.config.rampUpTime * 10);
    
    const interval = setInterval(async () => {
      const now = performance.now();
      if (now >= endTime) {
        clearInterval(interval);
        return;
      }

      // Ramp up RPS
      const elapsed = (now - startTime) / 1000;
      if (elapsed < this.config.rampUpTime) {
        currentRPS = Math.min(this.config.targetRPS, 1 + (rampIncrement * elapsed * 10));
      } else {
        currentRPS = this.config.targetRPS;
      }

      // Send batch of requests
      const requestsThisTick = Math.floor(currentRPS / 10);
      const promises = [];
      for (let i = 0; i < requestsThisTick; i++) {
        promises.push(sendRequest());
      }
      await Promise.all(promises);
    }, 100); // Check every 100ms

    // Wait for test to complete
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (performance.now() >= endTime) {
          clearInterval(checkInterval);
          clearInterval(interval);
          resolve(undefined);
        }
      }, 100);
    });

    // Calculate results
    this.calculateResults();
    return this.results;
  }

  private calculateResults(): void {
    if (this.latencies.length === 0) return;

    // Sort latencies for percentile calculation
    this.latencies.sort((a, b) => a - b);

    // Calculate average
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    this.results.avgLatency = sum / this.latencies.length;

    // Calculate percentiles
    const p95Index = Math.floor(this.latencies.length * 0.95);
    const p99Index = Math.floor(this.latencies.length * 0.99);
    this.results.p95Latency = this.latencies[p95Index] || 0;
    this.results.p99Latency = this.latencies[p99Index] || 0;

    // Calculate actual RPS
    const duration = this.config.duration;
    this.results.requestsPerSecond = this.results.totalRequests / duration;
  }

  printResults(): void {
    console.log('\n=== Load Test Results ===\n');
    console.log(`Total Requests: ${this.results.totalRequests}`);
    console.log(`Successful: ${this.results.successfulRequests} (${this.getPercentage(this.results.successfulRequests)}%)`);
    console.log(`Failed: ${this.results.failedRequests} (${this.getPercentage(this.results.failedRequests)}%)`);
    console.log(`  - Rate Limited: ${this.results.rateLimitErrors}`);
    console.log(`  - Auth Failed: ${this.results.authErrors}`);
    console.log(`  - Circuit Breaker: ${this.results.circuitBreakerErrors}`);
    console.log(`  - Other Errors: ${this.results.otherErrors}`);
    console.log(`\nPerformance:`);
    console.log(`  - Actual RPS: ${this.results.requestsPerSecond.toFixed(2)}`);
    console.log(`  - Avg Latency: ${this.results.avgLatency.toFixed(2)}ms`);
    console.log(`  - P95 Latency: ${this.results.p95Latency.toFixed(2)}ms`);
    console.log(`  - P99 Latency: ${this.results.p99Latency.toFixed(2)}ms`);
  }

  private getPercentage(value: number): string {
    if (this.results.totalRequests === 0) return '0';
    return ((value / this.results.totalRequests) * 100).toFixed(1);
  }
}

// Run load tests
async function runLoadTests() {
  console.log('MCP Server Load Testing Suite\n');

  // Test 1: Within rate limits
  console.log('Test 1: Normal load (within rate limits)');
  const test1 = new MCPLoadTester({
    targetRPS: 1,
    duration: 10,
    rampUpTime: 2,
  });
  await test1.run();
  test1.printResults();

  // Test 2: Exceeding rate limits
  console.log('\n\nTest 2: High load (exceeding rate limits)');
  const test2 = new MCPLoadTester({
    targetRPS: 5,
    duration: 10,
    rampUpTime: 2,
  });
  await test2.run();
  test2.printResults();

  // Test 3: With authentication
  console.log('\n\nTest 3: Authenticated requests');
  const test3 = new MCPLoadTester({
    targetRPS: 2,
    duration: 10,
    rampUpTime: 2,
    apiKey: 'test-api-key-123',
  });
  await test3.run();
  test3.printResults();

  console.log('\n\nLoad testing complete!');
}

// Export for testing
export { MCPLoadTester, runLoadTests };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runLoadTests().catch(console.error);
}