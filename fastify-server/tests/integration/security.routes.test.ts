import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '../helpers/test-app.js';

describe('Security & HTTP Hardening Verification (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Instantiate test app with security plugins enabled
    const setup = await createTestApp({ disableRateLimit: false });
    app = setup.app;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('HTTP Security Headers (Helmet)', () => {
    it('sets protective security headers on responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/live',
      });

      expect(response.statusCode).toBe(200);

      // Verify essential OWASP security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['x-xss-protection']).toBe('0'); // Modern Helmet standard disables buggy reflective XSS filters
      // Ensure X-Powered-By is hidden
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Cross-Origin Resource Sharing (CORS)', () => {
    it('allows requests with origins present in CORS allowlist', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/health/live',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'GET',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('rejects CORS preflight from disallowed origins', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/health/live',
        headers: {
          origin: 'http://malicious-attacker-domain.evil',
          'access-control-request-method': 'GET',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Error Response Sanitization', () => {
    it('returns structured, sanitized errors without exposing internal database details or stack traces', async () => {
      // Send malformed JSON payload to trigger validation error
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: {
          'content-type': 'application/json',
        },
        payload: '{ bad-json-structure',
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();

      expect(json.code).toBeDefined();
      expect(json.message).toBeDefined();
      expect(json.requestId).toBeDefined();

      // Ensure sensitive internal internals are NEVER exposed
      expect(json.stack).toBeUndefined();
      expect(json.query).toBeUndefined();
      expect(json.sql).toBeUndefined();
    });
  });
});
