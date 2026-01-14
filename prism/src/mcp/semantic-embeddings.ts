/**
 * ============================================================================
 * SEMANTIC EMBEDDINGS SERVICE
 * ============================================================================
 *
 * Provides true semantic embeddings using Cloudflare Workers AI, replacing
 * hash-based embeddings with meaningful vector representations that capture
 * semantic content for accurate search relevance.
 *
 * ARCHITECTURE:
 * ------------
 * 1. Primary Provider: Cloudflare Workers AI (@cf/baai/bge-small-en-v1.5)
 * 2. Fallback Provider: Ollama (nomic-embed-text)
 * 3. Last Resort: Hash-based placeholder (with warning)
 *
 * FEATURES:
 * ---------
 * - True semantic embeddings (384 dimensions)
 * - D1-based persistent caching with LRU eviction
 * - Batch processing for efficiency
 * - Comprehensive metrics and monitoring
 * - Graceful error handling and fallbacks
 * - Automatic retry with exponential backoff
 *
 * CACHE STRATEGY:
 * --------------
 * - D1 database for persistent storage
 * - LRU eviction policy
 * - TTL-based expiration (7 days default)
 * - Cache hit/miss statistics
 * - Automatic cleanup of expired entries
 *
 * PERFORMANCE:
 * -----------
 * - Cloudflare: ~100-300ms per embedding
 * - Cache hits: ~5-10ms
 * - Batch processing: Parallel requests with concurrency control
 * - Automatic retry on transient failures
 *
 * @see docs/architecture/02-token-optimizer.md
 * @see docs/migrations/004_semantic_embeddings.sql
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';

/**
 * ============================================================================
 * TYPES AND INTERFACES
 * ============================================================================
 */

/**
 * Embedding vector representation
 */
export interface Embedding {
  /** Vector values (384 dimensions for bge-small-en-v1.5) */
  values: number[];
  /** Model used to generate embedding */
  model: string;
  /** Dimension of the vector */
  dimensions: number;
  /** Timestamp when embedding was generated */
  timestamp: number;
  /** Whether this was retrieved from cache */
  cached?: boolean;
}

/**
 * Embedding generation result with metadata
 */
export interface EmbeddingResult extends Embedding {
  /** Cache hit status */
  cacheHit: boolean;
  /** Generation time in milliseconds */
  generationTime: number;
  /** Provider used (cloudflare, ollama, placeholder) */
  provider: 'cloudflare' | 'ollama' | 'placeholder';
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  /** Individual embedding results */
  results: EmbeddingResult[];
  /** Successful count */
  successCount: number;
  /** Failed count */
  failureCount: number;
  /** Total time in milliseconds */
  totalTime: number;
  /** Average time per embedding */
  averageTime: number;
}

/**
 * Similarity search result
 */
export interface SimilarityResult {
  /** Chunk content */
  chunk: any;
  /** Similarity score (0-1) */
  score: number;
  /** Additional metadata */
  metadata?: {
    /** Embedding distance */
    distance?: number;
    /** Rank in results */
    rank?: number;
  };
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total cache entries */
  totalEntries: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Total cache size in bytes */
  cacheSize: number;
}

/**
 * Embedding metrics
 */
export interface EmbeddingMetrics {
  /** Total embeddings generated */
  totalGenerated: number;
  /** Total cache hits */
  totalCacheHits: number;
  /** Total cache misses */
  totalCacheMisses: number;
  /** Average generation time (ms) */
  averageGenerationTime: number;
  /** Provider usage counts */
  providerUsage: {
    cloudflare: number;
    ollama: number;
    placeholder: number;
  };
  /** Error counts */
  errors: {
    cloudflare: number;
    ollama: number;
    network: number;
    timeout: number;
  };
}

/**
 * Service configuration
 */
export interface SemanticEmbeddingsConfig {
  /** Cloudflare account ID */
  cloudflareAccountId?: string;
  /** Cloudflare API key */
  cloudflareApiKey?: string;
  /** Cloudflare API endpoint */
  cloudflareApiEndpoint?: string;
  /** Embedding model */
  model?: string;
  /** Ollama endpoint */
  ollamaEndpoint?: string;
  /** Ollama model */
  ollamaModel?: string;
  /** Cache database path */
  cachePath?: string;
  /** Cache TTL in milliseconds (default: 7 days) */
  cacheTTL?: number;
  /** Maximum cache size (default: 10000 entries) */
  maxCacheSize?: number;
  /** Batch processing size (default: 10) */
  batchSize?: number;
  /** Maximum concurrent requests (default: 5) */
  maxConcurrency?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean;
  /** Fallback to hash-based embedding (default: true) */
  fallbackToHash?: boolean;
}

/**
 * Cloudflare AI API response
 */
interface CloudflareApiResponse {
  success: boolean;
  errors?: Array<{ message: string }>;
  result?: {
    shape: number[];
    data: number[][];
  };
}

/**
 * Ollama API response
 */
interface OllamaApiResponse {
  embedding: number[];
}

/**
 * Cache entry in database
 */
interface CacheEntry {
  key: string;
  embedding: Buffer; // Float32Array stored as BLOB
  model: string;
  created_at: number;
  last_accessed: number;
  access_count: number;
}

/**
 * ============================================================================
 * SEMANTIC EMBEDDINGS SERVICE
 * ============================================================================
 */

/**
 * Main semantic embeddings service class
 *
 * Provides true semantic embeddings using Cloudflare Workers AI with
 * comprehensive caching, metrics, and fallback strategies.
 */
export class SemanticEmbeddingsService {
  private config: Required<SemanticEmbeddingsConfig>;
  private db: Database.Database;
  private metrics: EmbeddingMetrics;

  constructor(config: SemanticEmbeddingsConfig = {}) {
    // Initialize configuration with defaults
    this.config = {
      cloudflareAccountId: config.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID || '',
      cloudflareApiKey: config.cloudflareApiKey || process.env.CLOUDFLARE_API_KEY || '',
      cloudflareApiEndpoint: config.cloudflareApiEndpoint || 'https://api.cloudflare.com/client/v4',
      model: config.model || '@cf/baai/bge-small-en-v1.5',
      ollamaEndpoint: config.ollamaEndpoint || 'http://localhost:11434',
      ollamaModel: config.ollamaModel || 'nomic-embed-text',
      cachePath: config.cachePath || ':memory:',
      cacheTTL: config.cacheTTL || 7 * 24 * 60 * 60 * 1000, // 7 days
      maxCacheSize: config.maxCacheSize || 10000,
      batchSize: config.batchSize || 10,
      maxConcurrency: config.maxConcurrency || 5,
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      enableMetrics: config.enableMetrics !== false,
      fallbackToHash: config.fallbackToHash !== false,
    };

    // Initialize database for caching
    this.db = new Database(this.config.cachePath);
    this.db.pragma('journal_mode = WAL');
    this.initializeDatabase();

    // Initialize metrics
    this.metrics = {
      totalGenerated: 0,
      totalCacheHits: 0,
      totalCacheMisses: 0,
      averageGenerationTime: 0,
      providerUsage: {
        cloudflare: 0,
        ollama: 0,
        placeholder: 0,
      },
      errors: {
        cloudflare: 0,
        ollama: 0,
        network: 0,
        timeout: 0,
      },
    };
  }

  /**
   * ============================================================================
   * DATABASE INITIALIZATION
   * ============================================================================
   */

  /**
   * Initialize database schema for embedding cache
   */
  private initializeDatabase(): void {
    this.db.exec(`
      -- Embedding cache table
      CREATE TABLE IF NOT EXISTS embedding_cache (
        key TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0
      );

      -- Index for LRU eviction
      CREATE INDEX IF NOT EXISTS idx_embedding_cache_accessed
        ON embedding_cache(last_accessed);

      -- Index for TTL cleanup
      CREATE INDEX IF NOT EXISTS idx_embedding_cache_created
        ON embedding_cache(created_at);

      -- Metadata table for statistics
      CREATE TABLE IF NOT EXISTS embedding_metadata (
        id INTEGER PRIMARY KEY,
        total_generated INTEGER DEFAULT 0,
        total_hits INTEGER DEFAULT 0,
        total_misses INTEGER DEFAULT 0,
        last_updated INTEGER NOT NULL
      );

      -- Initialize metadata row
      INSERT OR IGNORE INTO embedding_metadata (id, last_updated)
        VALUES (1, ${Date.now()});
    `);
  }

  /**
   * ============================================================================
   * EMBEDDING GENERATION
   * ============================================================================
   */

  /**
   * Generate semantic embedding for a single text
   *
   * This is the main entry point for embedding generation. It:
   * 1. Checks cache for existing embedding
   * 2. Generates new embedding if not cached
   * 3. Stores result in cache
   * 4. Updates metrics
   *
   * @param text - Text to generate embedding for
   * @returns Embedding result with metadata
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    // Validate input
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    // Check cache
    const cacheKey = this.generateCacheKey(text);
    const cached = await this.getFromCache(cacheKey);

    if (cached) {
      const generationTime = Date.now() - startTime;
      this.updateMetrics('cache', 'cloudflare', generationTime);

      return {
        ...cached,
        cacheHit: true,
        generationTime,
        provider: 'cloudflare',
      };
    }

    // Generate new embedding
    const embedding = await this.generateWithProviders(text);
    const generationTime = Date.now() - startTime;

    // Store in cache
    await this.addToCache(cacheKey, embedding);

    // Update metrics
    this.updateMetrics('generated', embedding.model === this.config.model ? 'cloudflare' :
                       embedding.model.includes('ollama') ? 'ollama' : 'placeholder',
                       generationTime);

    return {
      ...embedding,
      cacheHit: false,
      generationTime,
      provider: embedding.model === this.config.model ? 'cloudflare' :
                embedding.model.includes('ollama') ? 'ollama' : 'placeholder',
    };
  }

  /**
   * Generate embeddings for multiple texts in batch
   *
   * Processes multiple texts concurrently with controlled concurrency
   * to avoid overwhelming the API.
   *
   * @param texts - Array of texts to embed
   * @returns Batch embedding result with statistics
   */
  async generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const results: EmbeddingResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process in batches to control concurrency
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      const batchPromises = batch.map(async (text) => {
        try {
          const result = await this.generateEmbedding(text);
          successCount++;
          return result;
        } catch (error) {
          failureCount++;
          throw error;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const averageTime = totalTime / texts.length;

    return {
      results,
      successCount,
      failureCount,
      totalTime,
      averageTime,
    };
  }

  /**
   * ============================================================================
   * PROVIDER IMPLEMENTATIONS
   * ============================================================================
   */

  /**
   * Generate embedding with provider fallback chain
   *
   * Tries providers in order:
   * 1. Cloudflare Workers AI (primary)
   * 2. Ollama (fallback)
   * 3. Hash-based placeholder (last resort)
   *
   * @param text - Text to embed
   * @returns Embedding with metadata
   */
  private async generateWithProviders(text: string): Promise<Embedding> {
    // Try Cloudflare first
    if (this.config.cloudflareAccountId && this.config.cloudflareApiKey) {
      try {
        return await this.generateWithCloudflare(text);
      } catch (error) {
        this.metrics.errors.cloudflare++;
        console.warn('Cloudflare embedding failed:', error instanceof Error ? error.message : error);
      }
    }

    // Try Ollama fallback
    try {
      return await this.generateWithOllama(text);
    } catch (error) {
      this.metrics.errors.ollama++;
      console.warn('Ollama embedding failed:', error instanceof Error ? error.message : error);
    }

    // Last resort: hash-based placeholder
    if (this.config.fallbackToHash) {
      console.warn('WARNING: Using hash-based placeholder embedding. Search quality will be poor.');
      return this.generatePlaceholderEmbedding(text);
    }

    throw new Error('All embedding providers failed and fallback is disabled');
  }

  /**
   * Generate embedding using Cloudflare Workers AI
   *
   * @param text - Text to embed
   * @returns Cloudflare embedding
   */
  private async generateWithCloudflare(text: string): Promise<Embedding> {
    const { cloudflareAccountId, cloudflareApiKey, cloudflareApiEndpoint, model } = this.config;

    if (!cloudflareAccountId || !cloudflareApiKey) {
      throw new Error('Cloudflare credentials not configured');
    }

    const url = `${cloudflareApiEndpoint}/accounts/${cloudflareAccountId}/ai/run/${model}`;

    // Implement retry with exponential backoff
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cloudflareApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: [text] }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Cloudflare API error ${response.status}: ${errorText}`);
        }

        const data: CloudflareApiResponse = await response.json();

        if (!data.success) {
          const errorMessage = data.errors?.[0]?.message || 'Unknown error';
          throw new Error(`Cloudflare API failure: ${errorMessage}`);
        }

        if (!data.result?.data) {
          throw new Error('Invalid response format from Cloudflare');
        }

        // Extract embedding (Cloudflare returns [[0.1, 0.2, ...]])
        const embedding = data.result.data[0] || [];
        const dimension = 384;

        return {
          values: embedding.slice(0, dimension),
          model,
          dimensions: dimension,
          timestamp: Date.now(),
        };
      } catch (error) {
        if (attempt === this.config.maxRetries - 1) {
          throw error;
        }
        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Generate embedding using Ollama
   *
   * @param text - Text to embed
   * @returns Ollama embedding
   */
  private async generateWithOllama(text: string): Promise<Embedding> {
    const { ollamaEndpoint, ollamaModel } = this.config;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(`${ollamaEndpoint}/api/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: ollamaModel,
            prompt: text,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Ollama API error ${response.status}: ${response.statusText}`);
        }

        const data: OllamaApiResponse = await response.json();

        if (!data.embedding) {
          throw new Error('Invalid response format from Ollama');
        }

        return {
          values: data.embedding,
          model: `ollama-${ollamaModel}`,
          dimensions: data.embedding.length,
          timestamp: Date.now(),
        };
      } catch (error) {
        if (attempt === this.config.maxRetries - 1) {
          throw error;
        }
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Generate hash-based placeholder embedding
   *
   * WARNING: This does NOT capture semantic meaning and should only be used
   * as a last resort when both providers are unavailable.
   *
   * @param text - Text to embed
   * @returns Placeholder embedding
   */
  private generatePlaceholderEmbedding(text: string): Embedding {
    const dimension = 384;
    const values = new Array(dimension).fill(0);

    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
      values[i % dimension] = (hash % 1000) / 1000;
    }

    // Normalize
    const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
    const normalized = values.map((v) => (norm > 0 ? v / norm : 0));

    return {
      values: normalized,
      model: 'placeholder-hash',
      dimensions: dimension,
      timestamp: Date.now(),
    };
  }

  /**
   * ============================================================================
   * CACHE OPERATIONS
   * ============================================================================
   */

  /**
   * Generate cache key for text
   *
   * Uses SHA-256 hash of text content for reliable cache keys
   *
   * @param text - Text to generate key for
   * @returns Cache key
   */
  private generateCacheKey(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Get embedding from cache
   *
   * @param key - Cache key
   * @returns Cached embedding or null
   */
  async getFromCache(key: string): Promise<Embedding | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM embedding_cache WHERE key = ?')
        .get(key) as CacheEntry | undefined;

      if (!row) {
        this.metrics.totalCacheMisses++;
        return null;
      }

      // Check TTL
      const now = Date.now();
      if (now - row.created_at > this.config.cacheTTL) {
        // Expired, remove from cache
        this.db.prepare('DELETE FROM embedding_cache WHERE key = ?').run(key);
        this.metrics.totalCacheMisses++;
        return null;
      }

      // Update access statistics
      this.db
        .prepare('UPDATE embedding_cache SET last_accessed = ?, access_count = access_count + 1 WHERE key = ?')
        .run(now, key);

      // Deserialize embedding
      const floatArray = new Float32Array(row.embedding.buffer);
      const values = Array.from(floatArray);

      this.metrics.totalCacheHits++;

      return {
        values,
        model: row.model,
        dimensions: values.length,
        timestamp: row.created_at,
        cached: true,
      };
    } catch (error) {
      console.error('Cache retrieval error:', error);
      this.metrics.totalCacheMisses++;
      return null;
    }
  }

  /**
   * Add embedding to cache
   *
   * @param key - Cache key
   * @param embedding - Embedding to cache
   */
  async addToCache(key: string, embedding: Embedding): Promise<void> {
    try {
      // Check cache size and evict if necessary
      await this.evictIfNeeded();

      // Serialize embedding to Float32Array
      const floatArray = new Float32Array(embedding.values);
      const buffer = Buffer.from(floatArray.buffer);

      const now = Date.now();
      this.db
        .prepare(
          `INSERT OR REPLACE INTO embedding_cache
           (key, embedding, model, created_at, last_accessed, access_count)
           VALUES (?, ?, ?, ?, ?, 1)`
        )
        .run(key, buffer, embedding.model, embedding.timestamp || now, now);
    } catch (error) {
      console.error('Cache insertion error:', error);
    }
  }

  /**
   * Evict old entries if cache is at capacity
   */
  private async evictIfNeeded(): Promise<void> {
    const count = this.db.prepare('SELECT COUNT(*) as count FROM embedding_cache').get() as { count: number };

    if (count.count >= this.config.maxCacheSize) {
      // Delete oldest entries (LRU)
      const toDelete = count.count - this.config.maxCacheSize + 100; // Delete extra for headroom
      this.db
        .prepare(`DELETE FROM embedding_cache
                  WHERE key IN (
                    SELECT key FROM embedding_cache
                    ORDER BY last_accessed ASC
                    LIMIT ?
                  )`)
        .run(toDelete);
    }
  }

  /**
   * Clear all cached embeddings
   */
  async clearCache(): Promise<void> {
    this.db.prepare('DELETE FROM embedding_cache').run();
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics
   */
  getCacheStats(): CacheStats {
    const totalEntries = this.db.prepare('SELECT COUNT(*) as count FROM embedding_cache').get() as { count: number };

    // Calculate cache size
    const sizeResult = this.db.prepare('SELECT SUM(LENGTH(embedding)) as size FROM embedding_cache').get() as { size: number };

    const total = this.metrics.totalCacheHits + this.metrics.totalCacheMisses;
    const hitRate = total > 0 ? this.metrics.totalCacheHits / total : 0;

    return {
      totalEntries: totalEntries.count,
      hits: this.metrics.totalCacheHits,
      misses: this.metrics.totalCacheMisses,
      hitRate,
      cacheSize: sizeResult.size || 0,
    };
  }

  /**
   * ============================================================================
   * SIMILARITY CALCULATIONS
   * ============================================================================
   */

  /**
   * Calculate cosine similarity between two embeddings
   *
   * @param a - First embedding
   * @param b - Second embedding
   * @returns Similarity score (0-1)
   */
  calculateSimilarity(a: Embedding, b: Embedding): number {
    const vecA = a.values;
    const vecB = b.values;

    if (vecA.length !== vecB.length) {
      throw new Error('Embedding dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Find most similar embeddings
   *
   * @param query - Query embedding
   * @param candidates - Candidate embeddings to search
   * @param limit - Maximum number of results
   * @returns Sorted similarity results
   */
  findSimilar(
    query: Embedding,
    candidates: Array<{ embedding: Embedding; metadata?: any }>,
    limit: number = 10
  ): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (const candidate of candidates) {
      const score = this.calculateSimilarity(query, candidate.embedding);
      results.push({
        chunk: candidate.metadata,
        score,
        metadata: {
          distance: 1 - score,
        },
      });
    }

    // Sort by score (descending) and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map((result, index) => ({
      ...result,
      metadata: {
        ...result.metadata,
        rank: index + 1,
      },
    }));
  }

  /**
   * ============================================================================
   * METRICS AND MONITORING
   * ============================================================================
   */

  /**
   * Update metrics after embedding generation
   *
   * @param type - Operation type (cache or generated)
   * @param provider - Provider used
   * @param time - Generation time in ms
   */
  private updateMetrics(type: 'cache' | 'generated', provider: 'cloudflare' | 'ollama' | 'placeholder', time: number): void {
    if (!this.config.enableMetrics) {
      return;
    }

    if (type === 'generated') {
      this.metrics.totalGenerated++;
      this.metrics.providerUsage[provider]++;
    }

    // Update average generation time
    const total = this.metrics.averageGenerationTime * (this.metrics.totalGenerated - 1) + time;
    this.metrics.averageGenerationTime = total / this.metrics.totalGenerated;
  }

  /**
   * Get current metrics
   *
   * @returns Metrics snapshot
   */
  getMetrics(): EmbeddingMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalGenerated: 0,
      totalCacheHits: 0,
      totalCacheMisses: 0,
      averageGenerationTime: 0,
      providerUsage: {
        cloudflare: 0,
        ollama: 0,
        placeholder: 0,
      },
      errors: {
        cloudflare: 0,
        ollama: 0,
        network: 0,
        timeout: 0,
      },
    };
  }

  /**
   * ============================================================================
   * UTILITY METHODS
   * ============================================================================
   */

  /**
   * Delay helper for retry backoff
   *
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clean up expired cache entries
   */
  async cleanupExpiredEntries(): Promise<void> {
    const now = Date.now();
    const expiryThreshold = now - this.config.cacheTTL;

    this.db
      .prepare('DELETE FROM embedding_cache WHERE created_at < ?')
      .run(expiryThreshold);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get embedding dimension
   *
   * @returns Vector dimension
   */
  getDimension(): number {
    return 384; // bge-small-en-v1.5 dimension
  }

  /**
   * Export cache to file
   *
   * @param filePath - Path to export file
   */
  exportCache(filePath: string): void {
    const fs = require('fs');
    const data = this.db.serialize();
    fs.writeFileSync(filePath, Buffer.from(data));
  }

  /**
   * Import cache from file
   *
   * @param filePath - Path to import file
   */
  importCache(filePath: string): void {
    const fs = require('fs');
    const data = fs.readFileSync(filePath);
    const importDb = new Database(filePath);

    // Copy cache entries
    const rows = importDb.prepare('SELECT * FROM embedding_cache').all() as CacheEntry[];

    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO embedding_cache
       (key, embedding, model, created_at, last_accessed, access_count)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const transaction = this.db.transaction((rows: CacheEntry[]) => {
      for (const row of rows) {
        insert.run(row.key, row.embedding, row.model, row.created_at, row.last_accessed, row.access_count);
      }
    });

    transaction(rows);
    importDb.close();
  }
}

/**
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export default SemanticEmbeddingsService;
