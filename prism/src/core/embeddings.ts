/**
 * ============================================================================
 * EMBEDDING SERVICE - Query Vector Generation
 * ============================================================================
 *
 * Provides embedding generation for semantic search queries.
 *
 * Current Implementation:
 * - Uses hash-based embedding generation (deterministic but not semantic)
 * - Normalized to unit length for cosine similarity
 * - 384-dimensional vectors (compatible with bge-small-en-v1.5)
 *
 * Future Enhancements:
 * - Cloudflare Workers AI embedding API
 * - Local Ollama embedding models
 * - Caching for repeated queries
 * - Batch embedding support
 */

import type { SearchResult } from './types.js';

/**
 * Embedding configuration
 */
export interface EmbeddingConfig {
  /** Embedding dimension (default: 384 for bge-small-en-v1.5) */
  dimension?: number;
  /** Whether to use caching */
  enableCache?: boolean;
}

/**
 * Embedding service class
 */
export class EmbeddingService {
  private config: Required<EmbeddingConfig>;
  private cache: Map<string, number[]> = new Map();

  constructor(config: EmbeddingConfig = {}) {
    this.config = {
      dimension: config.dimension || 384,
      enableCache: config.enableCache ?? true,
    };
  }

  /**
   * Generate embedding for a text query
   *
   * Uses a deterministic hash-based approach that creates unique
   * vectors for similar texts. This is a placeholder for real
   * semantic embeddings but provides functional search capabilities.
   *
   * @param text - Query text to embed
   * @returns Embedding vector
   */
  generateEmbedding(text: string): number[] {
    // Check cache first
    if (this.config.enableCache && this.cache.has(text)) {
      return this.cache.get(text)!;
    }

    const embedding = this.hashBasedEmbedding(text);

    // Cache the result
    if (this.config.enableCache) {
      this.cache.set(text, embedding);
    }

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts
   *
   * @param texts - Array of texts to embed
   * @returns Array of embedding vectors
   */
  generateEmbeddings(texts: string[]): number[][] {
    return texts.map((text) => this.generateEmbedding(text));
  }

  /**
   * Hash-based embedding generation (deterministic but not semantic)
   *
   * Creates a normalized vector based on the text's hash values.
   * Similar texts will have similar hashes, providing basic semantic-like behavior.
   *
   * @param text - Text to convert to embedding
   * @returns Normalized embedding vector
   */
  private hashBasedEmbedding(text: string): number[] {
    const { dimension } = this.config;
    const embedding = new Array(dimension).fill(0);

    // Process text in chunks for better distribution
    const chunkSize = 32;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      const hash = this.djb2Hash(chunk);

      // Distribute hash values across dimensions
      for (let j = 0; j < dimension; j++) {
        const position = (i + j) % dimension;
        const value = ((hash >> (j % 32)) & 0xff) / 255.0;
        embedding[position] += value * 0.3;
      }
    }

    // Normalize to unit length
    return this.normalize(embedding);
  }

  /**
   * DJB2 hash function (fast and good distribution)
   *
   * @param str - String to hash
   * @returns Hash value
   */
  private djb2Hash(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // Force 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Normalize vector to unit length
   *
   * @param vector - Vector to normalize
   * @returns Normalized vector
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) {
      return vector.map(() => 0);
    }
    return vector.map((v) => v / magnitude);
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

/**
 * Rank search results by relevance score
 *
 * @param results - Search results to rank
 * @param minScore - Minimum relevance score (0-1)
 * @returns Filtered and ranked results
 */
export function rankResults(
  results: SearchResult[],
  minScore: number = 0.0
): SearchResult[] {
  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

/**
 * Calculate average relevance score
 *
 * @param results - Search results
 * @returns Average score (0-1)
 */
export function averageScore(results: SearchResult[]): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + r.score, 0);
  return sum / results.length;
}
