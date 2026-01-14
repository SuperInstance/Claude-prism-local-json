/**
 * ============================================================================
 * ENCRYPTION MODULE TESTS
 * ============================================================================
 *
 * Tests for the AES-256-GCM encryption utilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';
import {
  encrypt,
  decrypt,
  isEncrypted,
  validateApiKey,
  sanitizeApiKey,
  migratePlaintextKeys,
  rotateEncryptionKey,
  type EncryptedData,
} from '../../../src/config/encryption.js';

describe('Encryption Module', () => {
  describe('encrypt', () => {
    it('should encrypt plaintext to encrypted data', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toHaveProperty('encrypted');
      expect(encrypted).toHaveProperty('salt');
      expect(encrypted).toHaveProperty('nonce');
      expect(encrypted).toHaveProperty('authTag');

      expect(typeof encrypted.encrypted).toBe('string');
      expect(typeof encrypted.salt).toBe('string');
      expect(typeof encrypted.nonce).toBe('string');
      expect(typeof encrypted.authTag).toBe('string');

      // Should be base64 encoded
      expect(() => Buffer.from(encrypted.encrypted, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.salt, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.nonce, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.authTag, 'base64')).not.toThrow();
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Nonce should be different (random)
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);

      // Ciphertext should be different
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
    });

    it('should throw on empty plaintext', () => {
      expect(() => encrypt('')).toThrow('Plaintext must be a non-empty string');
    });

    it('should throw on non-string input', () => {
      expect(() => encrypt(null as unknown as string)).toThrow();
      expect(() => encrypt(undefined as unknown as string)).toThrow();
      expect(() => encrypt(123 as unknown as string)).toThrow();
    });

    it('should accept custom salt', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const customSalt = Buffer.from('custom-salt-16-bytes');

      const encrypted = encrypt(plaintext, { salt: customSalt });

      const saltBuffer = Buffer.from(encrypted.salt, 'base64');
      expect(saltBuffer).toEqual(customSalt);
    });

    it('should accept custom iterations', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const iterations = 50000;

      const encrypted = encrypt(plaintext, { iterations });

      // Should not throw
      expect(encrypted.encrypted).toBeDefined();
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data back to plaintext', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const encrypted = encrypt(plaintext);

      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt JSON string encrypted data', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const encrypted = encrypt(plaintext);
      const encryptedJson = JSON.stringify(encrypted);

      const decrypted = decrypt(encryptedJson);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw on invalid encrypted data structure', () => {
      const invalidData = {
        encrypted: 'abc',
        // missing salt, nonce, authTag
      };

      expect(() => decrypt(invalidData as EncryptedData)).toThrow('missing required fields');
    });

    it('should throw on invalid JSON', () => {
      expect(() => decrypt('not-valid-json')).toThrow('not valid JSON');
    });

    it('should throw on tampered data', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const encrypted = encrypt(plaintext);

      // Tamper with ciphertext
      const tamperedData = {
        ...encrypted,
        encrypted: Buffer.from(
          Buffer.from(encrypted.encrypted, 'base64').map((b) => b ^ 0xff)
        ).toString('base64'),
      };

      expect(() => decrypt(tamperedData)).toThrow('Decryption failed');
    });

    it('should throw on wrong key (different machine)', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const encrypted = encrypt(plaintext);

      // Simulate different machine by changing env var
      const originalEnv = process.env.PRISM_ENCRYPTION_KEY;
      process.env.PRISM_ENCRYPTION_KEY = 'different-secret-key';

      try {
        expect(() => decrypt(encrypted)).toThrow('Decryption failed');
      } finally {
        if (originalEnv) {
          process.env.PRISM_ENCRYPTION_KEY = originalEnv;
        } else {
          delete process.env.PRISM_ENCRYPTION_KEY;
        }
      }
    });

    it('should accept custom iterations', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const iterations = 50000;

      const encrypted = encrypt(plaintext, { iterations });
      const decrypted = decrypt(encrypted, { iterations });

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted data object', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const encrypted = encrypt(plaintext);

      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return true for encrypted data JSON string', () => {
      const plaintext = 'sk-ant-api-key-1234567890abcdef';
      const encrypted = encrypt(plaintext);
      const encryptedJson = JSON.stringify(encrypted);

      expect(isEncrypted(encryptedJson)).toBe(true);
    });

    it('should return false for plaintext string', () => {
      expect(isEncrypted('sk-ant-api-key-1234567890abcdef')).toBe(false);
    });

    it('should return false for incomplete object', () => {
      const incomplete = {
        encrypted: 'abc',
        salt: 'def',
        // missing nonce, authTag
      };

      expect(isEncrypted(incomplete)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isEncrypted(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isEncrypted(undefined)).toBe(false);
    });

    it('should return false for number', () => {
      expect(isEncrypted(123)).toBe(false);
    });

    it('should return false for array', () => {
      expect(isEncrypted([1, 2, 3])).toBe(false);
    });
  });

  describe('validateApiKey', () => {
    describe('Anthropic keys', () => {
      it('should validate valid Anthropic API key', () => {
        const key = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
        const result = validateApiKey(key, 'anthropic');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.service).toBe('anthropic');
        expect(result.keyType).toBe('Anthropic API Key');
      });

      it('should reject invalid Anthropic API key', () => {
        const key = 'not-a-valid-key';
        const result = validateApiKey(key, 'anthropic');

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('OpenAI keys', () => {
      it('should validate valid OpenAI API key', () => {
        const key = 'sk-1234567890abcdef1234567890abcdef1234567890abcdef';
        const result = validateApiKey(key, 'openai');

        expect(result.valid).toBe(true);
        expect(result.service).toBe('openai');
        expect(result.keyType).toBe('OpenAI API Key');
      });
    });

    describe('GitHub tokens', () => {
      it('should validate valid GitHub PAT', () => {
        const key = 'ghp_1234567890abcdef1234567890abcdef123456';
        const result = validateApiKey(key, 'github');

        expect(result.valid).toBe(true);
        expect(result.service).toBe('github');
        expect(result.keyType).toBe('GitHub Personal Access Token');
      });
    });

    describe('General validation', () => {
      it('should reject empty key', () => {
        const result = validateApiKey('', 'cloudflare');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('API key is empty');
      });

      it('should reject short key', () => {
        const result = validateApiKey('short', 'cloudflare');

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('too short'))).toBe(true);
      });

      it('should reject key with whitespace', () => {
        const result = validateApiKey('sk-ant-api key with spaces', 'anthropic');

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('API key contains whitespace');
      });

      it('should auto-detect service when not specified', () => {
        const key = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
        const result = validateApiKey(key);

        expect(result.valid).toBe(true);
        expect(result.service).toBe('anthropic');
      });

      it('should return unknown for unrecognized but valid-looking key', () => {
        const key = 'some-random-looking-key-that-is-long-enough-to-be-valid-12345';
        const result = validateApiKey(key);

        expect(result.valid).toBe(true);
        expect(result.service).toBe('unknown');
      });
    });
  });

  describe('sanitizeApiKey', () => {
    it('should sanitize long keys', () => {
      const key = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
      const sanitized = sanitizeApiKey(key);

      expect(sanitized).toBe('sk-ant-a...cdef');
      expect(sanitized).not.toContain(key.substring(8, key.length - 4));
    });

    it('should handle short keys', () => {
      const key = 'short';
      const sanitized = sanitizeApiKey(key);

      expect(sanitized).toBe('***');
    });

    it('should handle empty key', () => {
      const sanitized = sanitizeApiKey('');

      expect(sanitized).toBe('***');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeApiKey(null as unknown as string)).toBe('***');
      expect(sanitizeApiKey(undefined as unknown as string)).toBe('***');
    });
  });

  describe('migratePlaintextKeys', () => {
    it('should migrate plaintext API keys to encrypted', () => {
      const config = {
        apiKey: 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef',
        cloudflareApiKey: 'my-cloudflare-api-key-12345678',
        otherField: 'keep-as-is',
        nested: {
          apiKey: 'nested-api-key-1234567890abcdef',
        },
      };

      const migrated = migratePlaintextKeys(config);

      // API keys should be encrypted
      expect(isEncrypted(migrated.apiKey)).toBe(true);
      expect(isEncrypted(migrated.cloudflareApiKey)).toBe(true);
      expect(isEncrypted(migrated.nested.apiKey)).toBe(true);

      // Other fields should be unchanged
      expect(migrated.otherField).toBe('keep-as-is');
    });

    it('should skip environment variable references', () => {
      const config = {
        apiKey: '${ANTHROPIC_API_KEY}',
        cloudflareApiKey: '${CLOUDFLARE_API_KEY}',
      };

      const migrated = migratePlaintextKeys(config);

      expect(migrated.apiKey).toBe('${ANTHROPIC_API_KEY}');
      expect(migrated.cloudflareApiKey).toBe('${CLOUDFLARE_API_KEY}');
    });

    it('should skip already encrypted keys', () => {
      const plaintextKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
      const encryptedKey = JSON.stringify(encrypt(plaintextKey));

      const config = {
        apiKey: encryptedKey,
        otherKey: plaintextKey,
      };

      const migrated = migratePlaintextKeys(config);

      // Already encrypted should remain unchanged
      expect(migrated.apiKey).toBe(encryptedKey);

      // Plaintext should be encrypted
      expect(isEncrypted(migrated.otherKey)).toBe(true);
    });

    it('should handle nested objects', () => {
      const config = {
        cloudflare: {
          apiKey: 'cf-api-key-1234567890abcdef',
          accountId: 'account-123',
        },
        anthropic: {
          apiKey: 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      };

      const migrated = migratePlaintextKeys(config);

      expect(isEncrypted(migrated.cloudflare.apiKey)).toBe(true);
      expect(migrated.cloudflare.accountId).toBe('account-123');
      expect(isEncrypted(migrated.anthropic.apiKey)).toBe(true);
    });
  });

  describe('rotateEncryptionKey', () => {
    it('should rotate encryption for all keys', () => {
      const plaintextKey1 = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
      const plaintextKey2 = 'cf-api-key-1234567890abcdef1234567890';

      const config = {
        apiKey: JSON.stringify(encrypt(plaintextKey1)),
        nested: {
          cloudflareKey: JSON.stringify(encrypt(plaintextKey2)),
        },
        plainField: 'keep-as-is',
      };

      // Rotate with new key
      const rotated = rotateEncryptionKey(config, 'old-secret', 'new-secret');

      // Decrypt with new key should work
      process.env.PRISM_ENCRYPTION_KEY = 'new-secret';

      try {
        const decrypted1 = decrypt(rotated.apiKey as unknown as EncryptedData);
        const decrypted2 = decrypt(
          rotated.nested.cloudflareKey as unknown as EncryptedData
        );

        expect(decrypted1).toBe(plaintextKey1);
        expect(decrypted2).toBe(plaintextKey2);
        expect(rotated.plainField).toBe('keep-as-is');
      } finally {
        delete process.env.PRISM_ENCRYPTION_KEY;
      }
    });

    it('should handle decryption failures gracefully', () => {
      const plaintextKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      const config = {
        apiKey: JSON.stringify(encrypt(plaintextKey)),
        badKey: 'invalid-encrypted-data',
      };

      // Should not throw, just warn about bad key
      const rotated = rotateEncryptionKey(config, 'old-secret', 'new-secret');

      // Valid key should be rotated
      expect(isEncrypted(rotated.apiKey)).toBe(true);

      // Invalid key should be left as-is
      expect(rotated.badKey).toBe('invalid-encrypted-data');
    });
  });

  describe('round-trip encryption', () => {
    const testCases = [
      'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef',
      'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
      'ghp_1234567890abcdef1234567890abcdef123456',
      'a'.repeat(100), // Long string
      'special-chars-!@#$%^&*()_+-=[]{}|;:,.<>?', // Special characters
    ];

    it.each(testCases)('should encrypt and decrypt correctly: %s...', (plaintext) => {
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });
});
