/**
 * ============================================================================
 * D1-BASED INDEX STORAGE FOR INCREMENTAL INDEXING
 * ============================================================================
 *
 * This module provides persistent storage for index metadata using
 * Cloudflare D1, enabling accurate incremental indexing with SHA-256
 * content verification.
 *
 * FEATURES:
 * - SHA-256 checksum calculation for content verification
 * - Hybrid mtime + checksum change detection
 * - Deleted file detection and tracking
 * - Index metadata persistence
 * - File modification tracking
 *
 * ALGORITHM:
 *
 * File Change Detection:
 * 1. Compare mtime (fast path) - if unchanged, skip
 * 2. If mtime changed, verify with SHA-256 checksum
 * 3. Only reindex if checksum actually changed
 *
 * This hybrid approach provides:
 * - Fast detection for most files (mtime check)
 * - Accurate detection for git operations (checksum)
 * - No false positives from git checkout/rebase
 *
 * @see docs/architecture/04-indexer-architecture.md
 * @see migrations/002_vector_index.sql
 */

import type {
  IndexMetadata,
  IndexStats,
} from './IndexStorage.js';
import type { Env } from '../types/worker.js';
import { createPrismError, ErrorCode } from '../core/types/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * File modification record for tracking file changes
 */
export interface FileModificationRecord {
  /** File path (primary key) */
  path: string;

  /** SHA-256 checksum of file content */
  checksum: string;

  /** File size in bytes */
  fileSize: number;

  /** Last modification time (Unix timestamp, ms) */
  lastModified: number;

  /** Last indexing time (Unix timestamp, ms) */
  lastIndexed: number;

  /** Number of chunks indexed */
  chunkCount: number;
}

/**
 * Index storage statistics
 */
export interface IndexStorageStats {
  /** Total files tracked */
  totalFiles: number;

  /** Total chunks indexed */
  totalChunks: number;

  /** Files needing reindexing */
  needsReindexing: number;

  /** Last updated timestamp */
  lastUpdated: Date;
}

// ============================================================================
// D1 INDEX STORAGE CLASS
// ============================================================================

/**
 * D1-based index storage for incremental indexing
 *
 * Provides persistent metadata storage for tracking:
 * - File modifications with SHA-256 checksums
 * - Index statistics and metadata
 * - Deleted files for garbage collection
 */
export class D1IndexStorage {
  private db: import('../types/worker.js').D1Database;
  private kv: import('../types/worker.js').KVNamespace;

  // ========================================================================
  // CONSTRUCTOR
  // ========================================================================

  /**
   * Create a new D1 index storage
   *
   * @param env - Cloudflare Worker environment
   */
  constructor(env: Env) {
    this.db = env.DB;
    this.kv = env.KV;
  }

  // ========================================================================
  // FILE TRACKING
  // ========================================================================

  /**
   * Get file modification record
   *
   * @param filePath - File path
   * @returns File record or null if not tracked
   */
  async getFileRecord(filePath: string): Promise<FileModificationRecord | null> {
    try {
      const row = await this.db
        .prepare(`
          SELECT path, checksum, file_size, last_modified, last_indexed, chunk_count
          FROM file_index
          WHERE path = ?
        `)
        .bind(filePath)
        .first();

      if (!row) {
        return null;
      }

      return {
        path: row.path as string,
        checksum: row.checksum as string,
        fileSize: row.file_size as number,
        lastModified: row.last_modified as number,
        lastIndexed: row.last_indexed as number,
        chunkCount: row.chunk_count as number,
      };
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        `Failed to get file record for ${filePath}`,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Update file modification record
   *
   * @param filePath - File path
   * @param checksum - SHA-256 checksum
   * @param fileSize - File size in bytes
   * @param lastModified - Last modification time (Unix timestamp, ms)
   * @param chunkCount - Number of chunks indexed
   */
  async setFileRecord(
    filePath: string,
    checksum: string,
    fileSize: number,
    lastModified: number,
    chunkCount: number
  ): Promise<void> {
    try {
      const now = Date.now();

      await this.db
        .prepare(`
          INSERT OR REPLACE INTO file_index
          (path, checksum, file_size, last_modified, last_indexed, chunk_count)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(filePath, checksum, fileSize, lastModified, now, chunkCount)
        .run();
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        `Failed to set file record for ${filePath}`,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Check if file needs reindexing
   *
   * Uses hybrid approach:
   * 1. Check mtime (fast path) - if unchanged, skip
   * 2. If mtime changed, verify with checksum
   * 3. Return true only if checksum changed
   *
   * This handles git operations correctly:
   * - Git checkout: mtime changes, checksum unchanged → skip
   * - Actual edit: mtime changes, checksum changes → reindex
   *
   * @param filePath - File path to check
   * @param currentChecksum - Current SHA-256 checksum
   * @param currentModified - Current modification time (Unix timestamp, ms)
   * @returns true if file needs reindexing, false otherwise
   */
  async needsReindexing(
    filePath: string,
    currentChecksum: string,
    currentModified: number
  ): Promise<boolean> {
    try {
      const record = await this.getFileRecord(filePath);

      // Never indexed
      if (!record) {
        return true;
      }

      // Fast path: mtime unchanged
      if (currentModified <= record.lastModified) {
        return false;
      }

      // Mtime changed - verify with checksum
      if (record.checksum !== currentChecksum) {
        return true; // Content actually changed
      }

      // Mtime changed but checksum unchanged (git operation, etc)
      // Update record to avoid rechecking mtime
      await this.setFileRecord(
        filePath,
        record.checksum,
        record.fileSize,
        currentModified,
        record.chunkCount
      );

      return false;
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        `Failed to check reindexing status for ${filePath}`,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Get all tracked file paths
   *
   * @returns Array of tracked file paths
   */
  async getAllTrackedFiles(): Promise<string[]> {
    try {
      const rows = await this.db
        .prepare(`SELECT path FROM file_index`)
        .all();

      return rows.map(row => (row as any).path as string);
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        'Failed to get tracked files',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // ========================================================================
  // DELETED FILE DETECTION
  // ========================================================================

  /**
   * Detect deleted files
   *
   * Compares tracked files against current file list
   * and returns files that exist in tracking but not in list.
   *
   * @param currentPaths - Set of current file paths
   * @returns Array of deleted file paths
   */
  async detectDeletedFiles(currentPaths: Set<string>): Promise<string[]> {
    try {
      const trackedFiles = await this.getAllTrackedFiles();
      const deleted: string[] = [];

      for (const path of trackedFiles) {
        if (!currentPaths.has(path)) {
          deleted.push(path);
        }
      }

      return deleted;
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        'Failed to detect deleted files',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Mark a file as deleted
   *
   * Adds to deleted_files table and removes from file_index
   *
   * @param filePath - File path to mark as deleted
   */
  async markFileDeleted(filePath: string): Promise<void> {
    try {
      // Get chunk count before deletion
      const row = await this.db
        .prepare(`SELECT chunk_count FROM file_index WHERE path = ?`)
        .bind(filePath)
        .first();

      const chunkCount = (row as any)?.chunk_count || 0;

      // Add to deleted files tracking
      await this.db
        .prepare(`
          INSERT OR REPLACE INTO deleted_files
          (path, deleted_at, chunk_count)
          VALUES (?, ?, ?)
        `)
        .bind(filePath, Date.now(), chunkCount)
        .run();

      // Remove from file index
      await this.db
        .prepare(`DELETE FROM file_index WHERE path = ?`)
        .bind(filePath)
        .run();
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        `Failed to mark file as deleted: ${filePath}`,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Cleanup deleted files from vector database
   *
   * Removes chunks for deleted files and marks them as cleaned up
   *
   * @returns Number of files cleaned up
   */
  async cleanupDeletedFiles(): Promise<number> {
    try {
      // Get files that need cleanup
      const rows = await this.db
        .prepare(`
          SELECT path, chunk_count
          FROM deleted_files
          WHERE cleaned_up = 0
        `)
        .all();

      let cleaned = 0;

      for (const row of rows) {
        const path = row.path as string;
        const chunkCount = row.chunk_count as number;

        // Delete chunks from vector_chunks table
        await this.db
          .prepare(`DELETE FROM vector_chunks WHERE file_path = ?`)
          .bind(path)
          .run();

        // Mark as cleaned
        await this.db
          .prepare(`UPDATE deleted_files SET cleaned_up = 1 WHERE path = ?`)
          .bind(path)
          .run();

        cleaned++;
      }

      return cleaned;
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        'Failed to cleanup deleted files',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // ========================================================================
  // INDEX METADATA
  // ========================================================================

  /**
   * Save index metadata
   *
   * Stores in both D1 and KV for fast access
   *
   * @param metadata - Index metadata
   */
  async saveIndex(metadata: IndexMetadata): Promise<void> {
    try {
      const now = Date.now();

      // Store in D1
      await this.db
        .prepare(`
          INSERT OR REPLACE INTO index_metadata
          (index_id, last_updated, files_indexed, chunks_indexed, version)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(
          metadata.indexId || 'default',
          now,
          metadata.filesIndexed,
          metadata.chunksIndexed || 0,
          metadata.version || '0.2.0'
        )
        .run();

      // Cache in KV (24 hour TTL)
      await this.kv.put(
        `index:${metadata.indexId || 'default'}`,
        JSON.stringify({ ...metadata, lastUpdated: now }),
        { expirationTtl: 86400 }
      );
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        'Failed to save index metadata',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Load index metadata
   *
   * Tries KV cache first, falls back to D1
   *
   * @param indexId - Index ID (default: 'default')
   * @returns Index metadata or null if not found
   */
  async loadIndex(indexId: string = 'default'): Promise<IndexMetadata | null> {
    try {
      // Try KV cache first
      const cached = await this.kv.get(`index:${indexId}`, 'text');
      if (cached) {
        return JSON.parse(cached) as IndexMetadata;
      }

      // Fallback to D1
      const row = await this.db
        .prepare(`SELECT * FROM index_metadata WHERE index_id = ?`)
        .bind(indexId)
        .first();

      if (!row) {
        return null;
      }

      return {
        indexId: row.index_id as string,
        lastUpdated: new Date((row as any).last_updated),
        filesIndexed: (row as any).files_indexed as number,
        chunksIndexed: (row as any).chunks_indexed as number,
        version: (row as any).version as string,
      };
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        'Failed to load index metadata',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // ========================================================================
  // STATISTICS
  // ========================================================================

  /**
   * Get storage statistics
   *
   * @returns Storage statistics
   */
  async getStats(): Promise<IndexStorageStats> {
    try {
      const filesRow = await this.db
        .prepare(`SELECT COUNT(*) as count FROM file_index`)
        .first();
      const chunksRow = await this.db
        .prepare(`SELECT SUM(chunk_count) as total FROM file_index`)
        .first();
      const deletedRow = await this.db
        .prepare(`SELECT COUNT(*) as count FROM deleted_files WHERE cleaned_up = 0`)
        .first();

      return {
        totalFiles: (filesRow as any)?.count || 0,
        totalChunks: (chunksRow as any)?.total || 0,
        needsReindexing: (deletedRow as any)?.count || 0,
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        'Failed to get storage stats',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // ========================================================================
  // UTILITY FUNCTIONS
  // ========================================================================

  /**
   * Calculate SHA-256 checksum
   *
   * @param content - Content to hash
   * @returns Hex-encoded SHA-256 hash
   */
  async calculateChecksum(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Clear all stored data
   *
   * WARNING: This is not reversible!
   */
  async clear(): Promise<void> {
    try {
      // Clear all tables
      await this.db.prepare(`DELETE FROM file_index`).run();
      await this.db.prepare(`DELETE FROM deleted_files`).run();
      await this.db.prepare(`DELETE FROM index_metadata`).run();

      // Clear KV cache
      await this.kv.delete('index:default');
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        'Failed to clear storage',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Export all data
   *
   * @returns Exported data as JSON
   */
  async exportIndex(): Promise<{
    files: FileModificationRecord[];
    metadata: IndexMetadata | null;
  }> {
    try {
      const files = await this.getAllTrackedFiles();
      const fileRecords: FileModificationRecord[] = [];

      for (const path of files) {
        const record = await this.getFileRecord(path);
        if (record) {
          fileRecords.push(record);
        }
      }

      const metadata = await this.loadIndex();

      return {
        files: fileRecords,
        metadata,
      };
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        'Failed to export index',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Import data
   *
   * @param data - Exported data
   */
  async importIndex(data: {
    files: FileModificationRecord[];
    metadata: IndexMetadata | null;
  }): Promise<void> {
    try {
      // Import file records
      for (const record of data.files) {
        await this.setFileRecord(
          record.path,
          record.checksum,
          record.fileSize,
          record.lastModified,
          record.chunkCount
        );
      }

      // Import metadata
      if (data.metadata) {
        await this.saveIndex(data.metadata);
      }
    } catch (error) {
      throw createPrismError(
        ErrorCode.INDEXING_FAILED,
        'Failed to import index',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }
}
