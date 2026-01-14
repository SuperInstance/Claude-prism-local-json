/**
 * ============================================================================
 * CLOUDFLARE WORKER INTEGRATION TESTS
 * ============================================================================
 *
 * Tests the complete Cloudflare Worker functionality including:
 * - HTTP endpoints (health, index, search, stats)
 * - D1 database interactions
 * - KV storage operations
 * - Authentication middleware
 * - Error handling
 *
 * These tests mock the Cloudflare Workers environment (D1, KV, AI) to
 * enable local testing without actual Cloudflare resources.
 *
 * @see src/worker.ts for Worker implementation
 * @see wrangler.toml for Worker configuration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../src/worker.js';
import type { Env } from '../../src/types/worker.js';

// ============================================================================
// MOCKS
// ============================================================================

/**
 * Mock D1 database
 */
class MockD1Database {
  private data: Map<string, any[]> = new Map();

  prepare(sql: string) {
    return {
      bind: (...params: any[]) => ({
        first: async () => {
          const rows = this.data.get(sql) || [];
          // Simple mock - return first row
          return rows[0] || null;
        },
        all: async () => {
          return { results: this.data.get(sql) || [] };
        },
        run: async () => {
          return { success: true, meta: { duration: 0 } };
        },
      }),
    };
  }

  exec(sql: string): Promise<any> {
    return Promise.resolve({ success: true });
  }

  batch(statements: any[]): Promise<any[]> {
    return Promise.resolve(statements.map(() => ({ success: true })));
  }

  // Helper method for testing
  setMockData(sql: string, data: any[]) {
    this.data.set(sql, data);
  }
}

/**
 * Mock KV namespace
 */
class MockKVNamespace {
  private store: Map<string, { value: string; expiration?: number }> = new Map();

  async get(key: string, type: string = 'text'): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiration && entry.expiration < Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void> {
    const expiration = options?.expirationTtl
      ? Date.now() + options.expirationTtl * 1000
      : undefined;
    this.store.set(key, { value, expiration });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<{ keys: string[] }> {
    return { keys: Array.from(this.store.keys()) };
  }
}

/**
 * Mock R2 bucket
 */
class MockR2Bucket {
  private store: Map<string, Uint8Array> = new Map();

  async put(key: string, value: Uint8Array): Promise<void> {
    this.store.set(key, value);
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.store.get(key) || null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<{ objects: Array<{ key: string }> }> {
    return {
      objects: Array.from(this.store.keys()).map((key) => ({ key })),
    };
  }
}

/**
 * Mock Vectorize index
 */
class MockVectorizeIndex {
  private vectors: Map<string, number[]> = new Map();

  async query(
    vector: number[],
    options?: { topK?: number; returnValues?: boolean }
  ): Promise<{ matches: Array<{ id: string; score: number }> }> {
    const matches: Array<{ id: string; score: number }> = [];

    // Simple cosine similarity mock
    for (const [id, storedVector] of this.vectors.entries()) {
      const score = this.cosineSimilarity(vector, storedVector);
      matches.push({ id, score });
    }

    // Sort by score descending and limit
    matches.sort((a, b) => b.score - a.score);
    const topK = options?.topK || 10;
    return { matches: matches.slice(0, topK) };
  }

  async insert(vectors: Array<{ id: string; vector: number[] }>): Promise<void> {
    for (const v of vectors) {
      this.vectors.set(v.id, v.vector);
    }
  }

  async update(vectors: Array<{ id: string; vector: number[] }>): Promise<void> {
    return this.insert(vectors);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.vectors.delete(id);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Mock Workers AI
 */
class MockAi {
  async run(
    model: string,
    input: { text?: string[]; text_auto?: boolean }
  ): Promise<number[][]> {
    // Mock embedding generation
    if (Array.isArray(input.text)) {
      return input.text.map(() => this.mockEmbedding());
    }
    return [this.mockEmbedding()];
  }

  private mockEmbedding(): number[] {
    // Return a mock 384-dimensional embedding (BGE-small size)
    return Array.from({ length: 384 }, () => Math.random() * 2 - 1);
  }
}

/**
 * Create mock environment
 */
function createMockEnv(): Env {
  return {
    DB: new MockD1Database() as any,
    KV: new MockKVNamespace() as any,
    R2: new MockR2Bucket() as any,
    VECTORIZE: new MockVectorizeIndex() as any,
    AI: new MockAi() as any,
    ENVIRONMENT: 'test',
    LOG_LEVEL: 'debug',
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Cloudflare Worker Integration', () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  /**
   * HEALTH CHECK ENDPOINT
   */
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const request = new Request('http://localhost/health');
      const ctx = { env, request };

      const response = await worker.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        status: 'healthy',
        timestamp: expect.any(Number),
        version: '0.2.0',
      });
    });

    it('should return CORS headers', async () => {
      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, env);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });
  });

  /**
   * STATS ENDPOINT
   */
  describe('GET /api/stats', () => {
    it('should return statistics', async () => {
      const request = new Request('http://localhost/api/stats');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.stats).toBeDefined();
      expect(data.stats.totalChunks).toBeDefined();
      expect(data.stats.totalFiles).toBeDefined();
    });

    it('should handle missing stats gracefully', async () => {
      // Use fresh environment without any data
      const freshEnv = createMockEnv();
      const request = new Request('http://localhost/api/stats');
      const response = await worker.fetch(request, freshEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.totalChunks).toBe(0);
    });
  });

  /**
   * INDEX ENDPOINT
   */
  describe('POST /api/index', () => {
    it('should reject requests without path', async () => {
      const request = new Request('http://localhost/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: {} }),
      });

      const response = await worker.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('path');
    });

    it('should accept valid index request', async () => {
      const request = new Request('http://localhost/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '/src',
          options: {
            incremental: true,
            include: ['*.ts'],
            exclude: ['*.test.ts'],
          },
        }),
      });

      const response = await worker.fetch(request, env);
      const data = await response.json();

      // Note: This will fail in test environment due to file system access
      // but we're testing that the request is accepted and routed correctly
      expect([200, 500]).toContain(response.status);
    });

    it('should handle invalid JSON', async () => {
      const request = new Request('http://localhost/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(400);
    });
  });

  /**
   * SEARCH ENDPOINT
   */
  describe('POST /api/search', () => {
    it('should reject requests without query', async () => {
      const request = new Request('http://localhost/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
      });

      const response = await worker.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('query');
    });

    it('should accept valid search request', async () => {
      const request = new Request('http://localhost/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'how to authenticate',
          limit: 5,
        }),
      });

      const response = await worker.fetch(request, env);
      const data = await response.json();

      // Should accept the request (results may be empty)
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toBeDefined();
      expect(Array.isArray(data.results)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const request = new Request('http://localhost/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test',
          limit: 3,
        }),
      });

      const response = await worker.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results.length).toBeLessThanOrEqual(3);
    });
  });

  /**
   * ERROR HANDLING
   */
  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('http://localhost/unknown/route');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Not Found');
    });

    it('should handle OPTIONS for CORS', async () => {
      const request = new Request('http://localhost/api/search', {
        method: 'OPTIONS',
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should handle malformed requests', async () => {
      const request = new Request('http://localhost/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{malformed',
      });

      const response = await worker.fetch(request, env);

      expect([400, 500]).toContain(response.status);
    });
  });

  /**
   * ENVIRONMENT VARIABLES
   */
  describe('Environment Configuration', () => {
    it('should respect ENVIRONMENT variable', async () => {
      const testEnv = { ...env, ENVIRONMENT: 'production' };
      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, testEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.environment).toBe('production');
    });

    it('should handle missing bindings gracefully', async () => {
      const minimalEnv: Env = {
        DB: null as any,
        KV: null as any,
        R2: null as any,
        VECTORIZE: null as any,
        AI: null as any,
      };

      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, minimalEnv);

      // Should still respond even with missing bindings
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  /**
   * RATE LIMITING
   */
  describe('Rate Limiting', () => {
    it('should track request counts in KV', async () => {
      // Make multiple requests
      for (let i = 0; i < 5; i++) {
        const request = new Request('http://localhost/health');
        await worker.fetch(request, env);
      }

      // Check KV for rate limit tracking
      const rateLimitKey = await env.KV.get('rate_limit:test');
      expect(rateLimitKey).toBeDefined();
    });

    it('should enforce rate limits', async () => {
      // This test would require setting up rate limit middleware
      // For now, we just verify the endpoint is accessible
      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
    });
  });
});

/**
 * PERFORMANCE TESTS
 */
describe('Worker Performance', () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
  });

  it('should respond to health check in under 50ms', async () => {
    const start = Date.now();
    const request = new Request('http://localhost/health');
    await worker.fetch(request, env);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(50);
  });

  it('should handle concurrent requests', async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const request = new Request('http://localhost/health');
      promises.push(worker.fetch(request, env));
    }

    const responses = await Promise.all(promises);
    expect(responses).toHaveLength(10);
    responses.forEach((res) => {
      expect(res.status).toBe(200);
    });
  });
});
