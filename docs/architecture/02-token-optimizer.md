# Token Optimizer Architecture

**Component**: Token Optimizer
**Status**: Core Algorithm
**Priority**: Critical for MVP

## Purpose

Transform massive codebases (millions of tokens) into minimal, relevant context that fits within Claude's token window while preserving semantic meaning.

**The Problem**: Traditional Claude Code sends entire files/repos as context, quickly hitting the 200K token limit.

**The Solution**: Intelligently compress context by 10-100x using semantic relevance, code analysis, and adaptive compression.

## Interface

```typescript
interface TokenOptimizer {
  /**
   * Reconstruct a prompt with optimized context
   * @param originalPrompt - User's original query
   * @param codebase - All available code chunks (potentially 50K+)
   * @param budget - Remaining token allowance
   * @returns Optimized prompt with compressed context
   */
  reconstructPrompt(
    originalPrompt: string,
    codebase: CodeChunk[],
    budget: number
  ): Promise<OptimizedPrompt>;

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number;

  /**
   * Calculate savings achieved
   */
  calculateSavings(
    original: CodeChunk[],
    compressed: CompressedChunk[]
  ): TokenSavings;
}

interface OptimizedPrompt {
  prompt: string;              // Final prompt to send
  tokens: number;              // Estimated token count
  model: string;               // Recommended model
  savings: TokenSavings;       // Statistics
  chunks_used: number;         // How many chunks selected
  confidence: number;          // 0-1, how confident we are
}

interface CodeChunk {
  id: string;
  file_path: string;
  name: string;                // function/class name
  kind: string;                // 'function', 'class', 'method'
  start_line: number;
  end_line: number;
  content: string;
  signature?: string;          // Extracted signature
  embedding?: number[];        // Pre-computed embedding
  metadata?: {
    language: string;
    imports: string[];
    exports: string[];
    dependencies: string[];
  };
}

interface CompressedChunk extends CodeChunk {
  content: string;             // Compressed content
  tokens: number;              // Token count after compression
  original_tokens: number;     // Token count before compression
  compression_ratio: number;   // tokens / original_tokens
  relevance_score: number;     // 0-1
}

interface TokenSavings {
  tokens_saved: number;
  percentage: number;
  cost_saved: number;          // In USD
}
```

## Algorithm

### Phase 1: Intent Detection

```typescript
async function detectIntent(
  prompt: string,
  conversationHistory: Message[]
): Promise<QueryIntent> {

  // Generate embedding for prompt
  const promptEmbedding = await generateEmbedding(
    prompt + ' ' + conversationHistory.slice(-3).map(m => m.content).join('\n')
  );

  // Classify intent type
  const intentType = classifyIntent(prompt);

  // Extract key entities
  const entities = extractEntities(prompt);

  // Determine search scope
  const scope = determineScope(intentType, entities);

  return {
    type: intentType,          // 'bug_fix', 'feature_add', 'explain', 'refactor'
    query: prompt,
    embedding: promptEmbedding,
    entities,
    scope,                     // 'single_file', 'multi_file', 'repo_wide'
    complexity: calculateComplexity(prompt, entities),
    requires_history: needsHistory(intentType),
  };
}
```

**Intent Types:**

| Type | Pattern | Context Strategy |
|------|---------|------------------|
| `bug_fix` | "fix bug", "error", "not working" | Focus on error handlers, relevant functions |
| `feature_add` | "add", "implement", "create" | Focus on similar features, patterns |
| `explain` | "how does", "what is", "explain" | Broad context, show relationships |
| `refactor` | "refactor", "optimize", "clean up" | Focus on target code + dependents |
| `test` | "test", "spec", "coverage" | Focus on code + existing tests |
| `debug` | "debug", "why", "trace" | Focus on execution path, logs |

### Phase 2: Semantic Search & Retrieval

```typescript
async function retrieveRelevantCode(
  intent: QueryIntent,
  codebase: CodeChunk[]
): Promise<ScoredChunk[]> {

  // Multi-hop retrieval
  const results: ScoredChunk[] = [];

  // Hop 1: Direct semantic search
  const semanticResults = await vectorDB.search(intent.embedding, {
    top_k: 20,
    filter: {
      file_types: inferFileTypes(intent.entities),
    }
  });
  results.push(...semanticResults);

  // Hop 2: Expand to related files (import graph)
  const relatedFiles = findRelatedFiles(
    semanticResults.map(r => r.file_path)
  );
  const relatedChunks = codebase.filter(c =>
    relatedFiles.includes(c.file_path)
  );
  results.push(...relatedChunks.map(c => ({
    ...c,
    relevance_score: c.embedding_similarity * 0.7, // Lower weight
    source: 'related_files'
  })));

  // Hop 3: Symbol definitions
  const symbols = extractSymbols(intent.entities);
  for (const symbol of symbols) {
    const defChunks = codebase.filter(c => c.name === symbol);
    results.push(...defChunks.map(c => ({
      ...c,
      relevance_score: 0.8,
      source: 'symbol_definition'
    })));
  }

  // Deduplicate and merge scores
  return mergeAndDeduplicate(results);
}
```

### Phase 3: Relevance Scoring

```typescript
function scoreRelevance(
  chunk: CodeChunk,
  intent: QueryIntent,
  context: SelectionContext
): number {

  const features = {
    // Semantic similarity (pre-computed)
    semantic: chunk.embedding_similarity || 0,

    // File proximity to entities mentioned
    fileProximity: calculateFileProximity(
      chunk.file_path,
      intent.entities
    ),

    // Symbol name match
    symbolMatch: calculateSymbolMatch(
      chunk.name,
      intent.entities
    ),

    // Recency (recently edited files)
    recency: calculateRecency(chunk.file_path, context.recentFiles),

    // Usage frequency (learned from past)
    frequency: getUsageFrequency(chunk.id, context.usageHistory),

    // Dependency graph position
    dependency: chunk.metadata?.dependencies?.includes(
      ...intent.entities.map(e => e.name)
    ) ? 1.0 : 0.5,

    // Language match
    languageMatch: intent.preferredLanguage === chunk.metadata?.language ? 1.0 : 0.7,
  };

  // Weighted sum (tunable based on feedback)
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

### Phase 4: Budget-Constrained Selection

```typescript
function selectChunksWithinBudget(
  chunks: ScoredChunk[],
  budget: number,
  minRelevance: number = 0.5
): ScoredChunk[] {

  const selected: ScoredChunk[] = [];
  let spent = 0;

  // Sort by score density (score per token)
  const sorted = chunks
    .filter(c => c.relevance_score >= minRelevance)
    .sort((a, b) =>
      (b.relevance_score / b.estimated_tokens) -
      (a.relevance_score / a.estimated_tokens)
    );

  // Greedy selection
  for (const chunk of sorted) {
    const cost = chunk.estimated_tokens;

    if (spent + cost <= budget) {
      selected.push(chunk);
      spent += cost;
    } else if (spent + cost <= budget * 1.1) {
      // Allow 10% overage for high-value chunks
      if (chunk.relevance_score > 0.8) {
        selected.push(chunk);
        spent += cost;
      }
    } else {
      // Try to find a smaller alternative
      const alternative = findSmallerAlternative(chunk, sorted);
      if (alternative && spent + alternative.estimated_tokens <= budget) {
        selected.push(alternative);
        spent += alternative.estimated_tokens;
      }
    }

    if (spent >= budget * 0.95) break;
  }

  // Optimize selection (swap if better combination exists)
  return optimizeSelection(selected, sorted, budget);
}

function findSmallerAlternative(
  chunk: ScoredChunk,
  candidates: ScoredChunk[]
): ScoredChunk | null {
  // Find a chunk from the same file with fewer tokens
  return candidates.find(c =>
    c.file_path === chunk.file_path &&
    c.estimated_tokens < chunk.estimated_tokens * 0.5 &&
    c.relevance_score >= chunk.relevance_score * 0.8
  ) || null;
}
```

### Phase 5: Adaptive Compression

```typescript
function compressChunk(
  chunk: CodeChunk,
  targetTokens: number,
  compressionLevel: 'light' | 'medium' | 'aggressive'
): CompressedChunk {

  const originalTokens = estimateTokens(chunk.content);

  if (originalTokens <= targetTokens) {
    return {
      ...chunk,
      tokens: originalTokens,
      original_tokens: originalTokens,
      compression_ratio: 1.0,
      relevance_score: 1.0,
    };
  }

  let compressed = chunk.content;

  // Level 1: Remove comments and docstrings
  if (compressionLevel !== 'light') {
    compressed = compressed
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')
      .replace(/#.*/g, '')
      .trim();
  }

  // Level 2: Collapse whitespace
  compressed = compressed.replace(/\s+/g, ' ');

  // Level 3: Keep only signature + key logic
  if (compressionLevel === 'aggressive') {
    const lines = compressed.split('\n');
    const signature = lines[0];
    const body = lines.slice(1);

    // Keep first and last lines of each block
    compressed = signature + '\n' +
      body.filter((_, i) => i < 3 || i > body.length - 3).join('\n');
  }

  // Add metadata header
  compressed = `// ${chunk.file_path}:${chunk.start_line}-${chunk.end_line}\n` +
    `// ${chunk.kind}: ${chunk.name}\n` +
    `// (compressed: ${compressed.length} chars, ${((1 - estimateTokens(compressed) / originalTokens) * 100).toFixed(0)}% reduction)\n` +
    compressed;

  const compressedTokens = estimateTokens(compressed);

  return {
    ...chunk,
    content: compressed,
    tokens: compressedTokens,
    original_tokens: originalTokens,
    compression_ratio: compressedTokens / originalTokens,
    relevance_score: calculateCompressionQuality(chunk, compressed),
  };
}
```

### Phase 6: Model Selection

```typescript
function selectModel(
  tokens: number,
  complexity: number,
  ollamaAvailable: boolean
): ModelChoice {

  const characteristics = {
    tokenCount: tokens,
    complexity,      // 0-1
    requiresReasoning: complexity > 0.7,
    requiresCodeGen: complexity > 0.5,
  };

  // Decision tree
  if (ollamaAvailable && tokens < 8000 && complexity < 0.6) {
    return {
      model: 'ollama:deepseek-coder-v2',
      reasoning: 'Free local model, sufficient for simple tasks',
      cost: 0,
    };
  }

  if (tokens < 20000 && complexity < 0.4) {
    return {
      model: 'claude-3-haiku-20240307',
      reasoning: 'Cheapest Claude, fast enough for simple queries',
      cost: estimateCost(tokens, 0.00025),
    };
  }

  if (tokens < 100000 || complexity < 0.8) {
    return {
      model: 'claude-3.5-sonnet-20241022',
      reasoning: 'Balanced performance and cost',
      cost: estimateCost(tokens, 0.003),
    };
  }

  return {
    model: 'claude-3-opus-20240229',
    reasoning: 'Best for complex reasoning, worth the cost',
    cost: estimateCost(tokens, 0.015),
  };
}
```

### Phase 7: Prompt Reconstruction

```typescript
function reconstructPrompt(
  original: string,
  chunks: CompressedChunk[],
  intent: QueryIntent
): string {
  // Group chunks by file
  const byFile = new Map<string, CompressedChunk[]>();
  for (const chunk of chunks) {
    if (!byFile.has(chunk.file_path)) {
      byFile.set(chunk.file_path, []);
    }
    byFile.get(chunk.file_path)!.push(chunk);
  }

  // Build context section
  let context = '// RELEVANT CODE CONTEXT\n\n';

  for (const [file, fileChunks] of byFile) {
    context += `// File: ${file}\n`;

    for (const chunk of fileChunks.sort((a, b) =>
      a.start_line - b.start_line
    )) {
      context += `${chunk.content}\n\n`;
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
  return `${system}\n\nUSER QUERY:\n${original}`;
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT                                    │
│  - original_prompt: string                                      │
│  - codebase: CodeChunk[] (50,000+ chunks)                       │
│  - budget: 50,000 tokens                                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: Intent Detection                                      │
│  - Classify query type (bug_fix, feature_add, etc)              │
│  - Extract entities (file names, symbols)                       │
│  - Determine scope (single_file, multi_file, repo_wide)         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: Semantic Search & Retrieval                           │
│  - Vector search for relevant chunks                            │
│  - Expand to related files (imports/dependencies)               │
│  - Find symbol definitions                                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: Relevance Scoring                                     │
│  - Score each chunk by multiple factors                         │
│  - Weight: semantic (35%), proximity (20%), symbol (25%)        │
│  - Sort by score density (score / token_cost)                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: Budget-Constrained Selection                          │
│  - Greedy selection within token budget                         │
│  - Try smaller alternatives if over budget                     │
│  - Optimize selection (swap for better combinations)            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 5: Adaptive Compression                                  │
│  - Remove comments/docstrings                                   │
│  - Collapse whitespace                                          │
│  - Keep signature + key logic                                   │
│  - Add metadata header (file, lines, reduction %)               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 6: Model Selection                                       │
│  - Route to Ollama if free and simple                           │
│  - Route to Haiku if cheap and sufficient                       │
│  - Route to Sonnet/Opus for complex tasks                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 7: Prompt Reconstruction                                 │
│  - Group chunks by file                                         │
│  - Build context section with compressed chunks                 │
│  - Combine with system prompt and user query                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        OUTPUT                                   │
│  - prompt: string (optimized, ~2,000 tokens)                    │
│  - tokens: 2,000                                                │
│  - model: 'claude-3.5-sonnet'                                   │
│  - savings: { tokens_saved: 48,000, percentage: 96% }           │
│  - chunks_used: 15                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Edge Cases

### 1. No Relevant Code Found

```typescript
if (scoredChunks.length === 0 || scoredChunks[0].relevance_score < 0.3) {
  return {
    prompt: originalPrompt, // Pass through unchanged
    warning: 'No highly relevant code found. Proceeding without context.',
    confidence: 0.3,
  };
}
```

### 2. Budget Too Small

```typescript
if (budget < 1000) {
  // Use signature-only approach
  const signatures = chunks.map(c => ({
    file: c.file_path,
    name: c.name,
    signature: c.signature,
  }));

  return {
    prompt: `CODEBASE SIGNATURES:\n${JSON.stringify(signatures, null, 2)}\n\n${originalPrompt}`,
    tokens: budget,
    warning: 'Budget too small for full context. Providing signatures only.',
  };
}
```

### 3. Very Large Files

```typescript
if (chunk.end_line - chunk.start_line > 500) {
  // Split large chunks into smaller pieces
  const subChunks = splitLargeChunk(chunk, 100);
  // Score and select best sub-chunks
}
```

### 4. Circular Dependencies

```typescript
// Detect cycles in import graph
if (hasCircularDependency(selectedChunks)) {
  // Break cycle by removing lowest-scoring chunk in cycle
  breakCycle(selectedChunks);
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('TokenOptimizer', () => {
  test('estimates tokens accurately', () => {
    const text = 'function hello() { return "world"; }';
    expect(estimateTokens(text)).toBeCloseTo(15, 5);
  });

  test('selects chunks within budget', () => {
    const chunks = createMockChunks(100, { avgTokens: 500 });
    const selected = selectChunksWithinBudget(chunks, 10000);
    const totalTokens = selected.reduce((sum, c) => sum + c.estimated_tokens, 0);
    expect(totalTokens).toBeLessThanOrEqual(10000);
  });

  test('prioritizes high-relevance chunks', () => {
    const chunks = [
      { relevance_score: 0.9, estimated_tokens: 1000 },
      { relevance_score: 0.5, estimated_tokens: 100 },
      { relevance_score: 0.8, estimated_tokens: 500 },
    ];
    const selected = selectChunksWithinBudget(chunks, 600);
    expect(selected).toHaveLength(2);
    expect(selected[0].relevance_score).toBeGreaterThanOrEqual(0.8);
  });
});
```

### Integration Tests

```typescript
describe('TokenOptimizer Integration', () => {
  test('handles real codebase', async () => {
    const codebase = await indexRepo('./fixtures/react-app');
    const result = await reconstructPrompt(
      'fix the auth bug',
      codebase,
      50000
    );

    expect(result.tokens).toBeLessThan(50000);
    expect(result.savings.percentage).toBeGreaterThan(90);
  });

  test('routes to appropriate model', () => {
    expect(selectModel(5000, 0.3, true).model).toContain('ollama');
    expect(selectModel(50000, 0.8, false).model).toContain('sonnet');
  });
});
```

### Performance Tests

```typescript
describe('TokenOptimizer Performance', () => {
  test('processes 50K chunks in <2s', async () => {
    const chunks = createMockChunks(50000);
    const start = Date.now();
    await reconstructPrompt('test query', chunks, 50000);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
```

## Optimization Opportunities

### 1. Cached Embeddings

```typescript
// Cache query embeddings to avoid recomputation
const cacheKey = hashPrompt(prompt);
let cached = await kv.get(`embedding:${cacheKey}`);
if (!cached) {
  cached = await generateEmbedding(prompt);
  await kv.put(`embedding:${cacheKey}`, cached, { expirationTtl: 86400 });
}
```

### 2. Pre-Computed Scores

```typescript
// Score chunks during indexing, store in DB
interface PreComputedScore {
  chunk_id: string;
  avg_relevance: number;
  usage_frequency: number;
}
```

### 3. Early Termination

```typescript
// Stop searching if we find perfect match
if (chunk.relevance_score > 0.95 && chunk.estimated_tokens < budget * 0.1) {
  return [chunk]; // Perfect match, no need to search more
}
```

## References

- [Cloudflare Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Context Compression for LLMs](https://arxiv.org/abs/2305.14314)
- [Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401)

---

**Last Updated**: 2025-01-13
**Status**: Ready for Implementation
**Priority**: Critical (MVP blocker)
