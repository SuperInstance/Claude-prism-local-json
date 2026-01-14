-- ============================================================================
-- SEMANTIC EMBEDDINGS CACHE MIGRATION
-- ============================================================================
--
-- This migration creates the necessary tables for the semantic embeddings
-- caching system used by the MCP Server.
--
-- Features:
-- ---------
-- - Persistent embedding cache with D1 database
-- - LRU eviction policy support
-- - TTL-based expiration tracking
-- - Access statistics for cache optimization
-- - Automatic cleanup of stale entries
--
-- Tables:
-- --------
-- 1. embedding_cache - Main cache storage for embeddings
-- 2. embedding_metadata - Statistics and monitoring data
-- 3. embedding_metrics - Detailed performance metrics
--
-- @see docs/migrations/004_semantic_embeddings.md
-- @see prism/src/mcp/semantic-embeddings.ts
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: embedding_cache
-- ----------------------------------------------------------------------------
-- Stores cached semantic embeddings with metadata for LRU eviction and TTL
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS embedding_cache (
  -- Primary key: SHA-256 hash of the text content
  key TEXT PRIMARY KEY NOT NULL,

  -- Embedding vector stored as BLOB (Float32Array serialized)
  -- Size: 384 dimensions * 4 bytes/dimension = 1536 bytes per embedding
  embedding BLOB NOT NULL,

  -- Model identifier (e.g., '@cf/baai/bge-small-en-v1.5')
  model TEXT NOT NULL,

  -- Timestamp when embedding was generated (milliseconds since epoch)
  created_at INTEGER NOT NULL,

  -- Timestamp of last access (milliseconds since epoch)
  -- Used for LRU eviction policy
  last_accessed INTEGER NOT NULL,

  -- Number of times this embedding has been accessed
  -- Used for cache analysis and optimization
  access_count INTEGER DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- Indexes: embedding_cache
-- ----------------------------------------------------------------------------

-- Index for LRU eviction queries
-- Orders by last_accessed ASC to find least recently used entries
CREATE INDEX IF NOT EXISTS idx_embedding_cache_lru
  ON embedding_cache(last_accessed ASC);

-- Index for TTL cleanup queries
-- Orders by created_at to find expired entries
CREATE INDEX IF NOT EXISTS idx_embedding_cache_ttl
  ON embedding_cache(created_at ASC);

-- Index for model-specific queries
-- Useful for analytics and model comparison
CREATE INDEX IF NOT EXISTS idx_embedding_cache_model
  ON embedding_cache(model);

-- Composite index for cache analysis
-- Used for statistics and monitoring dashboards
CREATE INDEX IF NOT EXISTS idx_embedding_cache_stats
  ON embedding_cache(model, last_accessed DESC, access_count DESC);

-- ----------------------------------------------------------------------------
-- Table: embedding_metadata
-- ----------------------------------------------------------------------------
-- Stores aggregate statistics about the embedding cache
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS embedding_metadata (
  -- Singleton record (always id=1)
  id INTEGER PRIMARY KEY CHECK (id = 1),

  -- Total number of embeddings generated (including non-cached)
  total_generated INTEGER DEFAULT 0,

  -- Total number of cache hits
  total_hits INTEGER DEFAULT 0,

  -- Total number of cache misses
  total_misses INTEGER DEFAULT 0,

  -- Average embedding generation time in milliseconds
  average_generation_time REAL DEFAULT 0,

  -- Timestamp of last update
  last_updated INTEGER NOT NULL,

  -- Provider usage statistics (JSON)
  -- Format: {"cloudflare": 100, "ollama": 50, "placeholder": 5}
  provider_usage TEXT DEFAULT '{}',

  -- Error counts by type (JSON)
  -- Format: {"cloudflare": 2, "ollama": 1, "network": 3, "timeout": 1}
  error_counts TEXT DEFAULT '{}'
);

-- Initialize metadata row
INSERT OR IGNORE INTO embedding_metadata (
  id,
  total_generated,
  total_hits,
  total_misses,
  average_generation_time,
  last_updated,
  provider_usage,
  error_counts
) VALUES (
  1,
  0,
  0,
  0,
  0,
  strftime('%s', 'now') * 1000,
  '{}',
  '{}'
);

-- ----------------------------------------------------------------------------
-- Table: embedding_metrics
-- ----------------------------------------------------------------------------
-- Detailed time-series metrics for monitoring and analytics
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS embedding_metrics (
  -- Auto-incrementing primary key
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Timestamp of metric recording
  timestamp INTEGER NOT NULL,

  -- Provider used for this embedding
  provider TEXT NOT NULL,

  -- Model used
  model TEXT NOT NULL,

  -- Generation time in milliseconds
  generation_time INTEGER NOT NULL,

  -- Whether this was a cache hit
  cache_hit INTEGER NOT NULL,

  -- Embedding dimension
  dimension INTEGER NOT NULL,

  -- Error message (if generation failed)
  error TEXT,

  -- Additional metadata (JSON)
  metadata TEXT DEFAULT '{}'
);

-- ----------------------------------------------------------------------------
-- Indexes: embedding_metrics
-- ----------------------------------------------------------------------------

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_embedding_metrics_timestamp
  ON embedding_metrics(timestamp DESC);

-- Index for provider-specific analytics
CREATE INDEX IF NOT EXISTS idx_embedding_metrics_provider
  ON embedding_metrics(provider, timestamp DESC);

-- Index for performance analysis
CREATE INDEX IF NOT EXISTS idx_embedding_metrics_performance
  ON embedding_metrics(generation_time DESC);

-- Composite index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_embedding_metrics_dashboard
  ON embedding_metrics(timestamp DESC, provider, cache_hit);

-- ----------------------------------------------------------------------------
-- Helper Views
-- ----------------------------------------------------------------------------

-- View: Cache performance summary
-- Provides aggregate statistics for monitoring
CREATE VIEW IF NOT EXISTS v_cache_performance AS
SELECT
  COUNT(*) as total_entries,
  SUM(access_count) as total_accesses,
  AVG(access_count) as avg_accesses,
  MAX(access_count) as max_accesses,
  COUNT(CASE WHEN strftime('%s', 'now') * 1000 - created_at < 86400000 THEN 1 END) as entries_last_24h,
  COUNT(CASE WHEN strftime('%s', 'now') * 1000 - created_at < 604800000 THEN 1 END) as entries_last_7d
FROM embedding_cache;

-- View: Provider usage statistics
-- Breaks down embedding usage by provider
CREATE VIEW IF NOT EXISTS v_provider_stats AS
SELECT
  provider,
  model,
  COUNT(*) as total_embeddings,
  AVG(generation_time) as avg_generation_time,
  MIN(generation_time) as min_generation_time,
  MAX(generation_time) as max_generation_time,
  SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits,
  SUM(CASE WHEN cache_hit = 0 THEN 1 ELSE 0 END) as cache_misses,
  CAST(SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as hit_rate
FROM embedding_metrics
GROUP BY provider, model;

-- View: Error statistics
-- Tracks errors by type and provider
CREATE VIEW IF NOT EXISTS v_error_stats AS
SELECT
  provider,
  error,
  COUNT(*) as error_count,
  MAX(timestamp) as last_occurrence
FROM embedding_metrics
WHERE error IS NOT NULL
GROUP BY provider, error
ORDER BY error_count DESC;

-- ----------------------------------------------------------------------------
-- Triggers for Automatic Maintenance
-- ----------------------------------------------------------------------------

-- Trigger: Update last_accessed on cache read
CREATE TRIGGER IF NOT EXISTS trg_cache_update_accessed
  AFTER SELECT ON embedding_cache
  BEGIN
    UPDATE embedding_cache
    SET last_accessed = strftime('%s', 'now') * 1000,
        access_count = access_count + 1
    WHERE key = NEW.key;
  END;

-- Trigger: Update metadata on cache insert
CREATE TRIGGER IF NOT EXISTS trg_metadata_update_insert
  AFTER INSERT ON embedding_cache
  BEGIN
    UPDATE embedding_metadata
    SET total_generated = total_generated + 1,
        last_updated = strftime('%s', 'now') * 1000
    WHERE id = 1;
  END;

-- Trigger: Insert metric record
CREATE TRIGGER IF NOT EXISTS trg_metric_insert
  AFTER INSERT ON embedding_cache
  BEGIN
    INSERT INTO embedding_metrics (
      timestamp,
      provider,
      model,
      generation_time,
      cache_hit,
      dimension,
      metadata
    ) VALUES (
      strftime('%s', 'now') * 1000,
      CASE WHEN NEW.model LIKE '%ollama%' THEN 'ollama'
           WHEN NEW.model LIKE '%placeholder%' THEN 'placeholder'
           ELSE 'cloudflare' END,
      NEW.model,
      0, -- Will be updated by application
      0, -- Will be updated by application
      384, -- Default dimension
      '{}'
    );
  END;

-- ----------------------------------------------------------------------------
-- Stored Procedures for Maintenance
-- ----------------------------------------------------------------------------

-- Note: D1 doesn't support stored procedures, but these are useful patterns
-- for application-level maintenance tasks

-- Cleanup expired entries (TTL-based eviction)
-- DELETE FROM embedding_cache
-- WHERE created_at < strftime('%s', 'now') * 1000 - ?;

-- Enforce LRU eviction when cache is full
-- DELETE FROM embedding_cache
-- WHERE key IN (
--   SELECT key FROM embedding_cache
--   ORDER BY last_accessed ASC
--   LIMIT ?
-- );

-- Get cache hit rate
-- SELECT
--   CAST(total_hits AS REAL) / (total_hits + total_misses) as hit_rate
-- FROM embedding_metadata
-- WHERE id = 1;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
--
-- The semantic embeddings cache is now ready for use. The MCP Server will
-- automatically use these tables for caching embeddings.
--
-- Next Steps:
-- -----------
-- 1. Test the migration: wrangler d1 execute claudes-friend-db --file=./migrations/004_semantic_embeddings.sql
-- 2. Update MCP Server to use SemanticEmbeddingsService
-- 3. Monitor cache performance using the views above
-- 4. Set up periodic cleanup of expired entries
--
-- ============================================================================
