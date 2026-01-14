/**
 * SQLite Vector Database
 *
 * Provides persistent vector storage with cosine similarity search.
 * Uses better-sqlite3 for fast in-memory database operations.
 */
import Database from 'better-sqlite3';
/**
 * SQLite Vector Database Implementation
 */
export class SQLiteVectorDB {
    constructor(config = {}) {
        // Initialize database
        this.db = new Database(config.path || ':memory:');
        // Enable WAL mode for better concurrency
        this.db.pragma('journal_mode = WAL');
        // Create tables
        this.createTables();
        // Create indexes for faster queries
        this.createIndexes();
    }
    /**
     * Create database tables
     */
    createTables() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL,
        embedding TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        language TEXT NOT NULL,
        symbols TEXT,
        dependencies TEXT,
        metadata TEXT
      );
    `);
    }
    /**
     * Create indexes for faster queries
     */
    createIndexes() {
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
      CREATE INDEX IF NOT EXISTS idx_chunks_language ON chunks(language);
      CREATE INDEX IF NOT EXISTS idx_vectors_chunk_id ON vectors(chunk_id);
    `);
    }
    /**
     * Insert a single chunk with its embedding
     */
    async insert(chunk, embedding) {
        const insertChunk = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (
        id, file_path, content, start_line, end_line,
        language, symbols, dependencies, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const insertVector = this.db.prepare(`
      INSERT OR REPLACE INTO vectors (
        id, chunk_id, embedding, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `);
        const transaction = this.db.transaction(() => {
            // Insert chunk
            insertChunk.run(chunk.id, chunk.filePath, chunk.content, chunk.startLine, chunk.endLine, chunk.language, JSON.stringify(chunk.symbols || []), JSON.stringify(chunk.dependencies || []), JSON.stringify(chunk.metadata || {}));
            // Insert vector (if embedding provided)
            if (embedding) {
                insertVector.run(`vec_${chunk.id}`, chunk.id, JSON.stringify(embedding), JSON.stringify({}), Date.now());
            }
        });
        transaction();
    }
    /**
     * Insert multiple chunks in batch
     */
    async insertBatch(chunks, embeddings) {
        const insertChunk = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (
        id, file_path, content, start_line, end_line,
        language, symbols, dependencies, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const insertVector = this.db.prepare(`
      INSERT OR REPLACE INTO vectors (
        id, chunk_id, embedding, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `);
        const transaction = this.db.transaction((items) => {
            for (const { chunk, embedding } of items) {
                // Insert chunk
                insertChunk.run(chunk.id, chunk.filePath, chunk.content, chunk.startLine, chunk.endLine, chunk.language, JSON.stringify(chunk.symbols || []), JSON.stringify(chunk.dependencies || []), JSON.stringify(chunk.metadata || {}));
                // Insert vector (if embedding provided)
                if (embedding) {
                    insertVector.run(`vec_${chunk.id}`, chunk.id, JSON.stringify(embedding), JSON.stringify({}), Date.now());
                }
            }
        });
        const items = chunks.map((chunk, i) => ({
            chunk,
            embedding: embeddings?.[i],
        }));
        transaction(items);
    }
    /**
     * Search for similar chunks using cosine similarity
     */
    async search(query, limit = 10) {
        // Get all vectors from database
        const rows = this.db
            .prepare(`
        SELECT v.chunk_id, v.embedding, c.*
        FROM vectors v
        JOIN chunks c ON v.chunk_id = c.id
      `)
            .all();
        // Calculate cosine similarity for each vector
        const results = [];
        for (const row of rows) {
            const embedding = JSON.parse(row.embedding);
            const similarity = this.cosineSimilarity(query, embedding);
            results.push({
                chunk: {
                    id: row.chunk_id,
                    filePath: row.file_path,
                    content: row.content,
                    startLine: row.start_line,
                    endLine: row.end_line,
                    language: row.language,
                    symbols: JSON.parse(row.symbols || '[]'),
                    dependencies: JSON.parse(row.dependencies || '[]'),
                    metadata: JSON.parse(row.metadata || '{}'),
                },
                score: similarity,
            });
        }
        // Sort by similarity (descending) and limit
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
    }
    /**
     * Calculate cosine similarity between two vectors
     */
    cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            throw new Error('Vector dimensions must match');
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
            normA += (a[i] ?? 0) * (a[i] ?? 0);
            normB += (b[i] ?? 0) * (b[i] ?? 0);
        }
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) {
            return 0;
        }
        return dotProduct / denominator;
    }
    /**
     * Delete a chunk by ID
     */
    async delete(id) {
        const transaction = this.db.transaction(() => {
            this.db.prepare('DELETE FROM vectors WHERE chunk_id = ?').run(id);
            this.db.prepare('DELETE FROM chunks WHERE id = ?').run(id);
        });
        transaction();
    }
    /**
     * Clear all data
     */
    async clear() {
        const transaction = this.db.transaction(() => {
            this.db.prepare('DELETE FROM vectors').run();
            this.db.prepare('DELETE FROM chunks').run();
        });
        transaction();
    }
    /**
     * Get chunk by ID
     */
    async getChunk(id) {
        const row = this.db
            .prepare('SELECT * FROM chunks WHERE id = ?')
            .get(id);
        if (!row) {
            return null;
        }
        return {
            id: row.id,
            filePath: row.file_path,
            content: row.content,
            startLine: row.start_line,
            endLine: row.end_line,
            language: row.language,
            symbols: JSON.parse(row.symbols || '[]'),
            dependencies: JSON.parse(row.dependencies || '[]'),
            metadata: JSON.parse(row.metadata || '{}'),
        };
    }
    /**
     * Get all chunks
     */
    async getAllChunks() {
        const rows = this.db.prepare('SELECT * FROM chunks').all();
        return rows.map((row) => ({
            id: row.id,
            filePath: row.file_path,
            content: row.content,
            startLine: row.start_line,
            endLine: row.end_line,
            language: row.language,
            symbols: JSON.parse(row.symbols || '[]'),
            dependencies: JSON.parse(row.dependencies || '[]'),
            metadata: JSON.parse(row.metadata || '{}'),
        }));
    }
    /**
     * Get statistics
     */
    getStats() {
        const chunkCount = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get();
        const vectorCount = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get();
        return {
            chunkCount: chunkCount.count,
            vectorCount: vectorCount.count,
        };
    }
    /**
     * Close the database connection
     */
    close() {
        this.db.close();
    }
    /**
     * Export database to file
     */
    exportToFile(filePath) {
        const fs = require('fs');
        const data = this.db.serialize();
        fs.writeFileSync(filePath, Buffer.from(data));
    }
    /**
     * Import database from file
     */
    static importFromFile(filePath) {
        const db = new SQLiteVectorDB({ path: filePath });
        return db;
    }
}
