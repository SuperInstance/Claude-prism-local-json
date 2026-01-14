/**
 * ============================================================================
 * INTEGRATION TESTS: Encryption Workflows
 * ============================================================================
 *
 * Tests end-to-end encryption workflows including:
 * - Key storage and retrieval
 * - Migration from plaintext to encrypted
 * - Backup and restore operations
 * - Export and import for migration
 * - Key rotation
 * - Error handling and recovery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, mkdirSync, existsSync } from 'fs';
import {
  KeyStorage,
  type KeyInfo,
} from '../../src/config/KeyStorage.js';
import {
  encrypt,
  decrypt,
  isEncrypted,
  validateApiKey,
  migratePlaintextKeys,
  rotateEncryptionKey,
} from '../../src/config/encryption.js';
import fs from 'fs-extra';

describe('Encryption Workflow Integration Tests', () => {
  let testDir: string;
  let storage: KeyStorage;

  beforeEach(() => {
    // Create temporary directory for tests
    testDir = join(tmpdir(), `prism-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create KeyStorage instance with test directory
    storage = new KeyStorage({
      storageDir: testDir,
      autoMigrate: false,
      enableEnvOverrides: false,
    });
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Key Storage and Retrieval', () => {
    it('should store and retrieve API key with encryption', async () => {
      await storage.initialize();

      const service = 'anthropic';
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      // Store key
      const validation = await storage.set(service, apiKey, 'Test key');
      expect(validation.valid).toBe(true);
      expect(validation.service).toBe('anthropic');

      // Retrieve key
      const retrieved = await storage.get(service);
      expect(retrieved).toBe(apiKey);

      // Verify key exists
      const hasKey = await storage.has(service);
      expect(hasKey).toBe(true);
    });

    it('should list all stored keys with sanitized display', async () => {
      await storage.initialize();

      // Store multiple keys
      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');
      await storage.set('cloudflare', 'cf-api-key-1234567890abcdef');
      await storage.set('github', 'ghp_1234567890abcdef1234567890abcdef123456');

      // List keys
      const keys = await storage.list();
      expect(keys).toHaveLength(3);

      // Verify keys are sanitized
      for (const key of keys) {
        expect(key.sanitizedKey).toContain('...');
        expect(key.sanitizedKey).not.toContain(key.service);
      }
    });

    it('should remove stored key', async () => {
      await storage.initialize();

      const service = 'anthropic';
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      // Store key
      await storage.set(service, apiKey);

      // Remove key
      const removed = await storage.remove(service);
      expect(removed).toBe(true);

      // Verify key is gone
      const hasKey = await storage.has(service);
      expect(hasKey).toBe(false);

      // Remove non-existent key
      const removedAgain = await storage.remove(service);
      expect(removedAgain).toBe(false);
    });

    it('should validate stored key', async () => {
      await storage.initialize();

      const service = 'anthropic';
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      // Store key
      await storage.set(service, apiKey);

      // Validate key
      const validation = await storage.validate(service);
      expect(validation).toBeDefined();
      expect(validation?.valid).toBe(true);
      expect(validation?.service).toBe('anthropic');
    });
  });

  describe('Encryption and Decryption', () => {
    it('should encrypt and decrypt correctly', () => {
      const plaintext = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      // Encrypt
      const encrypted = encrypt(plaintext);

      // Verify structure
      expect(encrypted).toHaveProperty('encrypted');
      expect(encrypted).toHaveProperty('salt');
      expect(encrypted).toHaveProperty('nonce');
      expect(encrypted).toHaveProperty('authTag');

      // Decrypt
      const decrypted = decrypt(encrypted);

      // Verify round-trip
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Nonces should be different
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);

      // Ciphertext should be different
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);

      // But both should decrypt to same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should detect encrypted data', () => {
      const plaintext = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
      const encrypted = encrypt(plaintext);

      // Should detect encrypted data
      expect(isEncrypted(encrypted)).toBe(true);
      expect(isEncrypted(JSON.stringify(encrypted))).toBe(true);

      // Should not detect plaintext
      expect(isEncrypted(plaintext)).toBe(false);
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
    });

    it('should fail to decrypt with wrong key', () => {
      const plaintext = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      // Encrypt with default key
      const encrypted = encrypt(plaintext);

      // Try to decrypt with different key
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

    it('should fail to decrypt tampered data', () => {
      const plaintext = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
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
  });

  describe('Key Validation', () => {
    it('should validate Anthropic API keys', () => {
      const validKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
      const invalidKey = 'not-a-valid-key';

      const validResult = validateApiKey(validKey, 'anthropic');
      expect(validResult.valid).toBe(true);
      expect(validResult.service).toBe('anthropic');

      const invalidResult = validateApiKey(invalidKey, 'anthropic');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    it('should validate OpenAI API keys', () => {
      const validKey = 'sk-1234567890abcdef1234567890abcdef1234567890abcdef';

      const result = validateApiKey(validKey, 'openai');
      expect(result.valid).toBe(true);
      expect(result.service).toBe('openai');
    });

    it('should validate GitHub tokens', () => {
      const validKey = 'ghp_1234567890abcdef1234567890abcdef123456';

      const result = validateApiKey(validKey, 'github');
      expect(result.valid).toBe(true);
      expect(result.service).toBe('github');
    });

    it('should auto-detect service', () => {
      const anthropicKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
      const openaiKey = 'sk-1234567890abcdef1234567890abcdef1234567890abcdef';

      const anthropicResult = validateApiKey(anthropicKey);
      expect(anthropicResult.service).toBe('anthropic');

      const openaiResult = validateApiKey(openaiKey);
      expect(openaiResult.service).toBe('openai');
    });
  });

  describe('Backup and Restore', () => {
    it('should backup and restore all keys', async () => {
      await storage.initialize();

      // Store multiple keys
      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');
      await storage.set('cloudflare', 'cf-api-key-1234567890abcdef');

      // Create backup
      const backupPath = await storage.backup();
      expect(existsSync(backupPath)).toBe(true);

      // Clear all keys
      await storage.clear();

      // Verify keys are gone
      expect(await storage.has('anthropic')).toBe(false);
      expect(await storage.has('cloudflare')).toBe(false);

      // Restore from backup
      const result = await storage.restore(backupPath);

      expect(result.restoredCount).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Verify keys are restored
      expect(await storage.get('anthropic')).toBe('sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');
      expect(await storage.get('cloudflare')).toBe('cf-api-key-1234567890abcdef');
    });

    it('should list available backups', async () => {
      await storage.initialize();

      // Store a key
      await storage.set('test', 'test-api-key-1234567890abcdef');

      // Create multiple backups
      const backup1 = await storage.backup();
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
      const backup2 = await storage.backup();

      // List backups
      const backups = await storage.listBackups();

      expect(backups.length).toBeGreaterThanOrEqual(2);
      expect(backups[0].path).toBeDefined();
      expect(backups[0].timestamp).toBeDefined();
      expect(backups[0].size).toBeGreaterThan(0);
    });

    it('should cleanup old backups', async () => {
      await storage.initialize();

      // Store a key
      await storage.set('test', 'test-api-key-1234567890abcdef');

      // Create multiple backups
      await storage.backup();
      await new Promise(resolve => setTimeout(resolve, 10));
      await storage.backup();
      await new Promise(resolve => setTimeout(resolve, 10));
      await storage.backup();

      // Keep only 2 most recent
      const deleted = await storage.cleanupBackups(2);

      expect(deleted).toBeGreaterThan(0);

      // Verify only 2 backups remain
      const backups = await storage.listBackups();
      expect(backups.length).toBe(2);
    });

    it('should merge backup with existing keys', async () => {
      await storage.initialize();

      // Store initial keys
      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');

      // Create backup
      const backupPath = await storage.backup();

      // Add more keys
      await storage.set('cloudflare', 'cf-api-key-1234567890abcdef');

      // Restore with merge
      const result = await storage.restore(backupPath, { merge: true });

      // Should have kept cloudflare key
      expect(await storage.has('cloudflare')).toBe(true);
      expect(await storage.has('anthropic')).toBe(true);
    });
  });

  describe('Export and Import', () => {
    it('should export keys for migration', async () => {
      await storage.initialize();

      // Store keys
      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef', 'Test key');
      await storage.set('cloudflare', 'cf-api-key-1234567890abcdef');

      // Export
      const exportData = await storage.exportForMigration();

      expect(exportData.version).toBe(1);
      expect(exportData.timestamp).toBeDefined();
      expect(exportData.keys).toHaveLength(2);

      // Verify keys are plaintext
      const anthropicKey = exportData.keys.find(k => k.service === 'anthropic');
      expect(anthropicKey?.key).toBe('sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');
      expect(anthropicKey?.label).toBe('Test key');
    });

    it('should import keys from migration', async () => {
      await storage.initialize();

      const exportData = {
        version: 1,
        timestamp: new Date().toISOString(),
        keys: [
          {
            service: 'anthropic',
            key: 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef',
            label: 'Imported key',
          },
          {
            service: 'cloudflare',
            key: 'cf-api-key-1234567890abcdef',
          },
        ],
      };

      // Import
      const result = await storage.importFromMigration(exportData);

      expect(result.importedCount).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Verify keys were imported and encrypted
      const anthropicKey = await storage.get('anthropic');
      expect(anthropicKey).toBe('sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');

      const cloudflareKey = await storage.get('cloudflare');
      expect(cloudflareKey).toBe('cf-api-key-1234567890abcdef');
    });

    it('should merge import with existing keys', async () => {
      await storage.initialize();

      // Store existing key
      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');

      const exportData = {
        version: 1,
        timestamp: new Date().toISOString(),
        keys: [
          {
            service: 'cloudflare',
            key: 'cf-api-key-1234567890abcdef',
          },
        ],
      };

      // Import with merge
      const result = await storage.importFromMigration(exportData, { merge: true });

      expect(result.importedCount).toBe(1);

      // Verify both keys exist
      expect(await storage.has('anthropic')).toBe(true);
      expect(await storage.has('cloudflare')).toBe(true);
    });

    it('should overwrite existing keys when requested', async () => {
      await storage.initialize();

      // Store existing key
      await storage.set('anthropic', 'sk-ant-api03-old-key-1234567890abcdef1234567890abcdef');

      const exportData = {
        version: 1,
        timestamp: new Date().toISOString(),
        keys: [
          {
            service: 'anthropic',
            key: 'sk-ant-api03-new-key-1234567890abcdef1234567890abcdef',
          },
        ],
      };

      // Import with overwrite
      const result = await storage.importFromMigration(exportData, { overwrite: true });

      expect(result.importedCount).toBe(1);

      // Verify key was updated
      const key = await storage.get('anthropic');
      expect(key).toBe('sk-ant-api03-new-key-1234567890abcdef1234567890abcdef');
    });
  });

  describe('Key Rotation', () => {
    it('should rotate encryption keys', async () => {
      await storage.initialize();

      // Store key with old secret
      process.env.PRISM_ENCRYPTION_KEY = 'old-secret';
      await storage.set('test', 'test-api-key-1234567890abcdef');

      // Rotate to new secret
      await storage.rotateEncryption('old-secret', 'new-secret');

      // Verify can decrypt with new secret
      const key = await storage.get('test');
      expect(key).toBe('test-api-key-1234567890abcdef');

      // Clean up
      delete process.env.PRISM_ENCRYPTION_KEY;
    });

    it('should handle rotation errors gracefully', async () => {
      await storage.initialize();

      // Store key
      await storage.set('test', 'test-api-key-1234567890abcdef');

      // Try to rotate with wrong old key
      // Should not throw, just warn
      await storage.rotateEncryption('wrong-old-secret', 'new-secret');

      // Original key should still work
      const key = await storage.get('test');
      expect(key).toBe('test-api-key-1234567890abcdef');
    });
  });

  describe('Migration from Plaintext', () => {
    it('should migrate plaintext keys to encrypted', () => {
      const config = {
        apiKey: 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef',
        cloudflareApiKey: 'cf-api-key-1234567890abcdef',
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
  });

  describe('Error Handling', () => {
    it('should handle invalid backup file', async () => {
      await storage.initialize();

      await expect(storage.restore('/invalid/backup/path')).rejects.toThrow();
    });

    it('should handle corrupted backup file', async () => {
      await storage.initialize();

      // Create corrupted backup file
      const backupPath = join(testDir, '.backups', 'corrupted.json');
      await fs.ensureDir(join(testDir, '.backups'));
      await fs.writeFile(backupPath, 'invalid-json');

      await expect(storage.restore(backupPath)).rejects.toThrow();
    });

    it('should handle invalid API keys gracefully', async () => {
      await storage.initialize();

      await expect(storage.set('anthropic', 'invalid-key')).rejects.toThrow();
    });

    it('should handle missing keys gracefully', async () => {
      await storage.initialize();

      const key = await storage.get('nonexistent');
      expect(key).toBeUndefined();
    });
  });

  describe('Security', () => {
    it('should never log plaintext keys', async () => {
      await storage.initialize();

      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      // Store key
      await storage.set('anthropic', apiKey);

      // List keys
      const keys = await storage.list();

      // Verify key is sanitized
      const anthropicKey = keys.find(k => k.service === 'anthropic');
      expect(anthropicKey?.sanitizedKey).not.toContain(apiKey);
      expect(anthropicKey?.sanitizedKey).toMatch(/\w{8}\.\.\..+/);
    });

    it('should validate keys before storage', async () => {
      await storage.initialize();

      // Try to store invalid key
      await expect(storage.set('anthropic', 'too-short')).rejects.toThrow();
    });
  });
});
