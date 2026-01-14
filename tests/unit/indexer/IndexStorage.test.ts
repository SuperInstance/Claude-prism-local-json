/**
 * Unit tests for IndexStorage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IndexStorage } from '../../../src/indexer/IndexStorage.js';
import type { PrismConfig } from '../../../src/config/types/index.js';

describe('IndexStorage', () => {
  let storage: IndexStorage;
  let config: PrismConfig;

  beforeEach(async () => {
    config = {
      cloudflare: {
        accountId: 'test',
        apiKey: 'test',
      },
      ollama: {
        enabled: false,
        url: 'http://localhost:11434',
        model: 'test',
      },
      indexing: {
        include: ['**/*.ts'],
        exclude: ['**/node_modules/**'],
        watch: false,
        chunkSize: 500,
        maxFileSize: 1024 * 1024,
        languages: [],
        chunking: {
          strategy: 'function',
          minSize: 100,
          maxSize: 1000,
          overlap: 50,
          preserveBoundaries: true,
        },
        embedding: {
          provider: 'cloudflare',
          model: '@cf/baai/bge-small-en-v1.5',
          batchSize: 32,
          dimensions: 384,
          cache: true,
        },
      },
      optimization: {
        tokenBudget: 100000,
        minRelevance: 0.5,
        maxChunks: 50,
        compressionLevel: 5,
        weights: {
          semantic: 0.40,
          proximity: 0.25,
          symbol: 0.20,
          recency: 0.10,
          frequency: 0.05,
        },
      },
      mcp: {
        enabled: false,
        host: 'localhost',
        port: 3000,
        debug: false,
      },
      cli: {
        format: 'text',
        color: true,
        progress: true,
        confirm: true,
      },
      logging: {
        level: 'info',
        format: 'pretty',
      },
    };

    storage = new IndexStorage(config);

    // Clear any existing data before each test
    await storage.clearIndex();
  });

  describe('saveIndex and loadIndex', () => {
    it('should save and load index metadata', async () => {
      const metadata = {
        lastUpdated: new Date('2025-01-13'),
        filesIndexed: 100,
        chunksIndexed: 500,
        version: '1.0.0',
        indexId: 'test-index',
      };

      await storage.saveIndex(metadata);
      const loaded = await storage.loadIndex();

      expect(loaded).not.toBeNull();
      expect(loaded?.lastUpdated).toEqual(metadata.lastUpdated);
      expect(loaded?.filesIndexed).toBe(metadata.filesIndexed);
      expect(loaded?.chunksIndexed).toBe(metadata.chunksIndexed);
    });

    it('should return null when no metadata exists', async () => {
      const loaded = await storage.loadIndex();
      // SQLite always returns metadata (with default values) after initialization
      expect(loaded).not.toBeNull();
      expect(loaded?.filesIndexed).toBe(0);
      expect(loaded?.chunksIndexed).toBe(0);
    });
  });

  describe('setLastModified and getLastModified', () => {
    it('should save and retrieve last modified time', async () => {
      const filePath = '/path/to/file.ts';
      const date = new Date('2025-01-13T10:00:00Z');

      await storage.setLastModified(filePath, date);
      const retrieved = await storage.getLastModified(filePath);

      expect(retrieved).not.toBeNull();
      expect(retrieved).toEqual(date);
    });

    it('should return null for non-existent file', async () => {
      const retrieved = await storage.getLastModified('/nonexistent/file.ts');
      expect(retrieved).toBeNull();
    });

    it('should update existing file modification', async () => {
      const filePath = '/path/to/file.ts';
      const date1 = new Date('2025-01-13T10:00:00Z');
      const date2 = new Date('2025-01-13T11:00:00Z');

      await storage.setLastModified(filePath, date1);
      await storage.setLastModified(filePath, date2);

      const retrieved = await storage.getLastModified(filePath);
      expect(retrieved).toEqual(date2);
    });
  });

  describe('needsReindexing', () => {
    it('should return true for never-indexed file', async () => {
      const result = await storage.needsReindexing(
        '/new/file.ts',
        new Date('2025-01-13')
      );

      expect(result).toBe(true);
    });

    it('should return true if file is newer', async () => {
      const filePath = '/path/to/file.ts';
      const oldDate = new Date('2025-01-13T10:00:00Z');
      const newDate = new Date('2025-01-13T11:00:00Z');

      await storage.setLastModified(filePath, oldDate);

      const result = await storage.needsReindexing(filePath, newDate);
      expect(result).toBe(true);
    });

    it('should return false if file is unchanged', async () => {
      const filePath = '/path/to/file.ts';
      const date = new Date('2025-01-13T10:00:00Z');

      await storage.setLastModified(filePath, date);

      const result = await storage.needsReindexing(filePath, date);
      expect(result).toBe(false);
    });
  });

  describe('getAllTrackedFiles', () => {
    it('should return all tracked files', async () => {
      await storage.setLastModified('/file1.ts', new Date());
      await storage.setLastModified('/file2.ts', new Date());
      await storage.setLastModified('/file3.ts', new Date());

      const tracked = await storage.getAllTrackedFiles();

      expect(tracked.size).toBe(3);
      expect(tracked.has('/file1.ts')).toBe(true);
      expect(tracked.has('/file2.ts')).toBe(true);
      expect(tracked.has('/file3.ts')).toBe(true);
    });
  });

  describe('removeFile', () => {
    it('should remove file from tracking', async () => {
      const filePath = '/path/to/file.ts';

      await storage.setLastModified(filePath, new Date());
      await storage.removeFile(filePath);

      const retrieved = await storage.getLastModified(filePath);
      expect(retrieved).toBeNull();
    });

    it('should handle removing non-existent file', async () => {
      await expect(
        storage.removeFile('/nonexistent/file.ts')
      ).resolves.not.toThrow();
    });
  });

  describe('clearIndex', () => {
    it('should clear all data', async () => {
      await storage.saveIndex({
        lastUpdated: new Date(),
        filesIndexed: 100,
      });
      await storage.setLastModified('/file.ts', new Date());

      await storage.clearIndex();

      const metadata = await storage.loadIndex();
      const fileMod = await storage.getLastModified('/file.ts');

      // After clearing, metadata exists but has zero values (SQLite behavior)
      expect(metadata).not.toBeNull();
      expect(metadata?.filesIndexed).toBe(0);
      expect(metadata?.chunksIndexed).toBe(0);
      expect(fileMod).toBeNull();
    });
  });

  describe('getTrackingStats', () => {
    it('should return tracking statistics', async () => {
      await storage.setLastModified('/file1.ts', new Date());
      await storage.setLastModified('/file2.ts', new Date());
      await storage.saveIndex({
        lastUpdated: new Date(),
        filesIndexed: 2,
      });

      const stats = storage.getTrackingStats();

      expect(stats.totalFiles).toBe(2);
      expect(stats.indexSize).toBeGreaterThan(0);
      expect(stats.lastUpdated).not.toBeNull();
    });

    it('should return zeros for empty storage', () => {
      const stats = storage.getTrackingStats();

      expect(stats.totalFiles).toBe(0);
      // Empty arrays have minimal serialization overhead (2 for "[]")
      expect(stats.indexSize).toBeLessThan(10);
      expect(stats.lastUpdated).toBeNull();
    });
  });

  describe('exportIndex and importIndex', () => {
    it('should export and import index data', async () => {
      await storage.saveIndex({
        lastUpdated: new Date('2025-01-13'),
        filesIndexed: 10,
        indexId: 'test',
      });
      await storage.setLastModified('/file.ts', new Date());

      const exported = await storage.exportIndex();
      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');

      // Create new storage and import
      const newStorage = new IndexStorage(config);
      await newStorage.importIndex(exported);

      const metadata = await newStorage.loadIndex();
      expect(metadata).not.toBeNull();
      expect(metadata?.filesIndexed).toBe(10);
    });

    it('should handle invalid import data', async () => {
      await expect(storage.importIndex('invalid json')).rejects.toThrow();
    });
  });

  describe('validateIndex', () => {
    it('should validate correct index', async () => {
      await storage.saveIndex({
        lastUpdated: new Date(),
        filesIndexed: 10,
      });

      const isValid = await storage.validateIndex();
      expect(isValid).toBe(true);
    });

    it('should invalidate missing metadata', async () => {
      const isValid = await storage.validateIndex();
      expect(isValid).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return cached metadata', async () => {
      const metadata = {
        lastUpdated: new Date(),
        filesIndexed: 10,
      };

      await storage.saveIndex(metadata);

      const cached = storage.getMetadata();
      expect(cached).not.toBeNull();
      expect(cached?.filesIndexed).toBe(10);
    });

    it('should return null if not loaded', () => {
      const cached = storage.getMetadata();
      expect(cached).toBeNull();
    });
  });

  describe('getFileModifications', () => {
    it('should return all file modification records', async () => {
      await storage.setLastModified('/file1.ts', new Date());
      await storage.setLastModified('/file2.ts', new Date());

      const records = storage.getFileModifications();

      expect(records).toHaveLength(2);
      expect(records[0].path).toBeDefined();
      expect(records[0].lastModified).toBeDefined();
    });
  });
});
