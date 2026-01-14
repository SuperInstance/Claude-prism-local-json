/**
 * ============================================================================
 * CONFIG COMMANDS - Key Management
 * ============================================================================
 *
 * **Purpose**: CLI commands for managing API keys with secure encryption.
 * Provides set, list, remove, validate, backup, restore, and migration operations.
 *
 * **Last Updated**: 2025-01-14
 * **Dependencies**: commander, inquirer, chalk, KeyStorage
 *
 * **Commands**:
 * - `prism config:set-key <service> [key]` - Store an API key
 * - `prism config:list-keys` - List all stored keys
 * - `prism config:remove-key <service>` - Remove a stored key
 * - `prism config:validate-key <service>` - Validate a stored key
 * - `prism config:backup` - Backup encrypted keys
 * - `prism config:restore [backup]` - Restore from backup
 * - `prism config:export` - Export keys for migration
 * - `prism config:import [file]` - Import keys from migration
 * - `prism config:migrate` - Migrate plaintext keys to encrypted
 * - `prism config:cleanup` - Clean up old backups
 *
 * **Usage Examples**:
 * ```bash
 * # Store a key (interactive prompt)
 * prism config:set-key cloudflare
 *
 * # List all keys
 * prism config:list-keys
 *
 * # Backup keys
 * prism config:backup
 *
 * # Restore from backup
 * prism config:restore ~/.prism/keys/.backups/api-keys-2025-01-14.json
 *
 * # Export for migration
 * prism config:export > migration-export.json
 *
 * # Import from migration
 * prism config:import migration-export.json
 * ```
 *
 * **Security Best Practices**:
 * 1. Use environment variables for production (most secure)
 * 2. Store keys with encryption for development
 * 3. Never commit keys to version control
 * 4. Use different keys for dev/prod
 * 5. Rotate keys regularly
 * 6. Backup keys before major changes
 * 7. Clean up old backups regularly
 *
 * **Environment Variables**:
 * Keys can be provided via environment variables instead of storage:
 * - PRISM_CLOUDFLARE_API_KEY
 * - PRISM_ANTHROPIC_API_KEY
 * - PRISM_OPENAI_API_KEY
 * - PRISM_GITHUB_TOKEN
 * - PRISM_HUGGINGFACE_TOKEN
 * - PRISM_COHERE_API_KEY
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import {
  KeyStorage,
  createKeyStorage,
  type KeyInfo,
} from '../../config/KeyStorage.js';
import { sanitizeApiKey, validateApiKey } from '../../config/encryption.js';
import { handleCLIError } from '../errors.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Supported services with descriptions */
const SERVICE_DESCRIPTIONS: Record<string, string> = {
  cloudflare: 'Cloudflare API Token (for Vectorize, Workers AI, D1)',
  anthropic: 'Anthropic Claude API Key (for Claude models)',
  openai: 'OpenAI API Key (for GPT models)',
  github: 'GitHub Personal Access Token (for GitHub integration)',
  huggingface: 'Hugging Face API Token (for ML models)',
  cohere: 'Cohere API Key (for language models)',
};

/** All supported services */
const SUPPORTED_SERVICES = Object.keys(SERVICE_DESCRIPTIONS);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Prompt for API key input (hidden)
 *
 * Uses inquirer to prompt for sensitive input with hidden characters.
 *
 * @param service - Service name for the prompt message
 * @returns User input API key
 */
async function promptForApiKey(service: string): Promise<string> {
  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: `Enter ${chalk.cyan(service)} API key:`,
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key cannot be empty';
        }
        if (input.length < 20) {
          return 'API key seems too short (minimum 20 characters)';
        }
        return true;
      },
    },
  ]);

  return answers.apiKey;
}

/**
 * Prompt for optional label
 *
 * @param service - Service name for the prompt message
 * @returns User input label or empty string
 */
async function promptForLabel(service: string): Promise<string> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'label',
      message: `Enter ${chalk.cyan(service)} label (optional):`,
      default: '',
    },
  ]);

  return answers.label;
}

/**
 * Display key information in a formatted table
 *
 * @param keys - Array of key information to display
 */
function displayKeys(keys: KeyInfo[]): void {
  if (keys.length === 0) {
    console.log(chalk.yellow('\nNo API keys stored.'));
    console.log(chalk.gray('\nTip: Use environment variables for production (more secure).\n'));
    return;
  }

  console.log('\n' + chalk.bold.cyan('Stored API Keys'));
  console.log(chalk.gray('─'.repeat(70)));

  for (const key of keys) {
    console.log(chalk.white(`  ${chalk.bold(key.service)}`));
    console.log(chalk.gray(`    Key: ${chalk.cyan(key.sanitizedKey)}`));

    if (key.label) {
      console.log(chalk.gray(`    Label: ${key.label}`));
    }

    if (key.fromEnv) {
      console.log(chalk.green(`    Source: Environment Variable`));
    } else {
      console.log(chalk.gray(`    Source: Encrypted Storage`));
      if (key.createdAt) {
        console.log(chalk.gray(`    Created: ${key.createdAt}`));
      }
      if (key.updatedAt) {
        console.log(chalk.gray(`    Updated: ${key.updatedAt}`));
      }
    }

    console.log('');
  }

  console.log(chalk.gray('─'.repeat(70)));
  console.log('');
}

// ============================================================================
// COMMAND: SET KEY
// ============================================================================

/**
 * Register the config:set-key command
 *
 * Stores an API key with encryption.
 * Prompts for key if not provided as argument.
 *
 * Usage:
 * ```bash
 * prism config:set-key <service> [key]
 * prism config:set-key cloudflare
 * prism config:set-key anthropic sk-ant-api-xxx
 * ```
 */
export function registerSetKeyCommand(program: Command): void {
  program
    .command('config:set-key')
    .description('Store an API key with encryption')
    .argument('<service>', `Service name (${SUPPORTED_SERVICES.join(', ')})`)
    .argument('[key]', 'API key (will prompt if omitted)')
    .option('-l, --label <label>', 'Optional label/description for the key')
    .action(async (service: string, keyArg: string | undefined, options) => {
      try {
        // Normalize service name
        const normalizedService = service.toLowerCase();

        // Validate service
        if (!SUPPORTED_SERVICES.includes(normalizedService)) {
          console.error(
            chalk.red(
              `Unknown service: ${service}\n\n` +
                `Supported services:\n` +
                SUPPORTED_SERVICES.map((s) => `  - ${s}: ${SERVICE_DESCRIPTIONS[s]}`).join('\n')
            )
          );
          process.exit(1);
        }

        // Get API key (prompt if not provided)
        let apiKey = keyArg;
        if (!apiKey) {
          console.log('');
          console.log(
            chalk.cyan(`Storing API key for ${chalk.bold(service)} (${SERVICE_DESCRIPTIONS[normalizedService]})`)
          );
          console.log(chalk.gray('Your key will be encrypted and stored securely.\n'));
          apiKey = await promptForApiKey(service);
        }

        // Get label (prompt or use option)
        let label = options.label;
        if (!label) {
          label = await promptForLabel(service);
        }

        // Store the key
        const storage = new KeyStorage();
        await storage.initialize();

        console.log('');
        const validation = await storage.set(normalizedService, apiKey, label || undefined);

        console.log(chalk.green('✓ API key stored successfully!'));
        console.log(chalk.gray(`  Service: ${validation.service || normalizedService}`));
        console.log(chalk.gray(`  Type: ${validation.keyType || 'Unknown'}`));
        console.log(chalk.gray(`  Encrypted: ${apiKey}`));
        console.log('');
        console.log(chalk.cyan('You can now use this key for PRISM operations.\n'));

        console.log(chalk.yellow('Security Note:'));
        console.log(
          chalk.gray(
            '  For production, consider using environment variables instead:\n' +
              `  export PRISM_${normalizedService.toUpperCase()}_API_KEY=your-key\n`
          )
        );

        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

// ============================================================================
// COMMAND: LIST KEYS
// ============================================================================

/**
 * Register the config:list-keys command
 *
 * Lists all stored API keys with sanitized display.
 * Shows keys from both storage and environment variables.
 *
 * Usage:
 * ```bash
 * prism config:list-keys
 * ```
 */
export function registerListKeysCommand(program: Command): void {
  program
    .command('config:list-keys')
    .description('List all stored API keys')
    .action(async () => {
      try {
        const storage = new KeyStorage();
        await storage.initialize();

        const keys = await storage.list();
        displayKeys(keys);

        // Show environment variable hints
        console.log(chalk.cyan('Environment Variables:'));
        console.log(
          chalk.gray(
            '  You can also set keys via environment variables:\n' +
              SUPPORTED_SERVICES.map(
                (s) => `  export PRISM_${s.toUpperCase()}_API_KEY=your-key`
              ).join('\n') +
              '\n'
          )
        );

        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

// ============================================================================
// COMMAND: REMOVE KEY
// ============================================================================

/**
 * Register the config:remove-key command
 *
 * Removes a stored API key.
 * Does not affect environment variables.
 *
 * Usage:
 * ```bash
 * prism config:remove-key <service>
 * ```
 */
export function registerRemoveKeyCommand(program: Command): void {
  program
    .command('config:remove-key')
    .description('Remove a stored API key')
    .argument('<service>', 'Service name')
    .action(async (service: string) => {
      try {
        // Normalize service name
        const normalizedService = service.toLowerCase();

        // Check if key exists
        const storage = new KeyStorage();
        await storage.initialize();

        const hasKey = await storage.has(normalizedService);
        if (!hasKey) {
          console.log(chalk.yellow(`\nNo API key found for ${service}.\n`));
          process.exit(0);
          return;
        }

        // Confirm removal
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Remove API key for ${chalk.cyan(service)}?`,
            default: false,
          },
        ]);

        if (!answers.confirm) {
          console.log(chalk.gray('\nOperation cancelled.\n'));
          process.exit(0);
          return;
        }

        // Remove the key
        await storage.remove(normalizedService);

        console.log(chalk.green('\n✓ API key removed successfully!\n'));

        // Check if still available via environment variable
        const envVar = `PRISM_${normalizedService.toUpperCase()}_API_KEY`;
        if (process.env[envVar]) {
          console.log(chalk.yellow('Note:'));
          console.log(
            chalk.gray(
              `  Key is still available via environment variable ${envVar}.\n` +
                '  To fully remove, unset the environment variable.\n'
            )
          );
        }

        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

// ============================================================================
// COMMAND: VALIDATE KEY
// ============================================================================

/**
 * Register the config:validate-key command
 *
 * Validates a stored API key format and configuration.
 *
 * Usage:
 * ```bash
 * prism config:validate-key <service>
 * ```
 */
export function registerValidateKeyCommand(program: Command): void {
  program
    .command('config:validate-key')
    .description('Validate a stored API key')
    .argument('<service>', 'Service name')
    .action(async (service: string) => {
      try {
        // Normalize service name
        const normalizedService = service.toLowerCase();

        // Check if key exists
        const storage = new KeyStorage();
        await storage.initialize();

        const hasKey = await storage.has(normalizedService);
        if (!hasKey) {
          console.log(chalk.yellow(`\nNo API key found for ${service}.\n`));
          process.exit(0);
          return;
        }

        // Validate the key
        const validation = await storage.validate(normalizedService);

        if (!validation) {
          console.log(chalk.yellow(`\nNo API key found for ${service}.\n`));
          process.exit(0);
          return;
        }

        console.log('');
        console.log(chalk.bold.cyan(`API Key Validation: ${service}`));
        console.log(chalk.gray('─'.repeat(50)));

        if (validation.valid) {
          console.log(chalk.green('  ✓ Valid'));
          console.log(chalk.gray(`  Service: ${validation.service || 'Unknown'}`));
          console.log(chalk.gray(`  Type: ${validation.keyType || 'Unknown'}`));
        } else {
          console.log(chalk.red('  ✗ Invalid'));
          console.log(chalk.red('  Errors:'));
          for (const error of validation.errors) {
            console.log(chalk.red(`    - ${error}`));
          }
        }

        console.log(chalk.gray('─'.repeat(50)));
        console.log('');

        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

// ============================================================================
// COMMAND: BACKUP
// ============================================================================

/**
 * Register the config:backup command
 *
 * Creates a timestamped backup of all encrypted keys.
 *
 * Usage:
 * ```bash
 * prism config:backup
 * ```
 */
export function registerBackupCommand(program: Command): void {
  program
    .command('config:backup')
    .description('Backup all stored API keys')
    .action(async () => {
      try {
        const storage = new KeyStorage();
        await storage.initialize();

        console.log(chalk.cyan('\nCreating backup of encrypted API keys...\n'));

        const backupPath = await storage.backup();

        console.log(chalk.green('✓ Backup created successfully!'));
        console.log(chalk.gray(`  Path: ${backupPath}`));
        console.log('');
        console.log(chalk.cyan('To restore from this backup:'));
        console.log(chalk.gray(`  prism config:restore ${backupPath}\n`));

        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

// ============================================================================
// COMMAND: RESTORE
// ============================================================================

/**
 * Register the config:restore command
 *
 * Restores keys from a previously created backup.
 *
 * Usage:
 * ```bash
 * prism config:restore <backup-path>
 * ```
 */
export function registerRestoreCommand(program: Command): void {
  program
    .command('config:restore')
    .description('Restore API keys from backup')
    .argument('[backup]', 'Path to backup file (will prompt if omitted)')
    .option('--merge', 'Merge with existing keys instead of replacing')
    .option('--no-validate', 'Skip key validation during restore')
    .action(async (backupArg: string | undefined, options) => {
      try {
        const storage = new KeyStorage();
        await storage.initialize();

        let backupPath = backupArg;

        // List available backups if not specified
        if (!backupPath) {
          const backups = await storage.listBackups();

          if (backups.length === 0) {
            console.log(chalk.yellow('\nNo backups found.\n'));
            process.exit(0);
            return;
          }

          console.log(chalk.cyan('\nAvailable backups:'));
          console.log(chalk.gray('─'.repeat(70)));

          const choices = backups.map((b) => ({
            name: `${b.path} (${new Date(b.timestamp).toLocaleString()})`,
            value: b.path,
          }));

          for (const i = 0; i < choices.length; i++) {
            console.log(chalk.white(`  ${i + 1}. ${choices[i].name}`));
          }

          console.log(chalk.gray('─'.repeat(70)));

          const answers = await inquirer.prompt([
            {
              type: 'list',
              name: 'backup',
              message: 'Select backup to restore:',
              choices,
            },
          ]);

          backupPath = answers.backup;
        }

        console.log('');
        console.log(chalk.cyan(`Restoring from: ${backupPath}\n`));

        // Confirm restore
        if (!options.merge) {
          const confirm = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'This will replace all existing keys. Continue?',
              default: false,
            },
          ]);

          if (!confirm.confirm) {
            console.log(chalk.gray('\nOperation cancelled.\n'));
            process.exit(0);
            return;
          }
        }

        // Restore
        const result = await storage.restore(backupPath, {
          merge: options.merge,
          validate: options.validate !== false,
        });

        console.log(chalk.green('✓ Restore complete!\n'));
        console.log(chalk.gray('─'.repeat(70)));
        console.log(chalk.green(`  Restored: ${result.restoredCount} keys`));
        console.log(chalk.yellow(`  Skipped: ${result.skippedCount} keys`));

        if (result.errors.length > 0) {
          console.log(chalk.red(`  Errors: ${result.errors.length}`));
          for (const error of result.errors) {
            console.log(chalk.red(`    - ${error}`));
          }
        }

        console.log(chalk.gray('─'.repeat(70)));
        console.log('');

        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

// ============================================================================
// COMMAND: EXPORT
// ============================================================================

/**
 * Register the config:export command
 *
 * Exports keys in plaintext for migration to another machine.
 *
 * Usage:
 * ```bash
 * prism config:export > migration.json
 * ```
 */
export function registerExportCommand(program: Command): void {
  program
    .command('config:export')
    .description('Export keys for migration (plaintext - handle with care!)')
    .action(async () => {
      try {
        const storage = new KeyStorage();
        await storage.initialize();

        console.log(chalk.yellow('\n⚠️  WARNING: Export will contain PLAINTEXT API keys'));
        console.log(chalk.yellow('   Handle the export file securely!\n'));

        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Continue with export?',
            default: false,
          },
        ]);

        if (!confirm.confirm) {
          console.log(chalk.gray('\nOperation cancelled.\n'));
          process.exit(0);
          return;
        }

        const exportData = await storage.exportForMigration();

        console.log(chalk.green('\n✓ Export complete!\n'));
        console.log(chalk.gray('─'.repeat(70)));
        console.log(chalk.cyan(`  Exported: ${exportData.keys.length} keys`));
        console.log(chalk.gray(`  Timestamp: ${exportData.timestamp}`));
        console.log(chalk.gray('─'.repeat(70)));
        console.log('');
        console.log(chalk.cyan('Next steps:'));
        console.log(chalk.gray('  1. Save the JSON output above to a file'));
        console.log(chalk.gray('  2. Transfer the file securely to the new machine'));
        console.log(chalk.gray('  3. Import with: prism config:import <file>\n'));

        // Output JSON to stdout
        console.log('\n' + JSON.stringify(exportData, null, 2) + '\n');

        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

// ============================================================================
// COMMAND: IMPORT
// ============================================================================

/**
 * Register the config:import command
 *
 * Imports keys from a migration export file.
 *
 * Usage:
 * ```bash
 * prism config:import migration.json
 * ```
 */
export function registerImportCommand(program: Command): void {
  program
    .command('config:import')
    .description('Import keys from migration export')
    .argument('[file]', 'Path to export file (will prompt if omitted)')
    .option('--merge', 'Merge with existing keys (default: true)')
    .option('--overwrite', 'Overwrite existing keys')
    .action(async (fileArg: string | undefined, options) => {
      try {
        const storage = new KeyStorage();
        await storage.initialize();

        let filePath = fileArg;

        // Prompt for file if not provided
        if (!filePath) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'file',
              message: 'Path to export file:',
              validate: (input: string) => {
                if (!input || input.trim().length === 0) {
                  return 'File path is required';
                }
                return true;
              },
            },
          ]);
          filePath = answers.file;
        }

        // Read export file
        if (!(await fs.pathExists(filePath))) {
          console.error(chalk.red(`\n✗ File not found: ${filePath}\n`));
          process.exit(1);
          return;
        }

        const exportContent = await fs.readFile(filePath, 'utf-8');
        const exportData = JSON.parse(exportContent);

        console.log('');
        console.log(chalk.cyan(`Importing from: ${filePath}`));
        console.log(chalk.cyan(`  Keys: ${exportData.keys.length}`));
        console.log(chalk.cyan(`  Timestamp: ${exportData.timestamp}\n`));

        // Confirm import
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Import these keys? They will be encrypted for this machine.',
            default: true,
          },
        ]);

        if (!confirm.confirm) {
          console.log(chalk.gray('\nOperation cancelled.\n'));
          process.exit(0);
          return;
        }

        // Import
        const result = await storage.importFromMigration(exportData, {
          merge: options.merge !== false,
          overwrite: options.overwrite,
        });

        console.log(chalk.green('\n✓ Import complete!\n'));
        console.log(chalk.gray('─'.repeat(70)));
        console.log(chalk.green(`  Imported: ${result.importedCount} keys`));
        console.log(chalk.yellow(`  Skipped: ${result.skippedCount} keys`));

        if (result.errors.length > 0) {
          console.log(chalk.red(`  Errors: ${result.errors.length}`));
          for (const error of result.errors) {
            console.log(chalk.red(`    - ${error}`));
          }
        }

        console.log(chalk.gray('─'.repeat(70)));
        console.log('');
        console.log(chalk.cyan('Verify imported keys:'));
        console.log(chalk.gray('  prism config:list-keys\n'));

        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

// ============================================================================
// COMMAND: CLEANUP
// ============================================================================

/**
 * Register the config:cleanup command
 *
 * Removes old backup files.
 *
 * Usage:
 * ```bash
 * prism config:cleanup
 * prism config:cleanup --keep 3
 * ```
 */
export function registerCleanupCommand(program: Command): void {
  program
    .command('config:cleanup')
    .description('Clean up old backup files')
    .option('-k, --keep <number>', 'Number of recent backups to keep', '5')
    .action(async (options) => {
      try {
        const keep = parseInt(options.keep, 10);
        const storage = new KeyStorage();
        await storage.initialize();

        console.log('');
        console.log(chalk.cyan(`Cleaning up old backups (keeping ${keep} most recent)...\n`));

        const deleted = await storage.cleanupBackups(keep);

        if (deleted === 0) {
          console.log(chalk.green('✓ No old backups to remove.\n'));
        } else {
          console.log(chalk.green(`✓ Removed ${deleted} old backup(s).\n`));
        }

        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

// ============================================================================
// COMMAND: LIST BACKUPS
// ============================================================================

/**
 * Register the config:list-backups command
 *
 * Lists all available backup files.
 *
 * Usage:
 * ```bash
 * prism config:list-backups
 * ```
 */
export function registerListBackupsCommand(program: Command): void {
  program
    .command('config:list-backups')
    .description('List all backup files')
    .action(async () => {
      try {
        const storage = new KeyStorage();
        await storage.initialize();

        const backups = await storage.listBackups();

        if (backups.length === 0) {
          console.log(chalk.yellow('\nNo backups found.\n'));
          console.log(chalk.cyan('Create a backup with: prism config:backup\n'));
          process.exit(0);
          return;
        }

        console.log('\n' + chalk.bold.cyan('Available Backups'));
        console.log(chalk.gray('─'.repeat(70)));

        for (let i = 0; i < backups.length; i++) {
          const backup = backups[i];
          const date = new Date(backup.timestamp);
          const size = (backup.size / 1024).toFixed(2);

          console.log(chalk.white(`  ${chalk.bold(String(i + 1))}. ${backup.path}`));
          console.log(chalk.gray(`     Date: ${date.toLocaleString()}`));
          console.log(chalk.gray(`     Size: ${size} KB`));
          console.log('');
        }

        console.log(chalk.gray('─'.repeat(70)));
        console.log('');
        console.log(chalk.cyan('Restore a backup:'));
        console.log(chalk.gray(`  prism config:restore <backup-path>\n`));

        process.exit(0);
      } catch (error) {
        handleCLIError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
}

// ============================================================================
// EXPORT ALL COMMANDS
// ============================================================================

/**
 * Register all config commands with the CLI program
 *
 * @param program - The Commander program instance
 */
export function registerConfigCommands(program: Command): void {
  registerSetKeyCommand(program);
  registerListKeysCommand(program);
  registerRemoveKeyCommand(program);
  registerValidateKeyCommand(program);
  registerBackupCommand(program);
  registerRestoreCommand(program);
  registerExportCommand(program);
  registerImportCommand(program);
  registerCleanupCommand(program);
  registerListBackupsCommand(program);
}
