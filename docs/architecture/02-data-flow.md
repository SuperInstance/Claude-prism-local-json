# Data Flow Architecture

**Component**: PRISM Data Flow Specification
**Status**: Design Document
**Priority**: Foundational
**Last Updated**: 2026-01-13

## Purpose

This document specifies all major data flows in the PRISM system, including query processing, indexing, synchronization, and error handling. Each flow includes ASCII diagrams, step-by-step descriptions, and key decision points.

---

## Table of Contents

1. [Query Flow](#1-query-flow)
2. [Indexing Flow](#2-indexing-flow)
3. [Sync Flow](#3-sync-flow)
4. [Error Handling Flow](#4-error-handling-flow)

---

## 1. Query Flow

### 1.1 Overview

The query flow processes user search queries through intent detection, vector search, relevance scoring, token optimization, and model routing to deliver efficient, context-aware results.

### 1.2 Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER QUERY                                     │
│                          "how does auth work?"                              │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STEP 1: INTENT DETECTION                            │
│                                                                              │
│  Input: Raw query string                                                     │
│  Process:                                                                    │
│    1. Generate embedding for query                                           │
│    2. Classify intent type (bug_fix, feature_add, explain, etc)            │
│    3. Extract entities (file names, symbols, keywords)                      │
│    4. Determine scope (single_file, multi_file, repo_wide)                  │
│    5. Calculate complexity (0-1)                                             │
│                                                                              │
│  Output: QueryIntent object                                                  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STEP 2: VECTOR SEARCH                               │
│                                                                              │
│  Input: QueryIntent                                                          │
│  Process:                                                                    │
│    1. Query embedding for vector search                                      │
│    2. Search Vectorize/SQLite for similar vectors                            │
│    3. Retrieve top-k results (default: 20)                                  │
│    4. Filter by file type, path, language if specified                      │
│    5. Fetch full code chunks from storage                                    │
│                                                                              │
│  Output: ScoredChunk[] (raw results)                                        │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STEP 3: RELEVANCE SCORING                           │
│                                                                              │
│  Input: ScoredChunk[]                                                        │
│  Process:                                                                    │
│    1. Apply multi-factor scoring:                                           │
│       - Semantic similarity (35%)                                           │
│       - File proximity (20%)                                                │
│       - Symbol match (25%)                                                  │
│       - Recency (10%)                                                       │
│       - Usage frequency (5%)                                                │
│       - Dependency graph (3%)                                               │
│       - Language match (2%)                                                 │
│    2. Normalize scores to 0-1                                               │
│    3. Sort by score density (score / token_cost)                            │
│                                                                              │
│  Output: ScoredChunk[] (sorted, filtered)                                   │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 4: BUDGET-CONSTRAINED SELECTION                    │
│                                                                              │
│  Input: ScoredChunk[], budget (tokens)                                      │
│  Process:                                                                    │
│    1. Filter by minimum relevance (default: 0.5)                            │
│    2. Greedy selection within token budget:                                 │
│       a. Select highest score density chunks                                │
│       b. Allow 10% overage for high-value chunks                           │
│       c. Find smaller alternatives if over budget                           │
│    3. Optimize selection (swap for better combinations)                     │
│                                                                              │
│  Output: SelectedChunk[]                                                    │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STEP 5: COMPRESSION                                │
│                                                                              │
│  Input: SelectedChunk[]                                                     │
│  Process:                                                                    │
│    1. Remove comments and docstrings                                        │
│    2. Collapse whitespace                                                   │
│    3. Keep function signatures and key logic                               │
│    4. Add metadata headers (file, lines, reduction %)                      │
│    5. Estimate token count after compression                                │
│                                                                              │
│  Output: CompressedChunk[]                                                  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STEP 6: MODEL SELECTION                            │
│                                                                              │
│  Input: Token count, complexity score                                       │
│  Process:                                                                    │
│    1. Check Ollama availability                                              │
│    2. Apply decision tree:                                                  │
│       - tokens < 8K AND complexity < 0.6 → Ollama (free)                    │
│       - tokens < 20K AND complexity < 0.4 → Haiku (cheap)                   │
│       - tokens < 100K → Sonnet (balanced)                                   │
│       - tokens >= 100K → Opus (best quality)                                │
│    3. Return selected model with rationale                                  │
│                                                                              │
│  Output: ModelChoice                                                        │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STEP 7: PROMPT RECONSTRUCTION                         │
│                                                                              │
│  Input: CompressedChunk[], ModelChoice                                      │
│  Process:                                                                    │
│    1. Group chunks by file                                                  │
│    2. Build context section with file headers                               │
│    3. Add system prompt with usage instructions                             │
│    4. Combine with original user query                                      │
│    5. Calculate final token count and savings                               │
│                                                                              │
│  Output: OptimizedPrompt                                                    │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STEP 8: LLM INVOCATION                              │
│                                                                              │
│  Input: OptimizedPrompt, ModelChoice                                        │
│  Process:                                                                    │
│    1. Route to selected model:                                              │
│       - Ollama: HTTP to localhost:11434                                    │
│       - Claude API: HTTPS to api.anthropic.com                            │
│       - Workers AI: Internal Cloudflare call                                │
│    2. Stream response if supported                                          │
│    3. Track token usage and duration                                        │
│    4. Handle errors and retries                                             │
│                                                                              │
│  Output: LLMResponse + UsageStats                                           │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RESPONSE TO USER                                  │
│                                                                              │
│  • Answer based on optimized context                                        │
│  • Token savings statistics                                                  │
│  • Model selection rationale                                                 │
│  • Suggestions for further exploration                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Step-by-Step Specification

#### Step 1: Intent Detection

```typescript
interface QueryIntent {
  type: 'bug_fix' | 'feature_add' | 'explain' | 'refactor' | 'test' | 'debug';
  query: string;
  embedding: number[];  // 384 dimensions
  entities: Entity[];
  scope: 'single_file' | 'multi_file' | 'repo_wide';
  complexity: number;  // 0-1
  requiresHistory: boolean;
}

interface Entity {
  type: 'file' | 'symbol' | 'keyword';
  value: string;
  confidence: number;
}
```

**Algorithm**:
```typescript
async function detectIntent(query: string, history: Message[]): Promise<QueryIntent> {
  // 1. Generate embedding
  const embedding = await generateEmbedding(query);

  // 2. Classify intent (simple keyword-based for MVP)
  const type = classifyIntent(query);

  // 3. Extract entities using regex patterns
  const entities = extractEntities(query);

  // 4. Determine scope based on entities
  const scope = determineScope(entities);

  // 5. Calculate complexity (0-1)
  const complexity = calculateComplexity(query, entities);

  // 6. Check if conversation history is needed
  const requiresHistory = needsHistory(type);

  return { type, query, embedding, entities, scope, complexity, requiresHistory };
}
```

---

#### Step 2: Vector Search

```typescript
interface VectorSearchResult {
  chunkId: string;
  filePath: string;
  score: number;  // Cosine similarity
  snippet: string;
  lineRange: [number, number];
}
```

**Algorithm**:
```typescript
async function vectorSearch(intent: QueryIntent): Promise<VectorSearchResult[]> {
  // 1. Search vector database
  const results = await vectorDB.search({
    vector: intent.embedding,
    topK: 20,
    filter: {
      filePath: inferFilePatterns(intent.entities),
      language: inferLanguage(intent.entities),
    },
  });

  // 2. Filter by relevance threshold
  const filtered = results.filter(r => r.score >= 0.6);

  // 3. Fetch full code chunks
  const chunks = await Promise.all(
    filtered.map(r => storage.getChunk(r.chunkId))
  );

  return chunks;
}
```

---

#### Step 3: Relevance Scoring

```typescript
interface ScoredChunk extends CodeChunk {
  relevanceScore: number;  // 0-1
  scoreFactors: {
    semantic: number;
    fileProximity: number;
    symbolMatch: number;
    recency: number;
    frequency: number;
    dependency: number;
    languageMatch: number;
  };
}
```

**Algorithm**:
```typescript
function scoreRelevance(chunk: CodeChunk, intent: QueryIntent, context: SelectionContext): number {
  const features = {
    semantic: chunk.embedding_similarity || 0,
    fileProximity: calculateFileProximity(chunk.filePath, intent.entities),
    symbolMatch: calculateSymbolMatch(chunk.name, intent.entities),
    recency: calculateRecency(chunk.filePath, context.recentFiles),
    frequency: getUsageFrequency(chunk.id, context.usageHistory),
    dependency: isDependency(chunk, intent.entities) ? 1.0 : 0.5,
    languageMatch: intent.preferredLanguage === chunk.language ? 1.0 : 0.7,
  };

  const weights = {
    semantic: 0.35,
    fileProximity: 0.20,
    symbolMatch: 0.25,
    recency: 0.10,
    frequency: 0.05,
    dependency: 0.03,
    languageMatch: 0.02,
  };

  return Object.entries(features).reduce(
    (score, [key, value]) => score + value * weights[key],
    0
  );
}
```

---

#### Step 4: Budget-Constrained Selection

```typescript
interface SelectionConfig {
  budget: number;  // Token budget
  minRelevance: number;  // Minimum relevance threshold (default: 0.5)
  overageAllowance: number;  // Allow 10% overage for high-value chunks
}
```

**Algorithm**:
```typescript
function selectWithinBudget(
  chunks: ScoredChunk[],
  config: SelectionConfig
): ScoredChunk[] {
  const selected: ScoredChunk[] = [];
  let spent = 0;

  // Sort by score density (score per token)
  const sorted = chunks
    .filter(c => c.relevanceScore >= config.minRelevance)
    .sort((a, b) =>
      (b.relevanceScore / b.estimatedTokens) -
      (a.relevanceScore / a.estimatedTokens)
    );

  // Greedy selection
  for (const chunk of sorted) {
    const cost = chunk.estimatedTokens;

    if (spent + cost <= config.budget) {
      selected.push(chunk);
      spent += cost;
    } else if (spent + cost <= config.budget * 1.1) {
      // Allow 10% overage for high-value chunks
      if (chunk.relevanceScore > 0.8) {
        selected.push(chunk);
        spent += cost;
      }
    } else {
      // Try to find a smaller alternative
      const alternative = findSmallerAlternative(chunk, sorted);
      if (alternative && spent + alternative.estimatedTokens <= config.budget) {
        selected.push(alternative);
        spent += alternative.estimatedTokens;
      }
    }

    if (spent >= config.budget * 0.95) break;
  }

  return selected;
}
```

---

#### Step 5: Compression

```typescript
interface CompressedChunk extends CodeChunk {
  compressedContent: string;
  tokens: number;
  originalTokens: number;
  compressionRatio: number;  // tokens / originalTokens
}
```

**Algorithm**:
```typescript
function compressChunk(chunk: CodeChunk, targetTokens: number): CompressedChunk {
  const originalTokens = estimateTokens(chunk.content);

  if (originalTokens <= targetTokens) {
    return {
      ...chunk,
      compressedContent: chunk.content,
      tokens: originalTokens,
      originalTokens,
      compressionRatio: 1.0,
    };
  }

  let compressed = chunk.content;

  // Level 1: Remove comments and docstrings
  compressed = compressed
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '')
    .replace(/#.*/g, '')
    .trim();

  // Level 2: Collapse whitespace
  compressed = compressed.replace(/\s+/g, ' ');

  // Level 3: Keep only signature + key logic
  if (compressed.length > targetTokens * 4) {
    const lines = compressed.split('\n');
    const signature = lines[0];
    const body = lines.slice(1);

    compressed = signature + '\n' +
      body.filter((_, i) => i < 3 || i > body.length - 3).join('\n');
  }

  // Add metadata header
  compressed = `// ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}\n` +
    `// ${chunk.kind}: ${chunk.name}\n` +
    `// (compressed: ${compressed.length} chars, ${((1 - estimateTokens(compressed) / originalTokens) * 100).toFixed(0)}% reduction)\n` +
    compressed;

  return {
    ...chunk,
    compressedContent: compressed,
    tokens: estimateTokens(compressed),
    originalTokens,
    compressionRatio: estimateTokens(compressed) / originalTokens,
  };
}
```

---

#### Step 6: Model Selection

```typescript
interface ModelChoice {
  model: string;
  provider: 'ollama' | 'claude' | 'workers_ai';
  cost: number;  // Estimated USD
  reason: string;
}
```

**Algorithm**:
```typescript
function selectModel(tokens: number, complexity: number, ollamaAvailable: boolean): ModelChoice {
  // Decision tree
  if (ollamaAvailable && tokens < 8000 && complexity < 0.6) {
    return {
      model: 'deepseek-coder-v2',
      provider: 'ollama',
      cost: 0,
      reason: 'Free local model, sufficient for simple tasks',
    };
  }

  if (tokens < 20000 && complexity < 0.4) {
    return {
      model: 'claude-3-haiku-20240307',
      provider: 'claude',
      cost: estimateCost(tokens, 0.00025),
      reason: 'Cheapest Claude, fast enough for simple queries',
    };
  }

  if (tokens < 100000) {
    return {
      model: 'claude-3.5-sonnet-20241022',
      provider: 'claude',
      cost: estimateCost(tokens, 0.003),
      reason: 'Balanced performance and cost',
    };
  }

  return {
    model: 'claude-3-opus-20240229',
    provider: 'claude',
    cost: estimateCost(tokens, 0.015),
    reason: 'Best for complex reasoning, worth the cost',
  };
}
```

---

#### Step 7: Prompt Reconstruction

```typescript
interface OptimizedPrompt {
  prompt: string;
  tokens: number;
  model: string;
  savings: TokenSavings;
  chunksUsed: number;
  confidence: number;
}
```

**Algorithm**:
```typescript
function reconstructPrompt(
  original: string,
  chunks: CompressedChunk[],
  intent: QueryIntent,
  model: ModelChoice
): OptimizedPrompt {
  // Group chunks by file
  const byFile = new Map<string, CompressedChunk[]>();
  for (const chunk of chunks) {
    if (!byFile.has(chunk.filePath)) {
      byFile.set(chunk.filePath, []);
    }
    byFile.get(chunk.filePath)!.push(chunk);
  }

  // Build context section
  let context = '// RELEVANT CODE CONTEXT\n\n';

  for (const [file, fileChunks] of byFile) {
    context += `// File: ${file}\n`;

    for (const chunk of fileChunks.sort((a, b) => a.startLine - b.startLine)) {
      context += `${chunk.compressedContent}\n\n`;
    }
  }

  // Build system prompt
  const system = `You are Claude Code with PRISM super-agent capabilities.

CONTEXT:
The following code snippets are the most relevant parts of the codebase for this query.

${context}

INSTRUCTIONS:
- Use the provided context to answer the query
- If you need additional context, ask for specific files
- Reference line numbers when discussing code
- Consider the compressed format when analyzing`;

  // Combine
  const prompt = `${system}\n\nUSER QUERY:\n${original}`;

  // Calculate statistics
  const tokens = estimateTokens(prompt);
  const originalTokens = estimateTokens(original) +
    chunks.reduce((sum, c) => sum + c.originalTokens, 0);

  return {
    prompt,
    tokens,
    model: model.model,
    savings: {
      tokensSaved: originalTokens - tokens,
      percentage: ((originalTokens - tokens) / originalTokens) * 100,
      costSaved: model.cost * (originalTokens / 1000000),
    },
    chunksUsed: chunks.length,
    confidence: calculateConfidence(chunks, intent),
  };
}
```

---

### 1.4 Error Handling in Query Flow

```typescript
async function handleQueryWithErrorHandling(query: string): Promise<QueryResult> {
  try {
    // Step 1: Intent Detection
    const intent = await detectIntent(query);

    // Step 2: Vector Search (with fallback)
    let results;
    try {
      results = await vectorSearch(intent);
    } catch (error) {
      // Fallback to keyword search
      results = await keywordSearch(intent.query);
    }

    // Step 3: Scoring
    const scored = scoreRelevance(results, intent);

    // Step 4: Selection
    const selected = selectWithinBudget(scored, { budget: 50000 });

    if (selected.length === 0) {
      return {
        error: 'No relevant code found',
        suggestion: 'Try a more specific query or broader search scope',
      };
    }

    // Continue with remaining steps...
    return await processQuery(selected, intent);

  } catch (error) {
    return {
      error: 'Query processing failed',
      details: error.message,
      suggestion: 'Please try again or contact support',
    };
  }
}
```

---

## 2. Indexing Flow

### 2.1 Overview

The indexing flow processes source code files through Tree-sitter parsing, AST extraction, code chunking, embedding generation, and vector storage to build a searchable codebase index.

### 2.2 Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INDEX COMMAND                                     │
│                     prism index --path ./src                               │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 1: FILE DISCOVERY                                │
│                                                                              │
│  Process:                                                                    │
│    1. Scan directory recursively                                             │
│    2. Filter by file extensions (.ts, .js, .py, .rs, .go, .java)          │
│    3. Exclude patterns (node_modules, .git, dist, build)                   │
│    4. Calculate file hashes (SHA-256)                                       │
│    5. Compare with existing index                                            │
│    6. Identify changed files (new, modified, deleted)                       │
│                                                                              │
│  Output: FileIndex { files: FileInfo[], changed: Set<string> }            │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 2: LANGUAGE DETECTION                            │
│                                                                              │
│  Process:                                                                    │
│    1. Map file extension to language                                        │
│       - .ts, .tsx → TypeScript                                              │
│       - .js, .jsx → JavaScript                                              │
│       - .py → Python                                                        │
│       - .rs → Rust                                                          │
│       - .go → Go                                                            │
│       - .java → Java                                                        │
│    2. Load appropriate Tree-sitter grammar                                   │
│    3. Handle special cases (JSX, TSX, etc)                                  │
│                                                                              │
│  Output: Map<filePath, Language>                                            │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 3: PARALLEL PARSING                               │
│                                                                              │
│  Process:                                                                    │
│    1. For each changed file:                                                │
│       a. Read file content                                                   │
│       b. Initialize Tree-sitter parser for language                         │
│       c. Parse source code to AST                                           │
│       d. Check for syntax errors                                             │
│       e. Extract valid code elements despite errors                         │
│    2. Use worker threads for parallel processing                             │
│    3. Handle parse errors gracefully                                         │
│                                                                              │
│  Output: Map<filePath, ParseTree>                                          │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 4: AST EXTRACTION                                 │
│                                                                              │
│  Process:                                                                    │
│    1. Run Tree-sitter queries to extract:                                   │
│       - Function declarations                                                │
│       - Class declarations                                                   │
│       - Method definitions                                                  │
│       - Import/export statements                                             │
│    2. For each extracted element:                                           │
│       a. Extract name and signature                                         │
│       b. Capture line numbers                                                │
│       c. Extract body content                                                │
│       d. Identify dependencies (imports, calls)                             │
│       e. Extract metadata (async, exported, etc)                           │
│    3. Build structured representation                                         │
│                                                                              │
│  Output: Map<filePath, CodeElement[]>                                      │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 5: SEMANTIC CHUNKING                              │
│                                                                              │
│  Process:                                                                    │
│    1. For each code element:                                                │
│       a. Estimate token count (chars / 4)                                   │
│       b. If element > 512 tokens, split at logical boundaries              │
│       c. Add context (imports, class signature)                            │
│       d. Add overlap (128 tokens) between chunks                            │
│       e. Preserve line numbers and file references                          │
│    2. Generate unique chunk ID                                              │
│    3. Store chunk metadata                                                   │
│                                                                              │
│  Output: Map<chunkId, CodeChunk>                                            │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   STEP 6: EMBEDDING GENERATION                              │
│                                                                              │
│  Process:                                                                    │
│    1. Check embedding cache (by content hash)                               │
│    2. For chunks not in cache:                                              │
│       a. Prepare text (signature + body)                                   │
│       b. Call Cloudflare Workers AI (BGE-small)                            │
│       c. Receive 384-dimensional vector                                     │
│       d. Store in cache                                                     │
│    3. Batch requests (up to 100 chunks per batch)                          │
│    4. Handle rate limits and retries                                        │
│                                                                              │
│  Output: Map<chunkId, Embedding>                                            │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 7: VECTOR STORAGE                                │
│                                                                              │
│  Process:                                                                    │
│    1. For each chunk with embedding:                                        │
│       a. Store vector in SQLite/Vectorize                                  │
│       b. Store metadata (file, lines, language)                            │
│       c. Store full content in R2/D1                                       │
│       d. Index by file, symbol, language                                    │
│    2. Delete old vectors for modified files                                 │
│    3. Update index metadata                                                  │
│                                                                              │
│  Output: IndexStats { chunks: number, vectors: number, size: MB }         │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 8: INDEX COMPLETE                                │
│                                                                              │
│  • Display statistics: files indexed, chunks created, time taken            │
│  • Update local cache                                                        │
│  • Trigger background sync to cloud (if configured)                         │
│  • Show token savings estimate                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Step-by-Step Specification

#### Step 1: File Discovery

```typescript
interface FileInfo {
  path: string;
  hash: string;
  size: number;
  language: string;
  changed: boolean;
}

async function discoverFiles(rootPath: string, existingIndex?: Index): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  // Scan directory recursively
  for await (const entry of walk(rootPath)) {
    // Skip excluded patterns
    if (shouldExclude(entry.path)) continue;

    // Check file extension
    const language = detectLanguage(entry.path);
    if (!language) continue;

    // Calculate hash
    const hash = await calculateHash(entry.path);

    // Check if changed
    const existing = existingIndex?.files[entry.path];
    const changed = !existing || existing.hash !== hash;

    files.push({
      path: entry.path,
      hash,
      size: entry.size,
      language,
      changed,
    });
  }

  return files;
}
```

---

#### Step 3: Parallel Parsing

```typescript
async function parseFiles(files: FileInfo[]): Promise<Map<string, ParseTree>> {
  const results = new Map<string, ParseTree>();

  // Use worker threads for parallel processing
  const workers = Math.min(os.cpus().length, files.length);
  const chunkSize = Math.ceil(files.length / workers);

  const promises = [];
  for (let i = 0; i < workers; i++) {
    const chunk = files.slice(i * chunkSize, (i + 1) * chunkSize);
    promises.push(parseFileChunk(chunk));
  }

  const chunks = await Promise.all(promises);

  for (const chunk of chunks) {
    for (const [path, tree] of Object.entries(chunk)) {
      results.set(path, tree);
    }
  }

  return results;
}
```

---

#### Step 4: AST Extraction

```typescript
interface CodeElement {
  id: string;
  type: 'function' | 'class' | 'method' | 'variable';
  name: string;
  signature: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startByte: number;
  endByte: number;
  metadata: {
    async: boolean;
    exported: boolean;
    static: boolean;
    visibility: string;
  };
  dependencies: string[];
}

async function extractElements(tree: ParseTree, source: string): Promise<CodeElement[]> {
  const elements: CodeElement[] = [];

  // Run Tree-sitter queries
  const query = tree.sitterLanguage.query(`
    (function_declaration) @func
    (class_declaration) @class
    (method_definition) @method
  `);

  const matches = query.matches(tree.rootNode);

  for (const match of matches) {
    for (const capture of match.captures) {
      const node = capture.node;
      const element = extractElement(node, source, capture.name);
      elements.push(element);
    }
  }

  return elements;
}
```

---

#### Step 5: Semantic Chunking

```typescript
interface CodeChunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  estimatedTokens: number;
  metadata: {
    language: string;
    elementName: string;
    elementType: string;
  };
  context: {
    imports: string[];
    className?: string;
  };
}

function chunkElements(elements: CodeElement[]): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const targetTokens = 512;
  const overlap = 128;

  for (const element of elements) {
    const tokens = estimateTokens(element.content);

    if (tokens <= targetTokens) {
      // Single chunk
      chunks.push(createChunk(element));
    } else {
      // Split large element
      const subChunks = splitLargeElement(element, targetTokens, overlap);
      chunks.push(...subChunks);
    }
  }

  return chunks;
}
```

---

#### Step 6: Embedding Generation

```typescript
interface EmbeddingCache {
  get(hash: string): Promise<Embedding | null>;
  set(hash: string, embedding: Embedding): Promise<void>;
}

async function generateEmbedings(
  chunks: CodeChunk[],
  cache: EmbeddingCache
): Promise<Map<string, Embedding>> {
  const embeddings = new Map<string, Embedding>();

  // Batch processing
  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);

    const promises = batch.map(async (chunk) => {
      const hash = hashContent(chunk.content);

      // Check cache
      const cached = await cache.get(hash);
      if (cached) return { chunkId: chunk.id, embedding: cached };

      // Generate new embedding
      const text = `${chunk.metadata.elementName}\n${chunk.content}`;
      const embedding = await workersAI.run('@cf/baai/bge-small-en-v1.5', { text });

      // Cache result
      await cache.set(hash, embedding);

      return { chunkId: chunk.id, embedding: embedding.data[0] };
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      embeddings.set(result.chunkId, result.embedding);
    }
  }

  return embeddings;
}
```

---

### 2.4 Error Handling in Indexing Flow

```typescript
async function indexWithErrorHandling(rootPath: string): Promise<IndexResult> {
  const stats = {
    totalFiles: 0,
    indexedFiles: 0,
    failedFiles: 0,
    totalChunks: 0,
    duration: 0,
  };

  const startTime = Date.now();

  try {
    // Step 1: File Discovery
    const files = await discoverFiles(rootPath);
    stats.totalFiles = files.length;

    // Step 2-7: Process files with error handling
    for (const file of files) {
      try {
        // Parse and extract
        const elements = await parseAndExtract(file);
        stats.indexedFiles++;

        // Chunk and embed
        const chunks = chunkElements(elements);
        stats.totalChunks += chunks.length;

        const embeddings = await generateEmbeddings(chunks);

        // Store
        await storeVectors(chunks, embeddings);

      } catch (error) {
        stats.failedFiles++;
        console.error(`Failed to index ${file.path}:`, error.message);

        // Continue with next file
        continue;
      }
    }

    stats.duration = Date.now() - startTime;

    return {
      success: true,
      stats,
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      stats,
    };
  }
}
```

---

## 3. Sync Flow

### 3.1 Overview

The sync flow handles bidirectional synchronization between local storage (SQLite) and cloud services (Cloudflare Vectorize, D1, R2, KV), with conflict resolution and incremental updates.

### 3.2 Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SYNC TRIGGER                                       │
│                     • Manual: prism sync                                 │
│                     • Automatic: Every 5 minutes                           │
│                     • On change: File modification detected                │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 1: CHECK CONNECTIVITY                            │
│                                                                              │
│  Process:                                                                    │
│    1. Check internet connectivity                                            │
│    2. Verify Cloudflare API access                                          │
│    3. Check authentication credentials                                       │
│    4. Validate free tier quota remaining                                    │
│                                                                              │
│  Output: SyncStatus { connected: boolean, quotaRemaining: number }        │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
              Connected             Not Connected
                    │                     │
                    ▼                     ▼
          Continue to sync        Schedule retry
                                      in 60 seconds
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 2: DETERMINE CHANGES                             │
│                                                                              │
│  Process:                                                                    │
│    1. Compare local index with cloud timestamp                              │
│    2. Identify locally changed items (new, modified, deleted)              │
│    3. Identify remotely changed items                                       │
│    4. Detect conflicts (changed in both locations)                         │
│                                                                              │
│  Output: ChangeSet { local: Change[], remote: Change[], conflicts: [] }   │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 3: RESOLVE CONFLICTS                               │
│                                                                              │
│  Strategy: Local-wins (user's local changes take precedence)              │
│                                                                              │
│  Process:                                                                    │
│    1. For each conflict:                                                    │
│       a. Compare timestamps                                                  │
│       b. Keep newer version (default: local)                                │
│       c. Archive conflicting version to R2                                  │
│       d. Record conflict in log                                             │
│    2. Generate conflict report                                              │
│                                                                              │
│  Output: ResolvedChangeSet                                                 │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 4: BATCH UPLOAD CHANGES                            │
│                                                                              │
│  Process:                                                                    │
│    1. Group changes by type:                                                │
│       - Vectors → Vectorize                                                  │
│       - Metadata → D1                                                       │
│       - Blobs → R2                                                          │
│       - Cache → KV                                                         │
│    2. Upload in batches (respect rate limits)                              │
│    3. Track progress and handle failures                                    │
│    4. Retry failed uploads (exponential backoff)                           │
│                                                                              │
│  Output: UploadResult { success: number, failed: number }                 │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 5: DOWNLOAD REMOTE CHANGES                         │
│                                                                              │
│  Process:                                                                    │
│    1. Fetch remote changes since last sync                                  │
│    2. Merge with local index                                                 │
│    3. Update local storage                                                   │
│    4. Invalidate affected caches                                             │
│                                                                              │
│  Output: DownloadResult { received: number, merged: number }              │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 6: UPDATE SYNC STATE                               │
│                                                                              │
│  Process:                                                                    │
│    1. Update last sync timestamp                                            │
│    2. Record sync statistics                                                 │
│    3. Clear pending changes                                                  │
│    4. Update free tier quota tracking                                        │
│                                                                              │
│  Output: SyncState { lastSync: timestamp, pending: number }               │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SYNC COMPLETE                                            │
│                                                                              │
│  • Display sync summary                                                      │
│  • Show quota usage                                                          │
│  • Schedule next sync                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Step-by-Step Specification

#### Step 2: Determine Changes

```typescript
interface Change {
  type: 'create' | 'update' | 'delete';
  itemType: 'vector' | 'metadata' | 'blob';
  id: string;
  localVersion: Version;
  remoteVersion?: Version;
  data?: any;
}

async function determineChanges(
  localIndex: LocalIndex,
  remoteIndex: RemoteIndex
): Promise<ChangeSet> {
  const localChanges: Change[] = [];
  const remoteChanges: Change[] = [];
  const conflicts: Change[] = [];

  // Check local changes
  for (const [id, localItem] of localIndex.entries()) {
    const remoteItem = remoteIndex.get(id);

    if (!remoteItem) {
      // New locally
      localChanges.push({
        type: 'create',
        itemType: localItem.type,
        id,
        localVersion: localItem.version,
        data: localItem.data,
      });
    } else if (localItem.version !== remoteItem.version) {
      // Modified
      if (localItem.timestamp > remoteItem.timestamp) {
        localChanges.push({
          type: 'update',
          itemType: localItem.type,
          id,
          localVersion: localItem.version,
          remoteVersion: remoteItem.version,
          data: localItem.data,
        });
      } else {
        // Remote is newer
        remoteChanges.push({
          type: 'update',
          itemType: remoteItem.type,
          id,
          localVersion: localItem.version,
          remoteVersion: remoteItem.version,
          data: remoteItem.data,
        });
      }
    }
  }

  // Check for remote deletions
  for (const [id, remoteItem] of remoteIndex.entries()) {
    if (!localIndex.has(id)) {
      localChanges.push({
        type: 'delete',
        itemType: remoteItem.type,
        id,
        localVersion: { timestamp: Date.now() },
      });
    }
  }

  return { local: localChanges, remote: remoteChanges, conflicts };
}
```

---

#### Step 3: Resolve Conflicts

```typescript
interface ConflictResolution {
  strategy: 'local_wins' | 'remote_wins' | 'newer_wins' | 'manual';
  keepLocal: boolean;
  archiveRemote: boolean;
}

async function resolveConflicts(
  conflicts: Change[],
  strategy: ConflictResolution
): Promise<ResolvedChangeSet> {
  const resolved: Change[] = [];
  const archived: Change[] = [];

  for (const conflict of conflicts) {
    if (strategy.keepLocal) {
      // Keep local version
      resolved.push({
        ...conflict,
        type: 'update',
        data: conflict.data,
      });

      // Archive remote version
      if (strategy.archiveRemote) {
        await archiveToR2(conflict.id, conflict.remoteVersion);
        archived.push(conflict);
      }
    } else {
      // Keep remote version
      resolved.push({
        ...conflict,
        type: 'delete',  // Will trigger download
      });
    }
  }

  return { resolved, archived };
}
```

---

#### Step 4: Batch Upload Changes

```typescript
async function uploadChanges(changes: Change[]): Promise<UploadResult> {
  const batches = {
    vectors: changes.filter(c => c.itemType === 'vector'),
    metadata: changes.filter(c => c.itemType === 'metadata'),
    blobs: changes.filter(c => c.itemType === 'blob'),
  };

  const results = {
    success: 0,
    failed: 0,
  };

  // Upload vectors to Vectorize
  for (const batch of chunkArray(batches.vectors, 1000)) {
    try {
      await vectorize.upsert(batch.map(c => ({
        id: c.id,
        vector: c.data.embedding,
        metadata: c.data.metadata,
      })));
      results.success += batch.length;
    } catch (error) {
      results.failed += batch.length;
      console.error('Vector upload failed:', error);
    }
  }

  // Upload metadata to D1
  for (const batch of chunkArray(batches.metadata, 100)) {
    try {
      await d1.batch(batch.map(c => c.data));
      results.success += batch.length;
    } catch (error) {
      results.failed += batch.length;
    }
  }

  // Upload blobs to R2
  for (const blob of batches.blobs) {
    try {
      await r2.put(blob.id, blob.data);
      results.success++;
    } catch (error) {
      results.failed++;
    }
  }

  return results;
}
```

---

## 4. Error Handling Flow

### 4.1 Overview

Comprehensive error handling ensures system resilience with appropriate fallbacks, user-friendly error messages, and graceful degradation.

### 4.2 Error Categories

```typescript
enum ErrorCategory {
  NETWORK = 'network',           // Network connectivity issues
  AUTH = 'auth',                 // Authentication failures
  QUOTA = 'quota',               // Rate limit exceeded
  PARSE = 'parse',               // Code parsing errors
  STORAGE = 'storage',           // Database access failures
  LLM = 'llm',                   // LLM API errors
  VALIDATION = 'validation',     // Input validation errors
  UNKNOWN = 'unknown',           // Unexpected errors
}

enum ErrorSeverity {
  LOW = 'low',                   // Warning, continue operation
  MEDIUM = 'medium',             // Degraded service, use fallback
  HIGH = 'high',                 // Critical, stop operation
}
```

### 4.3 Error Handling Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR OCCURS                                     │
│                         error: Error                                       │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 1: CATEGORIZE ERROR                               │
│                                                                              │
│  Process:                                                                    │
│    1. Check error type and code                                             │
│    2. Determine category (network, auth, quota, etc)                        │
│    3. Assess severity (low, medium, high)                                   │
│    4. Check if fallback available                                           │
│                                                                              │
│  Output: ErrorInfo { category, severity, hasFallback: boolean }           │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
              Has Fallback         No Fallback
                    │                     │
                    ▼                     ▼
          Try Fallback           Return Error to User
                    │                     with Helpful Message
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STEP 2: ATTEMPT FALLBACK                              │
│                                                                              │
│  Fallback Chain:                                                            │
│    Embeddings:                                                               │
│      1. Cloudflare Workers AI → Ollama local → Skip embeddings            │
│                                                                              │
│    Storage:                                                                  │
│      1. SQLite → Vectorize → In-memory cache                               │
│                                                                              │
│    LLM:                                                                      │
│      1. Ollama → Claude Haiku → Claude Sonnet → Error                     │
│                                                                              │
│  Process:                                                                    │
│    1. Log fallback attempt                                                   │
│    2. Execute fallback operation                                            │
│    3. Track fallback success rate                                           │
│                                                                              │
│  Output: FallbackResult { success: boolean, method: string }             │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
             Fallback Success      Fallback Failed
                    │                     │
                    ▼                     ▼
          Continue Operation    Return Error with Context
```

### 4.4 Error Handling Examples

#### Network Error

```typescript
async function handleNetworkError(error: Error, operation: string): Promise<any> {
  console.error(`Network error during ${operation}:`, error.message);

  // Check for fallback
  if (operation === 'embeddings') {
    // Try local Ollama
    try {
      return await generateEmbeddingOllama(query);
    } catch (ollamaError) {
      // Skip embeddings, use keyword search
      console.warn('Falling back to keyword search');
      return await keywordSearch(query);
    }
  }

  if (operation === 'storage') {
    // Use local cache
    return await getFromCache(query);
  }

  // No fallback available
  throw new PRISMError(
    'Network operation failed',
    { category: ErrorCategory.NETWORK, severity: ErrorSeverity.HIGH }
  );
}
```

---

#### Quota Exceeded

```typescript
async function handleQuotaError(service: string): Promise<any> {
  console.warn(`${service} quota exceeded, switching to local mode`);

  // Switch to local-only mode
  config.mode = 'local';

  // Notify user
  console.log(`Switched to local mode. Cloud sync will resume tomorrow.`);

  // Schedule retry
  setTimeout(() => {
    console.log('Attempting to reconnect to cloud...');
    checkQuotaAndResume();
  }, 24 * 60 * 60 * 1000);  // 24 hours

  return await executeLocal();
}
```

---

#### Parse Error

```typescript
async function handleParseError(file: FileInfo, error: Error): Promise<ParseResult> {
  console.warn(`Parse error in ${file.path}:`, error.message);

  // Try to extract partial results
  try {
    const partial = await extractValidElements(error.partialTree);
    return {
      success: true,
      partial: true,
      elements: partial,
      warnings: ['File contains syntax errors, partial indexing performed'],
    };
  } catch (extractError) {
    return {
      success: false,
      error: `Failed to parse ${file.path}`,
      suggestions: [
        'Check file for syntax errors',
        'Ensure file is valid source code',
        'Try fixing syntax and re-index',
      ],
    };
  }
}
```

---

### 4.5 Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: {
    message: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    code: string;
    details?: any;
    suggestions?: string[];
    retryable: boolean;
  };
}

function createErrorResponse(
  error: Error,
  category: ErrorCategory,
  severity: ErrorSeverity
): ErrorResponse {
  return {
    success: false,
    error: {
      message: userFriendlyMessage(error, category),
      category,
      severity,
      code: errorCode(category),
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      suggestions: getSuggestions(category),
      retryable: isRetryable(category),
    },
  };
}
```

---

## 5. Flow Optimization

### 5.1 Performance Considerations

**Parallel Processing**:
- File parsing: Use worker threads
- Embedding generation: Batch requests (100 chunks)
- Vector storage: Bulk upsert operations

**Caching**:
- Embedding cache: LRU with 10K entries
- Parse tree cache: Per-file with TTL
- Search results cache: 5-minute TTL

**Incremental Updates**:
- Only process changed files
- Use file hashes to detect changes
- Invalidate affected cache entries

### 5.2 Monitoring Points

```typescript
interface FlowMetrics {
  query: {
    count: number;
    avgDuration: number;
    avgTokensSaved: number;
    cacheHitRate: number;
  };
  indexing: {
    filesProcessed: number;
    chunksCreated: number;
    avgDuration: number;
    errorRate: number;
  };
  sync: {
    lastSync: timestamp;
    changesUploaded: number;
    changesDownloaded: number;
    conflicts: number;
  };
}
```

---

**Document Status**: Complete
**Last Updated**: 2026-01-13
**Next Review**: After MVP implementation
