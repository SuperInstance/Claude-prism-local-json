# System Overview

**Component**: PRISM - Architecture Overview
**Status**: Design Document
**Priority**: Foundational
**Last Updated**: 2026-01-13

## Purpose

PRISM is a super-agent plugin for Claude Code that saves 90%+ tokens through intelligent vector-based RAG (Retrieval-Augmented Generation). This document provides a high-level overview of the entire system architecture, components, technology choices, and design principles.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Component Overview](#2-component-overview)
3. [Technology Rationale](#3-technology-rationale)
4. [Design Principles](#4-design-principles)
5. [Deployment Architecture](#5-deployment-architecture)

---

## 1. System Architecture

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLAUDE CODE (CLIENT)                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                       MCP PROTOCOL LAYER                              │   │
│  │  • Tool Discovery                                                    │   │
│  │  • Command Execution                                                 │   │
│  │  • Context Exchange                                                   │   │
│  └───────────────────────────┬──────────────────────────────────────────┘   │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VANTAGE CLI INTERFACE                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      COMMAND ROUTER                                   │   │
│  │  • prism index    - Build codebase index                             │   │
│  │  • prism search   - Semantic code search                             │   │
│  │  • prism chat     - AI-powered assistance                            │   │
│  │  • prism stats    - Token savings dashboard                          │   │
│  └───────────────────────────┬──────────────────────────────────────────┘   │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   LOCAL      │      │   CLOUD      │      │   HYBRID     │
│   MODE       │      │   MODE       │      │   MODE       │
│              │      │              │      │              │
│ • SQLite     │      │ • Workers    │      │ • Local +    │
│ • Ollama     │      │ • Vectorize  │      │   Cloud      │
│ • Filesys    │      │ • D1/R2/KV   │      │ • Smart sync  │
└──────────────┘      └──────────────┘      └──────────────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORE SERVICES LAYER                                 │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐        │
│  │  INDEXER SERVICE │  │  VECTOR SERVICE  │  │  OPTIMIZER SERVICE│        │
│  │                  │  │                  │  │                  │        │
│  │ • Tree-sitter    │  │ • Semantic search│  │ • Token budgeting│        │
│  │ • Rust WASM      │  │ • Embedding gen  │  │ • Context select │        │
│  │ • AST extraction │  │ • Vector storage │  │ • Compression    │        │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘        │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐        │
│  │  ROUTER SERVICE  │  │  MCP SERVER      │  │  SYNC SERVICE    │        │
│  │                  │  │                  │  │                  │        │
│  │ • Model selection│  │ • Tool exposure  │  │ • Local→Cloud   │        │
│  │ • Cost optimization│ │ • Resource access│  │ • Conflict resol │        │
│  │ • Fallback logic │  │ • Error handling │  │ • Incremental upd│        │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  STORAGE     │      │  AI MODELS   │      │  EXTERNAL    │
│              │      │              │      │  SERVICES     │
│ • SQLite     │      │ • Ollama     │      │ • GitHub     │
│ • D1         │      │ • Workers AI │      │ • Git APIs   │
│ • Vectorize  │      │ • Claude API │      │ • NPM APIs   │
│ • R2/KV      │      │ • OpenAI     │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
```

### 1.2 Component Communication

```
USER QUERY
    │
    ▼
[Claude Code] ──MCP──▶ [PRISM CLI]
    │                           │
    │                           ▼
    │                    [Command Router]
    │                           │
    │                    ┌──────┴──────┐
    │                    ▼             ▼
    │              [Indexer]    [Vector Search]
    │                    │             │
    │                    ▼             ▼
    │              [Tree-sitter]  [Embeddings]
    │                    │             │
    │                    └──────┬──────┘
    │                           ▼
    │                    [Token Optimizer]
    │                           │
    │                           ▼
    │                    [Model Router]
    │                           │
    ▼                           ▼
[Claude API] ◀──────────── [Selected Model]
    │
    ▼
[RESPONSE]
```

---

## 2. Component Overview

### 2.1 CLI Interface

**Purpose**: Entry point for all PRISM operations

**Responsibilities**:
- Parse command-line arguments
- Route commands to appropriate services
- Display progress and results
- Manage configuration files

**Commands**:
```bash
prism index [options]     # Index codebase for vector search
prism search <query>      # Semantic code search
prism chat <message>      # AI-powered assistance
prism stats              # Token savings statistics
```

**Key Files**:
- `/src/cli/index.ts` - Main CLI entry point
- `/src/cli/commands/` - Command implementations
- `/src/cli/config.ts` - Configuration management

---

### 2.2 Indexer Service

**Purpose**: Parse code and extract semantic structure

**Technology**: Rust compiled to WASM + Tree-sitter

**Responsibilities**:
- Parse source code using Tree-sitter grammars
- Extract functions, classes, methods
- Generate AST-based code chunks
- Preserve line numbers and signatures

**Supported Languages**:
- TypeScript / JavaScript
- Python
- Rust
- Go
- Java

**Key Files**:
- `/vantage-indexer/Cargo.toml` - Rust project config
- `/vantage-indexer/src/lib.rs` - WASM exports
- `/vantage-indexer/src/parser.rs` - Parser wrapper

**Performance Targets**:
- Index 100K LOC in <30 seconds
- Memory usage <100MB for 1M LOC
- WASM module size <1MB

---

### 2.3 Vector Service

**Purpose**: Semantic code search using vector embeddings

**Technology**: BGE-small-en-v1.5 (384 dimensions) via Cloudflare Workers AI

**Responsibilities**:
- Generate embeddings for code chunks
- Store vectors in SQLite (local) or Vectorize (cloud)
- Perform similarity search
- Return ranked results with scores

**Storage Options**:
```typescript
interface VectorStorage {
  // Local storage (development)
  local: {
    type: 'sqlite',
    path: './.vantage/vectors.db',
    dimensions: 384,
  },

  // Cloud storage (production)
  cloud: {
    type: 'vectorize',
    index: 'vantage-codebase-prod',
    dimensions: 384,
    metric: 'cosine',
  }
}
```

**Key Files**:
- `/src/vector/embeddings.ts` - Embedding generation
- `/src/vector/storage.ts` - Storage abstraction
- `/src/vector/search.ts` - Similarity search

---

### 2.4 Token Optimizer Service

**Purpose**: Reduce token usage by 90%+ through intelligent context selection

**Technology**: Custom algorithm in TypeScript

**Responsibilities**:
- Detect query intent (bug_fix, feature_add, explain, etc.)
- Retrieve relevant code via vector search
- Score chunks by multiple factors (semantic, proximity, frequency)
- Select chunks within token budget
- Compress selected chunks

**Algorithm Phases**:
1. **Intent Detection** - Classify query type
2. **Semantic Search** - Vector search for relevant code
3. **Relevance Scoring** - Multi-factor scoring
4. **Budget Selection** - Knapsack optimization
5. **Adaptive Compression** - Remove noise, keep meaning
6. **Model Selection** - Route to optimal model
7. **Prompt Reconstruction** - Build optimized context

**Key Files**:
- `/src/optimizer/intent.ts` - Intent detection
- `/src/optimizer/scoring.ts` - Relevance scoring
- `/src/optimizer/selection.ts` - Budget-constrained selection
- `/src/optimizer/compression.ts` - Context compression

---

### 2.5 Model Router Service

**Purpose**: Route to optimal AI model based on query complexity and cost

**Technology**: Decision tree with fallback logic

**Model Options**:
```typescript
const MODELS = {
  // Free local option
  ollama: {
    model: 'deepseek-coder-v2',
    cost: 0,
    maxTokens: 8000,
  },

  // Cheap Claude option
  haiku: {
    model: 'claude-3-haiku-20240307',
    cost: 0.00025, // per 1M input tokens
    maxTokens: 20000,
  },

  // Balanced option
  sonnet: {
    model: 'claude-3.5-sonnet-20241022',
    cost: 0.003, // per 1M input tokens
    maxTokens: 100000,
  },

  // Best quality
  opus: {
    model: 'claude-3-opus-20240229',
    cost: 0.015, // per 1M input tokens
    maxTokens: 200000,
  },
};
```

**Routing Logic**:
```typescript
function routeModel(tokens: number, complexity: number): Model {
  if (ollamaAvailable && tokens < 8000 && complexity < 0.6) {
    return MODELS.ollama;  // Free when possible
  }
  if (tokens < 20000 && complexity < 0.4) {
    return MODELS.haiku;  // Cheap for simple tasks
  }
  if (tokens < 100000) {
    return MODELS.sonnet;  // Balanced for most tasks
  }
  return MODELS.opus;  // Best for complex tasks
}
```

---

### 2.6 MCP Server

**Purpose**: Expose PRISM capabilities to Claude Code via MCP protocol

**Technology**: Python FastMCP or TypeScript MCP SDK

**Exposed Tools**:
```typescript
const MCP_TOOLS = {
  search_repo: {
    description: 'Search codebase using semantic vector similarity',
    input: {
      query: 'string',
      limit: 'number (default: 10)',
      threshold: 'number (default: 0.7)',
    },
    output: {
      results: 'array of matches',
      file_path: 'string',
      score: 'number',
      snippet: 'string',
    },
  },

  optimize_context: {
    description: 'Optimize context selection for token efficiency',
    input: {
      query: 'string',
      max_tokens: 'number (default: 50000)',
    },
    output: {
      selected_files: 'array',
      total_tokens: 'number',
      estimated_coverage: 'number',
    },
  },

  get_usage_stats: {
    description: 'Get token usage statistics and savings',
    output: {
      tokens_saved: 'number',
      percentage: 'number',
      queries_made: 'number',
    },
  },
};
```

**Key Files**:
- `/src/mcp/server.ts` - MCP server implementation
- `/src/mcp/tools.ts` - Tool definitions
- `.mcp.json` - Claude Code configuration

---

### 2.7 Sync Service

**Purpose**: Synchronize local data with Cloudflare services

**Technology**: Cloudflare Workers + Vectorize + D1 + R2 + KV

**Responsibilities**:
- Upload embeddings to Vectorize
- Sync metadata to D1
- Cache frequently accessed data in KV
- Archive large artifacts to R2
- Handle conflicts and incremental updates

**Sync Strategy**:
```typescript
interface SyncStrategy {
  // Primary: Local-first with cloud backup
  local: {
    primary: true,
    operations: ['index', 'search', 'chat'],
    fallback: 'cloud',
  },

  // Secondary: Cloud sync for persistence
  cloud: {
    primary: false,
    operations: ['backup', 'multi-device', 'analytics'],
    trigger: 'on_change',
  },

  // Conflict resolution
  conflicts: {
    strategy: 'local_wins',  // Local changes take precedence
    backup: 'keep_both',     // Keep conflicting versions
  },
}
```

---

## 3. Technology Rationale

### 3.1 Why Rust for Indexer?

**Decision**: Use Rust compiled to WASM for code parsing

**Rationale**:

| Factor | Rust + WASM | Alternative | Why Chosen |
|--------|-------------|-------------|------------|
| **Performance** | 10x faster than JS | JavaScript parsers | Handles 100K+ LOC efficiently |
| **Memory** | Deterministic, low overhead | V8 garbage collection | Predictable memory usage |
| **Tree-sitter** | Native Rust support | C bindings | Best grammar ecosystem |
| **Portability** | Runs anywhere with WASM | Native binaries | No installation required |
| **Safety** | Memory safe | C/C++ | Prevents security issues |
| **Size** | <1MB compiled | Varies | Fast download |

**Trade-offs**:
- 45% slower than native (acceptable)
- Requires WASM toolchain (mitigated: wasm-pack)
- Learning curve (mitigated: excellent docs)

---

### 3.2 Why Node.js for Proxy?

**Decision**: Use TypeScript/Node.js for main application logic

**Rationale**:

| Factor | Node.js/TS | Alternative | Why Chosen |
|--------|------------|-------------|------------|
| **MCP SDK** | Official support | Python, Rust | Native MCP integration |
| **Cloudflare** | Workers support | Rust, Go | First-class Cloudflare SDK |
| **TypeScript** | Type safety | JavaScript | Better developer experience |
| **Ecosystem** | Rich npm packages | Other runtimes | Wide library availability |
| **Async I/O** | Non-blocking | Other | Efficient for API calls |
| **Team Skills** | Widely known | Less common | Easier hiring/onboarding |

**Trade-offs**:
- Higher memory than Rust (acceptable for orchestration layer)
- Single-threaded (mitigated: worker threads for heavy tasks)

---

### 3.3 Why SQLite + Vectorize?

**Decision**: Hybrid local + cloud vector storage

**Rationale**:

**SQLite (Local)**:
- Zero configuration
- Fast queries (<100ms)
- Offline capability
- Free tier unlimited

**Vectorize (Cloud)**:
- Persistent storage
- Multi-device sync
- Shared team indexes
- Analytics

**Hybrid Benefits**:
```
Development:  SQLite only (fast, local)
Production:    SQLite + Vectorize sync
Offline:       SQLite cache
Collaboration: Vectorize shared index
```

---

### 3.4 Why MCP Protocol?

**Decision**: Integrate with Claude Code via Model Context Protocol

**Rationale**:

| Benefit | Explanation |
|---------|-------------|
| **Standard** | Open protocol, not vendor-specific |
| **Discovery** | Automatic tool detection |
| **Type Safety** | JSON Schema validation |
| **Streaming** | Support for long-running operations |
| **Resources** | Rich data source support |
| **Future-Proof** | Extensible design |

**Alternative Considered**: Direct Claude API integration
**Why Not**: Tightly coupled, less flexible, missing resource model

---

### 3.5 Why BGE-small-en-v1.5?

**Decision**: Use BGE-small-en-v1.5 (384 dimensions) for embeddings

**Rationale**:

| Factor | BGE-small (384d) | BGE-base (768d) | Code-specific |
|--------|------------------|-----------------|--------------|
| **Cost** | $0.020/M tokens | $0.040/M tokens | Not on CF Workers |
| **Storage** | 1.5 GB (1M vectors) | 3 GB (1M vectors) | Varies |
| **Latency** | 1.5x faster | Baseline | Varies |
| **Quality** | Competitive with larger | Best | +20% for code |
| **Free Tier** | 318K chunks/month | 159K chunks/month | N/A |

**Why BGE-small over Code-specific**:
- 90%+ of quality, 50% of cost
- Cloudflare Workers AI integration
- Sufficient for code search
- Fallback to local Ollama for precision tasks

---

## 4. Design Principles

### 4.1 Local-First with Cloud Sync

**Principle**: Prioritize local operations, sync to cloud asynchronously

**Benefits**:
- Fast response times (<100ms local vs >500ms cloud)
- Offline capability
- Privacy by default
- Cost efficiency

**Implementation**:
```typescript
// Default: Local storage
const storage = new LocalVectorStore();

// Background: Sync to cloud
async function syncToCloud() {
  if (navigator.onLine && hasCloudConfig()) {
    await cloudSync.uploadChanges(storage.getChanges());
  }
}

// Fallback: Use cloud cache when local unavailable
async function searchWithFallback(query: string) {
  try {
    return await storage.search(query);
  } catch (error) {
    return await cloudCache.search(query);
  }
}
```

---

### 4.2 Progressive Enhancement

**Principle**: Core functionality works without advanced features

**MVP (v0.1)**:
- Local indexing (Tree-sitter)
- Local vector DB (SQLite)
- Manual Ollama routing
- Basic MCP tools

**Enhanced (v0.2+)**:
- Cloud sync (Vectorize)
- Auto routing
- Learning system
- Token dashboard

**Pro (v0.3+)**:
- GPU acceleration
- Team features
- Custom models

---

### 4.3 Free Tier Optimization

**Principle**: Every design decision considers Cloudflare's free tier

**Daily Targets** (50% of limits for safety):
```typescript
const FREE_TIER_TARGETS = {
  workers_requests: 50_000,      // 100K limit
  ai_neurons: 5_000,             // 10K limit
  kv_reads: 50_000,              // 100K limit
  kv_writes: 500,                // 1K limit
  d1_reads: 2_500_000,           // 5M limit
  d1_writes: 50_000,             // 100K limit
  r2_storage: 5,                 // 10GB limit
  vectorize_stored: 2_500_000,   // 5M dimensions
  vectorize_queried: 15_000_000, // 30M dimensions
};
```

**Optimization Strategies**:
- Cache embeddings (avoid recomputation)
- Batch operations (reduce API calls)
- Incremental updates (index only changed files)
- Smart routing (use free models when possible)

---

### 4.4 Fail-Safe Defaults

**Principle**: System works even when external services fail

**Fallback Hierarchy**:
```typescript
const FALLBACK_CHAIN = {
  embeddings: [
    'cloudflare_workers_ai',  // Primary: Fast, edge
    'ollama_local',           // Fallback: Free, local
    'skip_embeddings',        // Last resort: Keyword search
  ],

  storage: [
    'sqlite_local',           // Primary: Fast, local
    'cloudflare_vectorize',   // Fallback: Persistent
    'in_memory',              // Last resort: Session-only
  ],

  llm: [
    'ollama_local',           // Primary: Free
    'claude_haiku',           // Fallback: Cheap
    'claude_sonnet',          // Last resort: Quality
  ],
};
```

---

### 4.5 Transparency and Observability

**Principle**: Users always know what's happening and why

**Metrics Exposed**:
- Tokens used vs saved
- Embeddings generated
- Cache hit rates
- Model selection reasons
- Cost breakdown

**Example Dashboard**:
```typescript
interface UsageStats {
  session: {
    queries: number,
    tokensUsed: number,
    tokensSaved: number,
    savingsPercentage: number,
    costSaved: number,
  },
  lastQuery: {
    model: string,
    reason: string,
    tokens: number,
    duration: number,
  },
  cache: {
    hitRate: number,
    embeddingsCached: number,
    searchesCached: number,
  },
}
```

---

## 5. Deployment Architecture

### 5.1 Development Environment

```
Developer Machine
├── PRISM CLI (local)
├── SQLite (local vector DB)
├── Tree-sitter WASM (local parsing)
├── Ollama (optional local LLM)
└── File system (codebase access)
```

**Setup**:
```bash
# Install PRISM
npm install -g @vantage/cli

# Initialize project
cd my-project
vantage init

# Index codebase
vantage index

# Search
vantage search "authentication flow"
```

---

### 5.2 Production Environment (Cloudflare Workers)

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                       │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                   API Gateway Worker                    │ │
│  │  • Authentication                                     │ │
│  │  • Rate limiting                                      │ │
│  │  • Request routing                                    │ │
│  └─────────────────┬─────────────────────────────────────┘ │
│                    │                                       │
│  ┌─────────────────┴─────────────────────────────────────┐ │
│  │                 Services Layer                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │ │
│  │  │ Embedding│  │ Vector   │  │ Optimizer│           │ │
│  │  │ Service  │  │ Service  │  │ Service  │           │ │
│  │  └──────────┘  └──────────┘  └──────────┘           │ │
│  └───────────────────────────────────────────────────────┘ │
│                    │                                       │
│  ┌─────────────────┴─────────────────────────────────────┐ │
│  │                 Storage Layer                          │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │ │
│  │  │ Vectorize│  │    D1    │  │    KV    │           │ │
│  │  └──────────┘  └──────────┘  └──────────┘           │ │
│  │  ┌──────────┐  ┌──────────┐                           │ │
│  │  │    R2    │  │  Queues  │                           │ │
│  │  └──────────┘  └──────────┘                           │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Deployment**:
```bash
# Build Worker
npm run build:worker

# Deploy to Cloudflare
wrangler deploy

# Create Vectorize index
wrangler vectorize create vantage-codebase-prod \
  --dimensions=384 \
  --metric=cosine
```

---

### 5.3 Hybrid Deployment

```
┌──────────────────────┐         ┌──────────────────────┐
│   Local Developer    │         │   Cloudflare Cloud   │
│                      │         │                      │
│  • CLI Interface     │◀───────▶│  • API Gateway       │
│  • SQLite Cache      │  Sync   │  • Vectorize         │
│  • Tree-sitter WASM  │         │  • D1 Metadata       │
│  • Ollama LLM        │         │  • Workers AI        │
└──────────────────────┘         └──────────────────────┘
         │                               │
         │                               │
         └─────────────►                 ◄──────────────┘
              Fallback                    Backup
```

**Sync Strategy**:
1. **Primary Operations**: Local (fast, offline-capable)
2. **Background Sync**: Upload to cloud when available
3. **Cloud Backup**: Persistent storage for multi-device
4. **Smart Fallback**: Use cloud cache when local unavailable

---

## 6. Key Metrics

### 6.1 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Indexing Speed** | <30s for 100K LOC | Time to complete `vantage index` |
| **Search Latency** | <200ms P95 | Time from query to results |
| **Token Savings** | >90% | Optimized vs full context |
| **Memory Usage** | <100MB for 1M LOC | Peak memory during indexing |
| **WASM Size** | <1MB | Downloaded module size |
| **Cold Start** | <10ms | Worker initialization |

### 6.2 Quality Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Search Relevance** | >85% P@1 | Precision at top result |
| **Compression Quality** | <5% meaning loss | User evaluation |
| **Uptime** | 99.9% | Service availability |
| **Error Rate** | <0.1% | Failed requests |

---

## 7. Architecture Decision Records

### ADR-001: Rust WASM for Indexer

**Status**: Accepted (2026-01-13)

**Context**: Need fast, portable code parsing for multiple languages

**Decision**: Use Rust + Tree-sitter compiled to WASM

**Consequences**:
- Positive: Fast, portable, memory-safe
- Negative: 45% slower than native, WASM complexity
- Mitigation: Still 10x faster than JS, wasm-pack simplifies build

---

### ADR-002: SQLite for Local Storage

**Status**: Accepted (2026-01-13)

**Context**: Need local vector storage with zero configuration

**Decision**: Use SQLite with FTS5 extension

**Consequences**:
- Positive: Built-in, fast, reliable
- Negative: Limited to ~100K vectors
- Mitigation: Cloud sync for larger datasets

---

### ADR-003: BGE-small for Embeddings

**Status**: Accepted (2026-01-13)

**Context**: Need cost-effective embeddings for code search

**Decision**: Use BGE-small-en-v1.5 (384 dimensions)

**Consequences**:
- Positive: Cheap, fast, good quality
- Negative: Not code-specific
- Mitigation: Fallback to nomic-embed-code for precision

---

### ADR-004: MCP for Claude Code Integration

**Status**: Accepted (2026-01-13)

**Context**: Need standard protocol for Claude Code integration

**Decision**: Use Model Context Protocol

**Consequences**:
- Positive: Standard, extensible, rich features
- Negative: Learning curve
- Mitigation: Good documentation, examples

---

## 8. Next Steps

1. **Validate Architecture** - Review with team
2. **Prototype MVP** - Implement core features
3. **Test Integration** - Claude Code + MCP server
4. **Measure Performance** - Benchmark against targets
5. **Iterate** - Refine based on feedback

---

**Document Status**: Complete
**Last Updated**: 2026-01-13
**Next Review**: After MVP implementation
