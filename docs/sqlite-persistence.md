# SQLite Persistence for IndexStorage

## Overview

IndexStorage now uses **SQLite-based persistent storage** to solve the critical data loss issue on process restart. All indexed data is stored in a local SQLite database located at `~/.prism/index.db`.

## Key Features

### 1. Persistent Storage
- **Data survives process restarts** - All indexed files and chunks are stored in SQLite
- **Database location**: `~/.prism/index.db`
- **Automatic initialization** - Database and tables are created on first use

### 2. SHA-256 Checksums
- **Accurate change detection** - Uses SHA-256 checksums instead of just mtime
- **Handles git operations** - Won't reindex files if only mtime changed
- **Content integrity** - Verifies data hasn't been corrupted

### 3. Incremental Indexing
- **10-100x speedup** - Skip unchanged files during reindexing
- **Efficient comparison** - Compare checksums before reindexing
- **Smart detection** - Only reindex files with actual content changes

### 4. Soft Delete Support
- **Reversible deletions** - Mark files/chunks as deleted instead of removing
- **Audit trail** - Track when items were deleted
- **Garbage collection** - Periodically clean up old soft-deleted records

### 5. Migration System
- **Schema versioning** - Track database schema version
- **Automatic migrations** - Run pending migrations on startup
- **Rollback support** - Schema migrations include rollback SQL

### 6. Backup/Restore
- **Full database backups** - Export entire database to file
- **Point-in-time recovery** - Restore from any backup
- **Automatic backups** - Timestamped backups before restores

## Database Schema

### index_metadata
Global index statistics (singleton table):
```sql
CREATE TABLE index_metadata (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  index_id TEXT UNIQUE NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  files_indexed INTEGER DEFAULT 0,
  chunks_indexed INTEGER DEFAULT 0,
  last_updated INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 3
);
```

### indexed_files
File tracking with checksums:
```sql
CREATE TABLE indexed_files (
  path TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,           -- SHA-256 of file content
  file_size INTEGER NOT NULL,
  last_modified INTEGER NOT NULL,   -- File mtime (Unix timestamp)
  last_indexed INTEGER NOT NULL,    -- Last indexing time
  chunk_count INTEGER DEFAULT 0,
  deleted_at INTEGER                -- Soft delete timestamp
);
```

### code_chunks
Chunk storage with metadata:
```sql
CREATE TABLE code_chunks (
  id TEXT PRIMARY KEY,              -- SHA-256 of chunk content
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  language TEXT NOT NULL,
  chunk_type TEXT NOT NULL,         -- function, class, method, etc.
  name TEXT,                        -- Human-readable name
  signature TEXT,                   -- Type signature
  symbols TEXT,                     -- JSON array
  dependencies TEXT,                -- JSON array
  exports TEXT,                     -- JSON array
  imports TEXT,                     -- JSON array
  metadata TEXT,                    -- JSON object
  embedding TEXT,                   -- JSON array of floats
  checksum TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (file_path) REFERENCES indexed_files(path)
);
```

### schema_migrations
Migration tracking:
```sql
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  rollback_sql TEXT
);
```

## Usage

### Basic Usage

```typescript
import { IndexStorage } from './indexer/IndexStorage.js';

const storage = new IndexStorage(config);

// Save index metadata
await storage.saveIndex({
  lastUpdated: new Date(),
  filesIndexed: 100,
  chunksIndexed: 500,
});

// Load index metadata (survives restart)
const metadata = await storage.loadIndex();

// Track file modifications
await storage.setLastModified('/path/to/file.ts', new Date());

// Check if file needs reindexing
const needsReindex = await storage.needsReindexing(
  '/path/to/file.ts',
  new Date()
);
```

### Advanced Usage (Direct SQLite Access)

```typescript
import { SQLiteIndexStorage } from './indexer/SQLiteIndexStorage.js';

const storage = new SQLiteIndexStorage(config);
await storage.initialize();

// Save file with checksum
await storage.saveFile('/path/to/file.ts', {
  path: '/path/to/file.ts',
  checksum: 'abc123...', // SHA-256 of file content
  fileSize: 12345,
  lastModified: Date.now(),
});

// Check if reindexing needed
const needsReindex = await storage.needsReindexing(
  '/path/to/file.ts',
  {
    checksum: 'abc123...',
    fileSize: 12345,
    lastModified: Date.now(),
  }
);

// Save chunks
await storage.saveChunk({
  id: 'chunk-1',
  filePath: '/path/to/file.ts',
  content: 'function test() { return 42; }',
  startLine: 1,
  endLine: 1,
  language: 'typescript',
  chunkType: 'function',
  checksum: 'def456...',
});

// Get statistics
const stats = await storage.getStats();
console.log(`Files: ${stats.totalFiles}, Chunks: ${stats.totalChunks}`);

// Create backup
const backupPath = await storage.createBackup();
console.log(`Backup created: ${backupPath}`);

// Restore from backup
await storage.restoreBackup(backupPath);

// Close database
await storage.close();
```

## Performance Optimizations

### Database Configuration
```typescript
// Enabled automatically on initialization
db.pragma('journal_mode = WAL');        // Write-Ahead Logging
db.pragma('synchronous = NORMAL');      // Faster writes
db.pragma('cache_size = -64000');       // 64MB cache
db.pragma('temp_store = MEMORY');       // In-memory temp tables
db.pragma('mmap_size = 30000000000');   // 30GB memory-mapped I/O
```

### Indexed Queries
All common queries use indexes:
- `indexed_files(path)` - Primary key
- `indexed_files(checksum)` - Index for change detection
- `code_chunks(file_path)` - Index for chunk retrieval
- `code_chunks(checksum)` - Index for deduplication

## Migration from In-Memory Storage

The old in-memory storage has been replaced with SQLite. The API remains backward compatible, so existing code continues to work:

```typescript
// Old code (still works)
const storage = new IndexStorage(config);
await storage.saveIndex(metadata);
await storage.setLastModified(filePath, date);

// New code (direct SQLite access)
const sqlite = storage.getSQLiteStorage();
await sqlite.initialize();
await sqlite.saveFile(filePath, fileMetadata);
```

## Backup and Restore

### Creating Backups

```typescript
const storage = new SQLiteIndexStorage(config);
await storage.initialize();

// Automatic timestamped backup
const backupPath = await storage.createBackup();
// → ~/.prism/index-backup-2025-01-14T10-30-00-000Z.db

// Custom backup path
const customBackup = await storage.createBackup('/backups/my-backup.db');
```

### Restoring Backups

```typescript
// Restore from backup
await storage.restoreBackup(backupPath);

// Automatic backup of current database before restore
// → ~/.prism/index-before-restore-1736857200000.db
```

## Maintenance

### Vacuum Database

After soft deletes, reclaim space with vacuum:

```typescript
await storage.vacuum();
```

### View Statistics

```typescript
const stats = await storage.getStats();
console.log({
  totalFiles: stats.totalFiles,
  totalChunks: stats.totalChunks,
  databaseSize: stats.databaseSize,
  lastIndexed: stats.lastIndexed,
  filesByLanguage: stats.filesByLanguage,
  chunksByLanguage: stats.chunksByLanguage,
});
```

### Validate Index

```typescript
const isValid = await storage.validateIndex();
if (!isValid) {
  console.error('Index corruption detected!');
}
```

## Troubleshooting

### Database Locked

If you get "database is locked" errors:
- Ensure only one process is accessing the database
- WAL mode allows concurrent readers, but only one writer
- Check for zombie processes: `lsof ~/.prism/index.db`

### Database Corruption

If you suspect corruption:
1. Restore from backup: `await storage.restoreBackup(backupPath)`
2. Or rebuild: `await storage.clearIndex()` and reindex

### Performance Issues

If indexing is slow:
1. Check database size: `ls -lh ~/.prism/index.db`
2. Run vacuum: `await storage.vacuum()`
3. Check for unindexed queries
4. Increase cache size in initialization

### Migration Failures

If migrations fail:
1. Check schema version: `SELECT schema_version FROM index_metadata`
2. Manually run migration: `sqlite3 ~/.prism/index.db < migrations/003_index_storage.sql`
3. Or delete and rebuild: `rm ~/.prism/index.db` and reindex

## Testing

Run unit tests:

```bash
npm test -- SQLiteIndexStorage.test.ts
```

Run integration tests:

```bash
npm test -- IndexStorage.test.ts
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   IndexStorage                      │
│  (Public API - Backward Compatible)                 │
│  - saveIndex(), loadIndex()                         │
│  - setLastModified(), getLastModified()             │
│  - needsReindexing()                                │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ delegates to
                   ▼
┌─────────────────────────────────────────────────────┐
│              SQLiteIndexStorage                     │
│  (SQLite Backend - Persistent Storage)              │
│  - saveFile(), getFile()                            │
│  - saveChunk(), getChunks()                         │
│  - needsReindexing() (with checksums)               │
│  - createBackup(), restoreBackup()                  │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ stores in
                   ▼
┌─────────────────────────────────────────────────────┐
│              SQLite Database                        │
│  Location: ~/.prism/index.db                        │
│  - index_metadata table                             │
│  - indexed_files table                              │
│  - code_chunks table                                │
│  - schema_migrations table                          │
└─────────────────────────────────────────────────────┘
```

## Future Enhancements

### Planned Features
- [ ] Full-text search on chunk content
- [ ] Vector similarity search with embeddings
- [ ] Automatic backup scheduling
- [ ] Compression for large content
- [ ] Encryption for sensitive data
- [ ] Replication for high availability

### Performance Improvements
- [ ] Connection pooling
- [ ] Prepared statement caching
- [ ] Bulk insert operations
- [ ] Async I/O with worker threads

### Integration
- [ ] Cloudflare D1 sync
- [ ] Remote backup storage
- [ ] Multi-repo support
- [ ] Distributed indexing

## References

- **Schema**: `/migrations/003_index_storage.sql`
- **Implementation**: `/src/indexer/SQLiteIndexStorage.ts`
- **Tests**: `/tests/unit/indexer/SQLiteIndexStorage.test.ts`
- **Checksum Utils**: `/src/indexer/checksum.ts`

## License

MIT

## Contributing

Contributions welcome! Please see CONTRIBUTING.md for guidelines.
