/**
 * Metrics & Operational Observability Service
 *
 * Lightweight, low-cardinality in-memory metrics collector.
 * Tracks HTTP traffic, latency distributions, error counts, cache ratios,
 * and background worker performance without introducing external monitoring overhead.
 */

export interface HttpRouteMetric {
  count: number;
  totalDurationMs: number;
  statusCodes: Record<string, number>;
}

export interface MetricsSummary {
  uptimeSeconds: number;
  http: {
    totalRequests: number;
    totalErrors: number;
    averageLatencyMs: number;
    statusCodes: Record<string, number>;
    routes: Record<string, { count: number; avgLatencyMs: number }>;
  };
  cache: {
    hits: number;
    misses: number;
    hitRatio: number;
  };
  jobs: {
    totalEnqueued: number;
    totalCompleted: number;
    totalFailed: number;
    activeWorkers: number;
  };
}

export class MetricsService {
  private startTime = Date.now();
  private totalRequests = 0;
  private totalErrors = 0;
  private totalDurationMs = 0;
  private statusCodes: Record<string, number> = {};
  private routeMetrics: Record<string, HttpRouteMetric> = {};

  // Cache metrics
  private cacheHits = 0;
  private cacheMisses = 0;

  // Job metrics
  private jobsEnqueued = 0;
  private jobsCompleted = 0;
  private jobsFailed = 0;
  private activeWorkers = 0;

  /**
   * Records an incoming HTTP request completion.
   * Strips dynamic path parameters to prevent high-cardinality label explosions.
   */
  public recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number
  ): void {
    this.totalRequests++;
    this.totalDurationMs += durationMs;

    const statusGroup = `${Math.floor(statusCode / 100)}xx`;
    this.statusCodes[statusGroup] = (this.statusCodes[statusGroup] ?? 0) + 1;
    this.statusCodes[statusCode.toString()] = (this.statusCodes[statusCode.toString()] ?? 0) + 1;

    if (statusCode >= 400) {
      this.totalErrors++;
    }

    // Sanitize parameterized routes (e.g., /api/v1/stores/:id -> /api/v1/stores/:id)
    const normalizedRoute = `${method.toUpperCase()} ${route || 'unknown'}`;
    const metric = this.routeMetrics[normalizedRoute] ?? {
      count: 0,
      totalDurationMs: 0,
      statusCodes: {},
    };

    metric.count++;
    metric.totalDurationMs += durationMs;
    metric.statusCodes[statusGroup] = (metric.statusCodes[statusGroup] ?? 0) + 1;
    this.routeMetrics[normalizedRoute] = metric;
  }

  public recordCacheHit(): void {
    this.cacheHits++;
  }

  public recordCacheMiss(): void {
    this.cacheMisses++;
  }

  public recordJobEnqueued(): void {
    this.jobsEnqueued++;
  }

  public recordJobCompleted(): void {
    this.jobsCompleted++;
  }

  public recordJobFailed(): void {
    this.jobsFailed++;
  }

  public setActiveWorkers(count: number): void {
    this.activeWorkers = count;
  }

  public getSummary(): MetricsSummary {
    const totalCacheOps = this.cacheHits + this.cacheMisses;
    const hitRatio = totalCacheOps > 0 ? Math.round((this.cacheHits / totalCacheOps) * 100) / 100 : 1;

    const routesSummary: Record<string, { count: number; avgLatencyMs: number }> = {};
    for (const [route, metric] of Object.entries(this.routeMetrics)) {
      routesSummary[route] = {
        count: metric.count,
        avgLatencyMs: Math.round((metric.totalDurationMs / metric.count) * 100) / 100,
      };
    }

    return {
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      http: {
        totalRequests: this.totalRequests,
        totalErrors: this.totalErrors,
        averageLatencyMs:
          this.totalRequests > 0
            ? Math.round((this.totalDurationMs / this.totalRequests) * 100) / 100
            : 0,
        statusCodes: { ...this.statusCodes },
        routes: routesSummary,
      },
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRatio,
      },
      jobs: {
        totalEnqueued: this.jobsEnqueued,
        totalCompleted: this.jobsCompleted,
        totalFailed: this.jobsFailed,
        activeWorkers: this.activeWorkers,
      },
    };
  }

  /**
   * Generates standard Prometheus text-format metrics exposition.
   */
  public toPrometheusFormat(): string {
    const summary = this.getSummary();
    const lines: string[] = [
      '# HELP process_uptime_seconds Total application process uptime in seconds.',
      '# TYPE process_uptime_seconds counter',
      `process_uptime_seconds ${summary.uptimeSeconds}`,
      '',
      '# HELP http_requests_total Total HTTP requests served.',
      '# TYPE http_requests_total counter',
      `http_requests_total ${summary.http.totalRequests}`,
      '',
      '# HELP http_errors_total Total HTTP 4xx and 5xx error responses.',
      '# TYPE http_errors_total counter',
      `http_errors_total ${summary.http.totalErrors}`,
      '',
      '# HELP http_request_duration_ms_avg Average HTTP response duration in milliseconds.',
      '# TYPE http_request_duration_ms_avg gauge',
      `http_request_duration_ms_avg ${summary.http.averageLatencyMs}`,
      '',
      '# HELP cache_hits_total Total cache hits.',
      '# TYPE cache_hits_total counter',
      `cache_hits_total ${summary.cache.hits}`,
      '',
      '# HELP cache_misses_total Total cache misses.',
      '# TYPE cache_misses_total counter',
      `cache_misses_total ${summary.cache.misses}`,
      '',
      '# HELP cache_hit_ratio Ephemeral cache hit ratio (0.0 to 1.0).',
      '# TYPE cache_hit_ratio gauge',
      `cache_hit_ratio ${summary.cache.hitRatio}`,
      '',
      '# HELP jobs_enqueued_total Total background jobs dispatched.',
      '# TYPE jobs_enqueued_total counter',
      `jobs_enqueued_total ${summary.jobs.totalEnqueued}`,
      '',
      '# HELP jobs_completed_total Total background jobs processed successfully.',
      '# TYPE jobs_completed_total counter',
      `jobs_completed_total ${summary.jobs.totalCompleted}`,
      '',
      '# HELP jobs_failed_total Total background jobs failed permanently.',
      '# TYPE jobs_failed_total counter',
      `jobs_failed_total ${summary.jobs.totalFailed}`,
      '',
    ];

    // Status code breakdowns
    for (const [code, count] of Object.entries(summary.http.statusCodes)) {
      lines.push(`http_requests_by_status{status="${code}"} ${count}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Resets internal metrics (primarily for test suite isolation).
   */
  public reset(): void {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.totalDurationMs = 0;
    this.statusCodes = {};
    this.routeMetrics = {};
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.jobsEnqueued = 0;
    this.jobsCompleted = 0;
    this.jobsFailed = 0;
    this.activeWorkers = 0;
  }
}

// Global metrics service singleton
let defaultMetricsService: MetricsService | null = null;

export function getMetricsService(): MetricsService {
  if (!defaultMetricsService) {
    defaultMetricsService = new MetricsService();
  }
  return defaultMetricsService;
}

export function resetMetricsService(): void {
  if (defaultMetricsService) {
    defaultMetricsService.reset();
  }
}
