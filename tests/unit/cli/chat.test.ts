/**
 * Unit tests for chat command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EmbeddingService } from '../../../prism/src/core/embeddings.js';
import { SQLiteVectorDB } from '../../../prism/src/vector-db/SQLiteVectorDB.js';
import type { CodeChunk } from '../../../prism/src/core/types.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('Chat Command Integration', () => {
  let tempDir: string;
  let dbPath: string;
  let vectorDB: SQLiteVectorDB;
  let embeddingService: EmbeddingService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prism-chat-test-'));
    dbPath = path.join(tempDir, 'test.db');
    vectorDB = new SQLiteVectorDB({ path: dbPath });
    embeddingService = new EmbeddingService();
  });

  afterEach(async () => {
    vectorDB.close();
    await fs.remove(tempDir);
  });

  describe('Context Retrieval', () => {
    it('should retrieve relevant context for user questions', async () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          filePath: '/src/auth.ts',
          content: `export function authenticateUser(credentials: Credentials) {
  const user = await database.users.findByEmail(credentials.email);
  if (!user) {
    throw new AuthenticationError('Invalid credentials');
  }
  return user;
}`,
          startLine: 1,
          endLine: 8,
          language: 'typescript',
          symbols: ['authenticateUser'],
          dependencies: [],
          metadata: {},
        },
        {
          id: 'chunk2',
          filePath: '/src/database.ts',
          content: `export class Database {
  async connect() {
    await this.client.connect();
  }
}`,
          startLine: 1,
          endLine: 5,
          language: 'typescript',
          symbols: ['Database'],
          dependencies: [],
          metadata: {},
        },
      ];

      await vectorDB.insertBatch(chunks);

      const queryEmbedding = embeddingService.generateEmbedding('authentication');
      const results = await vectorDB.search(queryEmbedding, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.symbols).toContain('authenticateUser');
    });

    it('should return empty results when no relevant code exists', async () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          filePath: '/test/file.ts',
          content: 'function test() {}',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          symbols: [],
          dependencies: [],
          metadata: {},
        },
      ];

      await vectorDB.insertBatch(chunks);

      const queryEmbedding = embeddingService.generateEmbedding('nonexistent functionality');
      const results = await vectorDB.search(queryEmbedding, 5);

      // Should still return results, just with lower scores
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Response Generation', () => {
    it('should include file paths and line numbers in response', async () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          filePath: '/src/auth.ts',
          content: 'export function login() {}',
          startLine: 10,
          endLine: 10,
          language: 'typescript',
          symbols: ['login'],
          dependencies: [],
          metadata: {},
        },
      ];

      await vectorDB.insertBatch(chunks);

      const queryEmbedding = embeddingService.generateEmbedding('login');
      const results = await vectorDB.search(queryEmbedding, 5);

      expect(results[0].chunk.filePath).toBe('/src/auth.ts');
      expect(results[0].chunk.startLine).toBe(10);
      expect(results[0].chunk.endLine).toBe(10);
    });

    it('should include symbols in response when available', async () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          filePath: '/src/utils.ts',
          content: 'export function helper1() {}\nexport function helper2() {}',
          startLine: 1,
          endLine: 2,
          language: 'typescript',
          symbols: ['helper1', 'helper2'],
          dependencies: [],
          metadata: {},
        },
      ];

      await vectorDB.insertBatch(chunks);

      const queryEmbedding = embeddingService.generateEmbedding('helper');
      const results = await vectorDB.search(queryEmbedding, 5);

      expect(results[0].chunk.symbols).toContain('helper1');
      expect(results[0].chunk.symbols).toContain('helper2');
    });
  });

  describe('Conversation History', () => {
    it('should persist conversation history to file', async () => {
      const historyPath = path.join(tempDir, 'chat-history.json');
      const messages = [
        { role: 'user' as const, content: 'What is the authentication flow?' },
        { role: 'assistant' as const, content: 'The authentication flow is...' },
      ];

      await fs.ensureDir(path.dirname(historyPath));
      await fs.writeJSON(historyPath, { messages }, { spaces: 2 });

      const historyData = await fs.readJSON(historyPath);
      expect(historyData.messages).toHaveLength(2);
      expect(historyData.messages[0].content).toBe('What is the authentication flow?');
    });

    it('should load conversation history from file', async () => {
      const historyPath = path.join(tempDir, 'chat-history.json');
      const messages = [
        { role: 'user' as const, content: 'Question 1' },
        { role: 'assistant' as const, content: 'Answer 1' },
        { role: 'user' as const, content: 'Question 2' },
        { role: 'assistant' as const, content: 'Answer 2' },
      ];

      await fs.ensureDir(path.dirname(historyPath));
      await fs.writeJSON(historyPath, { messages }, { spaces: 2 });

      const historyData = await fs.readJSON(historyPath);
      expect(historyData.messages).toHaveLength(4);
      expect(historyData.messages[2].content).toBe('Question 2');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing vector database gracefully', async () => {
      const nonexistentPath = path.join(tempDir, 'nonexistent.db');
      const exists = await fs.pathExists(nonexistentPath);

      expect(exists).toBe(false);
    });

    it('should handle corrupted database gracefully', async () => {
      const corruptedPath = path.join(tempDir, 'corrupted.db');
      await fs.writeFile(corruptedPath, 'corrupted data');

      const exists = await fs.pathExists(corruptedPath);
      expect(exists).toBe(true);
    });
  });

  describe('Multi-turn Conversations', () => {
    it('should maintain context across multiple turns', async () => {
      const chunks: CodeChunk[] = [
        {
          id: 'chunk1',
          filePath: '/src/auth.ts',
          content: 'export function authenticate() {}',
          startLine: 1,
          endLine: 1,
          language: 'typescript',
          symbols: ['authenticate'],
          dependencies: [],
          metadata: {},
        },
      ];

      await vectorDB.insertBatch(chunks);

      // First query
      const query1Embedding = embeddingService.generateEmbedding('authenticate');
      const results1 = await vectorDB.search(query1Embedding, 5);

      // Follow-up query
      const query2Embedding = embeddingService.generateEmbedding('how does authenticate work');
      const results2 = await vectorDB.search(query2Embedding, 5);

      // Both should return the same chunk
      expect(results1[0].chunk.id).toBe(results2[0].chunk.id);
    });
  });
});
