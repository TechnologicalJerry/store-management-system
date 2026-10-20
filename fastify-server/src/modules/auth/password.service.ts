import argon2 from 'argon2';
import { BadRequestError } from '../../common/errors/app-error.js';

/**
 * Argon2id cryptographic parameters adhering to OWASP recommendations.
 */
export const ARGON2_CONFIG: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,       // 3 iterations
  parallelism: 4,    // 4 threads
};

export class PasswordService {
  /**
   * Hashes a plaintext password using Argon2id.
   */
  public async hashPassword(password: string): Promise<string> {
    this.assertValidPassword(password);
    return argon2.hash(password, ARGON2_CONFIG);
  }

  /**
   * Verifies a candidate password against an Argon2id hash in constant time.
   */
  public async verifyPassword(hash: string, candidate: string): Promise<boolean> {
    if (!hash || !candidate || candidate.length > 128) {
      return false;
    }
    try {
      return await argon2.verify(hash, candidate);
    } catch {
      return false;
    }
  }

  /**
   * Enforces password complexity and safety boundaries.
   * Prevents excessively large strings (>128 chars) from exhausting server resources.
   */
  public assertValidPassword(password: string): void {
    if (!password || typeof password !== 'string') {
      throw new BadRequestError('Password must be a valid string.');
    }
    if (password.length < 8) {
      throw new BadRequestError('Password must be at least 8 characters long.');
    }
    if (password.length > 128) {
      throw new BadRequestError('Password must not exceed 128 characters.');
    }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      throw new BadRequestError('Password must contain at least one letter and one number.');
    }
  }

  /**
   * Normalizes an email address consistently across registration and lookup.
   */
  public normalizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      throw new BadRequestError('Email must be a valid string.');
    }
    return email.trim().toLowerCase();
  }
}

export const passwordService = new PasswordService();
