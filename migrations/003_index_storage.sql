-- ============================================================================
-- PRISM v0.3: Index Storage SQLite Schema Migration
-- ============================================================================
--
-- This migration creates the local SQLite database schema for IndexStorage
-- with:
-- - File modification tracking (mtime + SHA-256 checksums)
-- - Code chunk storage with metadata
-- - Incremental indexing support
-- - Soft delete support
-- - Index metadata persistence
--
-- This is for LOCAL SQLite storage (not Cloudflare D1)
-- Database location: ~/.prism/index.db
--
-- @see src/indexer/IndexStorage.ts for implementation
-- ============================================================================

-- ============================================================================
-- INDEX METADATA TABLE
-- ============================================================================
--
-- Stores global index metadata and statistics
-- Singleton table (only one row)

CREATE TABLE IF NOT EXISTS index_metadata (
  -- Primary key (singleton pattern)
  id TEXT PRIMARY KEY CHECK (id = 'default'),

  -- Index information
  index_id TEXT UNIQUE NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',

  -- Statistics
  files_indexed INTEGER DEFAULT 0,
  chunks_indexed INTEGER DEFAULT 0,

  -- Timestamps
  last_updated INTEGER NOT NULL,  -- Unix timestamp (ms)
  created_at INTEGER NOT NULL,    -- Unix timestamp (ms)

  -- Schema version for migrations
  schema_version INTEGER NOT NULL DEFAULT 3
);

-- Insert default metadata
INSERT OR IGNORE INTO index_metadata (
  id,
  index_id,
  version,
  files_indexed,
  chunks_indexed,
  last_updated,
  created_at,
  schema_version
)
VALUES (
  'default',
  'local-index',
  '1.0.0',
  0,
  0,
  0,
  0,
  3
);

-- ============================================================================
-- INDEXED FILES TABLE
-- ============================================================================
--
-- Tracks file metadata for incremental indexing
-- Uses both mtime AND SHA-256 checksums for accurate change detection

CREATE TABLE IF NOT EXISTS indexed_files (
  -- File path (primary key)
  path TEXT PRIMARY KEY,

  -- Content verification
  checksum TEXT NOT NULL,        -- SHA-256 hash of file content
  file_size INTEGER NOT NULL,    -- File size in bytes

  -- Timing information
  last_modified INTEGER NOT NULL,  -- File modification time (Unix timestamp, ms)
  last_indexed INTEGER NOT NULL,   -- Last indexing time (Unix timestamp, ms)

  -- Chunk tracking
  chunk_count INTEGER DEFAULT 0,  -- Number of chunks indexed

  -- Soft delete support
  deleted_at INTEGER               -- Unix timestamp (ms), NULL = not deleted
);

-- Create indexes for indexed_files
CREATE INDEX IF NOT EXISTS idx_indexed_files_checksum ON indexed_files(checksum);
CREATE INDEX IF NOT EXISTS idx_indexed_files_last_modified ON indexed_files(last_modified);
CREATE INDEX IF NOT EXISTS idx_indexed_files_last_indexed ON indexed_files(last_indexed);
CREATE INDEX IF NOT EXISTS idx_indexed_files_deleted_at ON indexed_files(deleted_at);

-- ============================================================================
-- CODE CHUNKS TABLE
-- ============================================================================
--
-- Stores indexed code chunks with metadata
-- Supports efficient retrieval and incremental updates

CREATE TABLE IF NOT EXISTS code_chunks (
  -- Primary key (SHA-256 hash of chunk content)
  id TEXT PRIMARY KEY,

  -- Source file information
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,

  -- Location information
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,

  -- Language and type
  language TEXT NOT NULL,
  chunk_type TEXT NOT NULL,  -- 'function', 'class', 'method', 'variable', 'interface'

  -- Optional fields
  name TEXT,                 -- Human-readable name (e.g., "UserService.fetchUser")
  signature TEXT,            -- Type signature for functions/methods

  -- Metadata (JSON)
  symbols TEXT,              -- JSON array: ["functionName", "className"]
  dependencies TEXT,         -- JSON array: ["./dependency.ts"]
  exports TEXT,              -- JSON array: exported symbols
  imports TEXT,              -- JSON array: imported symbols
  metadata TEXT,             -- JSON object: additional metadata

  -- Embedding (optional, can be stored as BLOB or TEXT)
  embedding TEXT,            -- JSON array of floats: [0.1, 0.2, ...]

  -- Content verification
  checksum TEXT NOT NULL,    -- SHA-256 hash of chunk content

  -- Timestamps
  created_at INTEGER NOT NULL,  -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL,  -- Unix timestamp (ms)

  -- Soft delete support
  deleted_at INTEGER,           -- Unix timestamp (ms), NULL = not deleted

  -- Foreign key relationship
  FOREIGN KEY (file_path) REFERENCES indexed_files(path) ON DELETE CASCADE
);

-- Create indexes for code_chunks
CREATE INDEX IF NOT EXISTS idx_code_chunks_file_path ON code_chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_code_chunks_language ON code_chunks(language);
CREATE INDEX IF NOT EXISTS idx_code_chunks_chunk_type ON code_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_code_chunks_checksum ON code_chunks(checksum);
CREATE INDEX IF NOT EXISTS idx_code_chunks_deleted_at ON code_chunks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_code_chunks_created_at ON code_chunks(created_at);

-- Full-text search on content
CREATE VIRTUAL TABLE IF NOT EXISTS code_chunks_fts USING fts5(
  content,
  name,
  tokenize='unicode61'
);

-- ============================================================================
-- MIGRATION TRACKING TABLE
-- ============================================================================
--
-- Tracks which migrations have been applied
-- Ensures migrations are only run once

CREATE TABLE IF NOT EXISTS schema_migrations (
  -- Migration version
  version TEXT PRIMARY KEY,

  -- Migration information
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL,  -- Unix timestamp (ms)

  -- Rollback support
  rollback_sql TEXT             -- SQL to rollback this migration
);

-- Insert this migration
INSERT OR IGNORE INTO schema_migrations (
  version,
  name,
  applied_at
)
VALUES (
  '003',
  'index_storage',
  strftime('%s', 'now') * 1000
);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active indexed files (not deleted)
CREATE VIEW IF NOT EXISTS active_indexed_files AS
SELECT
  path,
  checksum,
  file_size,
  last_modified,
  last_indexed,
  chunk_count
FROM indexed_files
WHERE deleted_at IS NULL;

-- Active code chunks (not deleted)
CREATE VIEW IF NOT EXISTS active_code_chunks AS
SELECT
  id,
  file_path,
  content,
  start_line,
  end_line,
  language,
  chunk_type,
  name,
  signature,
  created_at,
  updated_at
FROM code_chunks
WHERE deleted_at IS NULL;

-- Index statistics
CREATE VIEW IF NOT EXISTS index_statistics AS
SELECT
  (SELECT COUNT(*) FROM indexed_files WHERE deleted_at IS NULL) as total_files,
  (SELECT COUNT(*) FROM code_chunks WHERE deleted_at IS NULL) as total_chunks,
  (SELECT SUM(chunk_count) FROM indexed_files WHERE deleted_at IS NULL) as total_chunk_refs,
  (SELECT last_updated FROM index_metadata WHERE id = 'default') as last_updated,
  (SELECT created_at FROM index_metadata WHERE id = 'default') as created_at;

-- Files by language
CREATE VIEW IF NOT EXISTS files_by_language AS
SELECT
  language,
  COUNT(DISTINCT file_path) as file_count,
  COUNT(*) as chunk_count
FROM code_chunks
WHERE deleted_at IS NULL
GROUP BY language
ORDER BY chunk_count DESC;

-- ============================================================================
-- TRIGGERS FOR AUTO-UPDATE
-- ============================================================================

-- Update last_updated timestamp when chunks are inserted/updated
CREATE TRIGGER IF NOT EXISTS update_chunks_timestamp
AFTER UPDATE ON code_chunks
BEGIN
  UPDATE code_chunks SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
END;

-- Update chunk count when chunks are added/removed
CREATE TRIGGER IF NOT EXISTS increment_chunk_count
AFTER INSERT ON code_chunks
WHEN NEW.deleted_at IS NULL
BEGIN
  UPDATE indexed_files
  SET chunk_count = chunk_count + 1
  WHERE path = NEW.file_path;
END;

CREATE TRIGGER IF NOT EXISTS decrement_chunk_count
AFTER UPDATE OF deleted_at ON code_chunks
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  UPDATE indexed_files
  SET chunk_count = chunk_count - 1
  WHERE path = NEW.file_path;
END;

-- ============================================================================
-- PERFORMANCE NOTES
-- ============================================================================
--
-- **Query Optimization:**
-- - Use indexed columns in WHERE clauses (path, checksum, last_modified)
-- - Use views for common queries to simplify code
-- - Enable WAL mode for better concurrent access: PRAGMA journal_mode=WAL
-- - Increase cache size: PRAGMA cache_size=-64000 (64MB)
--
-- **Incremental Indexing Strategy:**
-- 1. Query indexed_files by path to get stored checksum
-- 2. Compare with current file checksum (SHA-256)
-- 3. If checksums match → skip file (fast path)
-- 4. If checksums differ → reindex file:
--    - Mark old chunks as deleted (deleted_at = now)
--    - Insert new chunks with new checksum
--    - Update indexed_files record
--
-- **Soft Delete Strategy:**
-- - Set deleted_at timestamp instead of DELETE
-- - Run periodic cleanup to permanently remove old records
-- - Allows recovery and auditing
--
-- **Migration Path:**
-- - Schema version stored in index_metadata.schema_version
-- - Check version on startup, run migrations if needed
-- - Each migration adds row to schema_migrations table
--
-- ============================================================================
