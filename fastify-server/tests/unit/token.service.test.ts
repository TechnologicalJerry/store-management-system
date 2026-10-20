import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { UnauthorizedError } from '../../src/common/errors/app-error.js';

describe('TokenService (Unit)', () => {
  const tokenService = new TokenService();

  describe('generateRawRefreshToken', () => {
    it('should generate a 64-character hexadecimal secure random string', () => {
      const token1 = tokenService.generateRawRefreshToken();
      const token2 = tokenService.generateRawRefreshToken();

      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(token1)).toBe(true);
      expect(token1).not.toBe(token2);
    });
  });

  describe('hashRefreshToken', () => {
    it('should produce a deterministic 64-character SHA-256 hex digest', () => {
      const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const hash1 = tokenService.hashRefreshToken(rawToken);
      const hash2 = tokenService.hashRefreshToken(rawToken);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
    });

    it('should produce distinct hashes for different inputs', () => {
      const hash1 = tokenService.hashRefreshToken('token-a');
      const hash2 = tokenService.hashRefreshToken('token-b');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('signAccessToken and verifyAccessToken', () => {
    const samplePayload = {
      sub: '550e8400-e29b-41d4-a716-446655440000',
      email: 'admin@store.local',
      name: 'System Admin',
      roles: ['ADMIN' as const, 'STORE_MANAGER' as const],
      sessionId: '660e8400-e29b-41d4-a716-446655440001',
    };

    it('should sign a valid JWT and return verified claims', () => {
      const token = tokenService.signAccessToken(samplePayload);
      expect(typeof token).toBe('string');

      const claims = tokenService.verifyAccessToken(token);
      expect(claims.sub).toBe(samplePayload.sub);
      expect(claims.email).toBe(samplePayload.email);
      expect(claims.name).toBe(samplePayload.name);
      expect(claims.roles).toEqual(samplePayload.roles);
      expect(claims.sessionId).toBe(samplePayload.sessionId);
      expect(claims.iss).toBe('store-management-system');
      expect(claims.aud).toBe('store-management-system-api');
    });

    it('should reject malformed token strings with UnauthorizedError', () => {
      expect(() => tokenService.verifyAccessToken('not.a.valid.jwt')).toThrow(UnauthorizedError);
      expect(() => tokenService.verifyAccessToken('')).toThrow(UnauthorizedError);
    });

    it('should reject tokens signed with an invalid or different secret', () => {
      const forgedToken = jwt.sign(
        {
          sub: samplePayload.sub,
          email: samplePayload.email,
          roles: ['SUPER_ADMIN'],
          sessionId: samplePayload.sessionId,
        },
        'wrong-secret-key-that-does-not-match-env-key-at-all!!',
        {
          algorithm: 'HS256',
          issuer: 'store-management-system',
          audience: 'store-management-system-api',
        }
      );

      expect(() => tokenService.verifyAccessToken(forgedToken)).toThrow(UnauthorizedError);
    });

    it('should reject expired tokens with UnauthorizedError', () => {
      const expiredToken = jwt.sign(
        {
          sub: samplePayload.sub,
          email: samplePayload.email,
          roles: samplePayload.roles,
          sessionId: samplePayload.sessionId,
        },
        process.env['JWT_ACCESS_SECRET'] || 'dev-jwt-access-secret-minimum-32-chars-long!!',
        {
          algorithm: 'HS256',
          issuer: 'store-management-system',
          audience: 'store-management-system-api',
          expiresIn: '-1s', // Expired 1 second ago
        }
      );

      expect(() => tokenService.verifyAccessToken(expiredToken)).toThrow(UnauthorizedError);
    });
  });
});
