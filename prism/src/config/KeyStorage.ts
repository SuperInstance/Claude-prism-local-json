/**
 * ============================================================================
 * SECURE KEY STORAGE SERVICE
 * ============================================================================
 *
 * **Purpose**: Manages secure storage and retrieval of API keys with encryption.
 * Provides a unified interface for storing, retrieving, and managing sensitive
 * credentials across different services.
 *
 * **Last Updated**: 2025-01-14
 * **Dependencies**: encryption.ts, fs-extra, path
 *
 * **Features**:
 * - Encrypt keys at rest using AES-256-GCM
 * - Support for environment variable overrides (most secure)
 * - Automatic decryption when retrieving keys
 * - Key validation and format checking
 * - Key rotation support
 * - Migration from plaintext to encrypted
 *
 * **Security Model**:
 * 1. **Best Practice**: Environment variables (no storage in files)
 * 2. **Good Practice**: Encrypted storage in config files
 * 3. **Legacy**: Plaintext (warns user, auto-migrates)
 *
 * **Usage Example**:
 * ```typescript
 * import { KeyStorage } from './KeyStorage.js';
 *
 * const storage = new KeyStorage();
 *
 * // Store a key (encrypted)
 * await storage.set('cloudflare', 'your-api-key');
 *
 * // Retrieve a key (auto-decrypts)
 * const key = await storage.get('cloudflare');
 *
 * // List all services
 * const services = await storage.list();
 * // => ['cloudflare', 'anthropic', 'github']
 *
 * // Remove a key
 * await storage.remove('cloudflare');
 * ```
 *
 * **Supported Services**:
 * - cloudflare: Cloudflare API Token
 * - anthropic: Anthropic Claude API Key
 * - openai: OpenAI API Key
 * - github: GitHub Personal Access Token
 * - huggingface: Hugging Face API Token
 * - cohere: Cohere API Key
 * - custom: Custom API keys (user-defined)
 *
 * **Environment Variable Overrides**:
 * - PRISM_CLOUDFLARE_API_KEY
 * - PRISM_ANTHROPIC_API_KEY
 * - PRISM_OPENAI_API_KEY
 * - PRISM_GITHUB_TOKEN
 * - PRISM_HUGGINGFACE_TOKEN
 * - PRISM_COHERE_API_KEY
 * - PRISM_<SERVICE>_API_KEY (for custom services)
 *
 * **Error Handling**:
 * - Throws descriptive errors for invalid operations
 * - Never logs plaintext keys
 * - Sanitizes keys in error messages
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  encrypt,
  decrypt,
  isEncrypted,
  validateApiKey,
  sanitizeApiKey,
  migratePlaintextKeys,
  type EncryptedData,
  type KeyValidationResult,
} from './encryption.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Stored key metadata
 */
export interface StoredKey {
  /** Service name (e.g., 'cloudflare', 'anthropic') */
  service: string;

  /** Encrypted key data */
  keyData: EncryptedData;

  /** When the key was stored */
  createdAt: string;

  /** When the key was last updated */
  updatedAt: string;

  /** Optional key description/label */
  label?: string;

  /** Optional key metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Key storage options
 */
export interface KeyStorageOptions {
  /** Custom storage directory (default: ~/.prism/keys) */
  storageDir?: string;

  /** Auto-migrate plaintext keys to encrypted (default: true) */
  autoMigrate?: boolean;

  /** Enable environment variable overrides (default: true) */
  enableEnvOverrides?: boolean;
}

/**
 * Key information for listing
 */
export interface KeyInfo {
  /** Service name */
  service: string;

  /** Key label if present */
  label?: string;

  /** Whether key is from environment variable */
  fromEnv: boolean;

  /** When the key was stored (not for env vars) */
  createdAt?: string;

  /** When the key was last updated (not for env vars) */
  updatedAt?: string;

  /** Sanitized key for display */
  sanitizedKey: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default storage directory */
const DEFAULT_STORAGE_DIR = '.prism/keys';

/** Key storage filename */
const KEYS_FILENAME = 'api-keys.json';

/** Environment variable prefix */
const ENV_PREFIX = 'PRISM_';

/** Service-specific environment variable suffixes */
const ENV_SUFFIXES: Record<string, string[]> = {
  cloudflare: ['CLOUDFLARE_API_KEY', 'CLOUDFLARE_TOKEN'],
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_KEY'],
  openai: ['OPENAI_API_KEY', 'OPENAI_KEY'],
  github: ['GITHUB_TOKEN', 'GITHUB_PAT'],
  huggingface: ['HUGGINGFACE_TOKEN', 'HUGGINGFACE_API_KEY'],
  cohere: ['COHERE_API_KEY', 'COHERE_KEY'],
};

// ============================================================================
// KEY STORAGE CLASS
// ============================================================================

/**
 * Secure key storage service
 *
 * Manages encrypted storage of API keys with support for:
 * - File-based encryption (default)
 * - Environment variable overrides (more secure)
 * - Key validation and migration
 * - Key rotation
 */
export class KeyStorage {
  private storageDir: string;
  private keysFilePath: string;
  private autoMigrate: boolean;
  private enableEnvOverrides: boolean;
  private keysCache: Map<string, StoredKey> | null = null;

  /**
   * Create a new KeyStorage instance
   *
   * @param options - Storage options
   */
  constructor(options: KeyStorageOptions = {}) {
    this.storageDir =
      options.storageDir || path.join(os.homedir(), DEFAULT_STORAGE_DIR);
    this.keysFilePath = path.join(this.storageDir, KEYS_FILENAME);
    this.autoMigrate = options.autoMigrate !== false;
    this.enableEnvOverrides = options.enableEnvOverrides !== false;
  }

  /**
   * Initialize the key storage
   *
   * Creates storage directory if it doesn't exist.
   * Migrates plaintext keys if autoMigrate is enabled.
   */
  async initialize(): Promise<void> {
    await fs.ensureDir(this.storageDir);

    if (this.autoMigrate) {
      await this.migratePlaintextKeys();
    }
  }

  /**
   * Store an API key
   *
   * Encrypts the key and stores it in the key storage file.
   * Validates the key format before storing.
   *
   * @param service - Service name (e.g., 'cloudflare', 'anthropic')
   * @param apiKey - API key to store
   * @param label - Optional label/description
   * @returns Validation result
   *
   * @throws {Error} If key validation fails
   *
   * @example
   * ```typescript
   * await storage.set('cloudflare', 'my-api-key', 'Production token');
   * ```
   */
  async set(
    service: string,
    apiKey: string,
    label?: string
  ): Promise<KeyValidationResult> {
    // Validate key format
    const validation = validateApiKey(apiKey, service);
    if (!validation.valid) {
      throw new Error(
        `Invalid API key for ${service}: ${validation.errors.join(', ')}`
      );
    }

    // Normalize service name
    const normalizedService = service.toLowerCase();

    // Load existing keys
    const keys = await this.loadKeys();

    // Check if key exists
    const existingKey = keys.get(normalizedService);
    const now = new Date().toISOString();

    // Encrypt the key
    const encrypted = encrypt(apiKey);

    // Store the key
    keys.set(normalizedService, {
      service: normalizedService,
      keyData: encrypted,
      createdAt: existingKey?.createdAt || now,
      updatedAt: now,
      label,
      metadata: {
        keyType: validation.keyType,
        service: validation.service,
      },
    });

    // Save to disk
    await this.saveKeys(keys);

    // Clear cache
    this.keysCache = null;

    return validation;
  }

  /**
   * Retrieve an API key
   *
   * Returns the decrypted API key for the specified service.
   * Checks environment variables first if enabled.
   *
   * @param service - Service name
   * @returns Decrypted API key or undefined if not found
   *
   * @example
   * ```typescript
   * const key = await storage.get('cloudflare');
   * if (key) {
   *   console.log('Using API key:', sanitizeApiKey(key));
   * }
   * ```
   */
  async get(service: string): Promise<string | undefined> {
    // Normalize service name
    const normalizedService = service.toLowerCase();

    // Check environment variables first (most secure)
    if (this.enableEnvOverrides) {
      const envKey = this.getEnvKey(normalizedService);
      if (envKey) {
        return envKey;
      }
    }

    // Load from storage
    const keys = await this.loadKeys();
    const storedKey = keys.get(normalizedService);

    if (!storedKey) {
      return undefined;
    }

    // Decrypt and return
    try {
      return decrypt(storedKey.keyData);
    } catch (error) {
      console.warn(
        `Failed to decrypt key for ${normalizedService}. ` +
          `It may have been encrypted on a different machine.`
      );
      return undefined;
    }
  }

  /**
   * Check if a key exists
   *
   * @param service - Service name
   * @returns True if key exists (in storage or environment)
   */
  async has(service: string): Promise<boolean> {
    const normalizedService = service.toLowerCase();

    // Check environment variables
    if (this.enableEnvOverrides) {
      const envKey = this.getEnvKey(normalizedService);
      if (envKey) {
        return true;
      }
    }

    // Check storage
    const keys = await this.loadKeys();
    return keys.has(normalizedService);
  }

  /**
   * Remove an API key
   *
   * @param service - Service name
   * @returns True if key was removed, false if not found
   */
  async remove(service: string): Promise<boolean> {
    const normalizedService = service.toLowerCase();

    // Load keys
    const keys = await this.loadKeys();

    // Remove if exists
    const deleted = keys.delete(normalizedService);

    if (deleted) {
      await this.saveKeys(keys);
      this.keysCache = null;
    }

    return deleted;
  }

  /**
   * List all stored keys
   *
   * Returns information about all stored keys without exposing
   * the actual key values. Includes keys from environment variables.
   *
   * @returns Array of key information
   *
   * @example
   * ```typescript
   * const keys = await storage.list();
   * for (const key of keys) {
   *   console.log(`${key.service}: ${key.sanitizedKey}`);
   *   if (key.fromEnv) console.log('  (from environment variable)');
   * }
   * ```
   */
  async list(): Promise<KeyInfo[]> {
    const result: KeyInfo[] = [];
    const seenServices = new Set<string>();

    // Check environment variables
    if (this.enableEnvOverrides) {
      const envServices = this.getEnvServices();
      for (const service of envServices) {
        const apiKey = this.getEnvKey(service);
        if (apiKey) {
          result.push({
            service,
            fromEnv: true,
            sanitizedKey: sanitizeApiKey(apiKey),
          });
          seenServices.add(service);
        }
      }
    }

    // Check storage
    const keys = await this.loadKeys();
    for (const [service, storedKey] of keys.entries()) {
      if (!seenServices.has(service)) {
        let apiKey: string | undefined;
        try {
          apiKey = decrypt(storedKey.keyData);
        } catch {
          // Decryption failed, use placeholder
          apiKey = '<decryption failed>';
        }

        result.push({
          service,
          label: storedKey.label,
          fromEnv: false,
          createdAt: storedKey.createdAt,
          updatedAt: storedKey.updatedAt,
          sanitizedKey: sanitizeApiKey(apiKey || '<unknown>'),
        });
      }
    }

    return result.sort((a, b) => a.service.localeCompare(b.service));
  }

  /**
   * Validate a stored key
   *
   * Retrieves and validates the key format.
   *
   * @param service - Service name
   * @returns Validation result or undefined if key not found
   */
  async validate(service: string): Promise<KeyValidationResult | undefined> {
    const apiKey = await this.get(service);
    if (!apiKey) {
      return undefined;
    }

    return validateApiKey(apiKey, service);
  }

  /**
   * Rotate encryption key
   *
   * Re-encrypts all stored keys with a new encryption key.
   * Useful when changing machine secrets or after security incident.
   *
   * @param oldSecret - Old machine secret (or omit to use current)
   * @param newSecret - New machine secret (or omit to use current)
   */
  async rotateEncryption(oldSecret?: string, newSecret?: string): Promise<void> {
    const keys = await this.loadKeys();

    for (const [service, storedKey] of keys.entries()) {
      try {
        // Decrypt with old key
        const oldEnv = process.env.PRISM_ENCRYPTION_KEY;
        if (oldSecret) {
          process.env.PRISM_ENCRYPTION_KEY = oldSecret;
        }

        const plaintext = decrypt(storedKey.keyData);

        // Encrypt with new key
        if (newSecret) {
          process.env.PRISM_ENCRYPTION_KEY = newSecret;
        } else if (oldSecret) {
          delete process.env.PRISM_ENCRYPTION_KEY;
        }

        const encrypted = encrypt(plaintext);

        // Update stored key
        storedKey.keyData = encrypted;
        storedKey.updatedAt = new Date().toISOString();

        // Restore environment
        if (oldEnv) {
          process.env.PRISM_ENCRYPTION_KEY = oldEnv;
        } else {
          delete process.env.PRISM_ENCRYPTION_KEY;
        }
      } catch (error) {
        console.warn(`Failed to rotate key for ${service}:`, error);
      }
    }

    await this.saveKeys(keys);
    this.keysCache = null;
  }

  /**
   * Clear all stored keys
   *
   * **WARNING**: This operation cannot be undone!
   * Does not affect environment variables.
   */
  async clear(): Promise<void> {
    await this.saveKeys(new Map());
    this.keysCache = null;
  }

  /**
   * Backup all stored keys to an encrypted archive
   *
   * Creates a timestamped backup of all encrypted keys.
   * The backup itself is encrypted and can only be restored on the same machine.
   *
   * @returns Backup file path
   *
   * @example
   * ```typescript
   * const backupPath = await storage.backup();
   * console.log('Backup created:', backupPath);
   * ```
   */
  async backup(): Promise<string> {
    const keys = await this.loadKeys();

    if (keys.size === 0) {
      throw new Error('No keys to backup');
    }

    // Create backup directory
    const backupDir = path.join(this.storageDir, '.backups');
    await fs.ensureDir(backupDir);

    // Create backup data
    const backupData = {
      version: 1,
      timestamp: new Date().toISOString(),
      machine: {
        hostname: os.hostname(),
        platform: os.platform(),
        userInfo: os.userInfo().username,
      },
      keys: Object.fromEntries(keys.entries()),
    };

    // Encrypt backup data
    const encrypted = encrypt(JSON.stringify(backupData));

    // Write backup file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `api-keys-${timestamp}.json`);
    await fs.writeFile(backupPath, JSON.stringify(encrypted, null, 2), 'utf-8');

    return backupPath;
  }

  /**
   * Restore keys from a backup archive
   *
   * Restores all keys from a previously created backup.
   * Will overwrite existing keys if they conflict.
   *
   * @param backupPath - Path to backup file
   * @param options - Restore options
   * @returns Restore result
   *
   * @example
   * ```typescript
   * const result = await storage.restore('./backup.json');
   * console.log('Restored:', result.restoredCount, 'keys');
   * ```
   */
  async restore(
    backupPath: string,
    options: { merge?: boolean; validate?: boolean } = {}
  ): Promise<{ restoredCount: number; skippedCount: number; errors: string[] }> {
    const { merge = false, validate = true } = options;
    const errors: string[] = [];

    // Read backup file
    if (!(await fs.pathExists(backupPath))) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    const backupContent = await fs.readFile(backupPath, 'utf-8');
    const encrypted = JSON.parse(backupContent);

    // Decrypt backup data
    let backupData: {
      version: number;
      timestamp: string;
      machine: { hostname: string; platform: string; userInfo: string };
      keys: Record<string, StoredKey>;
    };

    try {
      const decrypted = decrypt(encrypted);
      backupData = JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Failed to decrypt backup. This backup may be from a different machine.');
    }

    // Verify backup version
    if (backupData.version !== 1) {
      throw new Error(`Unsupported backup version: ${backupData.version}`);
    }

    // Load existing keys
    const existingKeys = merge ? await this.loadKeys() : new Map<string, StoredKey>();

    // Restore keys
    let restoredCount = 0;
    let skippedCount = 0;

    for (const [service, storedKey] of Object.entries(backupData.keys)) {
      try {
        // Validate key if requested
        if (validate) {
          const decrypted = decrypt(storedKey.keyData);
          const validation = validateApiKey(decrypted, service);
          if (!validation.valid) {
            errors.push(`Invalid key for ${service}: ${validation.errors.join(', ')}`);
            continue;
          }
        }

        // Restore key
        existingKeys.set(service, storedKey);
        restoredCount++;
      } catch (error) {
        errors.push(
          `Failed to restore ${service}: ${error instanceof Error ? error.message : String(error)}`
        );
        skippedCount++;
      }
    }

    // Save restored keys
    await this.saveKeys(existingKeys);
    this.keysCache = null;

    return { restoredCount, skippedCount, errors };
  }

  /**
   * List available backups
   *
   * @returns Array of backup file information
   *
   * @example
   * ```typescript
   * const backups = await storage.listBackups();
   * for (const backup of backups) {
   *   console.log(backup.path, backup.timestamp);
   * }
   * ```
   */
  async listBackups(): Promise<Array<{ path: string; timestamp: string; size: number }>> {
    const backupDir = path.join(this.storageDir, '.backups');

    if (!(await fs.pathExists(backupDir))) {
      return [];
    }

    const files = await fs.readdir(backupDir);
    const backups: Array<{ path: string; timestamp: string; size: number }> = [];

    for (const file of files) {
      if (file.startsWith('api-keys-') && file.endsWith('.json')) {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);

        // Try to extract timestamp from filename
        const match = file.match(/api-keys-(.+)\.json/);
        const timestamp = match ? match[1] : stats.mtime.toISOString();

        backups.push({
          path: filePath,
          timestamp,
          size: stats.size,
        });
      }
    }

    return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * Delete old backups
   *
   * @param keep - Number of most recent backups to keep (default: 5)
   * @returns Number of deleted backups
   *
   * @example
   * ```typescript
   * const deleted = await storage.cleanupBackups(5);
   * console.log('Deleted', deleted, 'old backups');
   * ```
   */
  async cleanupBackups(keep: number = 5): Promise<number> {
    const backups = await this.listBackups();

    if (backups.length <= keep) {
      return 0;
    }

    // Delete oldest backups
    const toDelete = backups.slice(keep);
    let deleted = 0;

    for (const backup of toDelete) {
      try {
        await fs.remove(backup.path);
        deleted++;
      } catch (error) {
        console.warn(`Failed to delete backup ${backup.path}:`, error);
      }
    }

    return deleted;
  }

  /**
   * Export keys for migration to another machine
   *
   * Creates a portable export that can be imported on another machine.
   * Keys are NOT encrypted in the export (must be encrypted on destination).
   *
   * **WARNING**: Export contains plaintext keys. Handle with care!
   *
   * @returns Export data (plaintext - user must encrypt)
   *
   * @example
   * ```typescript
   * const export = await storage.exportForMigration();
   * console.log('Export', export.keys.length, 'keys');
   * // Save export securely (encrypt, password protect, etc.)
   * ```
   */
  async exportForMigration(): Promise<{
    version: number;
    timestamp: string;
    keys: Array<{ service: string; label?: string; key: string }>;
  }> {
    const keys = await this.loadKeys();
    const exportData: Array<{ service: string; label?: string; key: string }> = [];

    for (const [service, storedKey] of keys.entries()) {
      try {
        const decrypted = decrypt(storedKey.keyData);
        exportData.push({
          service,
          label: storedKey.label,
          key: decrypted,
        });
      } catch (error) {
        console.warn(`Failed to export key for ${service}:`, error);
      }
    }

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      keys: exportData,
    };
  }

  /**
   * Import keys from migration export
   *
   * Imports keys exported from another machine.
   * Keys will be encrypted with the current machine's secret.
   *
   * @param exportData - Export data from exportForMigration()
   * @param options - Import options
   * @returns Import result
   *
   * @example
   * ```typescript
   * const result = await storage.importFromMigration(exportData);
   * console.log('Imported', result.importedCount, 'keys');
   * ```
   */
  async importFromMigration(
    exportData: {
      version: number;
      timestamp: string;
      keys: Array<{ service: string; label?: string; key: string }>;
    },
    options: { merge?: boolean; overwrite?: boolean } = {}
  ): Promise<{ importedCount: number; skippedCount: number; errors: string[] }> {
    const { merge = true, overwrite = false } = options;
    const errors: string[] = [];

    // Load existing keys
    const existingKeys = merge ? await this.loadKeys() : new Map<string, StoredKey>();

    let importedCount = 0;
    let skippedCount = 0;

    for (const { service, label, key } of exportData.keys) {
      try {
        // Check if key already exists
        if (existingKeys.has(service) && !overwrite) {
          skippedCount++;
          continue;
        }

        // Validate key
        const validation = validateApiKey(key, service);
        if (!validation.valid) {
          errors.push(`Invalid key for ${service}: ${validation.errors.join(', ')}`);
          continue;
        }

        // Encrypt and store
        const encrypted = encrypt(key);
        const now = new Date().toISOString();

        existingKeys.set(service, {
          service,
          keyData: encrypted,
          createdAt: now,
          updatedAt: now,
          label,
          metadata: {
            keyType: validation.keyType,
            service: validation.service,
            importedFrom: 'migration',
          },
        });

        importedCount++;
      } catch (error) {
        errors.push(
          `Failed to import ${service}: ${error instanceof Error ? error.message : String(error)}`
        );
        skippedCount++;
      }
    }

    // Save imported keys
    await this.saveKeys(existingKeys);
    this.keysCache = null;

    return { importedCount, skippedCount, errors };
  }

  // ========================================================================
  // PRIVATE METHODS
  // ========================================================================

  /**
   * Load keys from storage
   *
   * @returns Map of service to stored key
   */
  private async loadKeys(): Promise<Map<string, StoredKey>> {
    // Return cached keys if available
    if (this.keysCache) {
      return this.keysCache;
    }

    // Check if file exists
    if (!(await fs.pathExists(this.keysFilePath))) {
      this.keysCache = new Map();
      return this.keysCache;
    }

    // Read and parse
    try {
      const content = await fs.readFile(this.keysFilePath, 'utf-8');
      const data = JSON.parse(content);

      // Convert to Map
      const keys = new Map<string, StoredKey>();
      for (const [service, keyData] of Object.entries(data)) {
        keys.set(service, keyData as StoredKey);
      }

      this.keysCache = keys;
      return keys;
    } catch (error) {
      console.warn('Failed to load keys, starting with empty storage:', error);
      this.keysCache = new Map();
      return this.keysCache;
    }
  }

  /**
   * Save keys to storage
   *
   * @param keys - Map of service to stored key
   */
  private async saveKeys(keys: Map<string, StoredKey>): Promise<void> {
    // Convert to object
    const data: Record<string, StoredKey> = {};
    for (const [service, keyData] of keys.entries()) {
      data[service] = keyData;
    }

    // Write to file
    await fs.writeFile(this.keysFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Get API key from environment variable
   *
   * Checks multiple possible environment variable names for the service.
   *
   * @param service - Service name
   * @returns API key or undefined
   */
  private getEnvKey(service: string): string | undefined {
    // Check service-specific variables
    const suffixes = ENV_SUFFIXES[service] || [
      `${service.toUpperCase()}_API_KEY`,
      `${service.toUpperCase()}_KEY`,
      `${service.toUpperCase()}_TOKEN`,
    ];

    for (const suffix of suffixes) {
      const envVar = ENV_PREFIX + suffix;
      const value = process.env[envVar];
      if (value) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * Get all services with environment variables set
   *
   * @returns Array of service names
   */
  private getEnvServices(): string[] {
    const services: string[] = [];

    // Check known services
    for (const service of Object.keys(ENV_SUFFIXES)) {
      if (this.getEnvKey(service)) {
        services.push(service);
      }
    }

    // Check for custom PRISM_*_API_KEY variables
    const prefix = ENV_PREFIX;
    for (const envVar of Object.keys(process.env)) {
      if (
        envVar.startsWith(prefix) &&
        (envVar.endsWith('_API_KEY') ||
          envVar.endsWith('_KEY') ||
          envVar.endsWith('_TOKEN'))
      ) {
        // Extract service name
        const service = envVar
          .substring(prefix.length)
          .replace(/_API_KEY$/i, '')
          .replace(/_KEY$/i, '')
          .replace(/_TOKEN$/i, '')
          .toLowerCase();

        if (service && !services.includes(service)) {
          services.push(service);
        }
      }
    }

    return services;
  }

  /**
   * Migrate plaintext keys to encrypted format
   *
   * Scans existing keys and encrypts any that are not encrypted.
   */
  private async migratePlaintextKeys(): Promise<void> {
    const keys = await this.loadKeys();
    let migrated = false;

    for (const [service, storedKey] of keys.entries()) {
      const keyData = storedKey.keyData;

      // Check if already encrypted
      if (typeof keyData === 'string' && isEncrypted(keyData)) {
        continue;
      }

      // Check if it's a plaintext key (not an object)
      if (typeof keyData === 'string' && !keyData.startsWith('${')) {
        console.warn(`Migrating plaintext key for '${service}' to encrypted format`);

        try {
          // Validate before encrypting
          const validation = validateApiKey(keyData, service);
          if (!validation.valid) {
            console.warn(
              `Skipping migration for '${service}': ${validation.errors.join(', ')}`
            );
            continue;
          }

          // Encrypt the key
          const encrypted = encrypt(keyData);

          // Update stored key
          storedKey.keyData = encrypted;
          storedKey.updatedAt = new Date().toISOString();
          migrated = true;
        } catch (error) {
          console.warn(`Failed to migrate key for '${service}':`, error);
        }
      }
    }

    if (migrated) {
      await this.saveKeys(keys);
      this.keysCache = null;
      console.log('Key migration complete');
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a default KeyStorage instance
 *
 * Convenience function for creating a KeyStorage instance with default options.
 *
 * @returns Initialized KeyStorage instance
 */
export async function createKeyStorage(): Promise<KeyStorage> {
  const storage = new KeyStorage();
  await storage.initialize();
  return storage;
}

/**
 * Get an API key (convenience function)
 *
 * Simplifies the common pattern of getting a single key.
 *
 * @param service - Service name
 * @returns API key or undefined if not found
 *
 * @example
 * ```typescript
 * const cloudflareKey = await getApiKey('cloudflare');
 * if (!cloudflareKey) {
 *   console.error('Cloudflare API key not found');
 * }
 * ```
 */
export async function getApiKey(service: string): Promise<string | undefined> {
  const storage = new KeyStorage();
  await storage.initialize();
  return storage.get(service);
}

/**
 * Set an API key (convenience function)
 *
 * Simplifies the common pattern of setting a single key.
 *
 * @param service - Service name
 * @param apiKey - API key to store
 * @param label - Optional label
 * @returns Validation result
 *
 * @example
 * ```typescript
 * await setApiKey('cloudflare', 'my-api-key', 'Production token');
 * ```
 */
export async function setApiKey(
  service: string,
  apiKey: string,
  label?: string
): Promise<KeyValidationResult> {
  const storage = new KeyStorage();
  await storage.initialize();
  return storage.set(service, apiKey, label);
}
