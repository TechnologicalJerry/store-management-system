import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HealthService } from '../../src/modules/health/health.service.js';

describe('HealthService (Unit)', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  afterEach(() => {
    service.unregisterReadinessCheck('test-dep');
  });

  it('should return valid liveness status and uptime', () => {
    const liveness = service.getLiveness();
    expect(liveness.status).toBe('ok');
    expect(typeof liveness.uptime).toBe('number');
    expect(liveness.uptime).toBeGreaterThanOrEqual(0);
    expect(new Date(liveness.timestamp).toISOString()).toBe(liveness.timestamp);
  });

  it('should return ready status with default core system check', async () => {
    const { isReady, response } = await service.getReadiness();
    expect(isReady).toBe(true);
    expect(response.status).toBe('ready');
    expect(response.checks['system']).toBeDefined();
    expect(response.checks['system']?.status).toBe('up');
  });

  it('should remain ready when an additional healthy check is registered', async () => {
    service.registerReadinessCheck('test-dep', () => ({
      status: 'up',
      message: 'Test dependency is operational',
    }));

    const { isReady, response } = await service.getReadiness();
    expect(isReady).toBe(true);
    expect(response.status).toBe('ready');
    expect(response.checks['test-dep']?.status).toBe('up');
    expect(response.checks['test-dep']?.latencyMs).toBeDefined();
  });

  it('should return unavailable when a registered check reports down', async () => {
    service.registerReadinessCheck('test-dep', () => ({
      status: 'down',
      message: 'Database connection failed',
    }));

    const { isReady, response } = await service.getReadiness();
    expect(isReady).toBe(false);
    expect(response.status).toBe('unavailable');
    expect(response.checks['test-dep']?.status).toBe('down');
  });

  it('should catch throwing checks and mark readiness as unavailable', async () => {
    service.registerReadinessCheck('test-dep', () => {
      throw new Error('Connection timeout to external service');
    });

    const { isReady, response } = await service.getReadiness();
    expect(isReady).toBe(false);
    expect(response.status).toBe('unavailable');
    expect(response.checks['test-dep']?.status).toBe('down');
    expect(response.checks['test-dep']?.message).toContain('Connection timeout');
  });
});
