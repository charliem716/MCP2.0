/**
 * Monitoring and Metrics Collection
 * 
 * Provides comprehensive metrics collection for the MCP server
 * with support for Prometheus-style metrics export.
 */

import { EventEmitter } from 'events';
import { createLogger, type Logger } from '../../shared/utils/logger.js';

/**
 * Metric types
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary',
}

/**
 * Base metric interface
 */
export interface Metric {
  name: string;
  help: string;
  type: MetricType;
  labels?: string[];
}

/**
 * Counter metric - only goes up
 */
export class Counter implements Metric {
  readonly type = MetricType.COUNTER;
  private value = 0;
  private labeledValues = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labels: string[] = []
  ) {}

  inc(labels?: Record<string, string>, value = 1): void {
    if (labels) {
      const key = this.getLabelKey(labels);
      const current = this.labeledValues.get(key) ?? 0;
      this.labeledValues.set(key, current + value);
    } else {
      this.value += value;
    }
  }

  get(): number {
    return this.value;
  }

  getLabeled(labels: Record<string, string>): number {
    return this.labeledValues.get(this.getLabelKey(labels)) ?? 0;
  }

  reset(): void {
    this.value = 0;
    this.labeledValues.clear();
  }

  private getLabelKey(labels: Record<string, string>): string {
    return this.labels
      .map(label => labels[label] ?? '')
      .join(':');
  }

  toString(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} ${this.type}`,
    ];

    if (this.labeledValues.size > 0) {
      for (const [key, value] of this.labeledValues) {
        const labelPairs = key.split(':');
        const labelStr = this.labels
          .map((label, i) => `${label}="${labelPairs[i]}"`)
          .join(',');
        lines.push(`${this.name}{${labelStr}} ${value}`);
      }
    } else {
      lines.push(`${this.name} ${this.value}`);
    }

    return lines.join('\n');
  }
}

/**
 * Gauge metric - can go up or down
 */
export class Gauge implements Metric {
  readonly type = MetricType.GAUGE;
  private value = 0;
  private labeledValues = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labels: string[] = []
  ) {}

  set(value: number, labels?: Record<string, string>): void {
    if (labels) {
      const key = this.getLabelKey(labels);
      this.labeledValues.set(key, value);
    } else {
      this.value = value;
    }
  }

  inc(labels?: Record<string, string>, value = 1): void {
    if (labels) {
      const key = this.getLabelKey(labels);
      const current = this.labeledValues.get(key) ?? 0;
      this.labeledValues.set(key, current + value);
    } else {
      this.value += value;
    }
  }

  dec(labels?: Record<string, string>, value = 1): void {
    this.inc(labels, -value);
  }

  get(): number {
    return this.value;
  }

  getLabeled(labels: Record<string, string>): number {
    return this.labeledValues.get(this.getLabelKey(labels)) ?? 0;
  }

  private getLabelKey(labels: Record<string, string>): string {
    return this.labels
      .map(label => labels[label] ?? '')
      .join(':');
  }

  toString(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} ${this.type}`,
    ];

    if (this.labeledValues.size > 0) {
      for (const [key, value] of this.labeledValues) {
        const labelPairs = key.split(':');
        const labelStr = this.labels
          .map((label, i) => `${label}="${labelPairs[i]}"`)
          .join(',');
        lines.push(`${this.name}{${labelStr}} ${value}`);
      }
    } else {
      lines.push(`${this.name} ${this.value}`);
    }

    return lines.join('\n');
  }
}

/**
 * Histogram metric - tracks distribution of values
 */
export class Histogram implements Metric {
  readonly type = MetricType.HISTOGRAM;
  private buckets: number[];
  private bucketCounts: Map<number, number>;
  private sum = 0;
  private count = 0;

  constructor(
    public readonly name: string,
    public readonly help: string,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    public readonly labels: string[] = []
  ) {
    this.buckets = [...buckets, Infinity].sort((a, b) => a - b);
    this.bucketCounts = new Map(this.buckets.map(b => [b, 0]));
  }

  observe(value: number): void {
    this.sum += value;
    this.count++;

    for (const bucket of this.buckets) {
      if (value <= bucket) {
        const current = this.bucketCounts.get(bucket) ?? 0;
        this.bucketCounts.set(bucket, current + 1);
      }
    }
  }

  reset(): void {
    this.sum = 0;
    this.count = 0;
    this.bucketCounts = new Map(this.buckets.map(b => [b, 0]));
  }

  toString(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} ${this.type}`,
    ];

    // Bucket values
    for (const [bucket, count] of this.bucketCounts) {
      const bucketStr = bucket === Infinity ? '+Inf' : bucket.toString();
      lines.push(`${this.name}_bucket{le="${bucketStr}"} ${count}`);
    }

    // Sum and count
    lines.push(`${this.name}_sum ${this.sum}`);
    lines.push(`${this.name}_count ${this.count}`);

    return lines.join('\n');
  }
}

/**
 * MCP Server Metrics
 */
export class MCPMetrics {
  private readonly logger: Logger;
  
  // Request metrics
  public readonly requestCount: Counter;
  public readonly requestDuration: Histogram;
  public readonly requestErrors: Counter;
  
  // Connection metrics
  public readonly activeConnections: Gauge;
  public readonly connectionErrors: Counter;
  public readonly reconnects: Counter;
  
  // Tool metrics
  public readonly toolCalls: Counter;
  public readonly toolDuration: Histogram;
  public readonly toolErrors: Counter;
  
  // System metrics
  public readonly memoryUsage: Gauge;
  public readonly cpuUsage: Gauge;
  public readonly eventLoopLag: Histogram;
  
  // Rate limiting metrics
  public readonly rateLimitHits: Counter;
  public readonly rateLimitStatus: Gauge;
  
  // Cache metrics
  public readonly cacheHits: Counter;
  public readonly cacheMisses: Counter;
  public readonly cacheSize: Gauge;

  private metricsInterval?: NodeJS.Timeout;

  constructor() {
    this.logger = createLogger('mcp-metrics');

    // Initialize request metrics
    this.requestCount = new Counter(
      'mcp_requests_total',
      'Total number of MCP requests',
      ['method', 'status']
    );

    this.requestDuration = new Histogram(
      'mcp_request_duration_seconds',
      'MCP request duration in seconds',
      [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
      ['method']
    );

    this.requestErrors = new Counter(
      'mcp_request_errors_total',
      'Total number of MCP request errors',
      ['method', 'error_type']
    );

    // Initialize connection metrics
    this.activeConnections = new Gauge(
      'qsys_active_connections',
      'Number of active Q-SYS connections'
    );

    this.connectionErrors = new Counter(
      'qsys_connection_errors_total',
      'Total number of Q-SYS connection errors',
      ['error_type']
    );

    this.reconnects = new Counter(
      'qsys_reconnects_total',
      'Total number of Q-SYS reconnection attempts'
    );

    // Initialize tool metrics
    this.toolCalls = new Counter(
      'mcp_tool_calls_total',
      'Total number of tool calls',
      ['tool', 'status']
    );

    this.toolDuration = new Histogram(
      'mcp_tool_duration_seconds',
      'Tool execution duration in seconds',
      [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
      ['tool']
    );

    this.toolErrors = new Counter(
      'mcp_tool_errors_total',
      'Total number of tool errors',
      ['tool', 'error_type']
    );

    // Initialize system metrics
    this.memoryUsage = new Gauge(
      'process_memory_usage_bytes',
      'Process memory usage in bytes',
      ['type']
    );

    this.cpuUsage = new Gauge(
      'process_cpu_usage_percent',
      'Process CPU usage percentage'
    );

    this.eventLoopLag = new Histogram(
      'nodejs_event_loop_lag_seconds',
      'Node.js event loop lag in seconds',
      [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    );

    // Initialize rate limiting metrics
    this.rateLimitHits = new Counter(
      'mcp_rate_limit_hits_total',
      'Total number of rate limit hits',
      ['client_id']
    );

    this.rateLimitStatus = new Gauge(
      'mcp_rate_limit_remaining',
      'Remaining rate limit tokens',
      ['client_id']
    );

    // Initialize cache metrics
    this.cacheHits = new Counter(
      'mcp_cache_hits_total',
      'Total number of cache hits',
      ['cache_type']
    );

    this.cacheMisses = new Counter(
      'mcp_cache_misses_total',
      'Total number of cache misses',
      ['cache_type']
    );

    this.cacheSize = new Gauge(
      'mcp_cache_size_items',
      'Number of items in cache',
      ['cache_type']
    );

    this.startSystemMetricsCollection();
    this.logger.info('Metrics system initialized');
  }

  /**
   * Start collecting system metrics
   */
  private startSystemMetricsCollection(): void {
    // Collect system metrics every 10 seconds
    this.metricsInterval = setInterval(() => {
      // Memory metrics
      const memUsage = process.memoryUsage();
      this.memoryUsage.set(memUsage.rss, { type: 'rss' });
      this.memoryUsage.set(memUsage.heapTotal, { type: 'heap_total' });
      this.memoryUsage.set(memUsage.heapUsed, { type: 'heap_used' });
      this.memoryUsage.set(memUsage.external, { type: 'external' });

      // CPU metrics
      const cpuUsage = process.cpuUsage();
      const totalCpu = cpuUsage.user + cpuUsage.system;
      this.cpuUsage.set(totalCpu / 1000000); // Convert to percentage

      // Event loop lag (simplified measurement)
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1e9;
        this.eventLoopLag.observe(lag);
      });
    }, 10000);
  }

  /**
   * Export all metrics in Prometheus format
   */
  export(): string {
    const metrics: Metric[] = [
      this.requestCount,
      this.requestDuration,
      this.requestErrors,
      this.activeConnections,
      this.connectionErrors,
      this.reconnects,
      this.toolCalls,
      this.toolDuration,
      this.toolErrors,
      this.memoryUsage,
      this.cpuUsage,
      this.eventLoopLag,
      this.rateLimitHits,
      this.rateLimitStatus,
      this.cacheHits,
      this.cacheMisses,
      this.cacheSize,
    ];

    return metrics.map(m => String(m.toString())).join('\n\n');
  }

  /**
   * Get metrics as JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      requests: {
        total: this.requestCount.get(),
        errors: this.requestErrors.get(),
      },
      connections: {
        active: this.activeConnections.get(),
        errors: this.connectionErrors.get(),
        reconnects: this.reconnects.get(),
      },
      tools: {
        calls: this.toolCalls.get(),
        errors: this.toolErrors.get(),
      },
      system: {
        memory: {
          rss: this.memoryUsage.getLabeled({ type: 'rss' }),
          heapTotal: this.memoryUsage.getLabeled({ type: 'heap_total' }),
          heapUsed: this.memoryUsage.getLabeled({ type: 'heap_used' }),
        },
        cpu: this.cpuUsage.get(),
      },
      cache: {
        hits: this.cacheHits.get(),
        misses: this.cacheMisses.get(),
      },
    };
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }

    this.logger.info('Metrics system stopped');
  }
}

// Singleton instance
let metricsInstance: MCPMetrics | undefined;

/**
 * Get metrics instance
 */
export function getMetrics(): MCPMetrics {
  metricsInstance ??= new MCPMetrics();
  return metricsInstance;
}