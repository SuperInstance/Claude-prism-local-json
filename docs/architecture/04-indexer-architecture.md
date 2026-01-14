# Indexer Architecture

**Version**: 0.1.0
**Last Updated**: 2025-01-14
**Status**: Active Development
**Component**: Code Parsing & Chunking System

## Overview

The indexer is responsible for parsing source code files, extracting meaningful chunks, and preparing them for vector embeddings. It implements a sophisticated pipeline that transforms raw code into semantically meaningful, searchable units.

## Purpose and Scope

### Primary Responsibilities

- **Code Parsing**: Extract AST nodes and code structure from supported languages
- **Chunk Creation**: Split code into meaningful, searchable segments
- **Language Detection**: Identify programming languages from file extensions
- **Incremental Updates**: Track changes and avoid reprocessing unchanged files
- **Error Handling**: Gracefully handle malformed files and edge cases

### Scope

**In Scope:**
- Parsing TypeScript, JavaScript, Python, Rust, Go, Java files
- Function-level, class-level, and statement-level chunking
- Basic AST-based semantic chunking
- File size limits and filtering
- Language-specific parsing optimizations

**Out of Scope:**
- C/C++ language support (planned for v0.3)
- Advanced cross-reference resolution
- Git-aware chunking (uses basic mtime tracking)
- Multi-file dependency analysis

## Architecture

### Component Hierarchy

```
IndexerOrchestrator (Coordinator)
├── File Collection (IFileSystem)
├── Code Parser (IIndexer)
│   ├── WasmIndexer (Rust/WASM wrapper)
│   └── Future: JavaScript parsers fallback
├── Embedding Service (IEmbeddingService)
├── Vector Database (IVectorDatabase)
└── Metadata Storage (IndexStorage/D1IndexStorage)
```

### Indexing Pipeline

The indexer follows a 6-stage process:

#### Stage 1: File Collection (0-5%)

**Purpose**: Discover and filter relevant files

**Process**:
1. Recursively scan directory tree
2. Apply glob patterns (include/exclude)
3. Filter by file size (default: 1MB max)
4. Detect language via file extension

**Configuration**:
```typescript
interface IndexOptions {
  include: string[];      // ['*.ts', '*.js']
  exclude: string[];      // ['**/node_modules', '**/*.test.ts']
  maxFileSize: number;    // 1_000_000 bytes (1MB)
  languages: string[];    // ['typescript', 'javascript']
}
```

#### Stage 2: Incremental Filtering (5-10%)

**Purpose**: Skip unchanged files for performance

**Implementation**:
- **SHA-256 + mtime Hybrid**: Uses D1IndexStorage for accurate change detection
- **Fast Path**: If mtime unchanged, skip checksum calculation
- **Verification**: If mtime changed, compare content checksums
- **Git Operations**: Handles git checkout/rebase correctly by detecting mtime-only changes

**Algorithm**:
```typescript
async function needsReindexing(filePath: string, checksum: string, currentModified: number): Promise<boolean> {
  const stored = await this.getFileMetadata(filePath);

  // No stored metadata → new file
  if (!stored) return true;

  // mtime unchanged → unchanged file
  if (currentModified <= stored.lastModified) return false;

  // mtime changed but content unchanged → git operation
  if (checksum === stored.checksum) return false;

  // Content changed → needs reindexing
  return true;
}
```

#### Stage 3: Chunking (10-85%)

**Purpose**: Split files into semantic chunks for search

**Current Implementation**:
- **Line-based chunking** (from `/src/shared/utils.ts`)
- **Fixed chunk size**: 50 lines per chunk maximum
- **Minimum content validation**: Skip empty chunks
- **File-level limits**: Maximum 1000 chunks per file

**Chunking Algorithm**:
```typescript
function chunkFile(filePath: string, content: string, language: string): Chunk[] {
  const lines = content.split('\n');
  const chunks: Chunk[] = [];
  const maxLinesPerChunk = 50;
  let startLine = 0;

  while (startLine < lines.length) {
    const endLine = Math.min(startLine + maxLinesPerChunk, lines.length);
    const chunkContent = lines.slice(startLine, endLine).join('\n');

    if (chunkContent.trim().length >= 1) {
      chunks.push({
        content: chunkContent,
        startLine: startLine + 1,
        endLine,
        language
      });
    }

    startLine = endLine;
  }

  return chunks;
}
```

**Future Enhancements**:
- **AST-aware chunking**: Extract functions, classes, methods
- **Semantic boundaries**: Use AST nodes for chunk boundaries
- **Cross-file references**: Track imports/exports between chunks
- **Custom chunk strategies**: Language-specific parsing rules

#### Stage 4: Embedding Generation (85-90%)

**Purpose**: Convert chunks to vector representations

**Implementation**:
- **Batch processing**: 100 chunks per request (Cloudflare limit)
- **Model**: @cf/baai/bge-small-en-v1.5 (384-dimensional)
- **Rate limiting**: 10,000 neurons/day with safety buffer
- **Fallback**: Ollama for local processing

**Optimizations**:
- Parallel batch processing
- Error recovery for individual batches
- Caching of common queries

#### Stage 5: Vector Storage (90-95%)

**Purpose**: Store chunks with embeddings for fast search

**Storage Backends**:
- **In-memory**: Fast development/testing
- **SQLite**: Persistent local storage
- **Cloudflare D1**: Cloud storage with sync

**Data Schema**:
```typescript
interface CodeChunk {
  id: string;                // Unique chunk identifier
  content: string;            // Code content
  startLine: number;         // 1-indexed start line
  endLine: number;          // End line
  language: string;          // Programming language
  embedding: number[];      // 384-dimensional vector
  filePath: string;         // Relative file path
  checksum: string;          // SHA-256 content hash
  metadata: ChunkMetadata;  // Additional metadata
}

interface ChunkMetadata {
  symbols: string[];         // Extracted symbols
  type: 'function' | 'class' | 'statement' | 'file';
  dependencies: string[];   // Import references
}
```

#### Stage 6: Metadata Update (95-100%)

**Purpose**: Track indexed files for incremental updates

**Stored Information**:
- File modification times
- Content SHA-256 checksums
- Chunk counts per file
- Index statistics

## Key Components

### IndexerOrchestrator

**Location**: `/src/indexer/IndexerOrchestrator.ts`

**Responsibilities**:
- Coordinate the complete indexing pipeline
- Handle errors gracefully without failing entire process
- Report progress to UI layer
- Manage different storage backends

**Key Methods**:
```typescript
async indexDirectory(path: string, options: IndexOptions): Promise<IndexResult>
async filterUnchangedFiles(files: string[]): Promise<string[]>
async processFile(filePath: string): Promise<CodeChunk[]>
```

### WasmIndexer

**Location**: `/src/indexer/WasmIndexer.ts`

**Purpose**: Bridge between JavaScript and Rust/WASM parser

**Current Limitations**:
- Returns entire file as single chunk
- Limited language support
- No cross-reference tracking

**Future Roadmap**:
- Implement AST-aware chunking in Rust
- Add language grammars for C/C++, C#, PHP, etc.
- Build dependency graph between chunks

### ProgressReporter

**Location**: `/src/indexer/ProgressReporter.ts`

**Features**:
- Real-time progress tracking
- Detailed error reporting
- Performance metrics collection
- User-friendly progress messages

### IndexStorage

**Location**: `/src/indexer/IndexStorage.ts`
**Location**: `/src/indexer/D1IndexStorage.ts`

**Backends**:
- **IndexStorage**: Local file-based storage
- **D1IndexStorage**: Cloudflare D1 with SHA-256 checksums

## Usage Examples

### Basic Indexing

```typescript
const orchestrator = new IndexerOrchestrator(
  fileSystem,
  wasmIndexer,
  embeddingService,
  vectorDB,
  config
);

const result = await orchestrator.indexDirectory('./src', {
  include: ['*.ts', '*.js'],
  exclude: ['**/node_modules', '**/*.test.ts'],
  incremental: true,
  onProgress: (progress, message) => {
    console.log(`${progress}%: ${message}`);
  }
});

console.log(`Indexed ${result.files} files, ${result.chunks} chunks`);
console.log(`Duration: ${result.duration}ms`);
```

### Custom Chunking

```typescript
// Extend WasmIndexer for custom chunking
class CustomIndexer extends WasmIndexer {
  async index(filePath: string): Promise<CodeChunk[]> {
    const baseChunks = await super.index(filePath);

    // Apply custom chunking logic
    return this.applySemanticChunking(baseChunks);
  }

  private applySemanticChunking(chunks: CodeChunk[]): CodeChunk[] {
    // Split chunks by function/class boundaries
    // Extract symbols from AST
    // Track dependencies
    return enhancedChunks;
  }
}
```

## Performance Characteristics

### Indexing Speed

| Codebase Size | Time Estimate | Memory Usage |
|---------------|---------------|---------------|
| Small (10K LOC) | 2-3 seconds | ~10MB |
| Medium (100K LOC) | 15-20 seconds | ~80MB |
| Large (1M LOC) | 2-3 minutes | ~800MB |

### Bottlenecks

1. **Embedding Generation** (70% of time)
   - Cloudflare AI API latency
   - Batch processing overhead

2. **File I/O** (20% of time)
   - Network storage slower than local
   - Large file reading

3. **Vector Search** (10% of time)
   - Brute-force similarity search
   - No indexing for small datasets

## Configuration

### Default Settings

```typescript
const CONFIG = {
  MAX_CHUNKS_PER_FILE: 1000,
  MAX_LINES_PER_CHUNK: 50,
  MIN_CHUNK_CONTENT_LENGTH: 1,
  MAX_FILE_SIZE: 10_000_000,    // 10MB
  MAX_FILES_PER_BATCH: 100,
  MAX_EMBEDDING_CONCURRENCY: 10,
  EMBEDDING_DIMENSIONS: 384,
} as const;
```

### Custom Configuration

```typescript
const customConfig = {
  indexing: {
    include: ['*.ts', '*.tsx'],
    exclude: ['**/node_modules'],
    maxFileSize: 5_000_000,      // 5MB
    languages: ['typescript'],
    chunkSize: 100,             // lines per chunk
  },
  embeddings: {
    batchSize: 50,
    model: '@cf/baai/bge-large-en-v1.5', // 1024d
    fallbackToOllama: true,
  },
};
```

## Error Handling

### File Processing Errors

**Strategies**:
- Skip individual files without stopping process
- Log detailed error messages
- Track failed files in result
- Provide actionable error messages

**Error Types**:
```typescript
enum ErrorCode {
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_LANGUAGE = 'UNSUPPORTED_LANGUAGE',
  PARSING_ERROR = 'PARSING_ERROR',
  EMBEDDING_ERROR = 'EMBEDDING_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
}
```

### Recovery Mechanisms

1. **Partial Processing**: Continue with remaining files if one fails
2. **Retry Logic**: Retry transient errors (network, temporary failures)
3. **Fallback Modes**: Switch to simpler parsing for complex files
4. **Incremental Updates**: Skip files that can't be processed

## Known Limitations

### Current Limitations

1. **Chunking Strategy**: Line-based instead of AST-aware
2. **Language Support**: Limited to TypeScript, JavaScript, Python, Rust, Go, Java
3. **No Symbol Resolution**: Doesn't track cross-file references
4. **Simple File Filtering**: Basic glob pattern matching
5. **No Git Integration**: Basic mtime tracking instead of Git-aware

### Planned Improvements

**v0.2.0**:
- AST-aware chunking implementation
- Added language support (C/C++, C#, PHP)
- Symbol table and cross-references

**v0.3.0**:
- Git-aware chunking with proper change detection
- Multi-file dependency analysis
- Advanced file filtering with minimatch

## Testing

### Unit Tests

**Location**: `/tests/unit/indexer/`

**Coverage**:
- File collection and filtering
- Chunk creation algorithms
- Incremental filtering logic
- Error handling scenarios
- Progress reporting

### Integration Tests

**Location**: `/tests/integration/`

**Test Scenarios**:
- End-to-end indexing pipeline
- Multiple storage backends
- Large codebase processing
- Error recovery scenarios

## Monitoring and Metrics

### Key Metrics

**Performance**:
- Files processed per second
- Average chunks per file
- Embedding generation latency
- Storage write performance

**Reliability**:
- Error rate per file type
- Failed file tracking
- Incremental update efficiency

**Usage**:
- Most frequently indexed languages
- Average file sizes
- Chunk size distribution

### Monitoring Implementation

```typescript
interface IndexingMetrics {
  startTime: Date;
  endTime?: Date;
  totalFiles: number;
  filesProcessed: number;
  totalChunks: number;
  errors: number;
  errorRates: Record<string, number>;
  performance: {
    averageTimePerFile: number;
    averageChunksPerFile: number;
    embeddingLatency: number;
  };
}
```

## Related Documentation

- [System Overview](./01-system-overview.md) - High-level architecture
- [Data Flow](./02-data-flow.md) - Complete request lifecycle
- [Token Optimizer](./02-token-optimizer.md) - Context optimization
- [MCP Plugin Spec](./05-mcp-plugin-spec.md) - Claude Code integration

## Files

**Core Implementation**:
- `/src/indexer/IndexerOrchestrator.ts`
- `/src/indexer/WasmIndexer.ts`
- `/src/indexer/ProgressReporter.ts`
- `/src/indexer/IndexStorage.ts`
- `/src/indexer/D1IndexStorage.ts`

**Configuration**:
- `/src/shared/utils.ts`
- `/src/config/types/index.ts`

**Tests**:
- `/tests/unit/indexer/`
- `/tests/integration/indexing-pipeline.test.ts`

---

**Document Maintainer**: Development Team
**Last Review**: 2025-01-14
**Next Review**: After v0.2.0 release