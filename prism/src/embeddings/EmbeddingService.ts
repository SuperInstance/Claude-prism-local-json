/**
 * ============================================================================
 * EMBEDDING SERVICE FOR MCP SERVER
 * ============================================================================
 *
 * Generates vector embeddings for search queries using multiple providers with
 * automatic fallback and caching.
 *
 * SUPPORTED PROVIDERS:
 *
 * 1. CLOUDFLARE WORKERS AI (PRIMARY)
 *    - Model: @cf/baai/bge-small-en-v1.5
 *    - Dimensions: 384
 *    - Free tier: 10,000 neurons/day
 *    - Configuration: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY env vars
 *
 * 2. OLLAMA (FALLBACK)
 *    - Model: nomic-embed-text (v1.5)
 *    - Dimensions: 768
 *    - Configuration: Ollama must be running at http://localhost:11434
 *
 * 3. PLACEHASH (LAST RESORT - MEANINGLESS)
 *    - Hash-based embedding that doesn't capture semantics
 *    - Only used if both providers fail
 *    - Issues warning to user
 *
 * EMBEDDING CACHE:
 * - In-memory cache keyed by query hash
 * - Reduces API calls for repeated queries
 * - Cache size: 1000 entries (LRU eviction)
 *
 * @see docs/architecture/02-token-optimizer.md for usage
 */

/**
 * Cloudflare AI API response for embeddings
 */
interface CloudflareEmbeddingResponse {
  success: boolean;
  errors?: { message: string }[];
  result?: {
    shape: number[];
    data: number[][];
  };
}

/**
 * Ollama API response for embeddings
 */
interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Embedding cache entry
 */
interface CacheEntry {
  embedding: number[];
  timestamp: number;
}

/**
 * Configuration for embedding service
 */
export interface EmbeddingServiceConfig {
  /** Cloudflare account ID (from env var: CLOUDFLARE_ACCOUNT_ID) */
  cloudflareAccountId?: string;

  /** Cloudflare API key (from env var: CLOUDFLARE_API_KEY) */
  cloudflareApiKey?: string;

  /** Cloudflare API endpoint (default: https://api.cloudflare.com/client/v4) */
  cloudflareApiEndpoint?: string;

  /** Ollama endpoint (default: http://localhost:11434) */
  ollamaEndpoint?: string;

  /** Ollama model (default: nomic-embed-text) */
  ollamaModel?: string;

  /** Embedding model for Cloudflare (default: @cf/baai/bge-small-en-v1.5) */
  cloudflareModel?: string;

  /** Maximum cache size (default: 1000) */
  maxCacheSize?: number;
}

/**
 * Simple LRU cache for embeddings
 */
class EmbeddingCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: string): number[] | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry.embedding;
    }
    return undefined;
  }

  set(key: string, embedding: number[]): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Embedding service implementation
 *
 * Supports Cloudflare Workers AI (primary) and Ollama (fallback).
 */
export class EmbeddingService {
  private config: Required<EmbeddingServiceConfig>;
  private cache: EmbeddingCache;

  constructor(config: EmbeddingServiceConfig = {}) {
    // Get configuration from environment variables if not provided
    this.config = {
      cloudflareAccountId: config.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID || '',
      cloudflareApiKey: config.cloudflareApiKey || process.env.CLOUDFLARE_API_KEY || '',
      cloudflareApiEndpoint: config.cloudflareApiEndpoint || 'https://api.cloudflare.com/client/v4',
      ollamaEndpoint: config.ollamaEndpoint || 'http://localhost:11434',
      ollamaModel: config.ollamaModel || 'nomic-embed-text',
      cloudflareModel: config.cloudflareModel || '@cf/baai/bge-small-en-v1.5',
      maxCacheSize: config.maxCacheSize || 1000,
    };
    this.cache = new EmbeddingCache(this.config.maxCacheSize);
  }

  /**
   * Generate embedding for a single text
   *
   * @param text - Text to embed
   * @returns Vector embedding
   * @throws {Error} If embedding generation fails
   */
  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot embed empty text');
    }

    // Check cache first
    const cacheKey = this.hashText(text);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let embedding: number[];

    // Try Cloudflare first
    if (this.config.cloudflareAccountId && this.config.cloudflareApiKey) {
      try {
        embedding = await this.generateWithCloudflare(text);
        this.cache.set(cacheKey, embedding);
        return embedding;
      } catch (error) {
        console.warn('Cloudflare embedding failed, trying Ollama:', error instanceof Error ? error.message : error);
      }
    }

    // Try Ollama fallback
    try {
      embedding = await this.generateWithOllama(text);
      this.cache.set(cacheKey, embedding);
      return embedding;
    } catch (error) {
      console.warn('Ollama embedding failed, using placeholder hash:', error instanceof Error ? error.message : error);
    }

    // Last resort: hash-based placeholder (WARNING: Not semantic!)
    console.warn('WARNING: Using hash-based placeholder embedding. Search results will be poor quality. Configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_KEY environment variables for proper semantic search.');
    embedding = this.generatePlaceholderEmbedding(text);
    this.cache.set(cacheKey, embedding);
    return embedding;
  }

  /**
   * Generate embedding using Cloudflare Workers AI
   *
   * @param text - Text to embed
   * @returns Vector embedding (384 dimensions)
   * @throws {Error} If API call fails
   */
  private async generateWithCloudflare(text: string): Promise<number[]> {
    const { cloudflareAccountId, cloudflareApiKey, cloudflareApiEndpoint, cloudflareModel } = this.config;

    if (!cloudflareAccountId || !cloudflareApiKey) {
      throw new Error('Cloudflare credentials not configured');
    }

    const url = `${cloudflareApiEndpoint}/accounts/${cloudflareAccountId}/ai/run/${cloudflareModel}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cloudflareApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare API error ${response.status}: ${errorText}`);
    }

    const data: CloudflareEmbeddingResponse = await response.json();

    if (!data.success) {
      const errorMessage = data.errors?.[0]?.message || 'Unknown error';
      throw new Error(`Cloudflare API failure: ${errorMessage}`);
    }

    if (!data.result?.data) {
      throw new Error('Invalid response format from Cloudflare');
    }

    // Cloudflare returns nested array [[0.1, 0.2, ...]], extract first embedding
    const dimension = 384;
    const embeddings = data.result.data; // This is number[][]
    const embedding = embeddings[0] || Array(dimension).fill(0);
    return embedding.slice(0, dimension);
  }

  /**
   * Generate embedding using Ollama
   *
   * @param text - Text to embed
   * @returns Vector embedding (768 dimensions typically)
   * @throws {Error} If Ollama is not available or request fails
   */
  private async generateWithOllama(text: string): Promise<number[]> {
    const { ollamaEndpoint, ollamaModel } = this.config;

    const response = await fetch(`${ollamaEndpoint}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error ${response.status}: ${response.statusText}`);
    }

    const data: OllamaEmbeddingResponse = await response.json();

    if (!data.embedding) {
      throw new Error('Invalid response format from Ollama');
    }

    return data.embedding;
  }

  /**
   * Generate placeholder hash-based embedding
   *
   * WARNING: This does NOT capture semantic meaning and should only be used
   * as a last resort when both Cloudflare and Ollama are unavailable.
   *
   * @param text - Text to embed
   * @returns Normalized 384-dimensional vector (meaningless for semantics)
   */
  private generatePlaceholderEmbedding(text: string): number[] {
    const embedding = new Array(384).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
      embedding[i % 384] = (hash % 1000) / 1000;
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => (norm > 0 ? v / norm : 0));
  }

  /**
   * Generate hash key for caching
   *
   * @param text - Text to hash
   * @returns Hash string
   */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  /**
   * Get dimension of embedding vectors (depends on provider used)
   *
   * @returns Vector dimension (384 for Cloudflare, 768 for Ollama, 384 for placeholder)
   */
  getDimension(): number {
    // Prefer Cloudflare dimension
    if (this.config.cloudflareAccountId && this.config.cloudflareApiKey) {
      return 384;
    }
    return 384; // Default to 384 (works for both placeholder and Cloudflare)
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   *
   * @returns Cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
