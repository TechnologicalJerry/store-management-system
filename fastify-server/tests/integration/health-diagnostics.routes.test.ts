import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, generateTestAuthHeader } from '../helpers/test-app.js';
import { createMockUser, TEST_IDS } from '../helpers/test-fixtures.js';
import { healthService } from '../../src/modules/health/health.service.js';

describe('Health, Readiness & Diagnostics Probes (Integration)', () => {
  let app: FastifyInstance;
  let adminAuthHeader: { authorization: string };
  let cashierAuthHeader: { authorization: string };

  const adminUser = createMockUser({
    id: TEST_IDS.SUPER_ADMIN,
    roles: [{ id: 'r1', userId: TEST_IDS.SUPER_ADMIN, role: 'SUPER_ADMIN' }],
  });

  const cashierUser = createMockUser({
    id: TEST_IDS.CASHIER,
    roles: [{ id: 'r2', userId: TEST_IDS.CASHIER, role: 'CASHIER' }],
  });

  beforeAll(async () => {
    const testSetup = await createTestApp();
    app = testSetup.app;

    testSetup.prisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where.id === TEST_IDS.SUPER_ADMIN) return Promise.resolve(adminUser);
      if (where.id === TEST_IDS.CASHIER) return Promise.resolve(cashierUser);
      return Promise.resolve(null);
    });

    testSetup.prisma.session.findUnique.mockResolvedValue({
      id: TEST_IDS.SESSION_1,
      userId: TEST_IDS.SUPER_ADMIN,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000),
    });

    adminAuthHeader = generateTestAuthHeader(adminUser, 'SUPER_ADMIN');
    cashierAuthHeader = generateTestAuthHeader(cashierUser, 'CASHIER');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health/live (Process Liveness)', () => {
    it('returns 200 OK with process uptime and status ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/live',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.status).toBe('ok');
      expect(typeof json.uptime).toBe('number');
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('GET /api/v1/health/ready (Subsystem Readiness)', () => {
    it('returns 200 OK when core database is healthy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/ready',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.status).toBe('ready');
      expect(json.checks).toBeDefined();
      expect(json.checks.system.status).toBe('up');
    });

    it('keeps API ready with degraded cache if Redis becomes unavailable', async () => {
      // Mock Redis check reporting down
      healthService.registerReadinessCheck(
        'redis_mock',
        () => ({
          status: 'down',
          message: 'Connection refused',
        }),
        false // Non-critical dependency
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/ready',
      });

      // API remains 200 OK because Redis is non-critical and PostgreSQL is up
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.status).toBe('ready');
      expect(json.checks.redis_mock.status).toBe('degraded');

      healthService.unregisterReadinessCheck('redis_mock');
    });
  });

  describe('GET /api/v1/health/diagnostics (Restricted Administrative Diagnostics)', () => {
    it('returns 401 Unauthorized when no authentication token is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/diagnostics',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 Forbidden when requested by non-admin role (e.g. CASHIER)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/diagnostics',
        headers: cashierAuthHeader,
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 200 OK with system memory, process, and subsystem diagnostics for SUPER_ADMIN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/diagnostics',
        headers: adminAuthHeader,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.process).toBeDefined();
      expect(json.data.process.memory).toBeDefined();
      expect(json.data.redis).toBeDefined();
    });
  });

  describe('GET /api/v1/health/metrics (Operational Observability)', () => {
    it('returns 200 OK with JSON metrics summary by default', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/metrics',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.http).toBeDefined();
      expect(json.data.cache).toBeDefined();
      expect(json.data.jobs).toBeDefined();
    });

    it('returns 200 OK with Prometheus text format when Accept: text/plain is sent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/metrics',
        headers: {
          accept: 'text/plain',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('# HELP http_requests_total');
    });
  });
});
