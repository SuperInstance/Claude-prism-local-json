/**
 * ============================================================================
 * SECURE ENCRYPTION UTILITY
 * ============================================================================
 *
 * **Purpose**: Provides AES-256-GCM encryption for sensitive data like API keys.
 * Uses machine-specific secrets for key derivation to ensure encrypted data
 * can only be decrypted on the same machine.
 *
 * **Last Updated**: 2025-01-14
 * **Dependencies**: Node.js crypto module
 *
 * **Security Model**:
 * - Encryption: AES-256-GCM (authenticated encryption)
 * - Key Derivation: PBKDF2 with SHA-256
 * - Key Source: Machine-specific (hostname + platform + user ID)
 * - Salt: Unique per encryption (stored with ciphertext)
 * - Auth Tag: GCM authentication tag prevents tampering
 *
 * **Threat Model**:
 * - Protects against: Config file theft, git commits, shared screenshots
 * - Does NOT protect against: Compromised machine, memory dumps, keyloggers
 * - Best Practice: Use environment variables for production (more secure)
 *
 * **Encryption Format**:
 * ```json
 * {
 *   "encrypted": "base64(ciphertext)",
 *   "salt": "base64(salt)",
 *   "nonce": "base64(nonce)",
 *   "authTag": "base64(authTag)"
 * }
 * ```
 *
 * **Usage Example**:
 * ```typescript
 * import { encrypt, decrypt } from './encryption.js';
 *
 * // Encrypt an API key
 * const encrypted = encrypt('sk-ant-xxx...');
 * config.apiKey = encrypted;
 *
 * // Decrypt when needed
 * const apiKey = decrypt(config.apiKey);
 * ```
 *
 * **Environment Variables**:
 * - PRISM_ENCRYPTION_KEY: Override master key (for testing/migration)
 * - PRISM_NO_ENCRYPTION: Disable encryption (NOT recommended)
 *
 * **Error Handling**:
 * - Throws Error with descriptive messages
 * - Never logs plaintext keys
 * - Sanitizes keys in error messages
 */

import crypto from 'crypto';
import os from 'os';
import { execSync } from 'child_process';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Encrypted data container
 *
 * Stores all components needed for AES-256-GCM decryption:
 * - ciphertext: The encrypted data
 * - salt: For key derivation (unique per encryption)
 * - nonce: For GCM mode (must never reuse)
 * - authTag: For authentication (prevents tampering)
 */
export interface EncryptedData {
  /** Base64-encoded ciphertext */
  encrypted: string;

  /** Base64-encoded salt for key derivation */
  salt: string;

  /** Base64-encoded nonce (IV) for GCM mode */
  nonce: string;

  /** Base64-encoded authentication tag */
  authTag: string;
}

/**
 * Encryption options
 */
export interface EncryptionOptions {
  /** Master key (overrides machine-specific key) */
  masterKey?: string;

  /** Number of PBKDF2 iterations (default: 100000) */
  iterations?: number;

  /** Key derivation salt (default: random) */
  salt?: Buffer;
}

/**
 * Key validation result
 */
export interface KeyValidationResult {
  /** Whether the key is valid */
  valid: boolean;

  /** Validation errors if invalid */
  errors: string[];

  /** Key type if recognized */
  keyType?: string;

  /** Key service/provider */
  service?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Algorithm used for encryption */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/** Algorithm used for key derivation */
const KDF_ALGORITHM = 'sha256';

/** Default number of PBKDF2 iterations (NIST recommended minimum) */
const DEFAULT_ITERATIONS = 100000;

/** Key length in bytes (256 bits) */
const KEY_LENGTH = 32;

/** Nonce length in bytes (96 bits for GCM) */
const NONCE_LENGTH = 12;

/** Salt length in bytes (128 bits) */
const SALT_LENGTH = 16;

/** Authentication tag length in bytes (128 bits for GCM) */
const AUTH_TAG_LENGTH = 16;

// ============================================================================
// KEY DERIVATION
// ============================================================================

/**
 * Get machine-specific secret for key derivation
 *
 * Combines multiple machine identifiers to create a unique secret:
 * - Hostname
 * - Platform (os.type())
 * - User ID (or username)
 * - CPU info (optional, on supported systems)
 *
 * This ensures encrypted data can only be decrypted on the same machine.
 *
 * **Security Note**: This is NOT cryptographically secure, but provides
 * reasonable protection against config file theft. For production, use
 * environment variables instead.
 *
 * @returns Machine-specific secret string
 */
function getMachineSecret(): string {
  const parts: string[] = [];

  // Hostname
  try {
    parts.push(os.hostname() || 'unknown-host');
  } catch {
    parts.push('unknown-host');
  }

  // Platform
  parts.push(os.type() || 'unknown-platform');

  // User ID or username
  try {
    const userInfo = os.userInfo();
    parts.push(userInfo.uid?.toString() || userInfo.username || 'unknown-user');
  } catch {
    // Fallback to environment
    parts.push(process.env.USER || process.env.USERNAME || 'unknown-user');
  }

  // CPU info (optional, adds more uniqueness)
  try {
    const cpus = os.cpus();
    if (cpus && cpus.length > 0) {
      parts.push(cpus[0].model || 'unknown-cpu');
    }
  } catch {
    // Ignore if CPU info unavailable
  }

  // Machine ID (Linux-only)
  try {
    if (os.platform() === 'linux') {
      const machineId = execSync('cat /etc/machine-id 2>/dev/null || echo ""', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      if (machineId) {
        parts.push(machineId);
      }
    }
  } catch {
    // Ignore if machine-id unavailable
  }

  return parts.join('|');
}

/**
 * Derive encryption key from machine secret
 *
 * Uses PBKDF2 (Password-Based Key Derivation Function 2) with SHA-256:
 * - Slow: 100,000 iterations prevents brute force
 * - Salted: Each encryption uses unique salt
 * - Standard: NIST-approved for key derivation
 *
 * @param salt - Salt for key derivation (unique per encryption)
 * @param iterations - Number of PBKDF2 iterations
 * @returns 32-byte encryption key
 */
function deriveKey(salt: Buffer, iterations: number = DEFAULT_ITERATIONS): Buffer {
  // Use environment variable override if provided (for testing/migration)
  const secret =
    process.env.PRISM_ENCRYPTION_KEY || getMachineSecret();

  return crypto.pbkdf2Sync(
    secret,
    salt,
    iterations,
    KEY_LENGTH,
    KDF_ALGORITHM
  );
}

// ============================================================================
// ENCRYPTION
// ============================================================================

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * **Process**:
 * 1. Generate random salt and nonce
 * 2. Derive encryption key from machine secret + salt
 * 3. Encrypt plaintext with AES-256-GCM
 * 4. Return ciphertext + salt + nonce + auth tag
 *
 * **Security Guarantees**:
 * - Confidentiality: AES-256-GCM encryption
 * - Integrity: GCM authentication tag prevents tampering
 * - Uniqueness: Random nonce ensures different ciphertext each time
 *
 * @param plaintext - Data to encrypt (e.g., API key)
 * @param options - Encryption options
 * @returns Encrypted data container
 *
 * @example
 * ```typescript
 * const encrypted = encrypt('sk-ant-api-key-123');
 * // Store encrypted.encrypted in config file
 * ```
 */
export function encrypt(
  plaintext: string,
  options: EncryptionOptions = {}
): EncryptedData {
  // Validate input
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }

  // Generate random salt and nonce
  const salt = options.salt || crypto.randomBytes(SALT_LENGTH);
  const nonce = crypto.randomBytes(NONCE_LENGTH);

  // Derive encryption key
  const iterations = options.iterations || DEFAULT_ITERATIONS;
  const key = deriveKey(salt, iterations);

  // Create cipher
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, nonce);

  // Encrypt
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Return encrypted data container
  return {
    encrypted: ciphertext.toString('base64'),
    salt: salt.toString('base64'),
    nonce: nonce.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

// ============================================================================
// DECRYPTION
// ============================================================================

/**
 * Decrypt ciphertext using AES-256-GCM
 *
 * **Process**:
 * 1. Extract salt, nonce, and auth tag from container
 * 2. Derive decryption key from machine secret + salt
 * 3. Decrypt ciphertext with AES-256-GCM
 * 4. Verify auth tag (throws if tampered)
 * 5. Return plaintext
 *
 * **Security Guarantees**:
 * - Auth tag verification prevents tampering
 * - Throws if key is wrong (wrong machine or modified config)
 * - Never logs plaintext
 *
 * @param encryptedData - Encrypted data container or JSON string
 * @param options - Decryption options
 * @returns Decrypted plaintext
 *
 * @example
 * ```typescript
 * const apiKey = decrypt(config.apiKey);
 * // Use apiKey for API calls
 * ```
 *
 * @throws {Error} If decryption fails or auth tag is invalid
 */
export function decrypt(
  encryptedData: EncryptedData | string,
  options: EncryptionOptions = {}
): string {
  // Parse if string
  let data: EncryptedData;
  if (typeof encryptedData === 'string') {
    try {
      data = JSON.parse(encryptedData);
    } catch (error) {
      throw new Error('Invalid encrypted data: not valid JSON');
    }
  } else {
    data = encryptedData;
  }

  // Validate structure
  if (!data.encrypted || !data.salt || !data.nonce || !data.authTag) {
    throw new Error('Invalid encrypted data: missing required fields');
  }

  // Decode from base64
  const ciphertext = Buffer.from(data.encrypted, 'base64');
  const salt = Buffer.from(data.salt, 'base64');
  const nonce = Buffer.from(data.nonce, 'base64');
  const authTag = Buffer.from(data.authTag, 'base64');

  // Derive decryption key
  const iterations = options.iterations || DEFAULT_ITERATIONS;
  const key = deriveKey(salt, iterations);

  // Create decipher
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, nonce);

  // Set authentication tag
  decipher.setAuthTag(authTag);

  // Decrypt
  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString('utf-8');
  } catch (error) {
    // Auth tag verification failed or wrong key
    throw new Error(
      'Decryption failed: data may be corrupted or encrypted on a different machine'
    );
  }
}

/**
 * Check if a value is encrypted
 *
 * @param value - Value to check
 * @returns True if value appears to be encrypted
 */
export function isEncrypted(value: unknown): boolean {
  if (typeof value === 'string') {
    try {
      const data = JSON.parse(value);
      return (
        typeof data === 'object' &&
        data !== null &&
        'encrypted' in data &&
        'salt' in data &&
        'nonce' in data &&
        'authTag' in data
      );
    } catch {
      return false;
    }
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    'encrypted' in value &&
    'salt' in value &&
    'nonce' in value &&
    'authTag' in value
  );
}

// ============================================================================
// KEY VALIDATION
// ============================================================================

/**
 * API key patterns for validation
 *
 * Maps service names to their API key patterns.
 * Used for validation and to provide helpful error messages.
 */
const KEY_PATTERNS: Record<
  string,
  { pattern: RegExp; keyType: string; service: string }
> = {
  anthropic: {
    pattern: /^sk-ant-api[\w-]{50,}$/i,
    keyType: 'Anthropic API Key',
    service: 'anthropic',
  },
  openai: {
    pattern: /^sk-[\w-]{48,}$/i,
    keyType: 'OpenAI API Key',
    service: 'openai',
  },
  cloudflare: {
    pattern: /^[\w-]{30,}$/, // Cloudflare keys vary
    keyType: 'Cloudflare API Token',
    service: 'cloudflare',
  },
  github: {
    pattern: /^ghp_[\w-]{36,}$/i,
    keyType: 'GitHub Personal Access Token',
    service: 'github',
  },
  huggingface: {
    pattern: /^hf_[\w-]{34,}$/i,
    keyType: 'Hugging Face API Token',
    service: 'huggingface',
  },
  cohere: {
    pattern: /^[\w-]{40,}$/, // Cohere keys vary
    keyType: 'Cohere API Key',
    service: 'cohere',
  },
};

/**
 * Validate API key format
 *
 * Checks if the key matches known patterns for various services.
 * This helps catch typos and provides helpful error messages.
 *
 * @param key - API key to validate
 * @param service - Expected service (optional)
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateApiKey('sk-ant-api-xxx', 'anthropic');
 * if (!result.valid) {
 *   console.error('Invalid API key:', result.errors);
 * }
 * ```
 */
export function validateApiKey(
  key: string,
  service?: string
): KeyValidationResult {
  const errors: string[] = [];

  // Basic checks
  if (!key) {
    errors.push('API key is empty');
    return { valid: false, errors };
  }

  if (typeof key !== 'string') {
    errors.push('API key must be a string');
    return { valid: false, errors };
  }

  if (key.length < 20) {
    errors.push('API key is too short (minimum 20 characters)');
  }

  if (/\s/.test(key)) {
    errors.push('API key contains whitespace');
  }

  // Check against known patterns
  if (service) {
    const pattern = KEY_PATTERNS[service.toLowerCase()];
    if (pattern) {
      if (!pattern.pattern.test(key)) {
        errors.push(
          `Invalid ${pattern.service} API key format. Expected format: ${pattern.keyType}`
        );
        return { valid: false, errors, keyType: pattern.keyType, service: pattern.service };
      }
      return {
        valid: true,
        errors: [],
        keyType: pattern.keyType,
        service: pattern.service,
      };
    }
  }

  // Try to identify the service
  for (const [name, { pattern, keyType, service: svc }] of Object.entries(KEY_PATTERNS)) {
    if (pattern.test(key)) {
      return {
        valid: true,
        errors: [],
        keyType: keyType,
        service: svc,
      };
    }
  }

  // Unknown pattern but passes basic checks
  if (errors.length === 0) {
    return {
      valid: true,
      errors: [],
      keyType: 'Unknown',
      service: 'unknown',
    };
  }

  return { valid: false, errors };
}

/**
 * Sanitize API key for logging/error messages
 *
 * Masks all but the first and last few characters to prevent
 * accidental exposure in logs or error messages.
 *
 * @param key - API key to sanitize
 * @returns Sanitized key (e.g., "sk-ant...xxx123")
 *
 * @example
 * ```typescript
 * console.log('Using API key:', sanitizeApiKey(key));
 * // Output: "Using API key: sk-ant...xxx123"
 * ```
 */
export function sanitizeApiKey(key: string): string {
  if (!key || key.length < 10) {
    return '***';
  }

  const start = key.substring(0, 8);
  const end = key.substring(key.length - 4);
  return `${start}...${end}`;
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Migrate plaintext keys to encrypted
 *
 * Scans a config object and encrypts any plaintext API keys found.
 * Useful for migrating existing configs to encrypted format.
 *
 * @param config - Configuration object
 * @returns Updated config with encrypted keys
 *
 * @example
 * ```typescript
 * const config = loadConfig();
 * const migrated = migratePlaintextKeys(config);
 * saveConfig(migrated);
 * ```
 */
export function migratePlaintextKeys<T extends Record<string, unknown>>(
  config: T
): T {
  const migrated = { ...config };

  // Known API key fields
  const apiKeyFields = [
    'apiKey',
    'api_key',
    'anthropicApiKey',
    'openaiApiKey',
    'cloudflareApiKey',
    'githubToken',
    'huggingfaceToken',
  ];

  for (const field of apiKeyFields) {
    const value = migrated[field];
    if (
      value &&
      typeof value === 'string' &&
      !isEncrypted(value) &&
      !value.startsWith('${')
    ) {
      // This looks like a plaintext key, encrypt it
      console.warn(`Migrating plaintext key '${field}' to encrypted format`);
      migrated[field] = JSON.stringify(encrypt(value));
    }
  }

  // Check nested objects (e.g., cloudflare.apiKey)
  for (const key in migrated) {
    const value = migrated[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      migrated[key] = migratePlaintextKeys(value as Record<string, unknown>);
    }
  }

  return migrated;
}

/**
 * Rotate encryption key
 *
 * Decrypts all keys with old key and re-encrypts with new key.
 * Useful when changing machine secrets or after security incident.
 *
 * @param config - Configuration object
 * @param oldSecret - Old machine secret (or omit to use current)
 * @param newSecret - New machine secret (or omit to use current)
 * @returns Updated config with rotated encryption
 */
export function rotateEncryptionKey<T extends Record<string, unknown>>(
  config: T,
  oldSecret?: string,
  newSecret?: string
): T {
  // Temporarily override environment variables
  const originalEnv = process.env.PRISM_ENCRYPTION_KEY;

  if (oldSecret) {
    process.env.PRISM_ENCRYPTION_KEY = oldSecret;
  }

  // Decrypt all keys
  const decrypted: Record<string, unknown> = {};
  for (const key in config) {
    const value = config[key];
    if (isEncrypted(value)) {
      try {
        decrypted[key] = decrypt(value as EncryptedData);
      } catch (error) {
        console.warn(`Failed to decrypt '${key}' with old key, skipping`);
        decrypted[key] = value;
      }
    } else {
      decrypted[key] = value;
    }
  }

  // Switch to new key
  if (newSecret) {
    process.env.PRISM_ENCRYPTION_KEY = newSecret;
  } else {
    delete process.env.PRISM_ENCRYPTION_KEY;
  }

  // Re-encrypt all keys
  const reencrypted: Record<string, unknown> = {};
  for (const key in decrypted) {
    const value = decrypted[key];
    if (typeof value === 'string' && !value.startsWith('${')) {
      reencrypted[key] = JSON.stringify(encrypt(value));
    } else {
      reencrypted[key] = value;
    }
  }

  // Restore environment
  if (originalEnv) {
    process.env.PRISM_ENCRYPTION_KEY = originalEnv;
  } else {
    delete process.env.PRISM_ENCRYPTION_KEY;
  }

  return reencrypted as T;
}
