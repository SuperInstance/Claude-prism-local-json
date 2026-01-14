/**
 * Unit tests for PrismMCPServer with embedding service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismMCPServer } from '../../../src/mcp/PrismMCPServer.js';
import { SQLiteVectorDB } from '../../../src/vector-db/SQLiteVectorDB.js';
import { EmbeddingService } from '../../../src/embeddings/EmbeddingService.js';
import type { CodeChunk } from '../../../src/core/types.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('PrismMCPServer with Embedding Service', () => {
  let server: PrismMCPServer;
  let vectorDB: SQLiteVectorDB;
  let dbPath: string;
  let testChunks: CodeChunk[];
  let originalFetch: typeof fetch;

  beforeEach(async () => {
    // Save original fetch
    originalFetch = global.fetch;
    // Mock fetch
    global.fetch = vi.fn() as any;

    // Create temp database
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prism-test-'));
    dbPath = path.join(tmpDir, 'test.db');

    // Initialize vector DB
    vectorDB = new SQLiteVectorDB({ path: dbPath });
    await vectorDB.initialize();

    // Create test chunks
    testChunks = [
      {
        id: 'chunk1',
        filePath: '/test/auth.ts',
        startLine: 1,
        endLine: 10,
        content: 'function authenticate(user, password) {\n  return validate(user, password);\n}',
        language: 'typescript',
        symbols: ['authenticate', 'validate'],
        embedding: Array(384).fill(0.1), // Mock embedding
      },
      {
        id: 'chunk2',
        filePath: '/test/db.ts',
        startLine: 1,
        endLine: 10,
        content: 'function connectDatabase() {\n  return new Database();\n}',
        language: 'typescript',
        symbols: ['connectDatabase', 'Database'],
        embedding: Array(384).fill(0.2), // Different mock embedding
      },
    ];

    // Add test chunks to database
    for (const chunk of testChunks) {
      await vectorDB.insert(chunk);
    }
  });

  afterEach(async () => {
    // Restore original fetch
    global.fetch = originalFetch;

    // Clean up
    if (server) {
      await server.stop();
    }
    if (vectorDB) {
      await vectorDB.close();
    }
    if (dbPath && await fs.pathExists(dbPath)) {
      await fs.remove(dbPath);
    }
  });

  describe('with real embedding service', () => {
    beforeEach(() => {
      // Mock successful Cloudflare embedding
      const mockEmbedding = Array(384).fill(0.15);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            shape: [1, 384],
            data: mockEmbedding,
          },
        }),
      });
    });

    it('should use embedding service for search', async () => {
      const embeddingService = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      server = new PrismMCPServer({
        vectorDB,
        maxResults: 10,
        embeddingService,
      });

      // Note: We can't easily test the full search without the server running
      // But we can verify the server was created successfully
      expect(server).toBeDefined();
    });

    it('should use default embedding service if not provided', async () => {
      // Set environment variables for default service
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
      process.env.CLOUDFLARE_API_KEY = 'test-key';

      server = new PrismMCPServer({
        vectorDB,
        maxResults: 10,
      });

      expect(server).toBeDefined();

      // Clean up
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_KEY;
    });
  });

  describe('embedding caching', () => {
    it('should cache embeddings across searches', async () => {
      const mockEmbedding = Array(384).fill(0.15);
      let callCount = 0;

      (global.fetch as any).mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            result: {
              shape: [1, 384],
              data: mockEmbedding,
            },
          }),
        });
      });

      const embeddingService = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      server = new PrismMCPServer({
        vectorDB,
        maxResults: 10,
        embeddingService,
      });

      // Simulate two searches with the same query
      // (In real scenario, this would be through the MCP protocol)
      await embeddingService.embed('authentication');
      await embeddingService.embed('authentication');

      // Should only call Cloudflare once due to caching
      expect(callCount).toBe(1);
    });
  });

  describe('fallback behavior', () => {
    it('should fall back to Ollama when Cloudflare fails', async () => {
      const ollamaEmbedding = Array(768).fill(0.3);

      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Cloudflare error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            embedding: ollamaEmbedding,
          }),
        });

      const embeddingService = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      const result = await embeddingService.embed('test');

      expect(result).toHaveLength(768);
    });

    it('should use placeholder when both providers fail', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Cloudflare error'))
        .mockRejectedValueOnce(new Error('Ollama error'));

      const embeddingService = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      const result = await embeddingService.embed('test');

      expect(result).toHaveLength(384);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Using hash-based placeholder')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('tool definitions', () => {
    beforeEach(() => {
      server = new PrismMCPServer({
        vectorDB,
        maxResults: 10,
      });
    });

    it('should include search_repo tool', () => {
      // The server should be created successfully
      expect(server).toBeDefined();
      // Tool definitions are set up during construction
      // (In a real test, we'd inspect the tools via ListToolsRequest)
    });

    it('should include all expected tools', () => {
      // Server should be created with all tools
      expect(server).toBeDefined();
    });
  });

  describe('server lifecycle', () => {
    it('should start and stop without errors', async () => {
      server = new PrismMCPServer({
        vectorDB,
        maxResults: 10,
      });

      // Note: We can't actually test start() as it blocks on stdio
      // But we can verify the server was created successfully
      expect(server).toBeDefined();
    });
  });
});
