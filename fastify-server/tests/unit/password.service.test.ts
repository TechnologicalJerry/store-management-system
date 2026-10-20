import { describe, expect, it } from 'vitest';
import { PasswordService } from '../../src/modules/auth/password.service.js';
import { BadRequestError } from '../../src/common/errors/app-error.js';

describe('PasswordService (Unit)', () => {
  const passwordService = new PasswordService();

  describe('normalizeEmail', () => {
    it('should trim surrounding whitespace and convert to lowercase', () => {
      const email = '   User.Admin@EXAMPLE.COM   ';
      const normalized = passwordService.normalizeEmail(email);
      expect(normalized).toBe('user.admin@example.com');
    });

    it('should preserve already normalized email addresses', () => {
      const email = 'cashier@store.local';
      expect(passwordService.normalizeEmail(email)).toBe('cashier@store.local');
    });
  });

  describe('assertValidPassword', () => {
    it('should accept passwords with valid length between 8 and 128 characters', () => {
      expect(() => passwordService.assertValidPassword('P@ssw0rd123!')).not.toThrow();
      expect(() => passwordService.assertValidPassword('a'.repeat(8))).not.toThrow();
      expect(() => passwordService.assertValidPassword('a'.repeat(128))).not.toThrow();
    });

    it('should throw BadRequestError when password is fewer than 8 characters', () => {
      expect(() => passwordService.assertValidPassword('short7!')).toThrow(BadRequestError);
      expect(() => passwordService.assertValidPassword('')).toThrow(BadRequestError);
    });

    it('should throw BadRequestError when password exceeds 128 characters', () => {
      const longPassword = 'a'.repeat(129);
      expect(() => passwordService.assertValidPassword(longPassword)).toThrow(BadRequestError);
    });
  });

  describe('hashPassword and verifyPassword', () => {
    it('should hash a password using Argon2id algorithm', async () => {
      const plaintext = 'SecurePass!2026';
      const hash = await passwordService.hashPassword(plaintext);

      expect(hash).toBeDefined();
      expect(hash.startsWith('$argon2id$')).toBe(true);
    });

    it('should successfully verify the correct password against its Argon2id hash', async () => {
      const plaintext = 'CorrectHorseBatteryStaple!9';
      const hash = await passwordService.hashPassword(plaintext);

      const isValid = await passwordService.verifyPassword(hash, plaintext);
      expect(isValid).toBe(true);
    });

    it('should reject verification when the password does not match', async () => {
      const plaintext = 'CorrectHorseBatteryStaple!9';
      const wrongPassword = 'WrongHorseBatteryStaple!9';
      const hash = await passwordService.hashPassword(plaintext);

      const isValid = await passwordService.verifyPassword(hash, wrongPassword);
      expect(isValid).toBe(false);
    });

    it('should return false when verifying against an invalid hash string', async () => {
      const isValid = await passwordService.verifyPassword('invalid-non-argon-hash', 'SomePass123!');
      expect(isValid).toBe(false);
    });
  });
});
