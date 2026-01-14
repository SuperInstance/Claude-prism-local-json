/**
 * ============================================================================
 * PRISM CONFIGURATION LOADER
 * ============================================================================
 *
 * **Purpose**: This module handles loading, saving, and validating PRISM
 * configuration from ~/.prism/config.yaml. It provides defaults, validation,
 * and merging logic to ensure consistent configuration across the application.
 *
 * **Last Updated**: 2025-01-14
 * **Dependencies**: fs-extra, js-yaml, @types/node
 *
 * **Configuration Flow**:
 * 1. User creates ~/.prism/config.yaml (optional)
 * 2. loadConfig() reads file or returns defaults
 * 3. User config is validated against schema
 * 4. User config is merged with DEFAULT_CONFIG
 * 5. Encrypted API keys are automatically decrypted
 * 6. Environment variables are applied (highest priority)
 * 7. Final config is returned to application
 *
 * **Security Considerations**:
 * - API keys are encrypted at rest using AES-256-GCM
 * - Environment variables override config files (most secure)
 * - Automatic decryption of encrypted keys
 * - Migration of plaintext keys to encrypted format
 * - Validation prevents malicious values (e.g., negative chunkSize)
 * - Config files are not executed (YAML parsing only)
 *
 * **Error Handling**:
 * - Invalid config throws descriptive error with field path
 * - Missing file returns DEFAULT_CONFIG (not an error)
 * - Parse errors include YAML line number
 * - Decryption failures fall back to environment variables
 *
 * **Related Files**:
 * - `src/core/types.ts` - Configuration type definitions
 * - `src/core/PrismEngine.ts` - Consumer of configuration
 * - `src/config/encryption.ts` - Encryption utilities
 * - `src/config/KeyStorage.ts` - Secure key storage
 * - `tests/unit/config.test.ts` - Configuration tests
 *
 * **Future Enhancements**:
 * - Support JSON config format in addition to YAML
 * - Add config file watching for hot reload
 * - Add config migration for version changes
 * - Support multiple config profiles (dev, prod, etc.)
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import type { PrismConfig } from '../core/types.js';
import { isEncrypted, decrypt } from './encryption.js';

/**
 * ============================================================================
 * DEFAULT CONFIGURATION
 * ============================================================================
 *
 * These defaults are used when:
 * - Config file doesn't exist (first run)
 * - User omits specific fields (partial config)
 * - User explicitly calls resetConfig()
 *
 * **Rationale for Defaults**:
 *
 * **Indexer Defaults**:
 * - chunkSize: 500 - Balance between granularity and context
 * - overlap: 50 - 10% overlap prevents boundary issues
 * - languages: Popular languages with tree-sitter support
 * - includePatterns: Common source file extensions
 * - excludePatterns: Standard ignore patterns (node_modules, dist, etc.)
 *
 * **VectorDB Defaults**:
 * - type: 'sqlite' - Local, free, no setup required
 * - path: '~/.prism/vector.db' - Standard location
 *
 * **TokenOptimizer Defaults**:
 * - maxTokens: 100000 - 50% of Claude's 200K limit (leaves room for response)
 * - targetCompression: 0.7 - Good balance of savings vs quality
 * - preserveSignatures: true - Type information is critical for code
 *
 * **ModelRouter Defaults**:
 * - preferLocal: false - Use Claude by default (better quality)
 * - localEndpoint: 'http://localhost:11434' - Ollama default
 *
 * **Tuning Guidelines**:
 * - For large codebases (>1M LOC): Increase chunkSize to 1000
 * - For cost savings: Set preferLocal: true
 * - For better quality: Decrease targetCompression to 0.5
 * - For faster indexing: Decrease overlap to 25
 */

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: PrismConfig = {
  indexer: {
    chunkSize: 500,
    overlap: 50,
    languages: ['typescript', 'javascript', 'python', 'rust', 'go'],
    includePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.rs', '**/*.go'],
    excludePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/*.bundle.js',
      '**/package-lock.json',
      '**/yarn.lock',
      '**/pnpm-lock.yaml',
    ],
  },
  vectorDB: {
    type: 'sqlite',
    path: '~/.prism/vector.db',
  },
  tokenOptimizer: {
    maxTokens: 100000,
    targetCompression: 0.7,
    preserveSignatures: true,
  },
  modelRouter: {
    preferLocal: false,
    localEndpoint: 'http://localhost:11434',
  },
};

/**
 * Schema for validating configuration
 */
// const CONFIG_SCHEMA = {
//   indexer: {
//     chunkSize: 'number',
//     overlap: 'number',
//     languages: 'array',
//     includePatterns: 'array',
//     excludePatterns: 'array',
//   },
//   vectorDB: {
//     type: 'string',
//     path: 'string',
//     accountId: 'string?',
//     apiKey: 'string?',
//   },
//   tokenOptimizer: {
//     maxTokens: 'number',
//     targetCompression: 'number',
//     preserveSignatures: 'boolean',
//   },
//   modelRouter: {
//     preferLocal: 'boolean',
//     localEndpoint: 'string?',
//     apiKey: 'string?',
//   },
// };

/**
 * Get the path to the Prism config directory
 */
export function getConfigPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.prism');
}

/**
 * Get the path to the config file
 */
export function getConfigFilePath(): string {
  return path.join(getConfigPath(), 'config.yaml');
}

/**
 * Ensure the config directory exists
 */
export async function ensureConfigDir(): Promise<void> {
  const configPath = getConfigPath();
  await fs.ensureDir(configPath);
}

/**
 * Merge user config with defaults
 */
function mergeConfig(userConfig: Partial<PrismConfig>): PrismConfig {
  return {
    indexer: {
      ...DEFAULT_CONFIG.indexer,
      ...(userConfig.indexer || {}),
    },
    vectorDB: {
      ...DEFAULT_CONFIG.vectorDB,
      ...(userConfig.vectorDB || {}),
    },
    tokenOptimizer: {
      ...DEFAULT_CONFIG.tokenOptimizer,
      ...(userConfig.tokenOptimizer || {}),
    },
    modelRouter: {
      ...DEFAULT_CONFIG.modelRouter,
      ...(userConfig.modelRouter || {}),
    },
  };
}

/**
 * Validate configuration object
 */
function validateConfig(config: Partial<PrismConfig>): void {
  // Validate indexer config
  if (config.indexer) {
    if (config.indexer.chunkSize && config.indexer.chunkSize < 100) {
      throw new Error('indexer.chunkSize must be at least 100');
    }
    if (config.indexer.overlap && config.indexer.overlap < 0) {
      throw new Error('indexer.overlap cannot be negative');
    }
    if (config.indexer.overlap && config.indexer.chunkSize && config.indexer.overlap >= config.indexer.chunkSize) {
      throw new Error('indexer.overlap must be less than chunkSize');
    }
  }

  // Validate vectorDB config
  if (config.vectorDB) {
    if (config.vectorDB.type && !['sqlite', 'cloudflare'].includes(config.vectorDB.type)) {
      throw new Error('vectorDB.type must be either "sqlite" or "cloudflare"');
    }
  }

  // Validate tokenOptimizer config
  if (config.tokenOptimizer) {
    if (config.tokenOptimizer.maxTokens && config.tokenOptimizer.maxTokens < 1000) {
      throw new Error('tokenOptimizer.maxTokens must be at least 1000');
    }
    if (config.tokenOptimizer.targetCompression && (config.tokenOptimizer.targetCompression < 0 || config.tokenOptimizer.targetCompression > 1)) {
      throw new Error('tokenOptimizer.targetCompression must be between 0 and 1');
    }
  }
}

/**
 * Load configuration from file
 *
 * Loads configuration from ~/.prism/config.yaml and:
 * 1. Merges with defaults
 * 2. Decrypts any encrypted API keys
 * 3. Applies environment variable overrides
 * 4. Returns final configuration
 *
 * @returns Loaded and decrypted configuration
 */
export async function loadConfig(): Promise<PrismConfig> {
  try {
    const configPath = getConfigFilePath();

    // Check if config file exists
    if (!(await fs.pathExists(configPath))) {
      // Return default config if file doesn't exist
      return { ...DEFAULT_CONFIG };
    }

    // Read and parse YAML config
    const configContent = await fs.readFile(configPath, 'utf-8');
    const userConfig = yaml.load(configContent) as Partial<PrismConfig>;

    // Validate the config
    validateConfig(userConfig);

    // Merge with defaults
    const mergedConfig = mergeConfig(userConfig);

    // Decrypt encrypted API keys
    const decryptedConfig = decryptKeysInConfig(mergedConfig as Record<string, unknown>);

    // Apply environment variable overrides
    applyEnvOverrides(decryptedConfig);

    return decryptedConfig as PrismConfig;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load config: ${error.message}`);
    }
    throw new Error('Failed to load config: Unknown error');
  }
}

/**
 * Apply environment variable overrides to config
 *
 * Environment variables take precedence over config file values.
 * This is the most secure way to provide API keys.
 *
 * @param config - Configuration object to modify
 */
function applyEnvOverrides(config: Record<string, unknown>): void {
  // Cloudflare
  if (process.env.CLOUDFLARE_API_KEY) {
    const vectorDB = config.vectorDB as Record<string, unknown> | undefined;
    if (vectorDB) {
      vectorDB.apiKey = process.env.CLOUDFLARE_API_KEY;
    }
  }
  if (process.env.CLOUDFLARE_ACCOUNT_ID) {
    const vectorDB = config.vectorDB as Record<string, unknown> | undefined;
    if (vectorDB) {
      vectorDB.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    }
  }

  // Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    const modelRouter = config.modelRouter as Record<string, unknown> | undefined;
    if (modelRouter) {
      modelRouter.apiKey = process.env.ANTHROPIC_API_KEY;
    }
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: PrismConfig): Promise<void> {
  try {
    // Validate before saving
    validateConfig(config);

    // Ensure config directory exists
    await ensureConfigDir();

    // Write config to file
    const configPath = getConfigFilePath();
    const configContent = yaml.dump(config, {
      indent: 2,
      lineWidth: 100,
    });

    await fs.writeFile(configPath, configContent, 'utf-8');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to save config: ${error.message}`);
    }
    throw new Error('Failed to save config: Unknown error');
  }
}

/**
 * Ensure config exists, create with defaults if it doesn't
 */
export async function ensureConfig(): Promise<PrismConfig> {
  const configPath = getConfigFilePath();

  if (!(await fs.pathExists(configPath))) {
    // Create default config
    await saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  return loadConfig();
}

/**
 * Reset config to defaults
 */
export async function resetConfig(): Promise<void> {
  await saveConfig(DEFAULT_CONFIG);
}

/**
 * Expand tilde (~) in file paths
 */
export function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (filePath === '~') {
    return os.homedir();
  }
  return filePath;
}

/**
 * ============================================================================
 * ENCRYPTED KEY HANDLING
 * ============================================================================
 */

/**
 * Field paths that may contain encrypted API keys
 *
 * These are the known API key fields in the config that should be
 * automatically decrypted if they're encrypted.
 */
const API_KEY_FIELDS = [
  'vectorDB.apiKey',
  'modelRouter.apiKey',
  'cloudflare.apiKey',
  'cloudflare.accountId',
  'anthropic.apiKey',
  'openai.apiKey',
];

/**
 * Decrypt a value if it's encrypted
 *
 * Checks if a value is an encrypted key and decrypts it.
 * If decryption fails, returns the original value (may be env var).
 *
 * @param value - Value to decrypt (may be encrypted or plaintext)
 * @returns Decrypted value or original value
 */
function decryptIfEncrypted(value: unknown): unknown {
  // Skip null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Skip environment variables
  if (typeof value === 'string' && value.startsWith('${')) {
    return value;
  }

  // Check if encrypted
  if (isEncrypted(value)) {
    try {
      return decrypt(value as string | Parameters<typeof decrypt>[0]);
    } catch (error) {
      // Decryption failed - might be from different machine
      // Return original value and let environment variable override handle it
      console.warn('Failed to decrypt encrypted key, falling back to environment variable');
      return value;
    }
  }

  return value;
}

/**
 * Recursively decrypt encrypted keys in a config object
 *
 * Scans the configuration object and decrypts any encrypted API keys.
 * Works with nested objects using the known API key field paths.
 *
 * @param config - Configuration object to process
 * @returns Config with decrypted keys
 */
function decryptKeysInConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result = { ...config };

  for (const fieldPath of API_KEY_FIELDS) {
    const parts = fieldPath.split('.');
    const value = getNestedValue(result, parts);

    if (value !== undefined && value !== null) {
      const decrypted = decryptIfEncrypted(value);
      setNestedValue(result, parts, decrypted);
    }
  }

  return result;
}

/**
 * Get nested value from object using path parts
 *
 * @param obj - Object to get value from
 * @param parts - Array of path parts
 * @returns Value at path or undefined
 */
function getNestedValue(
  obj: Record<string, unknown>,
  parts: string[]
): unknown {
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Set nested value in object using path parts
 *
 * @param obj - Object to set value in
 * @param parts - Array of path parts
 * @param value - Value to set
 */
function setNestedValue(
  obj: Record<string, unknown>,
  parts: string[],
  value: unknown
): void {
  const lastPart = parts.pop()!;
  let current: unknown = obj;

  // Navigate to parent object
  for (const part of parts) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      if (!(current as Record<string, unknown>)[part]) {
        (current as Record<string, unknown>)[part] = {};
      }
      current = (current as Record<string, unknown>)[part];
    }
  }

  // Set value
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    (current as Record<string, unknown>)[lastPart] = value;
  }
}
