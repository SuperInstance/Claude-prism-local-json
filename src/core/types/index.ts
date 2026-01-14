/**
 * ============================================================================
 * VANTAGE CORE TYPE DEFINITIONS
 * ============================================================================
 *
 * **Purpose**: This module defines all foundational types used across the Vantage
 * codebase. These types form the backbone of the codebase indexing, semantic search,
 * and token optimization system.
 *
 * **Last Updated**: 2025-01-13
 * **Version**: 2.0 (Extended with scoring and optimization types)
 * **Dependencies**: None (base types)
 *
 * **Design Philosophy**:
 * - Types are designed to be serializable and transportable across process boundaries
 * - Optional fields represent data that may not be available during all operations
 * - Structured metadata preferred over generic Record<string, unknown>
 * - Result types enable error handling without exceptions
 *
 * **Comparison with PRISM Types**:
 * This is the extended version used in the main Vantage project. The PRISM
 * subproject (`prism/src/core/types.ts`) uses a simplified version. Key differences:
 * - `CodeChunk` has `name`, `kind`, `embedding` fields
 * - `CodeChunkMetadata` is structured (exports, imports, dependencies)
 * - `ScoredChunk` includes detailed score breakdowns
 * - Result types (Result<T, E>) for error handling
 * - Token optimization types (TokenBudget, OptimizedPrompt, etc.)
 *
 * **Related Files**:
 * - `src/core/interfaces/index.ts` - Service interfaces using these types
 * - `src/scoring/types.ts` - Additional scoring-related types
 * - `src/compression/types.ts` - Compression-specific types
 * - `src/token-optimizer/types.ts` - Optimizer configuration types
 * - `prism/src/core/types.ts` - Simplified PRISM-specific version
 *
 * **Architecture Notes**:
 * These types are used throughout the Vantage system. When modifying:
 * 1. Consider backward compatibility (don't remove fields)
 * 2. Add `@deprecated` comments for fields to be removed
 * 3. Update JSDoc comments with usage examples
 * 4. Consider impact on serialized data (JSON, vector DB)
 *
 * **Migration Path from PRISM Types**:
 * If migrating from prism/src/core/types.ts to these types:
 * - CodeChunk.id: Same
 * - CodeChunk.filePath: Same
 * - CodeChunk.content: Same
 * - CodeChunk.name: NEW (human-readable identifier)
 * - CodeChunk.kind: NEW (function | class | method | variable | interface)
 * - CodeChunk.embedding: NEW (pre-computed vector)
 * - CodeChunk.metadata: CHANGED from Record<> to structured CodeChunkMetadata
 */

/**
 * ============================================================================
 * CODE CHUNK TYPES
 * ============================================================================
 *
 * The core unit of indexed code. Chunks represent logical segments of code
 * that can be embedded, searched, and reconstructed for LLM context.
 */

/**
 * A chunk of code extracted from a source file
 *
 * **Purpose**: The fundamental unit of Vantage's codebase representation. Chunks
 * are created during indexing, embedded for semantic search, and reconstructed
 * into optimized prompts.
 *
 * **Creation Strategy**: Chunks are created by tree-sitter AST parsing in the
 * WasmIndexer. The current strategy creates chunks for:
 * - Function declarations (functions, methods)
 * - Class declarations (including nested classes)
 * - Interface declarations
 * - Variable declarations (top-level exports)
 *
 * **Chunk ID Generation**:
 * The `id` field is typically a SHA-256 hash of:
 * ```
 * SHA256(filePath + content + startLine + endLine)
 * ```
 * This ensures uniqueness while being deterministic for the same code.
 *
 * **Differences from PRISM CodeChunk**:
 * - `name: string` - Human-readable identifier (e.g., "UserService.fetchUser")
 * - `kind: 'function' | 'class' | ...` - Type classification for filtering
 * - `embedding?: number[]` - Pre-computed vector (optional, cached)
 * - `metadata: CodeChunkMetadata` - Structured vs Record<string, unknown>
 *
 * **Performance Characteristics**:
 * - Memory: ~1-5KB per chunk (content) + ~1.5KB (embedding, if present)
 * - Vector DB: 384 floats (1.5KB) per embedding when stored
 * - Search: O(log n) with HNSW index in vector database
 * - Embedding generation: ~10ms per chunk (Cloudflare Workers AI)
 *
 * **Optimization Opportunities**:
 * - **Lazy Embedding**: Only generate embeddings when searching
 * - **Embedding Caching**: Store embeddings to avoid recomputation
 * - **Compression**: Use CompressedChunk for large chunks in prompts
 * - **Delta Encoding**: Store only diffs from similar chunks
 * - **Deduplication**: Merge identical chunks from different files
 *
 * **Usage Examples**:
 * ```typescript
 * // Create a chunk
 * const chunk: CodeChunk = {
 *   id: 'abc123def456',
 *   filePath: '/src/services/UserService.ts',
 *   name: 'fetchUser',
 *   kind: 'method',
 *   startLine: 42,
 *   endLine: 58,
 *   content: 'async fetchUser(id: string): Promise<User> { ... }',
 *   signature: 'async fetchUser(id: string): Promise<User>',
 *   language: 'typescript',
 *   embedding: [0.1, 0.2, ...], // 384 dimensions
 *   metadata: {
 *     exports: ['fetchUser'],
 *     imports: ['User', 'db'],
 *     dependencies: ['./types.ts', './db.ts']
 *   }
 * };
 *
 * // Search for similar chunks
 * const results = await vectorDB.search(queryEmbedding, {
 *   limit: 10,
 *   minRelevance: 0.6
 * });
 * ```
 *
 * **Limitations**:
 * - Does not track parent-child relationships (e.g., method within class)
 * - Does not capture cross-file references (use metadata.dependencies)
 * - Embeddings are content-based only (no structural awareness)
 * - Large files (>10K LOC) may produce too many chunks
 *
 * **Future Enhancements**:
 * - Add `parentId?: string` for hierarchical relationships
 * - Add `tags: string[]` for manual categorization
 * - Add `complexity: number` for code complexity score
 * - Add `lastModified: Date` for recency tracking
 * - Add `astDigest: string` for structure-based similarity
 * - Add `compressedContent?: string` for pre-compressed storage
 * - Add `qualityScore: number` for code quality metrics
 *
 * **Serialization**:
 * Chunks are serialized to JSON for:
 * - Vector database storage
 * - Network transmission (MCP protocol)
 * - Caching on disk
 *
 * **Security Considerations**:
 * - `content` may contain sensitive data (API keys, secrets)
 * - Filter or redact sensitive content before embedding
 * - `filePath` may reveal project structure
 * - Consider anonymizing paths for shared indexes
 *
 * @see CodeChunkMetadata for structured metadata
 * @see ScoredChunk for chunk with relevance scoring
 * @see CompressedChunk for compressed representation
 */
export interface CodeChunk {
  /** Unique identifier (typically SHA-256 hash) */
  id: string;

  /** Absolute path to source file */
  filePath: string;

  /** Human-readable name (e.g., "UserService.fetchUser") */
  name: string;

  /** Type of code construct */
  kind: 'function' | 'class' | 'method' | 'variable' | 'interface';

  /** Starting line number (1-indexed) */
  startLine: number;

  /** Ending line number (1-indexed, inclusive) */
  endLine: number;

  /** Full source code content */
  content: string;

  /** Optional type signature (functions/methods only) */
  signature?: string;

  /** Programming language identifier */
  language: string;

  /** Vector embedding (384-dimensional, optional/cached) */
  embedding?: number[];

  /** Structured metadata about the chunk */
  metadata: CodeChunkMetadata;
}

/**
 * Metadata associated with a code chunk
 *
 * **Purpose**: Provides structured information about the chunk's relationships
 * to other code, enabling better relevance scoring and context reconstruction.
 *
 * **Why Structured Metadata?**
 * Unlike the PRISM version which uses `Record<string, unknown>`, this structured
 * approach enables:
 * - Type-safe access to common fields
 * - Efficient querying (e.g., "find all chunks that export X")
 * - Dependency graph construction
 * - Import/export analysis
 *
 * **Exports**:
 * Symbols (functions, classes, variables, types) that this chunk makes available
 * to other chunks. Used for:
 * - Reverse dependency tracking (who uses this chunk?)
 * - Symbol search (find where X is defined)
 * - Relevance boosting (if query references an export)
 *
 * **Imports**:
 * Symbols that this chunk references from other modules. Used for:
 * - Forward dependency tracking (what does this chunk need?)
 * - Context reconstruction (include dependencies in prompts)
 * - Relevance boosting (if query references an import)
 *
 * **Dependencies**:
 * File paths or module identifiers that this chunk depends on. Used for:
 * - File-level dependency analysis
 * - Change impact analysis (if X changes, what needs re-indexing?)
 * - Chunk grouping (include related chunks together)
 *
 * **Extensibility**:
 * The index signature `[key: string]: unknown` allows custom metadata:
 * ```typescript
 * metadata: {
 *   exports: ['fetchUser'],
 *   imports: ['User', 'db'],
 *   dependencies: ['./types.ts'],
 *   // Custom fields:
 *   tags: ['auth', 'api'],
 *   complexity: 0.75,
 *   testCoverage: 0.85,
 *   author: 'team-backend'
 * }
 * ```
 *
 * **Usage in Relevance Scoring**:
 * The metadata feeds into the ScoreBreakdown:
 * - Symbol matching: query terms matching exports/imports
 * - Dependency proximity: chunks that share dependencies are related
 * - Export importance: chunks with many exports are "central"
 *
 * **Performance**:
 * - Memory: ~200 bytes per chunk (string arrays)
 * - Comparison: O(n) where n = exports/imports length
 * - Querying: Requires building inverted index for fast lookup
 *
 * **Future Enhancements**:
 * - Add `exportedTo: string[]` for explicit re-exports
 * - Add `isTest: boolean` for test code identification
 * - Add `isDeprecated: boolean` for deprecated code
 * - Add `version: string` for API versioning
 * - Add `annotations: Annotation[]` for decorator/annotation tracking
 *
 * @see ScoreBreakdown for how metadata affects scoring
 * @see RelevanceScorer for metadata usage in scoring
 */
export interface CodeChunkMetadata {
  /** Symbols exported by this chunk (functions, classes, types, etc.) */
  exports: string[];

  /** Symbols imported by this chunk from other modules */
  imports: string[];

  /** File paths or module identifiers this chunk depends on */
  dependencies: string[];

  /** Additional arbitrary metadata for extensibility */
  [key: string]: unknown;
}

/**
 * ============================================================================
 * SEARCH AND QUERY TYPES
 * ============================================================================
 *
 * Types for search queries, results, and scoring.
 * These enable semantic search with multi-factor relevance scoring.
 */

/**
 * Context for a search query
 *
 * **Purpose**: Encapsulates all information needed to perform a search,
 * including the query text, optional embedding, and search constraints.
 *
 * **Query Embedding**:
 * If provided, the `embedding` field contains the pre-computed vector
 * representation of the query. This avoids re-computing the embedding
 * when the same query is searched multiple times.
 *
 * **Proximity Scoring**:
 * When `currentFile` is provided, results are boosted based on file
 * proximity. Files in the same directory score higher than files
 * in distant directories.
 *
 * **Language Filtering**:
 * When `language` is specified, only chunks matching that language
 * are returned. Useful for language-specific queries (e.g., "show
 * me how to do X in TypeScript").
 *
 * **Relevance Threshold**:
 * `minRelevance` filters out low-quality results. Recommended values:
 * - 0.3: Permissive (show weak matches)
 * - 0.5: Moderate (balanced)
 * - 0.7: Strict (only strong matches)
 *
 * **Usage Example**:
 * ```typescript
 * const context: QueryContext = {
 *   query: 'how to authenticate API requests',
 *   embedding: await embed('how to authenticate API requests'),
 *   currentFile: '/src/services/AuthService.ts',
 *   language: 'typescript',
 *   maxResults: 10,
 *   minRelevance: 0.6
 * };
 *
 * const results = await vectorDB.search(context);
 * ```
 *
 * **Future Enhancements**:
 * - Add `timeRange?: { start: Date; end: Date }` for temporal filtering
 * - Add `excludeIds?: string[]` for excluding specific chunks
 * - Add `semanticThreshold?: number` separate from minRelevance
 * - Add `boostFactors?: Partial<ScoreBreakdown>` for custom boosting
 */
export interface QueryContext {
  /** The search query text */
  query: string;

  /** Optional pre-computed embedding for the query */
  embedding?: number[];

  /** Optional current file path for proximity scoring */
  currentFile?: string;

  /** Optional language filter for results */
  language?: string;

  /** Maximum number of results to return */
  maxResults: number;

  /** Minimum relevance score (0-1) for results */
  minRelevance: number;
}

/**
 * Options for vector database search
 *
 * **Purpose**: Provides fine-grained control over search behavior,
 * including result limits, filters, and output format.
 *
 * **Result Limits**:
 * The `limit` parameter controls the maximum number of results returned.
 * Higher limits = slower searches but more comprehensive results.
 *
 * **Filtering**:
 * - pathFilter: Glob pattern for file paths
 * - languageFilter: Only results for specific language
 * - Filters are applied before ranking (affects which chunks are scored)
 *
 * **Score Breakdown**:
 * When `includeBreakdown` is true, each result includes detailed scoring
 * information (semantic, proximity, symbol, recency, frequency). This
 * is useful for debugging and understanding why results ranked as they did.
 *
 * **Performance Impact**:
 * - Higher limit = slower (more distance calculations)
 * - Filters = faster (reduces search space)
 * - Breakdown = minimal overhead (~5% slower)
 *
 * **Future Enhancements**:
 * - Add `rerank?: boolean` for cross-encoder reranking
 * - Add `diversity?: number` for result diversification
 * - Add `sortBy?: 'relevance' | 'recency' | 'popularity'`
 */
export interface SearchOptions {
  /** Number of results to return */
  limit?: number;

  /** Filter by file path pattern */
  pathFilter?: string;

  /** Filter by language */
  languageFilter?: string;

  /** Include score breakdown in results */
  includeBreakdown?: boolean;
}

/**
 * Results from a vector search operation
 *
 * **Purpose**: Contains scored and ranked chunks that match the query,
 * along with metadata about the search operation.
 *
 * **Ranking**:
 * Results are sorted by `relevanceScore` in descending order (highest
 * relevance first). The score is a weighted combination of the factors
 * in ScoreBreakdown.
 *
 * **Search Metrics**:
 * - `totalEvaluated`: Number of chunks considered (before filtering)
 * - `searchTime`: Milliseconds for the complete search operation
 * - These metrics help optimize search performance
 *
 * **Usage Example**:
 * ```typescript
 * const results: SearchResults = await vectorDB.search(query, options);
 *
 * console.log(`Found ${results.chunks.length} results`);
 * console.log(`Searched ${results.totalEvaluated} chunks in ${results.searchTime}ms`);
 *
 * for (const chunk of results.chunks) {
 *   console.log(`${chunk.name}: ${chunk.relevanceScore.toFixed(2)}`);
 *   console.log(`  Semantic: ${chunk.scoreBreakdown.semantic.toFixed(2)}`);
 *   console.log(`  Symbol: ${chunk.scoreBreakdown.symbol.toFixed(2)}`);
 * }
 * ```
 *
 * **Performance Characteristics**:
 * - Search time: ~10ms for 100K chunks (SQLite with HNSW index)
 * - Scoring time: ~1ms per 1000 chunks (multidimensional scoring)
 * - Total: ~20ms for typical search (100K → 100 results)
 *
 * **Future Enhancements**:
 * - Add `queryId: string` for query tracking
 * - Add `hasMore: boolean` for pagination
 * - Add `nextCursor?: string` for continuation
 * - Add `aggregations: AggregationMetrics` for analytics
 */
export interface SearchResults {
  /** Array of scored chunks, sorted by relevance */
  chunks: ScoredChunk[];

  /** Total number of chunks evaluated */
  totalEvaluated: number;

  /** Time taken for search in milliseconds */
  searchTime: number;
}

/**
 * A code chunk with its relevance score
 *
 * **Purpose**: Extends CodeChunk with scoring information for search results.
 * Provides both the chunk content and why it matched the query.
 *
 * **Relevance Score**:
 * Overall relevance score (0-1) combining all factors from ScoreBreakdown.
 * Higher scores indicate better matches.
 *
 * **Score Interpretation**:
 * - 0.9 - 1.0: Excellent match (highly relevant)
 * - 0.7 - 0.9: Good match (relevant)
 * - 0.5 - 0.7: Fair match (somewhat relevant)
 * - 0.3 - 0.5: Weak match (marginally relevant)
 * - 0.0 - 0.3: Poor match (not relevant)
 *
 * **Score Breakdown**:
 * Detailed breakdown of how the score was computed. Each component
 * is normalized 0-1. The final score is a weighted combination.
 *
 * **Usage in Ranking**:
 * Results are ranked by `relevanceScore` descending. Ties are broken
 * by `scoreBreakdown.semantic` (pure semantic similarity).
 *
 * **Future Enhancements**:
 * - Add `explanation: string` for natural language explanation
 * - Add `highlightRanges: SourceLocation[]` for query match highlights
 * - Add `rank: number` for result position
 * - Add `feedback?: 'positive' | 'negative'` for learning
 *
 * @see ScoreBreakdown for detailed scoring components
 */
export interface ScoredChunk extends CodeChunk {
  /** Overall relevance score (0-1) */
  relevanceScore: number;

  /** Breakdown of how the score was computed */
  scoreBreakdown: ScoreBreakdown;
}

/**
 * ============================================================================
 * RELEVANCE SCORING TYPES
 * ============================================================================
 *
 * Types for multi-factor relevance scoring.
 * Combines semantic similarity with domain-specific signals.
 */

/**
 * Detailed breakdown of relevance scoring
 *
 * **Purpose**: Shows the individual components that contribute to the final
 * relevance score. All values are normalized 0-1 for easy interpretation.
 *
 * **Scoring Formula**:
 * ```typescript
 * relevanceScore =
 *   0.40 * semantic +    // Vector similarity (primary signal)
 *   0.25 * symbol +      // Symbol/name matching
 *   0.20 * proximity +   // File proximity
 *   0.10 * recency +     // Recently modified
 *   0.05 * frequency     // Historically useful
 * ```
 *
 * **Semantic Similarity (40%)**:
 * Cosine similarity between query and chunk embeddings. The primary
 * signal for relevance. Higher values indicate more similar content.
 *
 * **Proximity (20%)**:
 * File path proximity to `currentFile` in QueryContext. Files in the
 * same directory score highest, decreasing with distance.
 *
 * **Symbol (25%)**:
 * Match between query terms and chunk symbols (exports, imports).
 * Boosts chunks that define or reference queried symbols.
 *
 * **Recency (10%)**:
 * Based on last modified time. Recently changed files score higher.
 * Useful for finding current implementations.
 *
 * **Frequency (5%)**:
 * Historical usage frequency (how often this chunk was selected).
 * Boosts chunks that have been useful in the past.
 *
 * **Usage Example**:
 * ```typescript
 * const breakdown: ScoreBreakdown = {
 *   semantic: 0.85,   // Very similar content
 *   proximity: 0.60,  // Same directory
 *   symbol: 0.90,     // Defines queried function
 *   recency: 0.30,    // Modified a while ago
 *   frequency: 0.50   // Moderately popular
 * };
 *
 * const finalScore =
 *   0.40 * 0.85 +
 *   0.25 * 0.90 +
 *   0.20 * 0.60 +
 *   0.10 * 0.30 +
 *   0.05 * 0.50;
 * // = 0.71 (good match)
 * ```
 *
 * **Tuning**:
 * Adjust weights in RelevanceScorer for your use case:
 * - For semantic search: Increase semantic weight to 0.5+
 * - For symbol search: Increase symbol weight to 0.4+
 * - For recent code: Increase recency weight to 0.2+
 *
 * **Future Enhancements**:
 * - Add `quality: number` for code quality score
 * - Add `popularity: number` for GitHub stars/usage
 * - Add `testCoverage: number` for test coverage boost
 * - Add `custom: Record<string, number>` for user-defined factors
 *
 * @see RelevanceScorer for scoring implementation
 */
export interface ScoreBreakdown {
  /** Semantic similarity from vector embedding */
  semantic: number;

  /** File proximity to current working directory */
  proximity: number;

  /** Symbol/name matching with query */
  symbol: number;

  /** Recency based on last modified time */
  recency: number;

  /** Historical usage frequency */
  frequency: number;
}

/**
 * ============================================================================
 * TOKEN OPTIMIZATION TYPES
 * ============================================================================
 *
 * Types for token budget management, prompt optimization, and compression.
 * These enable fitting massive codebases into LLM context windows.
 */

/**
 * Token budget allocation
 *
 * **Purpose**: Defines how tokens are allocated for a given request,
 * tracking usage and remaining capacity. Critical for staying within
 * LLM context limits.
 *
 * **Budget Allocation Strategy**:
 * ```
 * total = system + userQuery + availableForContext
 * used = system + userQuery + (compressed chunks)
 * remaining = total - used
 * ```
 *
 * **System Prompt Tokens**:
 * Reserved for the system prompt (instructions, context, etc.). This
 * is typically 1000-2000 tokens for Claude's system prompt.
 *
 * **User Query Tokens**:
 * The user's question or request. This varies but is typically
 * 100-500 tokens.
 *
 * **Available for Context**:
 * The remaining budget for code context. This is where chunks are
 * selected and compressed.
 *
 * **Usage Example**:
 * ```typescript
 * const budget: TokenBudget = {
 *   total: 200000,        // Claude's max context
 *   system: 1000,         // System prompt
 *   userQuery: 250,       // User question
 *   availableForContext: 198750,  // Remaining for code
 *   used: 0,              // Will be updated as chunks are added
 *   remaining: 200000     // Initially equal to total
 * };
 *
 * // Check if we can add more chunks
 * if (budget.remaining > minChunkSize) {
 *   // Add more chunks
 * }
 * ```
 *
 * **Budget Calculation**:
 * For a 200K token context limit:
 * - System prompt: ~1000 tokens (0.5%)
 * - User query: ~250 tokens (0.1%)
 * - Code context: ~198750 tokens (99.4%)
 *
 * **Safety Margin**:
 * Reserve 10-20% of budget for response generation. If the model
 * needs to generate 10K tokens, only use 190K for context.
 *
 * **Future Enhancements**:
 * - Add `responseReservation: number` for output token budget
 * - Add `overflowStrategy: 'truncate' | 'summarize' | 'refuse'`
 * - Add `tieredBudget: TokenBudget[]` for multi-turn conversations
 *
 * @see OptimizedPrompt for final optimized output
 */
export interface TokenBudget {
  /** Total token budget for the request */
  total: number;

  /** Tokens already used */
  used: number;

  /** Tokens remaining for context */
  remaining: number;

  /** Tokens reserved for system prompt */
  system: number;

  /** Tokens used for user query */
  userQuery: number;

  /** Tokens available for code context */
  availableForContext: number;
}

/**
 * Result of prompt optimization
 *
 * **Purpose**: Contains the optimized prompt with selected chunks compressed
 * to fit within the token budget, along with savings metrics.
 *
 * **Optimization Process**:
 * 1. Search for relevant chunks (semantic + symbolic)
 * 2. Score and rank chunks by relevance
 * 3. Select top chunks within budget
 * 4. Compress selected chunks (AST-preserving)
 * 5. Reconstruct prompt with compressed chunks
 * 6. Select optimal model based on token count
 *
 * **Prompt Structure**:
 * ```
 * <system_prompt>
 *   Instructions for the LLM
 * </system_prompt>
 *
 * <user_query>
 *   User's question or request
 * </user_query>
 *
 * <context>
 *   CompressedChunk[0].content
 *   CompressedChunk[1].content
 *   ...
 * </context>
 * ```
 *
 * **Savings Metrics**:
 * The `savings` field shows how many tokens were saved compared to
 * including all code without optimization. Typical savings: 70-90%.
 *
 * **Routing Information**:
 * Optional metadata about why a specific model was chosen and the
 * estimated cost for the request.
 *
 * **Usage Example**:
 * ```typescript
 * const optimized: OptimizedPrompt = await optimizer.reconstructPrompt(
 *   query,
 *   allChunks,
 *   budget
 * );
 *
 * console.log(`Optimized prompt: ${optimized.tokensUsed} tokens`);
 * console.log(`Saved ${optimized.savings.percentage}% tokens`);
 * console.log(`Model: ${optimized.model} (${optimized.routing?.reason})`);
 * console.log(`Estimated cost: $${optimized.routing?.estimatedCost.toFixed(4)}`);
 * ```
 *
 * **Future Enhancements**:
 * - Add `iterations: number` for optimization iterations
 * - Add `compressionStrategy: string` for algorithm used
 * - Add `rejectedChunks: CodeChunk[]` for chunks that didn't fit
 * - Add `warnings: string[]` for optimization issues
 *
 * @see CompressedChunk for compressed chunk representation
 */
export interface OptimizedPrompt {
  /** The final optimized prompt text */
  prompt: string;

  /** Total tokens used in optimized prompt */
  tokensUsed: number;

  /** Chunks included in the prompt (compressed) */
  chunks: CompressedChunk[];

  /** Model selected for this request */
  model: string;

  /** Metrics about token and cost savings */
  savings: SavingsMetrics;

  /** Optional routing information */
  routing?: {
    /** Model provider */
    provider: string;

    /** Reason for model selection */
    reason: string;

    /** Estimated cost for this request */
    estimatedCost: number;
  };
}

/**
 * Metrics about optimization savings
 *
 * **Purpose**: Tracks how many tokens and costs were saved through
 * optimization. Useful for measuring effectiveness and ROI.
 *
 * **Token Savings**:
 * Difference between original token count (all chunks uncompressed)
 * and optimized token count (selected chunks compressed).
 *
 * **Percentage**:
 * Token savings as a percentage of original. Higher is better.
 * Typical values: 70-95% depending on compression settings.
 *
 * **Cost Savings**:
 * Estimated monetary savings based on model pricing. Uses current
 * Anthropic pricing:
 * - Claude 3 Haiku: $0.25/M input tokens
 * - Claude 3.5 Sonnet: $3/M input tokens
 * - Claude 3 Opus: $15/M input tokens
 *
 * **Usage Example**:
 * ```typescript
 * const savings: SavingsMetrics = {
 *   tokensSaved: 150000,
 *   percentage: 85.5,
 *   costSaved: 0.45  // Using Claude 3.5 Sonnet
 * };
 *
 * console.log(`Saved ${savings.tokensSaved} tokens (${savings.percentage}%)`);
 * console.log(`Saved $${savings.costSaved} per request`);
 * ```
 *
 * **ROI Calculation**:
 * For 1000 requests/month:
 * - Without optimization: 1000 * $0.50 = $500/month
 * - With optimization: 1000 * $0.05 = $50/month
 * - Savings: $450/month (90% reduction)
 *
 * **Future Enhancements**:
 * - Add `originalCost: number` for cost before optimization
 * - Add `optimizedCost: number` for cost after optimization
 * - Add `timeSaved: number` for processing time savings
 *
 * @see ModelChoice for cost estimation
 */
export interface SavingsMetrics {
  /** Number of tokens saved */
  tokensSaved: number;

  /** Percentage of tokens saved (0-100) */
  percentage: number;

  /** Estimated cost saved in USD */
  costSaved: number;
}

/**
 * A code chunk that has been compressed
 *
 * **Purpose**: Contains both original and compressed versions along
 * with compression metrics. Used in OptimizedPrompt to reduce token count.
 *
 * **Compression Strategy**:
 * Uses AST-preserving compression to maintain code structure while
 * reducing tokens. Strategies:
 * - **Light** (0.9 ratio): Remove comments, whitespace
 * - **Medium** (0.7 ratio): Remove docstrings, inline comments
 * - **Aggressive** (0.5 ratio): Remove all non-essential code
 *
 * **Compression Ratio**:
 * ```
 * compressionRatio = originalTokens / compressedTokens
 *
 * Example:
 * - originalTokens: 1000
 * - compressedTokens: 300
 * - compressionRatio: 3.33x
 * ```
 *
 * **Quality Trade-offs**:
 * - Higher ratio = more savings but more information loss
 * - Signature preservation = better type inference
 * - Import retention = better context understanding
 *
 * **Usage Example**:
 * ```typescript
 * const compressed: CompressedChunk = {
 *   original: chunk,
 *   content: 'function add(a,b){return a+b}',  // Minified
 *   originalTokens: 150,
 *   compressedTokens: 20,
 *   compressionRatio: 7.5
 * };
 *
 * console.log(`Compressed ${compressed.originalTokens} → ${compressed.compressedTokens} tokens`);
 * console.log(`Compression ratio: ${compressed.compressionRatio}x`);
 * ```
 *
 * **Limitations**:
 * - Lossy compression (information is lost)
 * - Not reversible (can't reconstruct original)
 * - May affect code comprehension
 * - Manual review recommended for critical code
 *
 * **Future Enhancements**:
 * - Add `compressionStrategy: string` for algorithm used
 * - Add `qualityScore: number` for compression quality
 * - Add `reconstruction?: string` for lossless option
 * - Add `diff?: string` for showing what changed
 *
 * @see AdaptiveCompressor for compression implementation
 */
export interface CompressedChunk {
  /** Original uncompressed chunk */
  original: CodeChunk;

  /** Compressed content */
  content: string;

  /** Original token count */
  originalTokens: number;

  /** Token count after compression */
  compressedTokens: number;

  /** Compression ratio (original / compressed) */
  compressionRatio: number;
}

/**
 * ============================================================================
 * MODEL ROUTING TYPES
 * ============================================================================
 *
 * Types for intelligent model selection and routing.
 * Enables cost optimization by using the cheapest viable model.
 */

/**
 * Model selection result
 *
 * **Purpose**: Contains the chosen model and reasoning for the selection.
 * Enables transparent, cost-aware model routing.
 *
 * **Routing Strategy**:
 * The model router selects the optimal model based on:
 * 1. Token count (small → cheap model, large → capable model)
 * 2. Query complexity (simple → local, complex → cloud)
 * 3. Cost constraints (budget → local, quality → cloud)
 * 4. Availability (fallback if primary unavailable)
 *
 * **Model Hierarchy**:
 * ```
 * Tokens < 8K + Simple → Ollama (deepseek-coder-v2)
 *   Cost: $0, Quality: Good, Speed: Fast
 *
 * Tokens < 20K + Medium → Claude 3 Haiku
 *   Cost: $0.25/M, Quality: Very Good, Speed: Fast
 *
 * Tokens < 100K + Complex → Claude 3.5 Sonnet
 *   Cost: $3/M, Quality: Excellent, Speed: Medium
 *
 * Tokens >= 100K or Very Complex → Claude 3 Opus
 *   Cost: $15/M, Quality: Best, Speed: Slow
 * ```
 *
 * **Provider Types**:
 * - **ollama**: Local models (free, requires GPU/CPU)
 * - **cloudflare**: Cloudflare Workers AI (cheap, fast)
 * - **anthropic**: Claude API (expensive, best quality)
 *
 * **Cost Estimation**:
 * Estimated cost based on input token count and model pricing:
 * ```typescript
 * cost = (inputTokens / 1M) * pricePerMillion
 *
 * Example (Claude 3.5 Sonnet):
 * cost = (50000 / 1M) * $3 = $0.15
 * ```
 *
 * **Usage Example**:
 * ```typescript
 * const choice: ModelChoice = router.selectModel(50000, 0.7);
 *
 * console.log(`Model: ${choice.model}`);
 * console.log(`Provider: ${choice.provider}`);
 * console.log(`Reason: ${choice.reason}`);
 * console.log(`Estimated cost: $${choice.estimatedCost.toFixed(4)}`);
 * // Output:
 * // Model: claude-3-5-sonnet-20241022
 * // Provider: anthropic
 * // Reason: 50K tokens with medium complexity
 * // Estimated cost: $0.1500
 * ```
 *
 * **Fallback Behavior**:
 * If the selected model is unavailable, automatically falls back to
 * the next best option:
 * - Opus unavailable → Sonnet
 * - Sonnet unavailable → Haiku
 * - Claude unavailable → Ollama
 *
 * **Future Enhancements**:
 * - Add `fallbackChain: string[]` for models tried
 * - Add `availability: boolean` for model status
 * - Add `latencyEstimate: number` for expected response time
 * - Add `confidence: number` for selection confidence
 *
 * @see IModelRouter for routing interface
 */
export interface ModelChoice {
  /** Model identifier (e.g., 'claude-3-5-sonnet-20241022') */
  model: string;

  /** Provider hosting the model */
  provider: 'ollama' | 'cloudflare' | 'anthropic';

  /** Explanation of why this model was chosen */
  reason: string;

  /** Estimated cost for this request in USD */
  estimatedCost: number;
}

/**
 * Error codes used throughout PRISM
 */
export enum ErrorCode {
  /** Embedding generation failed */
  EMBEDDING_FAILED = 'EMBEDDING_FAILED',

  /** Vector database operation failed */
  VECTOR_DB_ERROR = 'VECTOR_DB_ERROR',

  /** Token budget exceeded */
  TOKEN_BUDGET_EXCEEDED = 'TOKEN_BUDGET_EXCEEDED',

  /** Invalid configuration */
  INVALID_CONFIG = 'INVALID_CONFIG',

  /** File not found */
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',

  /** Indexing failed */
  INDEXING_FAILED = 'INDEXING_FAILED',

  /** Model routing failed */
  MODEL_ROUTING_FAILED = 'MODEL_ROUTING_FAILED',

  /** Invalid query */
  INVALID_QUERY = 'INVALID_QUERY',

  /** Compression failed */
  COMPRESSION_FAILED = 'COMPRESSION_FAILED',
}

/**
 * Base error class for all PRISM errors
 *
 * Provides structured error information with codes and details.
 */
export class PrismError extends Error {
  /**
   * Create a new PrismError
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code
   * @param details - Additional error context
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'PrismError';

    // Maintains proper stack trace in V8 (only in Node.js environment)
    const errorConstructor = Error as unknown as {
      captureStackTrace?: (target: Error, constructor?: Function) => void;
    };
    if (typeof errorConstructor.captureStackTrace === 'function') {
      errorConstructor.captureStackTrace(this, PrismError);
    }
  }

  /**
   * Convert error to JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * Factory function to create PrismError instances
 *
 * @param code - Error code from ErrorCode enum
 * @param message - Human-readable error message
 * @param details - Additional error context
 * @returns A new PrismError instance
 */
export function createPrismError(
  code: ErrorCode,
  message: string,
  details?: unknown
): PrismError {
  return new PrismError(message, code, details);
}

/**
 * Result type for operations that can fail
 *
 * Provides a type-safe way to handle errors without throwing.
 */
export type Result<T, E = PrismError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Create a successful Result
 */
export function Ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/**
 * Create a failed Result
 */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard for successful results
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

/**
 * Type guard for failed results
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}
