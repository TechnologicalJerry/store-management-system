import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

describe('Environment Configuration Validation (Unit)', () => {
  const baseValidEnv = {
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: '8080',
    LOG_LEVEL: 'debug',
    API_PREFIX: '/api/v1',
    CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
    SWAGGER_ENABLED: 'true',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/store_management?schema=public',
    DB_POOL_MAX: '20',
    DB_CONNECTION_TIMEOUT_MS: '6000',
  };

  it('should successfully parse valid environment variables', () => {
    const config = loadEnv(baseValidEnv);
    expect(config.NODE_ENV).toBe('development');
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.PORT).toBe(8080);
    expect(config.LOG_LEVEL).toBe('debug');
    expect(config.API_PREFIX).toBe('/api/v1');
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:5173']);
    expect(config.SWAGGER_ENABLED).toBe(true);
    expect(config.DATABASE_URL).toBe(baseValidEnv.DATABASE_URL);
    expect(config.DB_POOL_MAX).toBe(20);
    expect(config.DB_CONNECTION_TIMEOUT_MS).toBe(6000);
  });

  it('should apply safe defaults for missing optional environment variables', () => {
    const config = loadEnv({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.API_PREFIX).toBe('/api/v1');
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:5173']);
    expect(config.SWAGGER_ENABLED).toBe(true);
    expect(config.DATABASE_URL).toContain('postgresql://');
    expect(config.DB_POOL_MAX).toBe(10);
    expect(config.DB_CONNECTION_TIMEOUT_MS).toBe(5000);
  });

  it('should reject invalid PORT outside valid range', () => {
    expect(() => loadEnv({ ...baseValidEnv, PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnv({ ...baseValidEnv, PORT: '0' })).toThrow(/PORT/);
    expect(() => loadEnv({ ...baseValidEnv, PORT: '-5' })).toThrow(/PORT/);
    expect(() => loadEnv({ ...baseValidEnv, PORT: 'not-a-number' })).toThrow(/PORT/);
  });

  it('should reject invalid NODE_ENV', () => {
    expect(() => loadEnv({ ...baseValidEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('should reject invalid LOG_LEVEL', () => {
    expect(() => loadEnv({ ...baseValidEnv, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('should reject invalid API_PREFIX not starting with /', () => {
    expect(() => loadEnv({ ...baseValidEnv, API_PREFIX: 'api/v1' })).toThrow(/API_PREFIX/);
  });

  it('should reject wildcard CORS origin (*) in production environment', () => {
    expect(() =>
      loadEnv({
        ...baseValidEnv,
        NODE_ENV: 'production',
        CORS_ORIGINS: '*',
      })
    ).toThrow(/Wildcard CORS origin \(\*\) is not allowed in production/);
  });

  it('should parse boolean values cleanly from strings and numbers', () => {
    expect(loadEnv({ ...baseValidEnv, SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED).toBe(true);
    expect(loadEnv({ ...baseValidEnv, SWAGGER_ENABLED: '1' }).SWAGGER_ENABLED).toBe(true);
    expect(loadEnv({ ...baseValidEnv, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
    expect(loadEnv({ ...baseValidEnv, SWAGGER_ENABLED: '0' }).SWAGGER_ENABLED).toBe(false);
  });

  it('should reject malformed DATABASE_URL not starting with postgresql:// or postgres://', () => {
    expect(() =>
      loadEnv({
        ...baseValidEnv,
        DATABASE_URL: 'mysql://root:password@localhost:3306/db',
      })
    ).toThrow(/DATABASE_URL/);

    expect(() =>
      loadEnv({
        ...baseValidEnv,
        DATABASE_URL: 'invalid-connection-string',
      })
    ).toThrow(/DATABASE_URL/);
  });

  it('should reject DB_POOL_MAX outside bounds', () => {
    expect(() => loadEnv({ ...baseValidEnv, DB_POOL_MAX: '0' })).toThrow(/DB_POOL_MAX/);
    expect(() => loadEnv({ ...baseValidEnv, DB_POOL_MAX: '150' })).toThrow(/DB_POOL_MAX/);
  });

  it('should reject DB_CONNECTION_TIMEOUT_MS outside bounds', () => {
    expect(() => loadEnv({ ...baseValidEnv, DB_CONNECTION_TIMEOUT_MS: '100' })).toThrow(
      /DB_CONNECTION_TIMEOUT_MS/
    );
    expect(() => loadEnv({ ...baseValidEnv, DB_CONNECTION_TIMEOUT_MS: '70000' })).toThrow(
      /DB_CONNECTION_TIMEOUT_MS/
    );
  });

  it('should parse Stage 3 auth environment variables and apply secure defaults', () => {
    const config = loadEnv(baseValidEnv);
    expect(config.JWT_ACCESS_SECRET).toBeDefined();
    expect(config.JWT_ACCESS_TTL).toBe('15m');
    expect(config.JWT_ISSUER).toBe('store-management-system');
    expect(config.JWT_AUDIENCE).toBe('store-management-system-api');
    expect(config.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(config.MAX_ACTIVE_SESSIONS).toBe(2);
    expect(config.AUTH_COOKIE_NAME).toBe('refresh_token');
    expect(config.COOKIE_SECRET).toBeDefined();
  });

  it('should reject JWT_ACCESS_SECRET shorter than 32 characters', () => {
    expect(() =>
      loadEnv({
        ...baseValidEnv,
        JWT_ACCESS_SECRET: 'too-short-secret',
      })
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('should reject default dev secrets in production environment', () => {
    expect(() =>
      loadEnv({
        ...baseValidEnv,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://admin.store.com',
      })
    ).toThrow(/JWT_ACCESS_SECRET must be set to a secure, unique secret in production/);
  });

  it('should reject MAX_ACTIVE_SESSIONS outside allowed bounds (1 to 10)', () => {
    expect(() => loadEnv({ ...baseValidEnv, MAX_ACTIVE_SESSIONS: '0' })).toThrow(
      /MAX_ACTIVE_SESSIONS/
    );
    expect(() => loadEnv({ ...baseValidEnv, MAX_ACTIVE_SESSIONS: '15' })).toThrow(
      /MAX_ACTIVE_SESSIONS/
    );
  });
});

