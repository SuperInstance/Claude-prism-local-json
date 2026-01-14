# 🚀 PRISM v0.3.1: Semantic Code Search with Vector Embeddings

> **Find code by meaning, not just keywords—powered by Cloudflare Workers and Vectorize.**

---

## What is PRISM?

**PRISM** is an open-source semantic code search engine that uses vector embeddings to help you find code by **intent** rather than exact keywords.

### The Problem

Traditional code search tools (`grep`, `ripgrep`, IDE search) are **keyword-based**:
- ❌ Miss code with different naming conventions
- ❌ Can't understand what you're looking for
- ❌ Return unranked results (no relevance scoring)
- ❌ Slow on large codebases

### The Solution

**PRISM uses semantic search**:
- ⚡ **Fast ANN search** via Cloudflare Vectorize (31ms median query latency)
- 🎯 **Find by meaning**—search "authentication" finds login, auth, signin code
- 🌐 **Edge deployment** via Cloudflare Workers
- 🆓 **Free tier friendly**—works within Cloudflare's generous free limits

---

## How It Works

PRISM uses **vector embeddings** to understand code meaning:

1. **Chunk**: Split code into 50-line chunks
2. **Embed**: Convert each chunk to a 384-dimensional vector using BGE-small-en-v1.5
3. **Index**: Store vectors in Vectorize for fast ANN search
4. **Query**: Search by intent, find semantically similar code

### Example

```bash
# Search for "authentication"
prism search "user authentication flow"
```

Finds code like:
```typescript
function handleLogin(credentials) { /* ... */ }
function validateSession(token) { /* ... */ }
function processOAuthCallback() { /* ... */ }
```

Even if none contain the word "authentication".

---

## Key Features

### 1. Semantic Search

- **Understands intent**: Search by what code does, not what it's named
- **Relevance ranking**: Best matches first
- **Multi-language support**: TypeScript, JavaScript, Python, Rust, Go, Java, C/C++, and more

### 2. Fast Vector Search

Based on Cloudflare Vectorize v2 benchmarks:
- **31ms median query latency** (P50)
- **56ms at P75 latency**
- **>95% result accuracy** with refinement

*Source: [Cloudflare Vectorize Benchmarks](https://blog.cloudflare.com/workers-ai-bigger-better-faster/)*

### 3. Incremental Indexing

Uses SHA-256 checksums to detect changes:
- ✅ Only reindexes modified files
- ✅ Skips unchanged files
- ✅ Detects deleted files

### 4. Smart Filtering

Narrow results by:
- **Language**: `--lang typescript`
- **Path**: `--path src/api/`
- **Date range**: `--created-after 1704067200000`
- **Relevance**: `--min-score 0.5`

### 5. Built-in CLI Features

- 📜 **Search history** - Never lose a useful query
- ⭐ **Favorites** - Save important searches
- 💡 **Suggestions** - Get query recommendations
- 📊 **Statistics** - Track your index

---

## Quick Start

### Installation

```bash
npm install -g claudes-friend
# or
git clone https://github.com/SuperInstance/PRISM.git
cd PRISM
npm link
```

### Index Your Code

```bash
# Index your project
prism index src/

# Incremental indexing (skip unchanged files)
prism index src/ --incremental
```

### Search Semantically

```bash
# Natural language queries
prism search "database connection pooling"

# Filter by language
prism search "authentication" --lang typescript

# Limit results
prism search "file upload handler" --limit 5
```

---

## Technical Details

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  PRISM CLI                                              │
│  - File collection                                      │
│  - Batch processing                                     │
└───────────────────┬─────────────────────────────────────┘
                    │ HTTP/JSON
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Worker (Global Edge)                        │
│  - /api/index   → Index with embeddings                 │
│  - /api/search  → Semantic search (Vectorize ANN)      │
└──────┬────────────────────────────────┬─────────────────┘
       │                                │
       ▼                                ▼
┌──────────────────┐         ┌──────────────────────────┐
│  Vectorize       │         │  D1 Database             │
│  - ANN Index     │         │  - vector_chunks (BLOB)  │
│  - 31ms P50      │         │  - file_index (SHA-256)  │
└──────────────────┘         └──────────────────────────┘
```

### Technology Stack

- **Embedding Model**: BAAI BGE-small-en-v1.5
  - **384 dimensions** per vector
  - Optimized for English text
  - MTEB retrieval score: 51.68
  - Max 512 tokens per input

- **Vector Database**: Cloudflare Vectorize
  - **31ms median query latency** (official benchmark)
  - **>95% accuracy** with refinement
  - **5M vectors** max per index
  - IVF + PQ optimization

- **Metadata Storage**: Cloudflare D1 (SQLite)

- **Deployment**: Cloudflare Workers (300+ locations)

### Free Tier Capacity

Cloudflare Workers Free Plan includes:
- **5 million stored vector dimensions**
- **30 million queried dimensions per month**
- At 384 dimensions per vector: **~13,000 chunks** storage

*Source: [Vectorize Pricing](https://developers.cloudflare.com/vectorize/platform/pricing/)*

---

## Performance

### Measured Benchmarks

Current implementation tested with **549 chunks across 67 files**:

| Metric | Value |
|--------|-------|
| Average search time | 360ms |
| Median search time | 350ms |
| Fastest query | 228ms |
| Queries per second | 2.8 qps |

*Source: [Benchmark Results](https://github.com/SuperInstance/PRISM/blob/main/docs/benchmark-results.md)*

### Scalability Projection

Based on Vectorize's logarithmic scaling:

| Chunks | Est. Search Time | Notes |
|--------|-----------------|-------|
| 549 (current) | 360ms | Measured |
| 1,000 | ~370ms | Projected |
| 10,000 | ~390ms | Projected |
| 100,000 | ~430ms | Projected |

Note: These are projections based on Vectorize's architecture. Actual performance may vary.

---

## Use Cases

- **Onboarding**: New devs search "how payments work"
- **Code reviews**: Find all error handling logic
- **Refactoring**: Locate all database queries
- **Debugging**: Search for "file upload validation"
- **Learning**: Understand how features are implemented

---

## Supported Languages

TypeScript (.ts, .tsx), JavaScript (.js, .jsx), Python (.py), Rust (.rs), Go (.go), Java (.java), C/C++ (.c, .cpp, .h), C# (.cs), PHP (.php), Ruby (.rb), Kotlin (.kt), Swift (.swift), Shell (.sh, .bash), YAML (.yaml, .yml), JSON (.json), Markdown (.md), and more.

---

## Roadmap

### v0.4.0 (Planned)
- [ ] MCP server integration for Claude Code
- [ ] Performance benchmarks against grep/ripgrep
- [ ] Multi-repo namespace support
- [ ] Advanced ranking algorithms

### v0.5.0 (Planned)
- [ ] Hybrid cloud + local storage
- [ ] Real-time indexing with file watchers
- [ ] Web UI for search visualization

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING_GUIDE.md) for details.

### Areas to Contribute:
- 🔍 **Search algorithms** - Improve relevance scoring
- 🌐 **Language support** - Add more programming languages
- 📚 **Documentation** - Improve guides and examples
- 🐛 **Bug fixes** - See [GitHub Issues](https://github.com/SuperInstance/PRISM/issues)
- ✨ **Features** - Request or implement new features

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Links

- **GitHub**: [SuperInstance/PRISM](https://github.com/SuperInstance/PRISM)
- **npm**: [`claudes-friend`](https://www.npmjs.com/package/claudes-friend)
- **Documentation**: [Full Docs](./docs/)
- **Benchmarks**: [Performance Results](./docs/benchmark-results.md)
- **CLI Guide**: [PRISM CLI Reference](./docs/prism-cli.md)

---

## Acknowledgments

Built with:
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge computing platform
- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/) - Vector database with **31ms median query latency**
- [Cloudflare D1](https://developers.cloudflare.com/d1/) - SQLite database
- [BAAI BGE-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) - **384-dimensional** embedding model

---

**Happy searching! 🎯**

*Find code by meaning, not just keywords.*
