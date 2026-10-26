import { beforeEach, describe, expect, it } from 'vitest';
import { MetricsService } from '../../src/infrastructure/observability/metrics.service.js';

describe('MetricsService (Unit)', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  it('records HTTP requests, aggregates latency, and tracks status code groupings', () => {
    metrics.recordHttpRequest('GET', '/api/v1/stores', 200, 15);
    metrics.recordHttpRequest('GET', '/api/v1/stores', 200, 25);
    metrics.recordHttpRequest('POST', '/api/v1/sales/checkout', 400, 10);
    metrics.recordHttpRequest('GET', '/api/v1/reports', 500, 50);

    const summary = metrics.getSummary();

    expect(summary.http.totalRequests).toBe(4);
    expect(summary.http.totalErrors).toBe(2); // 1x 400, 1x 500
    expect(summary.http.averageLatencyMs).toBe(25); // (15 + 25 + 10 + 50) / 4 = 25ms
    expect(summary.http.statusCodes['2xx']).toBe(2);
    expect(summary.http.statusCodes['4xx']).toBe(1);
    expect(summary.http.statusCodes['5xx']).toBe(1);

    expect(summary.http.routes['GET /api/v1/stores'].count).toBe(2);
    expect(summary.http.routes['GET /api/v1/stores'].avgLatencyMs).toBe(20);
  });

  it('calculates cache hit ratio accurately', () => {
    // 3 hits, 1 miss -> 75% ratio
    metrics.recordCacheHit();
    metrics.recordCacheHit();
    metrics.recordCacheHit();
    metrics.recordCacheMiss();

    const summary = metrics.getSummary();
    expect(summary.cache.hits).toBe(3);
    expect(summary.cache.misses).toBe(1);
    expect(summary.cache.hitRatio).toBe(0.75);
  });

  it('tracks background queue and worker metrics', () => {
    metrics.recordJobEnqueued();
    metrics.recordJobEnqueued();
    metrics.recordJobCompleted();
    metrics.recordJobFailed();
    metrics.setActiveWorkers(5);

    const summary = metrics.getSummary();
    expect(summary.jobs.totalEnqueued).toBe(2);
    expect(summary.jobs.totalCompleted).toBe(1);
    expect(summary.jobs.totalFailed).toBe(1);
    expect(summary.jobs.activeWorkers).toBe(5);
  });

  it('formats metrics into standard Prometheus text format', () => {
    metrics.recordHttpRequest('GET', '/health/live', 200, 5);
    metrics.recordCacheHit();

    const output = metrics.toPrometheusFormat();

    expect(output).toContain('# HELP http_requests_total');
    expect(output).toContain('http_requests_total 1');
    expect(output).toContain('cache_hits_total 1');
    expect(output).toContain('http_requests_by_status{status="200"} 1');
  });

  it('resets all counters when reset() is invoked', () => {
    metrics.recordHttpRequest('GET', '/test', 200, 10);
    metrics.recordCacheHit();

    metrics.reset();

    const summary = metrics.getSummary();
    expect(summary.http.totalRequests).toBe(0);
    expect(summary.cache.hits).toBe(0);
  });
});
