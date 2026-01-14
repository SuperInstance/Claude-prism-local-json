/**
 * ============================================================================
 * KEY STORAGE MODULE TESTS
 * ============================================================================
 *
 * Tests for the secure key storage service.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  KeyStorage,
  createKeyStorage,
  getApiKey,
  setApiKey,
  type KeyInfo,
} from '../../../src/config/KeyStorage.js';
import { encrypt, sanitizeApiKey } from '../../../src/config/encryption.js';

describe('KeyStorage Module', () => {
  let tempDir: string;
  let storage: KeyStorage;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = mkdtempSync(join(tmpdir(), 'prism-key-storage-test-'));
    storage = new KeyStorage({ storageDir: tempDir });
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Clear environment variables
    delete process.env.PRISM_CLOUDFLARE_API_KEY;
    delete process.env.PRISM_ANTHROPIC_API_KEY;
    delete process.env.PRISM_OPENAI_API_KEY;
  });

  describe('initialize', () => {
    it('should create storage directory', async () => {
      await storage.initialize();

      const { existsSync } = await import('fs-extra');
      expect(existsSync(tempDir)).toBe(true);
    });
  });

  describe('set', () => {
    it('should store an API key', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      const result = await storage.set('anthropic', apiKey);

      expect(result.valid).toBe(true);
      expect(result.service).toBe('anthropic');
    });

    it('should store key with label', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
      const label = 'Production key';

      await storage.set('anthropic', apiKey, label);

      const keys = await storage.list();
      const key = keys.find(k => k.service === 'anthropic');

      expect(key?.label).toBe(label);
    });

    it('should reject invalid API key', async () => {
      await storage.initialize();

      await expect(
        storage.set('anthropic', 'invalid-key')
      ).rejects.toThrow('Invalid API key');
    });

    it('should update existing key', async () => {
      await storage.initialize();
      const apiKey1 = 'sk-ant-api03-111111111111111111111111111111111111111111111111';
      const apiKey2 = 'sk-ant-api03-222222222222222222222222222222222222222222222222';

      await storage.set('anthropic', apiKey1);
      const keys1 = await storage.list();
      const date1 = keys1[0]?.updatedAt;

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      await storage.set('anthropic', apiKey2);
      const keys2 = await storage.list();
      const date2 = keys2.find(k => k.service === 'anthropic')?.updatedAt;

      expect(date2).not.toBe(date1);
    });

    it('should normalize service name', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('ANTHROPIC', apiKey);

      const retrieved = await storage.get('anthropic');
      expect(retrieved).toBe(apiKey);
    });
  });

  describe('get', () => {
    it('should retrieve stored key', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);
      const retrieved = await storage.get('anthropic');

      expect(retrieved).toBe(apiKey);
    });

    it('should return undefined for non-existent key', async () => {
      await storage.initialize();

      const retrieved = await storage.get('nonexistent');

      expect(retrieved).toBeUndefined();
    });

    it('should prioritize environment variables', async () => {
      await storage.initialize();
      const storedKey = 'sk-ant-api03-111111111111111111111111111111111111111111111111';
      const envKey = 'sk-ant-api03-222222222222222222222222222222222222222222222222';

      await storage.set('anthropic', storedKey);
      process.env.PRISM_ANTHROPIC_API_KEY = envKey;

      const retrieved = await storage.get('anthropic');

      expect(retrieved).toBe(envKey);
    });

    it('should handle multiple env var formats', async () => {
      await storage.initialize();

      process.env.PRISM_CLOUDFLARE_API_KEY = 'cf-api-key-1';

      const retrieved = await storage.get('cloudflare');

      expect(retrieved).toBe('cf-api-key-1');
    });

    it('should decrypt encrypted keys', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);
      const retrieved = await storage.get('anthropic');

      expect(retrieved).toBe(apiKey);
    });

    it('should return undefined if decryption fails', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);

      // Change encryption key to simulate different machine
      const originalEnv = process.env.PRISM_ENCRYPTION_KEY;
      process.env.PRISM_ENCRYPTION_KEY = 'different-key';

      try {
        const retrieved = await storage.get('anthropic');

        // Should return undefined when decryption fails
        expect(retrieved).toBeUndefined();
      } finally {
        if (originalEnv) {
          process.env.PRISM_ENCRYPTION_KEY = originalEnv;
        } else {
          delete process.env.PRISM_ENCRYPTION_KEY;
        }
      }
    });
  });

  describe('has', () => {
    it('should return true for existing key', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);
      const exists = await storage.has('anthropic');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      await storage.initialize();

      const exists = await storage.has('nonexistent');

      expect(exists).toBe(false);
    });

    it('should return true for environment variables', async () => {
      await storage.initialize();

      process.env.PRISM_ANTHROPIC_API_KEY = 'env-key';

      const exists = await storage.has('anthropic');

      expect(exists).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove stored key', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);
      expect(await storage.has('anthropic')).toBe(true);

      const removed = await storage.remove('anthropic');

      expect(removed).toBe(true);
      expect(await storage.has('anthropic')).toBe(false);
    });

    it('should return false for non-existent key', async () => {
      await storage.initialize();

      const removed = await storage.remove('nonexistent');

      expect(removed).toBe(false);
    });

    it('should not affect environment variables', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);
      process.env.PRISM_ANTHROPIC_API_KEY = 'env-key';

      await storage.remove('anthropic');

      // Should still be available via env
      expect(await storage.has('anthropic')).toBe(true);
      expect(await storage.get('anthropic')).toBe('env-key');
    });
  });

  describe('list', () => {
    it('should return empty array when no keys', async () => {
      await storage.initialize();

      const keys = await storage.list();

      expect(keys).toHaveLength(0);
    });

    it('should list all stored keys', async () => {
      await storage.initialize();

      await storage.set('cloudflare', 'cf-api-key-1234567890abcdef');
      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');

      const keys = await storage.list();

      expect(keys).toHaveLength(2);
      expect(keys.some(k => k.service === 'cloudflare')).toBe(true);
      expect(keys.some(k => k.service === 'anthropic')).toBe(true);
    });

    it('should include keys from environment variables', async () => {
      await storage.initialize();

      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');
      process.env.PRISM_CLOUDFLARE_API_KEY = 'env-cf-key';

      const keys = await storage.list();

      expect(keys.length).toBeGreaterThanOrEqual(2);
      expect(keys.some(k => k.service === 'anthropic' && !k.fromEnv)).toBe(true);
      expect(keys.some(k => k.service === 'cloudflare' && k.fromEnv)).toBe(true);
    });

    it('should not include environment keys if storage has same service', async () => {
      await storage.initialize();

      const storedKey = 'sk-ant-api03-111111111111111111111111111111111111111111111111';
      const envKey = 'sk-ant-api03-222222222222222222222222222222222222222222222222';

      await storage.set('anthropic', storedKey);
      process.env.PRISM_ANTHROPIC_API_KEY = envKey;

      const keys = await storage.list();
      const anthropicKeys = keys.filter(k => k.service === 'anthropic');

      // Should only have one entry (env var takes priority)
      expect(anthropicKeys).toHaveLength(1);
      expect(anthropicKeys[0]?.fromEnv).toBe(true);
      expect(anthropicKeys[0]?.sanitizedKey).toBe(sanitizeApiKey(envKey));
    });

    it('should sanitize keys in list', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);

      const keys = await storage.list();
      const key = keys.find(k => k.service === 'anthropic');

      expect(key?.sanitizedKey).toBe('sk-ant-a...cdef');
      expect(key?.sanitizedKey).not.toContain(apiKey);
    });

    it('should include metadata', async () => {
      await storage.initialize();
      const label = 'Production key';

      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef', label);

      const keys = await storage.list();
      const key = keys.find(k => k.service === 'anthropic');

      expect(key?.label).toBe(label);
      expect(key?.createdAt).toBeDefined();
      expect(key?.updatedAt).toBeDefined();
    });

    it('should sort keys by service name', async () => {
      await storage.initialize();

      await storage.set('cloudflare', 'cf-api-key-1234567890abcdef');
      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');
      await storage.set('github', 'ghp_1234567890abcdef1234567890abcdef123456');

      const keys = await storage.list();

      expect(keys[0]?.service).toBe('anthropic');
      expect(keys[1]?.service).toBe('cloudflare');
      expect(keys[2]?.service).toBe('github');
    });
  });

  describe('validate', () => {
    it('should validate stored key', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);

      const validation = await storage.validate('anthropic');

      expect(validation?.valid).toBe(true);
      expect(validation?.service).toBe('anthropic');
    });

    it('should return undefined for non-existent key', async () => {
      await storage.initialize();

      const validation = await storage.validate('nonexistent');

      expect(validation).toBeUndefined();
    });
  });

  describe('rotateEncryption', () => {
    it('should rotate encryption key', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);

      // Rotate with new key
      await storage.rotateEncryption('old-key', 'new-key');

      // Should be able to retrieve with new key
      process.env.PRISM_ENCRYPTION_KEY = 'new-key';

      try {
        const retrieved = await storage.get('anthropic');
        expect(retrieved).toBe(apiKey);
      } finally {
        delete process.env.PRISM_ENCRYPTION_KEY;
      }
    });

    it('should update timestamps on rotation', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);

      const keysBefore = await storage.list();
      const updatedAtBefore = keysBefore[0]?.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));
      await storage.rotateEncryption('old-key', 'new-key');

      const keysAfter = await storage.list();
      const updatedAtAfter = keysAfter.find(k => k.service === 'anthropic')?.updatedAt;

      expect(updatedAtAfter).not.toBe(updatedAtBefore);
    });
  });

  describe('clear', () => {
    it('should clear all stored keys', async () => {
      await storage.initialize();

      await storage.set('cloudflare', 'cf-api-key-1234567890abcdef');
      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');

      await storage.clear();

      expect(await storage.has('cloudflare')).toBe(false);
      expect(await storage.has('anthropic')).toBe(false);
    });

    it('should not affect environment variables', async () => {
      await storage.initialize();

      await storage.set('anthropic', 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef');
      process.env.PRISM_CLOUDFLARE_API_KEY = 'env-cf-key';

      await storage.clear();

      expect(await storage.has('cloudflare')).toBe(true);
    });
  });

  describe('convenience functions', () => {
    it('createKeyStorage should initialize storage', async () => {
      const storage = await createKeyStorage();

      expect(storage).toBeInstanceOf(KeyStorage);

      const keys = await storage.list();
      expect(Array.isArray(keys)).toBe(true);
    });

    it('getApiKey should retrieve key', async () => {
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await setApiKey('anthropic', apiKey);
      const retrieved = await getApiKey('anthropic');

      expect(retrieved).toBe(apiKey);
    });

    it('setApiKey should store key', async () => {
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      const result = await setApiKey('cloudflare', apiKey);

      expect(result.valid).toBe(true);
    });
  });

  describe('auto-migration', () => {
    it('should migrate plaintext keys on initialize', async () => {
      // Create storage with plaintext keys
      const storage1 = new KeyStorage({
        storageDir: tempDir,
        autoMigrate: false,
      });
      await storage1.initialize();

      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';
      await storage1.set('anthropic', apiKey);

      // Create new storage with auto-migrate
      const storage2 = new KeyStorage({
        storageDir: tempDir,
        autoMigrate: true,
      });
      await storage2.initialize();

      // Key should still be retrievable
      const retrieved = await storage2.get('anthropic');
      expect(retrieved).toBe(apiKey);
    });
  });

  describe('environment variable overrides', () => {
    it('should disable env overrides when configured', async () => {
      await storage.initialize();
      const apiKey = 'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef';

      await storage.set('anthropic', apiKey);
      process.env.PRISM_ANTHROPIC_API_KEY = 'env-key';

      const storageNoEnv = new KeyStorage({
        storageDir: tempDir,
        enableEnvOverrides: false,
      });

      const retrieved = await storageNoEnv.get('anthropic');

      expect(retrieved).toBe(apiKey);
    });
  });
});
