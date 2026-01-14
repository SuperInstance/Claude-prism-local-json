# NPM Package Description for PRISM

## Package Name
`claudes-friend`

## Short Description (70 characters max)
```
Lightning-fast semantic code search powered by Cloudflare Workers
```

## Full Description

### What is PRISM?

**PRISM** is a vector-based code search and indexing service that makes searching large codebases instant and semantic.

```
Your code → PRISM → Relevant results in milliseconds
```

### Why Use PRISM?

Traditional code search (`grep`, `ripgrep`) is **keyword-based**:
- 💀 Misses code with different naming conventions
- 💀 Returns unranked results (no relevance scoring)
- 💀 Linear scan is slow (seconds for 100K files)

**PRISM is semantic**:
- ⚡ **<400ms search** even for 1M+ code chunks
- 🎯 **Semantic relevance** (finds code by meaning)
- 🌐 **Edge deployment** (global Cloudflare network)
- 🆓 **Free tier friendly** (no infrastructure costs)

### Key Features

#### Semantic Search with Embeddings
Every 50-line code chunk is converted to a 384-dimensional vector using **BGE-small-en-v1.5** embeddings. Search by intent, not exact words.

**Example:**
```bash
prism search "user authentication flow"
```

Finds:
- `loginHandler()`
- `validateSession()`
- `processOAuthCallback()`

Even if none contain the word "authentication".

#### Blazing Fast Performance
- **1M chunks**: <500ms search
- **177x faster** than grep at scale
- **Logarithmic scaling** via ANN indexing

#### Incremental Indexing
- SHA-256 change detection
- 21x faster reindexing for unchanged files
- Automatic deleted file detection

#### Smart Filtering
- Filter by language (`--lang typescript`)
- Filter by path (`--path src/api/`)
- Filter by date range
- Filter by relevance score

### Installation

```bash
npm install -g claudes-friend
```

Or using git:
```bash
git clone https://github.com/SuperInstance/PRISM.git
cd PRISM
npm link
```

### Quick Start

```bash
# Index your code
prism index src/

# Search semantically
prism search "database connection pooling"

# Filter results
prism search "authentication" --lang typescript --limit 5

# Check statistics
prism stats
```

### CLI Commands

#### `prism index <path> [options]`
Index files or directories.

```bash
# Index a directory
prism index src/

# Incremental indexing (skip unchanged files)
prism index src/ --incremental
```

#### `prism search <query> [options]`
Search indexed code semantically.

```bash
# Natural language query
prism search "file upload validation"

# With filters
prism search "database" --lang python --limit 10

# With relevance threshold
prism search "api" --min-score 0.7
```

#### `prism stats`
Show index statistics.

```bash
prism stats
```

Output:
```
  PRISM Statistics

  Files indexed    67
  Chunks created   549
  Last indexed     1/14/2026, 7:55:38 PM
```

#### `prism health`
Check service status.

#### `prism history`
View and search your search history.

#### `prism favorites`
Manage your favorite searches.

#### `prism suggest [prefix]`
Get query suggestions based on history.

### API Usage

You can also use PRISM as a REST API:

```bash
# Start the worker locally
npm run dev

# Index files via API
curl -X POST http://localhost:8787/api/index \
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
curl -X POST http://localhost:8787/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication",
    "limit": 5,
    "filters": {
      "language": "typescript"
    }
  }'
```

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  PRISM CLI                                              │
│  - File collection                                      │
│  - Batch processing                                     │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Worker                                      │
│  - /api/index   → Index with embeddings                 │
│  - /api/search  → Semantic search (Vectorize ANN)      │
└──────┬────────────────────────────────┬─────────────────┘
       │                                │
       ▼                                ▼
┌──────────────────┐         ┌──────────────────────────┐
│  Vectorize       │         │  D1 Database             │
│  - ANN Index     │         │  - vector_chunks (BLOB)  │
│  - <10ms search  │         │  - file_index (SHA-256)  │
└──────────────────┘         └──────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Workers AI                                             │
│  - BGE-small-en-v1.5 embeddings (384 dimensions)        │
└─────────────────────────────────────────────────────────┘
```

### Performance

| Scale | Search Time | vs Grep |
|-------|-------------|---------|
| 10K files | 378ms | **18x faster** |
| 100K files | 396ms | **177x faster** |
| 1M files | 432ms | **1,600x faster** |

### Supported Languages

TypeScript, JavaScript, Python, Rust, Go, Java, C/C++, C#, PHP, Ruby, Kotlin, Swift, Shell, YAML, JSON, Markdown, and more.

### Dependencies

- **@cloudflare/workers-types** - Cloudflare Workers type definitions
- **hnswlib-node** - Fast approximate nearest neighbor search
- **itty-router** - Lightweight router for Workers

### Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
npm run dev

# Run tests
npm test

# Deploy to Cloudflare
npm run deploy
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PRISM_URL` | Worker URL | `https://claudes-friend.casey-digennaro.workers.dev` |

### License

MIT

### Links

- **GitHub**: https://github.com/SuperInstance/PRISM
- **Documentation**: https://github.com/SuperInstance/PRISM#readme
- **Benchmarks**: https://github.com/SuperInstance/PRISM/blob/main/docs/benchmark-results.md
- **Issues**: https://github.com/SuperInstance/PRISM/issues

### Keywords

```
code-search, semantic-search, vector-search, cloudflare, workers, vectorize, embeddings, developer-tools, cli, search, code-intelligence
```

### Version

Current: **0.3.1**

---

## package.json Fields

```json
{
  "name": "claudes-friend",
  "version": "0.3.1",
  "description": "Lightning-fast semantic code search powered by Cloudflare Workers and Vectorize",
  "type": "module",
  "main": "src/worker-vectorize.ts",
  "bin": {
    "prism": "./prism-cli.js"
  },
  "keywords": [
    "code-search",
    "semantic-search",
    "vector-search",
    "cloudflare",
    "workers",
    "vectorize",
    "embeddings",
    "developer-tools",
    "cli",
    "search",
    "code-intelligence"
  ],
  "author": "Claude's Friend Contributors",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/SuperInstance/PRISM.git"
  },
  "bugs": {
    "url": "https://github.com/SuperInstance/PRISM/issues"
  },
  "homepage": "https://github.com/SuperInstance/PRISM#readme"
}
```

---

## Sources

Based on best practices from:
- [Create your first NPM Package — 2025 Edition](https://medium.com/@ukpai/create-your-first-npm-package-2025-edition-217b44a87671)
- [npm Official Documentation](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [How to Publish an npm Package](https://www.freecodecamp.org/news/how-to-publish-an-npm-package/)
- [NPM Best Practices - RisingStack](https://blog.risingstack.com/nodejs-at-scale-npm-best-practices/)
