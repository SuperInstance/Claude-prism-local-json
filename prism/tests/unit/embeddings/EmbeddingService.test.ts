/**
 * Unit tests for EmbeddingService (MCP Server)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbeddingService } from '../../../src/embeddings/EmbeddingService.js';

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    // Save original fetch
    originalFetch = global.fetch;
    // Mock fetch
    global.fetch = vi.fn() as any;
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    // Clear environment variables
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_KEY;
  });

  describe('constructor', () => {
    it('should use provided config', () => {
      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
        maxCacheSize: 100,
      });

      expect(service).toBeDefined();
    });

    it('should use environment variables when config not provided', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'env-account';
      process.env.CLOUDFLARE_API_KEY = 'env-key';

      service = new EmbeddingService();

      expect(service).toBeDefined();
    });

    it('should use default config when neither config nor env vars provided', () => {
      service = new EmbeddingService();

      expect(service).toBeDefined();
    });
  });

  describe('embed', () => {
    it('should throw error for empty text', async () => {
      service = new EmbeddingService();

      await expect(service.embed('')).rejects.toThrow('Cannot embed empty text');
    });

    it('should throw error for whitespace-only text', async () => {
      service = new EmbeddingService();

      await expect(service.embed('   ')).rejects.toThrow('Cannot embed empty text');
    });

    it('should use Cloudflare when credentials are configured', async () => {
      const mockEmbedding = Array(384).fill(0.1);

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

      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      const result = await service.embed('test code');

      expect(result).toHaveLength(384);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('cloudflare'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('should fall back to Ollama when Cloudflare fails', async () => {
      const ollamaEmbedding = Array(768).fill(0.2);

      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Cloudflare error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            embedding: ollamaEmbedding,
          }),
        });

      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      const result = await service.embed('test code');

      expect(result).toHaveLength(768);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should use placeholder when both providers fail', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Cloudflare error'))
        .mockRejectedValueOnce(new Error('Ollama error'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      const result = await service.embed('test code');

      expect(result).toHaveLength(384);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Using hash-based placeholder embedding')
      );

      consoleSpy.mockRestore();
    });

    it('should cache embeddings', async () => {
      const mockEmbedding = Array(384).fill(0.1);

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

      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      // First call
      await service.embed('test code');
      // Second call (should use cache)
      await service.embed('test code');

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle different texts separately in cache', async () => {
      const mockEmbedding1 = Array(384).fill(0.1);
      const mockEmbedding2 = Array(384).fill(0.2);

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            result: {
              shape: [1, 384],
              data: mockEmbedding1,
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            result: {
              shape: [1, 384],
              data: mockEmbedding2,
            },
          }),
        });

      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      await service.embed('test code 1');
      await service.embed('test code 2');

      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cloudflare API', () => {
    beforeEach(() => {
      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });
    });

    it('should call correct endpoint with account ID', async () => {
      const mockEmbedding = Array(384).fill(0.1);

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

      await service.embed('test');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/baai/bge-small-en-v1.5',
        expect.any(Object)
      );
    });

    it('should handle API error responses by falling back to placeholder', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => 'Unauthorized',
        })
        .mockRejectedValueOnce(new Error('Ollama not available'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await service.embed('test');

      // Should return placeholder embedding instead of throwing
      expect(result).toHaveLength(384);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle API failure responses by falling back to placeholder', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: false,
            errors: [{ message: 'Invalid request' }],
          }),
        })
        .mockRejectedValueOnce(new Error('Ollama not available'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await service.embed('test');

      // Should return placeholder embedding instead of throwing
      expect(result).toHaveLength(384);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle malformed responses by falling back to placeholder', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            // Missing result.data
          }),
        })
        .mockRejectedValueOnce(new Error('Ollama not available'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await service.embed('test');

      // Should return placeholder embedding instead of throwing
      expect(result).toHaveLength(384);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Ollama API', () => {
    beforeEach(() => {
      service = new EmbeddingService({
        // No Cloudflare credentials to force Ollama
      });
    });

    it('should call Ollama endpoint', async () => {
      const mockEmbedding = Array(768).fill(0.1);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          embedding: mockEmbedding,
        }),
      });

      await service.embed('test');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should handle Ollama errors', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Service Unavailable',
      });

      // Should fall back to placeholder
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await service.embed('test');

      expect(result).toHaveLength(384);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle malformed Ollama responses by falling back to placeholder', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          // Missing embedding field
        }),
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await service.embed('test');

      // Should return placeholder embedding instead of throwing
      expect(result).toHaveLength(384);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Cache Management', () => {
    beforeEach(() => {
      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
        maxCacheSize: 5,
      });
    });

    it('should track cache size', async () => {
      const mockEmbedding = Array(384).fill(0.1);

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

      expect(service.getCacheSize()).toBe(0);

      await service.embed('test 1');
      expect(service.getCacheSize()).toBe(1);

      await service.embed('test 2');
      expect(service.getCacheSize()).toBe(2);
    });

    it('should clear cache', async () => {
      const mockEmbedding = Array(384).fill(0.1);

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

      await service.embed('test');
      expect(service.getCacheSize()).toBe(1);

      service.clearCache();
      expect(service.getCacheSize()).toBe(0);

      // Should refetch after cache clear
      await service.embed('test');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should evict oldest entries when cache is full', async () => {
      const mockEmbedding = Array(384).fill(0.1);

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

      // Fill cache to max size
      await service.embed('test 1');
      await service.embed('test 2');
      await service.embed('test 3');
      await service.embed('test 4');
      await service.embed('test 5');
      expect(service.getCacheSize()).toBe(5);

      // Add one more (should evict oldest)
      await service.embed('test 6');
      expect(service.getCacheSize()).toBe(5);

      // Request the first item again (should miss cache)
      await service.embed('test 1');
      expect(fetch).toHaveBeenCalledTimes(7);
    });
  });

  describe('getDimension', () => {
    it('should return 384 when Cloudflare is configured', () => {
      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      expect(service.getDimension()).toBe(384);
    });

    it('should return 384 when no provider is configured', () => {
      service = new EmbeddingService();

      expect(service.getDimension()).toBe(384);
    });
  });

  describe('Placeholder Embedding', () => {
    it('should generate consistent embeddings for same text', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Cloudflare error'))
        .mockRejectedValueOnce(new Error('Ollama error'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      const result1 = await service.embed('test code');
      const result2 = await service.embed('test code');

      expect(result1).toEqual(result2);

      consoleSpy.mockRestore();
    });

    it('should generate different embeddings for different text', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Cloudflare error'))
        .mockRejectedValueOnce(new Error('Ollama error'))
        .mockRejectedValueOnce(new Error('Cloudflare error'))
        .mockRejectedValueOnce(new Error('Ollama error'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service = new EmbeddingService({
        cloudflareAccountId: 'test-account',
        cloudflareApiKey: 'test-key',
      });

      const result1 = await service.embed('test code 1');
      const result2 = await service.embed('test code 2');

      expect(result1).not.toEqual(result2);

      consoleSpy.mockRestore();
    });
  });
});
