# PRISM - System Architecture

A Cloudflare Worker-powered AI companion for Claude Code that maximizes free tier usage.

## Project Overview

**PRISM** is a serverless AI assistant built entirely on Cloudflare's free tier, designed to integrate with Claude Code and provide:

- **RAG-powered code assistance** - Search and retrieve relevant code context
- **Document management** - Store, index, and query documentation
- **Persistent memory** - Remember conversations and preferences
- **Real-time collaboration** - Share sessions with Durable Objects
- **Multi-model routing** - Smart routing to optimal AI models

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLOUDFLARE EDGE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                        API GATEWAY WORKER                           │     │
│  │  • Authentication                                                  │     │
│  │  • Rate limiting (KV-backed)                                       │     │
│  │  • Request routing                                                 │     │
│  │  • Response caching                                                │     │
│  └───────────┬────────────────────────────────────────────────────────┘     │
│              │                                                              │
│              ▼                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                      ORCHESTRATION WORKER                           │     │
│  │  • Multi-model routing (smallest model for task)                   │     │
│  │  • RAG pipeline orchestration                                      │     │
│  │  • Context management                                              │     │
│  │  • Response generation                                             │     │
│  └───────────┬────────────────────────────────────────────────────────┘     │
│              │                                                              │
│      ┌───────┴───────────┬───────────────┬──────────────┬────────────┐     │
│      ▼                   ▼               ▼              ▼            ▼     │
│  ┌─────────┐      ┌──────────┐    ┌─────────┐   ┌─────────┐  ┌─────────┐  │
│  │ VECTOR  │      │    D1    │    │   KV    │   │   R2    │  │ DURABLE │  │
│  │  SEARCH │      │ DATABASE │    │  CACHE  │   │ STORAGE │  │ OBJECTS │  │
│  │         │      │          │    │         │   │         │  │         │  │
│  │ Vectorize│     │ • Docs   │    │ • Config│   │ • Files │  │ • State │  │
│  │ + AI    │      │ • Users  │    │ • Cache │   │ • Docs  │  │ • Sessions│
│  │         │      │ • Index  │    │ • Rate  │   │ • Models│  │ • WS    │  │
│  └─────────┘      └──────────┘    └─────────┘   └─────────┘  └─────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                │  Workers AI (10K neurons/day)
                                │
                                ▼
                     ┌──────────────────────┐
                     │  AI MODEL ROUTING    │
                     ├──────────────────────┤
                     │ • Llama 3.2 1B      │
                     │   (quick chat)       │
                     │ • Llama 3.1 8B      │
                     │   (general)          │
                     │ • Qwen Coder 32B    │
                     │   (code)             │
                     │ • BGE-small         │
                     │   (embeddings)       │
                     └──────────────────────┘
```

## Core Components

### 1. API Gateway Worker (`api-gateway/`)

**Purpose:** Entry point for all requests

**Responsibilities:**
- Authentication (API key validation)
- Rate limiting (100K requests/day)
- Request routing
- Response caching (KV-backed)
- Request logging

**Endpoints:**
```
POST   /api/chat           - Chat with AI
POST   /api/search         - Semantic search
POST   /api/index          - Index documents
POST   /api/memory         - Manage persistent memory
GET    /api/session/:id    - Get session state
WS     /api/session/:id/ws - WebSocket for real-time
```

**Free Tier Optimization:**
- Cache static responses indefinitely
- Use Cloudflare Cache for static assets
- Minimize dynamic Worker invocations

### 2. Orchestration Worker (`orchestrator/`)

**Purpose:** Core AI logic and model routing

**Responsibilities:**
- Multi-model routing (choose optimal model)
- RAG pipeline execution
- Context window management
- Prompt engineering
- Response generation

**Model Routing Strategy:**

```javascript
const MODEL_ROUTING = {
  // Simple queries - fastest, cheapest
  simple: {
    model: '@cf/meta/llama-3.2-1b-instruct',
    maxTokens: 512,
    neuronsPerToken: 0.002457
  },

  // General chat - balanced
  general: {
    model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
    maxTokens: 2048,
    neuronsPerToken: 0.004119
  },

  // Code tasks - specialized
  code: {
    model: '@cf/qwen/qwen2.5-coder-32b-instruct',
    maxTokens: 4096,
    neuronsPerToken: 0.060
  },

  // Complex reasoning - when needed
  complex: {
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    maxTokens: 4096,
    neuronsPerToken: 0.026668
  },

  // Embeddings
  embedding: {
    model: '@cf/baai/bge-small-en-v1.5',
    dimensions: 384,
    neuronsPerToken: 0.001841
  }
};
```

### 3. Vector Search Service (`vector-search/`)

**Purpose:** Semantic search and retrieval

**Components:**
- Vectorize index (5M free dimensions)
- Workers AI embeddings
- Document chunker
- Reranking (optional)

**Vectorize Schema:**
```javascript
{
  id: "doc-chunk-{uuid}-{index}",
  vector: [384 dimensions],
  metadata: {
    docId: string,
    title: string,
    chunkIndex: number,
    text: string,
    type: "code" | "doc" | "conversation",
    language: string,
    tags: string[],
    createdAt: timestamp
  }
}
```

**Free Tier Strategy:**
- Use BGE-small (384 dimensions) = ~13K chunks max
- Implement time-based eviction for old chunks
- Deduplicate similar content
- Compress metadata

### 4. D1 Database (`database/`)

**Purpose:** Structured data storage

**Schema:**

```sql
-- Documents table
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  language TEXT,
  tags TEXT,
  metadata TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_type ON documents(type);
CREATE INDEX idx_documents_language ON documents(language);
CREATE FULLTEXT INDEX idx_documents_search ON documents(title);

-- Users/Sessions table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  api_key TEXT UNIQUE NOT NULL,
  preferences TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Conversation history
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  messages TEXT, -- JSON array
  context TEXT, -- JSON (relevant docs, etc)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_conversations_user ON conversations(user_id);

-- Usage tracking (for staying in free tier)
CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  metric TEXT NOT NULL, -- 'neurons', 'requests', 'rows_read', etc
  value INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_usage_log_date ON usage_log(date, metric);
```

**Free Tier Strategy:**
- 5M rows read/day = ~150M/month
- 100K rows written/day = ~3M/month
- Archive old conversations to R2
- Aggregate usage logs daily

### 5. KV Cache (`cache/`)

**Purpose:** Hot data and configuration

**Keys:**

```javascript
// Configuration (rarely changes)
KV:config:models           // Model routing config
KV:config:limits           // Free tier limits
KV:config:features         // Feature flags

// Hot cache (frequently accessed)
KV:cache:user:{id}         // User profile
KV:cache:session:{id}      // Active session
KV:cache:doc:{id}          // Hot document metadata
KV:cache:rate:{ip}         // Rate limit counter

// Computed results
KV:cache:search:{hash}     // Search results
KV:cache:embed:{hash}      // Embedding cache
```

**Free Tier Strategy:**
- 100K reads/day = ~3M/month
- 1K writes/day = ~30K/month
- Use for read-heavy operations
- Implement TTL for automatic eviction
- Batch writes when possible

### 6. R2 Storage (`storage/`)

**Purpose:** Large file storage

**Buckets:**

```javascript
// Document storage
R2:documents/{docId}.json          // Full document with chunks
R2:documents/{docId}/original      // Original file (if uploaded)
R2:documents/{docId}/processed     // Processed/extracted text

// Models and assets
R2:models/{name}/metadata.json     // Custom model metadata
R2:assets/{type}/{id}              // Images, files, etc

// Archives
R2:archives/conversations/{date}/{id}.json
R2:archives/usage/{year}/{month}.json
```

**Free Tier Strategy:**
- 10GB storage limit
- 1M Class A operations/month
- No egress fees (major advantage!)
- Compress archived data
- Use for infrequently accessed data

### 7. Durable Objects (`durable-objects/`)

**Purpose:** Real-time stateful sessions

**Use Cases:**
- WebSocket connections for real-time chat
- Session state management
- Collaboration (shared editing)
- Streaming responses

**State Schema:**

```javascript
class SessionDurableObject {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
    this.sessions = new Map();
    this.context = [];
  }

  async fetch(request) {
    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }
  }

  async handleWebSocket(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.sessions.set(client, {
      connectedAt: Date.now(),
      messages: [],
      context: []
    });

    server.addEventListener("message", (event) => {
      this.handleMessage(client, event.data);
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
}
```

**Free Tier Strategy:**
- 100K requests/day
- 13K GB-seconds/day
- Use for active sessions only
- Implement session timeout
- Persist state to D1 when idle

## Data Flow

### 1. Chat Request Flow

```
Client Request
    ↓
API Gateway (auth, rate limit)
    ↓
Orchestrator (route to appropriate model)
    ↓
Vector Search (retrieve relevant context)
    ↓
D1/KV (get session history, user context)
    ↓
Workers AI (generate response)
    ↓
Durable Object (stream response via WebSocket)
    ↓
Update D1 (store conversation)
    ↓
Return response
```

### 2. Document Indexing Flow

```
Upload Document
    ↓
API Gateway
    ↓
Orchestrator (validate, parse)
    ↓
Store in R2 (original)
    ↓
Extract text (if needed)
    ↓
Chunk text (500-1000 token chunks)
    ↓
Workers AI (generate embeddings)
    ↓
Store in Vectorize (vectors)
    ↓
Store in D1 (metadata)
    ↓
Update KV (cache hot docs)
    ↓
Return success
```

### 3. Semantic Search Flow

```
Search Query
    ↓
API Gateway
    ↓
Orchestrator
    ↓
Workers AI (generate query embedding)
    ↓
Vectorize (search similar vectors)
    ↓
Retrieve full documents from R2/D1
    ↓
Optional: Rerank with BGE-reranker
    ↓
Return results
```

## Free Tier Budget Management

### Daily Allocations

| Resource | Daily Limit | Monthly Equivalent | Strategy |
|----------|-------------|-------------------|----------|
| Workers Requests | 100K | 3M | Cache heavily |
| Workers CPU | 10ms/request | - | Optimize code |
| AI Neurons | 10K | 300K | Use small models |
| KV Reads | 100K | 3M | Cache hot data |
| KV Writes | 1K | 30K | Batch writes |
| D1 Rows Read | 5M | 150M | Archive old data |
| D1 Rows Written | 100K | 3M | Efficient inserts |
| R2 Storage | 10GB total | - | Compress data |
| Vectorize Dimensions | 5M stored | - | Evict old |
| Vectorize Queries | 1M/day | 30M | Cache results |

### Monitoring Worker

```javascript
// Track usage and stay within free tier
async function trackUsage(env, metric, value) {
  const date = new Date().toISOString().split('T')[0];

  // Log to D1
  await env.DB.prepare(`
    INSERT INTO usage_log (date, metric, value)
    VALUES (?, ?, ?)
  `).bind(date, metric, value).run();

  // Check if approaching limit
  const stats = await env.DB.prepare(`
    SELECT SUM(value) as total FROM usage_log
    WHERE date = ? AND metric = ?
  `).bind(date, metric).first();

  const LIMITS = {
    neurons: 10000,
    requests: 100000,
    kv_reads: 100000,
    kv_writes: 1000,
    d1_reads: 5000000,
    d1_writes: 100000
  };

  if (stats.total > LIMITS[metric] * 0.9) {
    // Alert: approaching 90% of daily limit
    await sendAlert(env, metric, stats.total, LIMITS[metric]);
  }
}
```

## Performance Optimizations

### 1. Response Caching

```javascript
// Cache AI responses in KV
async function getCachedResponse(env, prompt, model) {
  const hash = await hashPrompt(prompt, model);
  const cached = await env.KV.get(`cache:response:${hash}`, 'json');

  if (cached && Date.now() - cached.timestamp < 3600000) {
    return cached.response; // Cache for 1 hour
  }

  return null;
}

async function setCachedResponse(env, prompt, model, response) {
  const hash = await hashPrompt(prompt, model);
  await env.KV.put(`cache:response:${hash}`, JSON.stringify({
    response,
    timestamp: Date.now()
  }), { expirationTtl: 3600 });
}
```

### 2. Embedding Caching

```javascript
// Cache embeddings to avoid recomputation
async function getEmbedding(env, text) {
  const hash = await sha256(text);
  const cached = await env.KV.get(`cache:embed:${hash}`, 'json');

  if (cached) {
    return cached.embedding;
  }

  const result = await env.AI.run('@cf/baai/bge-small-en-v1.5', { text });
  await env.KV.put(`cache:embed:${hash}`, JSON.stringify({
    embedding: result.data[0]
  }), { expirationTtl: 86400 * 7 }); // Cache for 7 days

  return result.data[0];
}
```

### 3. Batch Operations

```javascript
// Batch D1 writes to minimize row count
async function batchInsert(env, table, rows) {
  const stmt = env.DB.prepare(`
    INSERT INTO ${table} (id, data) VALUES (?, ?)
  `);

  const batch = rows.map(row =>
    stmt.bind(row.id, JSON.stringify(row))
  );

  await env.DB.batch(batch);
}
```

## Security Considerations

1. **API Key Authentication**
   - Validate all requests
   - Store keys in D1 with hashed values
   - Implement rate limiting per key

2. **Input Sanitization**
   - Validate all user inputs
   - Sanitize prompts before sending to AI
   - Limit context window size

3. **Content Moderation**
   - Use Llama Guard for content filtering
   - Implement usage policies
   - Log and review flagged content

4. **Data Privacy**
   - Encrypt sensitive data at rest
   - Implement data retention policies
   - Allow user data deletion

## Deployment Strategy

1. **Development**
   - Use `wrangler dev` for local development
   - Test with reduced limits
   - Use local SQLite for D1 testing

2. **Staging**
   - Deploy to separate account
   - Load test free tier limits
   - Monitor usage patterns

3. **Production**
   - Deploy with production limits
   - Set up alerts for 80% threshold
   - Implement automatic failover

## Sources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)
- [Vectorize Documentation](https://developers.cloudflare.com/vectorize/)
