/**
 * Unit tests for search command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbeddingService, rankResults } from '../../../prism/src/core/embeddings.js';
import { SQLiteVectorDB } from '../../../prism/src/vector-db/SQLiteVectorDB.js';
import type { CodeChunk } from '../../../prism/src/core/types.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    service = new EmbeddingService({ dimension: 384, enableCache: true });
  });

  afterEach(() => {
    service.clearCache();
  });

  describe('generateEmbedding', () => {
    it('should generate a normalized vector', () => {
      const text = 'test query';
      const embedding = service.generateEmbedding(text);

      expect(embedding).toHaveLength(384);
      expect(embedding.every(v => typeof v === 'number')).toBe(true);
      expect(embedding.every(v => v >= -1 && v <= 1)).toBe(true);
    });

    it('should generate same embedding for same text (deterministic)', () => {
      const text = 'test query';
      const embedding1 = service.generateEmbedding(text);
      const embedding2 = service.generateEmbedding(text);

      expect(embedding1).toEqual(embedding2);
    });

    it('should generate different embeddings for different text', () => {
      const embedding1 = service.generateEmbedding('query one');
      const embedding2 = service.generateEmbedding('query two');

      expect(embedding1).not.toEqual(embedding2);
    });

    it('should cache embeddings when enabled', () => {
      const text = 'cached query';
      const stats1 = service.getCacheStats();

      service.generateEmbedding(text);
      const stats2 = service.getCacheStats();

      expect(stats2.size).toBe(stats1.size + 1);
      expect(stats2.keys).toContain(text);
    });

    it('should not cache embeddings when disabled', () => {
      const noCacheService = new EmbeddingService({ enableCache: false });
      const text = 'uncached query';
      const stats1 = noCacheService.getCacheStats();

      noCacheService.generateEmbedding(text);
      const stats2 = noCacheService.getCacheStats();

      expect(stats2.size).toBe(stats1.size);
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for multiple texts', () => {
      const texts = ['query 1', 'query 2', 'query 3'];
      const embeddings = service.generateEmbeddings(texts);

      expect(embeddings).toHaveLength(3);
      embeddings.forEach(embedding => {
        expect(embedding).toHaveLength(384);
      });
    });
  });

  describe('clearCache', () => {
    it('should clear all cached embeddings', () => {
      service.generateEmbedding('test 1');
      service.generateEmbedding('test 2');
      expect(service.getCacheStats().size).toBe(2);

      service.clearCache();
      expect(service.getCacheStats().size).toBe(0);
    });
  });
});

describe('rankResults', () => {
  it('should filter results by minimum score', () => {
    const results = [
      { chunk: {} as CodeChunk, score: 0.9 },
      { chunk: {} as CodeChunk, score: 0.5 },
      { chunk: {} as CodeChunk, score: 0.3 },
    ];

    const ranked = rankResults(results, 0.6);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBe(0.9);
  });

  it('should sort results by score descending', () => {
    const results = [
      { chunk: {} as CodeChunk, score: 0.5 },
      { chunk: {} as CodeChunk, score: 0.9 },
      { chunk: {} as CodeChunk, score: 0.3 },
    ];

    const ranked = rankResults(results, 0.0);

    expect(ranked[0].score).toBe(0.9);
    expect(ranked[1].score).toBe(0.5);
    expect(ranked[2].score).toBe(0.3);
  });

  it('should return empty array when no results match', () => {
    const results = [
      { chunk: {} as CodeChunk, score: 0.3 },
      { chunk: {} as CodeChunk, score: 0.5 },
    ];

    const ranked = rankResults(results, 0.8);

    expect(ranked).toHaveLength(0);
  });
});

describe('Search Command Integration', () => {
  let tempDir: string;
  let dbPath: string;
  let vectorDB: SQLiteVectorDB;
  let embeddingService: EmbeddingService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prism-test-'));
    dbPath = path.join(tempDir, 'test.db');
    vectorDB = new SQLiteVectorDB({ path: dbPath });
    embeddingService = new EmbeddingService();
  });

  afterEach(async () => {
    vectorDB.close();
    await fs.remove(tempDir);
  });

  it('should insert and search chunks', async () => {
    const chunks: CodeChunk[] = [
      {
        id: 'chunk1',
        filePath: '/test/file1.ts',
        content: 'export function testFunction() { return true; }',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        symbols: ['testFunction'],
        dependencies: [],
        metadata: {},
      },
      {
        id: 'chunk2',
        filePath: '/test/file2.ts',
        content: 'export class TestClass { method() { return false; } }',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        symbols: ['TestClass'],
        dependencies: [],
        metadata: {},
      },
    ];

    await vectorDB.insertBatch(chunks);

    const stats = vectorDB.getStats();
    expect(stats.chunkCount).toBe(2);
  });

  it('should return results sorted by relevance', async () => {
    const chunks: CodeChunk[] = [
      {
        id: 'chunk1',
        filePath: '/test/file1.ts',
        content: 'function authenticate() {}',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        symbols: ['authenticate'],
        dependencies: [],
        metadata: {},
      },
      {
        id: 'chunk2',
        filePath: '/test/file2.ts',
        content: 'function getData() {}',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        symbols: ['getData'],
        dependencies: [],
        metadata: {},
      },
    ];

    await vectorDB.insertBatch(chunks);

    const queryEmbedding = embeddingService.generateEmbedding('authenticate');
    const results = await vectorDB.search(queryEmbedding, 10);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunk).toBeDefined();
    expect(results[0].score).toBeGreaterThanOrEqual(0);
    expect(results[0].score).toBeLessThanOrEqual(1);
  });

  it('should filter by language', async () => {
    const chunks: CodeChunk[] = [
      {
        id: 'chunk1',
        filePath: '/test/file1.ts',
        content: 'function test() {}',
        startLine: 1,
        endLine: 1,
        language: 'typescript',
        symbols: [],
        dependencies: [],
        metadata: {},
      },
      {
        id: 'chunk2',
        filePath: '/test/file2.py',
        content: 'def test(): pass',
        startLine: 1,
        endLine: 1,
        language: 'python',
        symbols: [],
        dependencies: [],
        metadata: {},
      },
    ];

    await vectorDB.insertBatch(chunks);

    const queryEmbedding = embeddingService.generateEmbedding('test');
    const results = await vectorDB.search(queryEmbedding, 10);

    const tsResults = results.filter(r => r.chunk.language === 'typescript');
    const pyResults = results.filter(r => r.chunk.language === 'python');

    expect(tsResults.length).toBeGreaterThan(0);
    expect(pyResults.length).toBeGreaterThan(0);
  });
});
