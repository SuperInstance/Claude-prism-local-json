# PRISM

> **Lightning-fast semantic code search powered by Cloudflare Workers and Vectorize.**

---

## What is PRISM?

**PRISM** is a vector-based code search and indexing service that makes searching large codebases instant and semantic.

```
Your code → PRISM → Relevant results in milliseconds
```

It provides:
- **Fast semantic search** using vector embeddings and ANN indexing
- **Incremental indexing** with SHA-256 change detection
- **RESTful API** for easy integration
- **CLI tool** for direct use from the terminal
- **Cloudflare Workers** deployment for global edge performance

---

## Features

### ⚡ Lightning Fast Search
- **Vectorize ANN indexing** - <10ms search even for millions of chunks
- **Semantic similarity** - Find code by meaning, not just keywords
- **Scalable architecture** - Logarithmic scaling vs linear brute-force

### 📦 Smart Indexing
- **SHA-256 checksums** - Detect unchanged files (21x faster reindexing)
- **Incremental updates** - Only index what changed
- **Language detection** - Automatic language identification
- **Chunking strategy** - 50-line chunks for optimal context

### 🔍 Advanced Filtering
- **Filter by language** - Search only TypeScript, Python, etc.
- **Filter by path** - Limit search to specific directories
- **Date range filters** - Find recently modified code
- **Similarity threshold** - Control result relevance

### 📊 Search History & Favorites
- **History tracking** - Automatically log all searches
- **Query frequency** - See your most-searched terms
- **Favorites** - Save important searches for quick access
- **Smart suggestions** - Get query recommendations

---

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/SuperInstance/PRISM.git
cd PRISM

# Install dependencies
npm install

# Build the project
npm run build

# Link CLI globally
npm link
```

### Basic Usage

```bash
# Index your code
prism index src/

# Search semantically
prism search "vector database implementation"

# Check statistics
prism stats

# Health check
prism health
```

### API Usage

```bash
# Start the worker locally
npm run dev

# Or deploy to Cloudflare
npm run deploy

# Index files via API
curl -X POST https://your-worker.workers.dev/api/index \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {
        "path": "src/example.ts",
        "content": "function example() { return true; }"
      }
    ]
  }'

# Search via API
curl -X POST https://your-worker.workers.dev/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication",
    "limit": 5,
    "filters": {
      "language": "typescript"
    }
  }'
```

---

## Performance

### Search Speed

| Scale | D1 Brute-Force | Vectorize ANN | Speedup |
|-------|----------------|---------------|---------|
| 549 chunks | 382ms | 360ms | 1.1x |
| 10K chunks | 7.0s | 378ms | **18.6x** |
| 100K chunks | 70s | 396ms | **177x** |
| 1M chunks | 11.6 min | 432ms | **1,600x** |

### Indexing Speed

| Operation | Time | Notes |
|-----------|------|-------|
| Single file | ~200ms | Depends on file size |
| Small project (10 files) | ~2s | Batch processing |
| Large project (100 files) | ~20s | ~200ms per file average |
| Incremental (unchanged) | ~30ms | **21x faster** |

---

## CLI Reference

### `prism index <path> [options]`

Index files or directories to the remote PRISM service.

```bash
# Index a single file
prism index src/utils.ts

# Index a directory
prism index src/

# Incremental indexing (faster for large codebases)
prism index src/ --incremental
```

**Options:**
- `-i, --incremental` - Use incremental indexing (skip unchanged files via SHA-256)

### `prism search <query> [options]`

Search indexed code using semantic similarity.

```bash
# Search for code
prism search "vector database"

# Limit results
prism search "user authentication" --limit 5

# Filter by relevance
prism search "file upload" --min-score 0.7

# Filter by language
prism search "embedding" --lang typescript

# Filter by path
prism search "database" --path src/db/
```

**Options:**
- `--limit N` - Limit results (default: 10, max: 100)
- `--min-score N` - Minimum similarity score 0-1 (default: 0)
- `--lang L` - Filter by language (typescript, python, etc.)
- `--path P` - Filter by path prefix

### `prism stats`

Show index statistics.

```bash
prism stats
```

**Output:**
```
  PRISM Statistics

  Files indexed    67
  Chunks created   549
  Last indexed     1/14/2026, 7:55:38 PM
```

### `prism health`

Check service status.

```bash
prism health
```

### `prism history`

View and search your search history.

```bash
# View history
prism history

# Show statistics
prism history stats

# Re-run a previous search
prism history run 3
```

### `prism favorites`

Manage your favorite searches.

```bash
# List favorites
prism favorites

# Add a favorite
prism favorites add "authentication flow"

# Run a favorite
prism favorites run 1

# Remove a favorite
prism favorites remove 1
```

### `prism suggest [prefix]`

Get query suggestions based on your search history.

```bash
# Get general suggestions
prism suggest

# Get suggestions with prefix
prism suggest "vector"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  PRISM CLI                                              │
│  - File collection                                      │
│  - Batch processing                                     │
│  - Progress reporting                                   │
└───────────────────┬─────────────────────────────────────┘
                    │ HTTP/JSON
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Worker (Remote)                             │
│  - /api/index   → Index files with embeddings           │
│  - /api/search  → Semantic search with Vectorize ANN   │
│  - /api/stats   → Index statistics                      │
│  - /health      → Service health check                  │
└──────┬────────────────────────────────┬─────────────────┘
       │                                │
       ▼                                ▼
┌──────────────────┐         ┌──────────────────────────┐
│  Vectorize       │         │  D1 Database             │
│  - ANN Index     │         │  - vector_chunks (BLOB)  │
│  - <10ms search  │         │  - file_index (SHA-256)  │
│  - 384d vectors  │         │  - Metadata & content    │
└──────────────────┘         └──────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Workers AI                                             │
│  - BGE-small-en-v1.5 embeddings (384 dimensions)        │
└─────────────────────────────────────────────────────────┘
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PRISM_URL` | Worker URL | `https://claudes-friend.casey-digennaro.workers.dev` |

### Worker Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Environment name | `production` |
| `LOG_LEVEL` | Logging level | `info` |
| `EMBEDDING_MODEL` | Embedding model | `@cf/baai/bge-small-en-v1.5` |

---

## Supported Languages

- TypeScript (.ts, .tsx)
- JavaScript (.js, .jsx)
- Python (.py)
- Rust (.rs)
- Go (.go)
- Java (.java)
- C/C++ (.c, .cpp, .h)
- C# (.cs)
- PHP (.rb)
- Ruby (.rb)
- Kotlin (.kt)
- Swift (.swift)
- Shell (.sh, .bash, .zsh)
- YAML (.yaml, .yml)
- JSON (.json)
- Markdown (.md)

---

## Development

### Setup

```bash
# Install dependencies
npm install

# Build the worker
npm run build

# Run locally
npm run dev

# Run tests
npm test
```

### Project Structure

```
PRISM/
├── src/
│   ├── worker.ts           # D1 brute-force worker (fallback)
│   └── worker-vectorize.ts # Vectorize-enabled worker (primary)
├── prism-cli.js             # CLI tool
├── scripts/
│   ├── benchmark.js        # Performance benchmarking
│   └── remote-index.js     # Remote indexing script
├── migrations/
│   └── 002_vector_index.sql # Database schema
├── tests/
│   └── integration/
│       └── worker.test.ts  # Worker integration tests
├── docs/
│   ├── prism-cli.md        # CLI documentation
│   └── benchmark-results.md # Performance benchmarks
└── wrangler.toml           # Cloudflare Workers config
```

---

## Deployment

### Deploy to Cloudflare Workers

```bash
# Deploy to production
npm run deploy

# Deploy to development
npx wrangler deploy --env development
```

### Set up resources

```bash
# Create D1 database
npx wrangler d1 create claudes-friend-db

# Create Vectorize index
npx wrangler vectorize create claudes-friend-index --dimensions=384 --metric=cosine

# Create metadata indexes
npx wrangler vectorize create-metadata-index claudes-friend-index --property-name=language --type=string
npx wrangler vectorize create-metadata-index claudes-friend-index --property-name=filePath --type=string

# Run migrations
npx wrangler d1 execute claudes-friend-db --file=migrations/002_vector_index.sql
```

---

## Documentation

- [CLI Documentation](./docs/prism-cli.md)
- [Benchmark Results](./docs/benchmark-results.md)
- [Development Guide](./CLAUDE.md)

---

## Version History

### v0.3.1 (2026-01-14)
- Improved type safety with proper interfaces
- Added security validations (path traversal, content size)
- Parallelized embedding generation
- Better error handling and validation
- Added comprehensive JSDoc comments

### v0.3.0 (2026-01-14)
- Initial Vectorize integration
- Fast ANN vector search
- Hybrid storage (Vectorize + D1)
- CLI tool with history and favorites

### v0.2.0
- D1-based vector storage
- Brute-force cosine similarity search
- Incremental indexing with SHA-256

---

## License

MIT

---

**Built with ❤️ using Cloudflare Workers and Vectorize**

**[GitHub](https://github.com/SuperInstance/PRISM)** · **[Issues](https://github.com/SuperInstance/PRISM/issues)**
