import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { type Env, getEnv } from '../../config/env.js';
import type { AccessTokenClaims } from './auth.types.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';

export class TokenService {
  constructor(private readonly env: Env = getEnv()) {}

  /**
   * Signs a short-lived HMAC-SHA256 JWT access token.
   */
  public signAccessToken(
    claims: Omit<AccessTokenClaims, 'iss' | 'aud' | 'iat' | 'exp'>,
    expiresIn: string = this.env.JWT_ACCESS_TTL
  ): string {
    return jwt.sign(claims, this.env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      issuer: this.env.JWT_ISSUER,
      audience: this.env.JWT_AUDIENCE,
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    });
  }

  /**
   * Verifies and decodes an access token against allowed algorithms, issuer, and audience.
   */
  public verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const decoded = jwt.verify(token, this.env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: this.env.JWT_ISSUER,
        audience: this.env.JWT_AUDIENCE,
      });

      return decoded as AccessTokenClaims;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Access token has expired. Please refresh your session.');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Malformed or invalid access token.');
      }
      throw new UnauthorizedError('Token verification failed.');
    }
  }

  /**
   * Generates a cryptographically secure random opaque refresh token and its SHA-256 hash.
   * Plaintext refresh tokens are returned to clients; only the SHA-256 hash is persisted.
   */
  public generateRefreshToken(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashRefreshToken(rawToken);
    return { rawToken, tokenHash };
  }

  /**
   * Computes deterministic SHA-256 hash of a raw refresh token.
   */
  public hashRefreshToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Computes refresh token expiration date based on configured retention days.
   */
  public getRefreshTokenExpiryDate(days: number = this.env.REFRESH_TOKEN_TTL_DAYS): Date {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    return expiresAt;
  }
}

export const tokenService = new TokenService();
