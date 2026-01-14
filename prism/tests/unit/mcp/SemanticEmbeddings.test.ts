/**
 * ============================================================================
 * SEMANTIC EMBEDDINGS SERVICE TEST SUITE
 * ============================================================================
 *
 * Comprehensive tests for the semantic embeddings service including:
 * - Unit tests for embedding generation
 * - Integration tests with providers
 * - Cache functionality tests
 * - Similarity calculation tests
 * - Error handling and fallback tests
 * - Performance benchmarks
 *
 * @see prism/src/mcp/semantic-embeddings.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SemanticEmbeddingsService } from '../../../src/mcp/semantic-embeddings.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import { randomBytes } from 'crypto';

/**
 * ============================================================================
 * TEST UTILITIES
 * ============================================================================
 */

/**
 * Generate a random test database path
 */
function getTestDbPath(): string {
  const randomId = randomBytes(8).toString('hex');
  return `/tmp/test-embeddings-${randomId}.db`;
}

/**
 * Clean up test database
 */
function cleanupTestDb(path: string): void {
  if (fs.existsSync(path)) {
    fs.unlinkSync(path);
  }
}

/**
 * Create test configuration
 */
function getTestConfig(): any {
  return {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    cloudflareApiKey: process.env.CLOUDFLARE_API_KEY || '',
    cachePath: getTestDbPath(),
    cacheTTL: 60000, // 1 minute for tests
    maxCacheSize: 100,
    enableMetrics: true,
    fallbackToHash: true,
  };
}

/**
 * ============================================================================
 * TEST SUITES
 * ============================================================================
 */

describe('SemanticEmbeddingsService - Unit Tests', () => {
  let service: SemanticEmbeddingsService;
  let dbPath: string;

  beforeEach(() => {
    const config = getTestConfig();
    dbPath = config.cachePath;
    service = new SemanticEmbeddingsService(config);
  });

  afterEach(() => {
    service.close();
    cleanupTestDb(dbPath);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default configuration', () => {
      const testService = new SemanticEmbeddingsService();
      expect(testService).toBeDefined();
      expect(testService.getDimension()).toBe(384);
      testService.close();
    });

    it('should initialize with custom configuration', () => {
      const config = {
        cachePath: getTestDbPath(),
        maxCacheSize: 500,
        cacheTTL: 120000,
      };
      const testService = new SemanticEmbeddingsService(config);
      expect(testService).toBeDefined();
      testService.close();
      cleanupTestDb(config.cachePath);
    });

    it('should create database tables on initialization', () => {
      const db = new Database(dbPath);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('embedding_cache');
      expect(tableNames).toContain('embedding_metadata');
      expect(tableNames).toContain('embedding_metrics');

      db.close();
    });
  });

  describe('Embedding Generation', () => {
    it('should generate embedding for simple text', async () => {
      const text = 'authentication logic';
      const result = await service.generateEmbedding(text);

      expect(result).toBeDefined();
      expect(result.values).toBeDefined();
      expect(result.values).toHaveLength(384);
      expect(result.model).toBeDefined();
      expect(result.dimensions).toBe(384);
      expect(result.timestamp).toBeDefined();
    });

    it('should generate embedding for complex text', async () => {
      const text = `
        function authenticateUser(username: string, password: string): Promise<boolean> {
          const user = await db.users.findOne({ username });
          if (!user) return false;
          return bcrypt.compare(password, user.passwordHash);
        }
      `;
      const result = await service.generateEmbedding(text);

      expect(result.values).toHaveLength(384);
      expect(result.values.every((v) => typeof v === 'number')).toBe(true);
    });

    it('should throw error for empty text', async () => {
      await expect(service.generateEmbedding('')).rejects.toThrow('Cannot generate embedding for empty text');
      await expect(service.generateEmbedding('   ')).rejects.toThrow('Cannot generate embedding for empty text');
    });

    it('should return same embedding for same text (deterministic)', async () => {
      const text = 'database connection code';
      const result1 = await service.generateEmbedding(text);
      const result2 = await service.generateEmbedding(text);

      expect(result1.values).toEqual(result2.values);
    });

    it('should return similar embeddings for semantically similar text', async () => {
      const text1 = 'user authentication function';
      const text2 = 'login authentication logic';

      const result1 = await service.generateEmbedding(text1);
      const result2 = await service.generateEmbedding(text2);

      const similarity = service.calculateSimilarity(result1, result2);
      expect(similarity).toBeGreaterThan(0.7); // High similarity for related concepts
    });

    it('should return different embeddings for different text', async () => {
      const text1 = 'authentication logic';
      const text2 = 'database query optimization';

      const result1 = await service.generateEmbedding(text1);
      const result2 = await service.generateEmbedding(text2);

      const similarity = service.calculateSimilarity(result1, result2);
      expect(similarity).toBeLessThan(0.9); // Lower similarity for different concepts
    });
  });

  describe('Batch Embedding Generation', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = ['authentication', 'database', 'error handling'];
      const result = await service.generateBatchEmbeddings(texts);

      expect(result.results).toHaveLength(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.averageTime).toBeGreaterThan(0);
    });

    it('should handle large batches efficiently', async () => {
      const texts = Array.from({ length: 50 }, (_, i) => `test text ${i}`);
      const result = await service.generateBatchEmbeddings(texts);

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.successCount).toBeGreaterThan(0);
    });

    it('should handle empty batch', async () => {
      const result = await service.generateBatchEmbeddings([]);

      expect(result.results).toHaveLength(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('Cache Functionality', () => {
    it('should cache generated embeddings', async () => {
      const text = 'cache test text';
      const result1 = await service.generateEmbedding(text);
      const result2 = await service.generateEmbedding(text);

      expect(result1.cacheHit).toBe(false);
      expect(result2.cacheHit).toBe(true);
      expect(result2.generationTime).toBeLessThan(result1.generationTime);
    });

    it('should track cache statistics', async () => {
      await service.generateEmbedding('test1');
      await service.generateEmbedding('test2');
      await service.generateEmbedding('test1'); // Cache hit

      const stats = service.getCacheStats();
      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
    });

    it('should calculate hit rate correctly', async () => {
      await service.generateEmbedding('test1');
      await service.generateEmbedding('test1');
      await service.generateEmbedding('test1');

      const stats = service.getCacheStats();
      expect(stats.hitRate).toBeGreaterThan(0.5);
    });

    it('should clear cache', async () => {
      await service.generateEmbedding('test1');
      await service.generateEmbedding('test2');

      let stats = service.getCacheStats();
      expect(stats.totalEntries).toBeGreaterThan(0);

      await service.clearCache();

      stats = service.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should respect max cache size', async () => {
      const config = getTestConfig();
      config.maxCacheSize = 5;
      const testService = new SemanticEmbeddingsService(config);

      // Add more entries than max size
      for (let i = 0; i < 10; i++) {
        await testService.generateEmbedding(`test text ${i}`);
      }

      const stats = testService.getCacheStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(5);

      testService.close();
      cleanupTestDb(config.cachePath);
    });
  });

  describe('Similarity Calculations', () => {
    it('should calculate cosine similarity correctly', async () => {
      const text1 = 'identical text';
      const text2 = 'identical text';

      const embedding1 = await service.generateEmbedding(text1);
      const embedding2 = await service.generateEmbedding(text2);

      const similarity = service.calculateSimilarity(embedding1, embedding2);
      expect(similarity).toBeCloseTo(1.0, 5); // Should be nearly identical
    });

    it('should handle zero vectors', () => {
      const embedding1: any = {
        values: new Array(384).fill(0),
        model: 'test',
        dimensions: 384,
        timestamp: Date.now(),
      };

      const embedding2: any = {
        values: new Array(384).fill(0),
        model: 'test',
        dimensions: 384,
        timestamp: Date.now(),
      };

      const similarity = service.calculateSimilarity(embedding1, embedding2);
      expect(similarity).toBe(0); // Zero vectors have 0 similarity
    });

    it('should throw error for mismatched dimensions', async () => {
      const text1 = 'test text';
      const embedding1 = await service.generateEmbedding(text1);

      const embedding2: any = {
        values: new Array(256).fill(0.1), // Different dimension
        model: 'test',
        dimensions: 256,
        timestamp: Date.now(),
      };

      expect(() => service.calculateSimilarity(embedding1, embedding2)).toThrow('Vector dimensions must match');
    });
  });

  describe('Similarity Search', () => {
    it('should find similar embeddings', async () => {
      const query = 'authentication logic';
      const queryEmbedding = await service.generateEmbedding(query);

      const candidates = [
        {
          embedding: await service.generateEmbedding('login authentication'),
          metadata: { id: '1', text: 'login authentication' },
        },
        {
          embedding: await service.generateEmbedding('database query'),
          metadata: { id: '2', text: 'database query' },
        },
        {
          embedding: await service.generateEmbedding('error handling'),
          metadata: { id: '3', text: 'error handling' },
        },
      ];

      const results = service.findSimilar(queryEmbedding, candidates, 2);

      expect(results).toHaveLength(2);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[0].metadata?.rank).toBe(1);
      expect(results[1].metadata?.rank).toBe(2);
    });

    it('should respect limit parameter', async () => {
      const query = 'test';
      const queryEmbedding = await service.generateEmbedding(query);

      const candidates = Array.from({ length: 20 }, async (_, i) => ({
        embedding: await service.generateEmbedding(`test text ${i}`),
        metadata: { id: String(i) },
      }));

      const resolvedCandidates = await Promise.all(candidates);
      const results = service.findSimilar(queryEmbedding, resolvedCandidates, 5);

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track embedding generation metrics', async () => {
      await service.generateEmbedding('test1');
      await service.generateEmbedding('test2');

      const metrics = service.getMetrics();
      expect(metrics.totalGenerated).toBe(2);
      expect(metrics.averageGenerationTime).toBeGreaterThan(0);
    });

    it('should track provider usage', async () => {
      await service.generateEmbedding('test1');

      const metrics = service.getMetrics();
      const totalUsage = metrics.providerUsage.cloudflare +
                        metrics.providerUsage.ollama +
                        metrics.providerUsage.placeholder;
      expect(totalUsage).toBeGreaterThan(0);
    });

    it('should reset metrics', async () => {
      await service.generateEmbedding('test1');

      service.resetMetrics();

      const metrics = service.getMetrics();
      expect(metrics.totalGenerated).toBe(0);
      expect(metrics.totalCacheHits).toBe(0);
      expect(metrics.totalCacheMisses).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid text gracefully', async () => {
      await expect(service.generateEmbedding('')).rejects.toThrow();
    });

    it('should use fallback when providers fail', async () => {
      // Create service with invalid credentials
      const config = {
        cloudflareAccountId: 'invalid',
        cloudflareApiKey: 'invalid',
        cachePath: getTestDbPath(),
        fallbackToHash: true,
      };
      const testService = new SemanticEmbeddingsService(config);

      // Should still generate embedding (using hash fallback)
      const result = await testService.generateEmbedding('test text');
      expect(result.values).toBeDefined();
      expect(result.values).toHaveLength(384);

      testService.close();
      cleanupTestDb(config.cachePath);
    });

    it('should throw error when fallback is disabled', async () => {
      const config = {
        cloudflareAccountId: 'invalid',
        cloudflareApiKey: 'invalid',
        cachePath: getTestDbPath(),
        fallbackToHash: false,
      };
      const testService = new SemanticEmbeddingsService(config);

      await expect(testService.generateEmbedding('test text')).rejects.toThrow();

      testService.close();
      cleanupTestDb(config.cachePath);
    });
  });

  describe('Cache Management', () => {
    it('should export and import cache', async () => {
      await service.generateEmbedding('test1');
      await service.generateEmbedding('test2');

      const exportPath = `/tmp/test-export-${randomBytes(4).toString('hex')}.db`;
      service.exportCache(exportPath);

      expect(fs.existsSync(exportPath)).toBe(true);

      // Create new service and import
      const config = getTestConfig();
      config.cachePath = getTestDbPath();
      const newService = new SemanticEmbeddingsService(config);
      newService.importCache(exportPath);

      const stats = newService.getCacheStats();
      expect(stats.totalEntries).toBeGreaterThan(0);

      newService.close();
      cleanupTestDb(config.cachePath);
      fs.unlinkSync(exportPath);
    });

    it('should cleanup expired entries', async () => {
      const config = {
        ...getTestConfig(),
        cacheTTL: 100, // Very short TTL
      };
      const testService = new SemanticEmbeddingsService(config);

      await testService.generateEmbedding('test1');
      await new Promise((resolve) => setTimeout(resolve, 150)); // Wait for expiration
      await testService.cleanupExpiredEntries();

      const stats = testService.getCacheStats();
      expect(stats.totalEntries).toBe(0);

      testService.close();
      cleanupTestDb(config.cachePath);
    });
  });

  describe('Utility Methods', () => {
    it('should return correct dimension', () => {
      expect(service.getDimension()).toBe(384);
    });

    it('should close database connection', () => {
      expect(() => service.close()).not.toThrow();
    });
  });
});

describe('SemanticEmbeddingsService - Integration Tests', () => {
  let service: SemanticEmbeddingsService;
  let dbPath: string;

  beforeAll(() => {
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_KEY) {
      console.warn('Skipping Cloudflare integration tests (no credentials)');
      return;
    }

    const config = getTestConfig();
    dbPath = config.cachePath;
    service = new SemanticEmbeddingsService(config);
  });

  afterAll(() => {
    if (service) {
      service.close();
      cleanupTestDb(dbPath);
    }
  });

  describe('Cloudflare Workers AI Integration', () => {
    it('should generate embedding with Cloudflare', async () => {
      if (!service) return;

      const result = await service.generateEmbedding('test authentication logic');
      expect(result.provider).toBe('cloudflare');
      expect(result.values).toHaveLength(384);
    }, 10000);

    it('should handle batch requests with Cloudflare', async () => {
      if (!service) return;

      const texts = ['auth1', 'auth2', 'auth3'];
      const result = await service.generateBatchEmbeddings(texts);

      expect(result.successCount).toBe(3);
      expect(result.results.every((r) => r.provider === 'cloudflare')).toBe(true);
    }, 15000);
  });
});

describe('SemanticEmbeddingsService - Performance Benchmarks', () => {
  let service: SemanticEmbeddingsService;
  let dbPath: string;

  beforeEach(() => {
    const config = getTestConfig();
    dbPath = config.cachePath;
    service = new SemanticEmbeddingsService(config);
  });

  afterEach(() => {
    service.close();
    cleanupTestDb(dbPath);
  });

  it('should generate single embedding quickly', async () => {
    const start = Date.now();
    await service.generateEmbedding('test text');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5000); // Should complete in <5s
  });

  it('should handle cache hits efficiently', async () => {
    await service.generateEmbedding('cached text');

    const start = Date.now();
    await service.generateEmbedding('cached text');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100); // Cache hits should be <100ms
  });

  it('should process batch efficiently', async () => {
    const texts = Array.from({ length: 20 }, (_, i) => `test text ${i}`);

    const start = Date.now();
    await service.generateBatchEmbeddings(texts);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(30000); // Should complete in <30s
  });
});
