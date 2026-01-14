-- ============================================================================
-- PRISM v0.2: Vector Database Schema Migration
-- ============================================================================
--
-- This migration creates the D1 database schema for PRISM v0.2 with:
-- - Vector storage with BLOB embeddings (Float32Array)
-- - SHA-256 content hashing for incremental indexing
-- - Soft delete support
-- - HNSW index metadata
-- - File change tracking
-- - Deleted file tracking
--
-- Run this migration after 001_initial.sql
--
-- @see docs/architecture/04-indexer-architecture.md
-- ============================================================================

-- ============================================================================
-- VECTOR CHUNKS TABLE
-- ============================================================================
--
-- Stores code chunks with their vector embeddings
-- Uses BLOB for efficient Float32Array storage (70% space savings vs JSON)
-- Supports soft delete for garbage collection

CREATE TABLE IF NOT EXISTS vector_chunks (
  -- Primary key
  id TEXT PRIMARY KEY,

  -- Source file information
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  language TEXT NOT NULL,

  -- Code structure metadata (JSON arrays/objects)
  symbols TEXT,              -- JSON array: ["functionName", "className"]
  dependencies TEXT,         -- JSON array: ["./dependency.ts"]
  metadata TEXT,             -- JSON object: { "exports": [], "imports": [] }

  -- Vector embedding (BLOB: Float32Array)
  -- 384 dimensions × 4 bytes = 1,536 bytes per chunk
  embedding BLOB NOT NULL,

  -- SHA-256 checksum for content verification
  checksum TEXT NOT NULL,

  -- Timestamps
  created_at INTEGER NOT NULL,  -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL,  -- Unix timestamp (ms)
  deleted_at INTEGER            -- Unix timestamp (ms), NULL = not deleted
);

-- Create indexes for vector_chunks
CREATE INDEX IF NOT EXISTS idx_vector_chunks_file_path ON vector_chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_language ON vector_chunks(language);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_checksum ON vector_chunks(checksum);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_deleted_at ON vector_chunks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_created_at ON vector_chunks(created_at);

-- ============================================================================
-- FILE INDEX TABLE
-- ============================================================================
--
-- Tracks file metadata for incremental indexing
-- Uses SHA-256 checksums for accurate change detection
-- Supports hybrid mtime + checksum approach

CREATE TABLE IF NOT EXISTS file_index (
  -- File path (primary key)
  path TEXT PRIMARY KEY,

  -- Content verification
  checksum TEXT NOT NULL,        -- SHA-256 hash of file content
  file_size INTEGER NOT NULL,    -- File size in bytes

  -- Timing information
  last_modified INTEGER NOT NULL,  -- File modification time (Unix timestamp)
  last_indexed INTEGER NOT NULL,   -- Last indexing time (Unix timestamp)

  -- Chunk tracking
  chunk_count INTEGER DEFAULT 0  -- Number of chunks indexed
);

-- Create indexes for file_index
CREATE INDEX IF NOT EXISTS idx_file_index_checksum ON file_index(checksum);
CREATE INDEX IF NOT EXISTS idx_file_index_last_modified ON file_index(last_modified);
CREATE INDEX IF NOT EXISTS idx_file_index_last_indexed ON file_index(last_indexed);

-- ============================================================================
-- HNSW INDEX METADATA
-- ============================================================================
--
-- Stores HNSW (Hierarchical Navigable Small World) index configuration
-- HNSW provides O(log n) approximate nearest neighbor search
-- Single-row table (singleton pattern)

CREATE TABLE IF NOT EXISTS hnsw_metadata (
  id TEXT PRIMARY KEY CHECK (id = 'default'),  -- Singleton: only 'default' row

  -- HNSW parameters
  dimension INTEGER NOT NULL DEFAULT 384,        -- Embedding dimensions (BGE-small)
  m INTEGER NOT NULL DEFAULT 16,                 -- Max connections per node (16-32)
  ef_construction INTEGER NOT NULL DEFAULT 200,  -- Build-time accuracy (100-200)
  ef_search INTEGER NOT NULL DEFAULT 50,         -- Search-time accuracy (50-100)

  -- Index statistics
  vector_count INTEGER DEFAULT 0,                -- Number of vectors in index
  last_built INTEGER,                            -- Last index rebuild time (Unix timestamp)

  -- Index versioning
  version TEXT NOT NULL DEFAULT '1.0.0',         -- HNSW algorithm version
  index_format TEXT NOT NULL DEFAULT 'hnswlib'   -- Index format identifier
);

-- Create index for hnsw_metadata
CREATE INDEX IF NOT EXISTS idx_hnsw_metadata_vector_count ON hnsw_metadata(vector_count);

-- Insert default HNSW metadata
INSERT OR IGNORE INTO hnsw_metadata (
  id,
  dimension,
  m,
  ef_construction,
  ef_search,
  vector_count,
  version
)
VALUES (
  'default',
  384,    -- BGE-small-en-v1.5 dimensions
  16,     -- Max connections (balance between speed and accuracy)
  200,    -- Build-time accuracy (higher = better index, slower build)
  50,     -- Search-time accuracy (higher = better results, slower search)
  0,      -- Start with 0 vectors
  '1.0.0' -- Initial version
);

-- ============================================================================
-- DELETED FILES TRACKING
-- ============================================================================
--
-- Tracks deleted files for garbage collection
-- Allows cleanup of orphaned chunks from vector database

CREATE TABLE IF NOT EXISTS deleted_files (
  -- File path (primary key)
  path TEXT PRIMARY KEY,

  -- Deletion information
  deleted_at INTEGER NOT NULL,      -- Unix timestamp (ms)
  chunk_count INTEGER DEFAULT 0,     -- Number of chunks to clean up

  -- Cleanup status
  cleaned_up INTEGER DEFAULT 0       -- Boolean: 0 = not cleaned, 1 = cleaned
);

-- Create indexes for deleted_files
CREATE INDEX IF NOT EXISTS idx_deleted_files_deleted_at ON deleted_files(deleted_at);
CREATE INDEX IF NOT EXISTS idx_deleted_files_cleaned_up ON deleted_files(cleaned_up);

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
--
-- **HNSW Integration:**
-- This schema supports HNSW indexing but doesn't create the HNSW index itself.
-- The HNSW index is stored separately as a binary file (hnsw_index.bin)
-- and managed by the HNSWIndex class.
--
-- **BLOB Storage:**
-- Embeddings are stored as BLOB (Float32Array) instead of TEXT (JSON).
-- This provides 70% space savings and faster loading.
--
-- **Soft Delete:**
-- Chunks are soft-deleted (deleted_at set) instead of hard-deleted.
-- This allows for recovery and auditing.
-- Garbage collection will permanently remove old soft-deleted chunks.
--
-- **SHA-256 Checksums:**
-- All chunks and files include SHA-256 checksums for:
-- - Accurate change detection (mtime alone is unreliable)
-- - Content integrity verification
-- - Deduplication (same content = same checksum)
--
-- **Incremental Indexing:**
-- The file_index table enables efficient incremental indexing:
-- 1. Compare checksums to detect actual content changes
-- 2. Skip unchanged files (fast path)
-- 3. Detect git operations (mtime changed, checksum unchanged)
-- 4. Track deleted files for cleanup
--
-- ============================================================================

-- ============================================================================
-- POST-MIGRATION TASKS
-- ============================================================================
--
-- After running this migration:
--
-- 1. Update wrangler.toml with the D1 database ID:
--    [[d1_databases]]
--    binding = "DB"
--    database_name = "claudes-friend-db"
--    database_id = "<YOUR_DATABASE_ID>"
--
-- 2. Create HNSW index storage location:
--    The HNSW index will be stored as: ~/.prism/hnsw_index.bin
--
-- 3. Run initial indexing to populate the database:
--    npm run db:migrate
--    prism index . --incremental
--
-- ============================================================================
