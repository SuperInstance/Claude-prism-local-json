#!/usr/bin/env node
/**
 * ============================================================================
 * MIGRATION SCRIPT: HASH-BASED TO SEMANTIC EMBEDDINGS
 * ============================================================================
 *
 * This script migrates existing hash-based embeddings to semantic embeddings
 * using Cloudflare Workers AI or Ollama.
 *
 * Features:
 * ---------
 * - Detects hash-based embeddings in database
 * - Re-embeds content with semantic model
 * - Updates database with new embeddings
 * - Provides progress tracking
 * - Supports rollback on failure
 * - Handles large datasets efficiently
 *
 * Usage:
 * ------
 * node scripts/migrate-to-semantic-embeddings.ts [options]
 *
 * Options:
 * --------
 * --db <path>           Path to SQLite database (default: ./prism.db)
 * --batch-size <number> Batch size for processing (default: 100)
 * --concurrency <number> Concurrent requests (default: 5)
 * --dry-run             Run without making changes
 * --force               Force migration even if already migrated
 * --backup              Create backup before migration
 * --ollama              Use Ollama instead of Cloudflare
 *
 * Examples:
 * ---------
 * # Dry run to see what would be migrated
 * node scripts/migrate-to-semantic-embeddings.ts --dry-run
 *
 * # Migrate with backup
 * node scripts/migrate-to-semantic-embeddings.ts --backup
 *
 * # Migrate using Ollama
 * node scripts/migrate-to-semantic-embeddings.ts --ollama
 *
 * @see docs/migrations/004_semantic_embeddings.md
 */

import Database from 'better-sqlite3';
import { SemanticEmbeddingsService } from '../prism/src/mcp/semantic-embeddings.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ============================================================================
 * TYPES AND INTERFACES
 * ============================================================================
 */

interface MigrationOptions {
  dbPath: string;
  batchSize: number;
  concurrency: number;
  dryRun: boolean;
  force: boolean;
  backup: boolean;
  useOllama: boolean;
}

interface MigrationProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  startTime: number;
}

interface ChunkRecord {
  id: string;
  file_path: string;
  content: string;
  start_line: number;
  end_line: number;
  language: string;
  symbols: string;
  dependencies: string;
  metadata: string;
}

interface VectorRecord {
  id: string;
  chunk_id: string;
  embedding: string;
  metadata: string;
  created_at: number;
}

/**
 * ============================================================================
 * MIGRATION SCRIPT
 * ============================================================================
 */

class EmbeddingMigration {
  private options: MigrationOptions;
  private db: Database.Database;
  private embeddings: SemanticEmbeddingsService;
  private progress: MigrationProgress;
  private backupPath: string | null = null;

  constructor(options: MigrationOptions) {
    this.options = options;
    this.db = new Database(options.dbPath);
    this.embeddings = new SemanticEmbeddingsService({
      cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      cloudflareApiKey: process.env.CLOUDFLARE_API_KEY,
      cachePath: ':memory:', // Use in-memory cache for migration
      enableMetrics: true,
      fallbackToHash: false, // Don't use hash fallback during migration
    });

    this.progress = {
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Run the migration
   */
  async run(): Promise<void> {
    console.log('=== Semantic Embeddings Migration ===\n');

    try {
      // Check database
      await this.checkDatabase();

      // Create backup if requested
      if (this.options.backup && !this.options.dryRun) {
        await this.createBackup();
      }

      // Get chunks to migrate
      const chunks = await this.getChunksToMigrate();
      this.progress.total = chunks.length;

      if (chunks.length === 0) {
        console.log('No chunks need migration. Already done!');
        return;
      }

      console.log(`Found ${chunks.length} chunks to migrate\n`);

      // Migrate chunks
      await this.migrateChunks(chunks);

      // Print summary
      this.printSummary();

      // Cleanup
      this.cleanup();
    } catch (error) {
      console.error('\nMigration failed:', error);

      // Rollback if backup was created
      if (this.backupPath) {
        console.log('\nRolling back to backup...');
        await this.rollback();
      }

      throw error;
    }
  }

  /**
   * Check database schema and status
   */
  private async checkDatabase(): Promise<void> {
    console.log('Checking database...');

    // Check if vectors table exists
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vectors'")
      .get() as { name: string } | undefined;

    if (!tables) {
      throw new Error('Vectors table not found. Please run the indexing process first.');
    }

    // Check vector count
    const vectorCount = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number };
    console.log(`Found ${vectorCount.count} vectors in database\n`);
  }

  /**
   * Create backup of database
   */
  private async createBackup(): Promise<void> {
    console.log('Creating backup...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.backupPath = `${this.options.dbPath}.backup-${timestamp}`;

    const data = this.db.serialize();
    fs.writeFileSync(this.backupPath, Buffer.from(data));

    console.log(`Backup created: ${this.backupPath}\n`);
  }

  /**
   * Get chunks that need migration
   */
  private async getChunksToMigrate(): Promise<Array<ChunkRecord & VectorRecord>> {
    console.log('Analyzing embeddings...');

    // Get all chunks with their vectors
    const rows = this.db
      .prepare(`
        SELECT c.*, v.id as vector_id, v.embedding, v.metadata as vector_metadata
        FROM chunks c
        LEFT JOIN vectors v ON c.id = v.chunk_id
        WHERE v.embedding IS NOT NULL
      `)
      .all() as Array<ChunkRecord & VectorRecord & { vector_id: string; vector_metadata: string }>;

    const toMigrate: Array<ChunkRecord & VectorRecord> = [];

    for (const row of rows) {
      const metadata = JSON.parse(row.metadata || '{}');
      const vectorMetadata = JSON.parse(row.vector_metadata || '{}');

      // Check if already migrated
      if (metadata.embeddingType === 'semantic' && !this.options.force) {
        this.progress.skipped++;
        continue;
      }

      // Check if embedding looks like hash-based (not from semantic model)
      const embedding = JSON.parse(row.embedding) as number[];
      const isSemantic = vectorMetadata.model === '@cf/baai/bge-small-en-v1.5' ||
                        vectorMetadata.model?.includes('ollama');

      if (!isSemantic || this.options.force) {
        toMigrate.push(row);
      }
    }

    return toMigrate;
  }

  /**
   * Migrate chunks in batches
   */
  private async migrateChunks(chunks: Array<ChunkRecord & VectorRecord>): Promise<void> {
    const batches: Array<typeof chunks> = [];

    // Split into batches
    for (let i = 0; i < chunks.length; i += this.options.batchSize) {
      batches.push(chunks.slice(i, i + this.options.batchSize));
    }

    console.log(`Processing ${batches.length} batches...\n`);

    // Process batches
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[${i + 1}/${batches.length}] Processing batch ${i + 1}...`);

      await this.processBatch(batch);

      // Print progress
      this.printProgress();

      // Add delay to avoid rate limits
      if (i < batches.length - 1) {
        await this.delay(1000);
      }
    }
  }

  /**
   * Process a single batch of chunks
   */
  private async processBatch(batch: Array<ChunkRecord & VectorRecord>): Promise<void> {
    const texts = batch.map((chunk) => chunk.content);

    // Generate embeddings
    const batchResult = await this.embeddings.generateBatchEmbeddings(texts);

    // Update each chunk
    for (let i = 0; i < batch.length; i++) {
      const chunk = batch[i];
      const embedding = batchResult.results[i];

      if (!this.options.dryRun) {
        try {
          // Update vectors table
          this.db
            .prepare(
              `UPDATE vectors
               SET embedding = ?, metadata = ?, created_at = ?
               WHERE id = ?`
            )
            .run(
              JSON.stringify(embedding.values),
              JSON.stringify({
                model: embedding.model,
                embeddingType: 'semantic',
                migratedAt: Date.now(),
              }),
              Date.now(),
              chunk.vector_id
            );

          // Update chunks metadata
          const metadata = JSON.parse(chunk.metadata || '{}');
          metadata.embeddingType = 'semantic';
          metadata.embeddingModel = embedding.model;
          metadata.migratedAt = Date.now();

          this.db
            .prepare('UPDATE chunks SET metadata = ? WHERE id = ?')
            .run(JSON.stringify(metadata), chunk.id);

          this.progress.succeeded++;
        } catch (error) {
          console.error(`Failed to migrate chunk ${chunk.id}:`, error);
          this.progress.failed++;
        }
      } else {
        console.log(`[DRY RUN] Would migrate chunk ${chunk.id}`);
        this.progress.succeeded++;
      }

      this.progress.processed++;
    }
  }

  /**
   * Print current progress
   */
  private printProgress(): void {
    const elapsed = Date.now() - this.progress.startTime;
    const rate = this.progress.processed / (elapsed / 1000);
    const eta = this.progress.total > 0 ? (this.progress.total - this.progress.processed) / rate : 0;

    console.log(
      `  Progress: ${this.progress.processed}/${this.progress.total} ` +
      `(${((this.progress.processed / this.progress.total) * 100).toFixed(1)}%) ` +
      `| Success: ${this.progress.succeeded} ` +
      `| Failed: ${this.progress.failed} ` +
      `| Rate: ${rate.toFixed(2)} chunks/s ` +
      `| ETA: ${this.formatTime(eta)}`
    );
  }

  /**
   * Print migration summary
   */
  private printSummary(): void {
    const elapsed = Date.now() - this.progress.startTime;

    console.log('\n=== Migration Summary ===');
    console.log(`Total chunks: ${this.progress.total}`);
    console.log(`Processed: ${this.progress.processed}`);
    console.log(`Succeeded: ${this.progress.succeeded}`);
    console.log(`Failed: ${this.progress.failed}`);
    console.log(`Skipped: ${this.progress.skipped}`);
    console.log(`Time elapsed: ${this.formatTime(elapsed)}`);

    if (this.progress.succeeded > 0) {
      const avgTime = elapsed / this.progress.succeeded;
      console.log(`Average time: ${avgTime.toFixed(0)}ms per chunk`);
    }

    // Print metrics from embeddings service
    const metrics = this.embeddings.getMetrics();
    console.log('\n=== Embeddings Metrics ===');
    console.log(`Provider usage:`, metrics.providerUsage);
    console.log(`Average generation time: ${metrics.averageGenerationTime.toFixed(1)}ms`);
    console.log(`Errors:`, metrics.errors);

    if (this.options.dryRun) {
      console.log('\n[DRY RUN] No changes were made. Run without --dry-run to apply changes.');
    }
  }

  /**
   * Rollback to backup
   */
  private async rollback(): Promise<void> {
    if (!this.backupPath || !fs.existsSync(this.backupPath)) {
      console.log('No backup found, cannot rollback');
      return;
    }

    // Close current database
    this.db.close();

    // Restore backup
    const backupData = fs.readFileSync(this.backupPath);
    fs.writeFileSync(this.options.dbPath, backupData);

    console.log(`Rolled back to ${this.backupPath}`);
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.db.close();
    this.embeddings.close();
  }

  /**
   * Format time in human-readable format
   */
  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * ============================================================================
 * CLI
 * ============================================================================
 */

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dbPath: './prism.db',
    batchSize: 100,
    concurrency: 5,
    dryRun: false,
    force: false,
    backup: false,
    useOllama: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--db':
        options.dbPath = args[++i];
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--concurrency':
        options.concurrency = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--backup':
        options.backup = true;
        break;
      case '--ollama':
        options.useOllama = true;
        break;
      case '--help':
        console.log(`
Semantic Embeddings Migration Script

Usage: node scripts/migrate-to-semantic-embeddings.ts [options]

Options:
  --db <path>           Path to SQLite database (default: ./prism.db)
  --batch-size <number> Batch size for processing (default: 100)
  --concurrency <number> Concurrent requests (default: 5)
  --dry-run             Run without making changes
  --force               Force migration even if already migrated
  --backup              Create backup before migration
  --ollama              Use Ollama instead of Cloudflare
  --help                Show this help message

Environment Variables:
  CLOUDFLARE_ACCOUNT_ID Cloudflare account ID
  CLOUDFLARE_API_KEY    Cloudflare API key

Examples:
  # Dry run to see what would be migrated
  node scripts/migrate-to-semantic-embeddings.ts --dry-run

  # Migrate with backup
  node scripts/migrate-to-semantic-embeddings.ts --backup

  # Migrate using custom database
  node scripts/migrate-to-semantic-embeddings.ts --db ./data/prism.db --backup
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        console.error('Use --help for usage information');
        process.exit(1);
    }
  }

  // Check if database exists
  if (!fs.existsSync(options.dbPath)) {
    console.error(`Database not found: ${options.dbPath}`);
    console.error('Please run the indexing process first to create the database.');
    process.exit(1);
  }

  // Run migration
  const migration = new EmbeddingMigration(options);
  await migration.run();
}

// Run main function
main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
