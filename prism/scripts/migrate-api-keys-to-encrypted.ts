#!/usr/bin/env node
/**
 * ============================================================================
 * MIGRATION SCRIPT: Plaintext to Encrypted API Keys
 * ============================================================================
 *
 * **Purpose**: Migrates plaintext API keys to encrypted storage.
 * Scans existing configuration files and encrypts any plaintext keys found.
 *
 * **Last Updated**: 2025-01-14
 * **Dependencies**: fs-extra, js-yaml, inquirer, chalk
 *
 * **Features**:
 * - Detects plaintext API keys in config files
 * - Encrypts keys with AES-256-GCM
 * - Creates backup of original config
 * - Validates encryption/decryption
 * - Supports dry-run mode
 * - Interactive confirmation
 *
 * **Usage**:
 * ```bash
 * # Dry run (see what would be migrated)
 * node prism/scripts/migrate-api-keys-to-encrypted.ts --dry-run
 *
 * # Interactive migration
 * node prism/scripts/migrate-api-keys-to-encrypted.ts
 *
 * # Force migration without prompts
 * node prism/scripts/migrate-api-keys-to-encrypted.ts --force
 * ```
 *
 * **Safety**:
 * - Always creates backup before migration
 * - Validates encryption works before writing
 * - Shows clear diff of changes
 * - Can be rolled back if needed
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  encrypt,
  decrypt,
  isEncrypted,
  validateApiKey,
  sanitizeApiKey,
  type EncryptedData,
} from '../src/config/encryption.js';

// ============================================================================
// TYPES
// ============================================================================

interface MigrationResult {
  configPath: string;
  backupPath: string;
  migratedKeys: string[];
  skippedKeys: string[];
  failedKeys: Array<{ key: string; error: string }>;
}

interface ConfigObject {
  [key: string]: unknown;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Known API key field paths */
const API_KEY_PATHS = [
  'vectorDB.apiKey',
  'vectorDB.accountId',
  'modelRouter.apiKey',
  'cloudflare.apiKey',
  'cloudflare.accountId',
  'anthropic.apiKey',
  'openai.apiKey',
  'github.apiKey',
  'github.token',
  'huggingface.apiKey',
  'huggingface.token',
  'cohere.apiKey',
];

/** Config file locations to check */
const CONFIG_LOCATIONS = [
  path.join(os.homedir(), '.prism', 'config.yaml'),
  path.join(process.cwd(), '.prism', 'config.yaml'),
  path.join(process.cwd(), 'prism.config.yaml'),
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: ConfigObject, path: string): unknown {
  const parts = path.split('.');
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
 * Set nested value in object using dot notation
 */
function setNestedValue(obj: ConfigObject, path: string, value: unknown): void {
  const parts = path.split('.');
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

/**
 * Check if a value looks like an API key
 */
function looksLikeApiKey(value: unknown): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const str = value as string;

  // Skip environment variable references
  if (str.startsWith('${') && str.endsWith('}')) {
    return false;
  }

  // Skip if already encrypted
  if (isEncrypted(str)) {
    return false;
  }

  // Check for common API key patterns
  const apiKeyPatterns = [
    /^sk-ant-/, // Anthropic
    /^sk-/, // OpenAI, others
    /^ghp_/, // GitHub
    /^hf_/, // Hugging Face
    /^[a-zA-Z0-9_-]{30,}$/, // Generic long string
  ];

  return apiKeyPatterns.some((pattern) => pattern.test(str));
}

/**
 * Scan config object for plaintext API keys
 */
function scanForPlaintextKeys(
  config: ConfigObject
): Array<{ path: string; value: string; service: string }> {
  const results: Array<{ path: string; value: string; service: string }> = [];

  for (const keyPath of API_KEY_PATHS) {
    const value = getNestedValue(config, keyPath);

    if (looksLikeApiKey(value)) {
      // Extract service name from path
      const parts = keyPath.split('.');
      const service = parts[0];

      results.push({
        path: keyPath,
        value: value as string,
        service,
      });
    }
  }

  return results;
}

/**
 * Migrate plaintext keys to encrypted
 */
function migrateKeys(
  config: ConfigObject,
  plaintextKeys: Array<{ path: string; value: string; service: string }>
): { migrated: string[]; failed: Array<{ key: string; error: string }> } {
  const migrated: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];

  for (const { path, value, service } of plaintextKeys) {
    try {
      // Validate the key
      const validation = validateApiKey(value, service);
      if (!validation.valid) {
        failed.push({
          key: path,
          error: `Invalid key format: ${validation.errors.join(', ')}`,
        });
        continue;
      }

      // Encrypt the key
      const encrypted = encrypt(value);

      // Update config
      setNestedValue(config, path, JSON.stringify(encrypted));

      migrated.push(path);
    } catch (error) {
      failed.push({
        key: path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { migrated, failed };
}

/**
 * Validate encrypted keys can be decrypted
 */
function validateEncryption(
  config: ConfigObject,
  migratedPaths: string[]
): { valid: string[]; invalid: Array<{ path: string; error: string }> } {
  const valid: string[] = [];
  const invalid: Array<{ path: string; error: string }> = [];

  for (const path of migratedPaths) {
    try {
      const value = getNestedValue(config, path);
      if (!value || typeof value !== 'string') {
        invalid.push({ path, error: 'Value is not a string' });
        continue;
      }

      const decrypted = decrypt(value);
      if (!decrypted || decrypted.length < 10) {
        invalid.push({ path, error: 'Decrypted value is too short' });
        continue;
      }

      valid.push(path);
    } catch (error) {
      invalid.push({
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { valid, invalid };
}

/**
 * Create backup of config file
 */
async function createBackup(configPath: string): Promise<string> {
  const backupDir = path.join(path.dirname(configPath), '.backups');
  await fs.ensureDir(backupDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `config-${timestamp}.yaml`);

  await fs.copy(configPath, backupPath);

  return backupPath;
}

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

/**
 * Migrate config file to encrypted keys
 */
async function migrateConfig(
  configPath: string,
  options: { dryRun: boolean; force: boolean }
): Promise<MigrationResult> {
  console.log(chalk.cyan(`\n📁 Scanning: ${configPath}\n`));

  // Check if file exists
  if (!(await fs.pathExists(configPath))) {
    return {
      configPath,
      backupPath: '',
      migratedKeys: [],
      skippedKeys: [],
      failedKeys: [],
    };
  }

  // Load config
  const configContent = await fs.readFile(configPath, 'utf-8');
  const config = yaml.load(configContent) as ConfigObject;

  // Scan for plaintext keys
  const plaintextKeys = scanForPlaintextKeys(config);

  if (plaintextKeys.length === 0) {
    console.log(chalk.green('✓ No plaintext API keys found (already encrypted or none present)\n'));
    return {
      configPath,
      backupPath: '',
      migratedKeys: [],
      skippedKeys: [],
      failedKeys: [],
    };
  }

  // Show what will be migrated
  console.log(chalk.yellow('Found plaintext API keys:'));
  console.log(chalk.gray('─'.repeat(70)));

  for (const { path, value, service } of plaintextKeys) {
    console.log(chalk.white(`  ${chalk.bold(path)}`));
    console.log(chalk.gray(`    Service: ${service}`));
    console.log(chalk.cyan(`    Value: ${sanitizeApiKey(value)}`));
    console.log('');
  }

  console.log(chalk.gray('─'.repeat(70)));
  console.log('');

  // Dry run mode
  if (options.dryRun) {
    console.log(chalk.cyan('🔍 Dry run mode - no changes will be made\n'));
    return {
      configPath,
      backupPath: '',
      migratedKeys: plaintextKeys.map((k) => k.path),
      skippedKeys: [],
      failedKeys: [],
    };
  }

  // Confirm migration
  if (!options.force) {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Migrate these keys to encrypted storage?',
        default: false,
      },
    ]);

    if (!answers.confirm) {
      console.log(chalk.gray('\n✗ Migration cancelled\n'));
      return {
        configPath,
        backupPath: '',
        migratedKeys: [],
        skippedKeys: plaintextKeys.map((k) => k.path),
        failedKeys: [],
      };
    }
  }

  // Create backup
  console.log(chalk.cyan('Creating backup...'));
  const backupPath = await createBackup(configPath);
  console.log(chalk.green(`✓ Backup created: ${backupPath}\n`));

  // Migrate keys
  console.log(chalk.cyan('Encrypting keys...'));
  const { migrated, failed } = migrateKeys(config, plaintextKeys);

  // Validate encryption
  console.log(chalk.cyan('Validating encryption...'));
  const { valid, invalid } = validateEncryption(config, migrated);

  if (invalid.length > 0) {
    console.log(chalk.red('\n✗ Encryption validation failed!'));
    console.log(chalk.red('Restoring backup...\n'));

    await fs.copy(backupPath, configPath);
    await fs.remove(backupPath);

    throw new Error(
      `Encryption validation failed for ${invalid.length} keys. Backup restored.`
    );
  }

  // Write migrated config
  const migratedContent = yaml.dump(config, {
    indent: 2,
    lineWidth: 100,
  });

  await fs.writeFile(configPath, migratedContent, 'utf-8');

  // Show results
  console.log(chalk.green('\n✓ Migration successful!\n'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log(chalk.green(`  Migrated: ${migrated.length} keys`));

  if (failed.length > 0) {
    console.log(chalk.yellow(`  Failed: ${failed.length} keys`));
    for (const { key, error } of failed) {
      console.log(chalk.red(`    - ${key}: ${error}`));
    }
  }

  console.log(chalk.gray(`  Backup: ${backupPath}`));
  console.log(chalk.gray('─'.repeat(70)));
  console.log('');

  return {
    configPath,
    backupPath,
    migratedKeys: migrated,
    skippedKeys: [],
    failedKeys: failed,
  };
}

/**
 * Rollback migration from backup
 */
async function rollbackMigration(backupPath: string, configPath: string): Promise<void> {
  console.log(chalk.cyan(`\nRolling back from: ${backupPath}\n`));

  if (!(await fs.pathExists(backupPath))) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  await fs.copy(backupPath, configPath);
  await fs.remove(backupPath);

  console.log(chalk.green('✓ Rollback complete\n'));
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║   PRISM API Key Migration: Plaintext → Encrypted           ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));

  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const rollback = args.includes('--rollback');

  if (rollback) {
    // Rollback mode
    const backupArg = args[args.indexOf('--rollback') + 1];
    if (!backupArg) {
      console.error(chalk.red('Error: --rollback requires backup path\n'));
      process.exit(1);
    }

    try {
      const configPath = path.join(os.homedir(), '.prism', 'config.yaml');
      await rollbackMigration(backupArg, configPath);
      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`Error: ${error}\n`));
      process.exit(1);
    }
  }

  // Migration mode
  console.log(chalk.cyan('Scanning for configuration files...\n'));

  const results: MigrationResult[] = [];
  let totalMigrated = 0;
  let totalFailed = 0;

  for (const configPath of CONFIG_LOCATIONS) {
    try {
      const result = await migrateConfig(configPath, { dryRun, force });
      results.push(result);
      totalMigrated += result.migratedKeys.length;
      totalFailed += result.failedKeys.length;
    } catch (error) {
      console.error(chalk.red(`\n✗ Error processing ${configPath}:`));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      console.log('');
    }
  }

  // Summary
  console.log(chalk.bold.cyan('\n📊 Migration Summary'));
  console.log(chalk.gray('─'.repeat(70)));

  if (dryRun) {
    console.log(chalk.cyan(`  Would migrate: ${totalMigrated} keys`));
    console.log(chalk.gray('  (Dry run mode - no changes made)\n'));
  } else {
    console.log(chalk.green(`  Total migrated: ${totalMigrated} keys`));
    console.log(chalk.yellow(`  Total failed: ${totalFailed} keys`));
    console.log('');

    if (totalMigrated > 0) {
      console.log(chalk.cyan('Next steps:'));
      console.log(chalk.gray('  1. Test your application to ensure keys work correctly'));
      console.log(chalk.gray('  2. Remove backup files when confident:'));
      console.log(chalk.gray('     rm -rf ~/.prism/.backups'));
      console.log(chalk.gray('  3. Consider using environment variables for production:\n'));
      console.log(chalk.gray('     export PRISM_CLOUDFLARE_API_KEY=your-key'));
      console.log(chalk.gray('     export PRISM_ANTHROPIC_API_KEY=your-key\n'));
    }

    if (totalFailed > 0) {
      console.log(chalk.yellow('Failed keys:'));
      for (const result of results) {
        for (const { key, error } of result.failedKeys) {
          console.log(chalk.red(`  - ${key}: ${error}`));
        }
      }
      console.log('');
    }
  }

  console.log(chalk.gray('─'.repeat(70)));
  console.log('');

  process.exit(totalFailed > 0 && !dryRun ? 1 : 0);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red(`\n✗ Fatal error: ${error}\n`));
    process.exit(1);
  });
}

export { migrateConfig, rollbackMigration };
