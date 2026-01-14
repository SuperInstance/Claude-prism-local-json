# Core API Specification

**Component**: PRISM Core API
**Status**: Design Document
**Priority**: Foundational
**Last Updated**: 2026-01-13

## Purpose

This document specifies the complete API surface for PRISM, including CLI commands, TypeScript interfaces, MCP tools, and error codes. All APIs are designed with type safety, clear documentation, and backward compatibility in mind.

---

## Table of Contents

1. [CLI Commands](#1-cli-commands)
2. [Core TypeScript Interfaces](#2-core-typescript-interfaces)
3. [MCP Tools](#3-mcp-tools)
4. [Error Codes](#4-error-codes)

---

## 1. CLI Commands

### 1.1 Command Overview

PRISM exposes a single CLI entry point `prism` with subcommands for different operations.

```bash
prism [command] [options]
```

### 1.2 prism index

Build or update the codebase index.

```bash
prism index [options]
```

**Options**:
```typescript
interface IndexOptions {
  // Path to codebase root (default: current directory)
  path?: string;

  // File extensions to index (default: .ts,.js,.py,.rs,.go,.java)
  extensions?: string;

  // Paths to exclude (default: node_modules,.git,dist,build)
  exclude?: string[];

  // Force full reindex (default: false)
  force?: boolean;

  // Verbose output (default: false)
  verbose?: boolean;

  // Output format (default: 'text')
  format?: 'text' | 'json';

  // Maximum file size in MB (default: 1)
  maxSize?: number;
}
```

**Examples**:
```bash
# Index current directory
prism index

# Index specific path with custom options
prism index --path ./src --extensions .ts,.tsx --exclude test/**

# Force full reindex
prism index --force

# JSON output for scripting
prism index --format json
```

**Output** (text format):
```
Indexing ./src...
✓ Found 127 files
✓ Parsed 127 files (2.3s)
✓ Extracted 1,234 code elements
✓ Generated 1,234 embeddings (12.4s)
✓ Indexed 1,234 chunks (0.8s)

Index complete!
Files: 127 | Chunks: 1,234 | Time: 15.5s
Storage: ./vantage/vectors.db (4.2 MB)
```

**Output** (JSON format):
```json
{
  "success": true,
  "stats": {
    "filesIndexed": 127,
    "chunksCreated": 1234,
    "duration": 15500,
    "storageSize": 4200000
  }
}
```

---

### 1.3 prism search

Search codebase using semantic vector similarity.

```bash
prism search <query> [options]
```

**Arguments**:
- `query` - Natural language search query (required)

**Options**:
```typescript
interface SearchOptions {
  // Maximum number of results (default: 10, max: 100)
  limit?: number;

  // Minimum similarity threshold 0-1 (default: 0.7)
  threshold?: number;

  // Filter by file extensions
  extensions?: string[];

  // Filter by file paths
  paths?: string[];

  // Exclude file paths
  exclude?: string[];

  // Output format (default: 'text')
  format?: 'text' | 'json' | 'markdown';

  // Show line numbers (default: true)
  lineNumbers?: boolean;

  // Show code snippet (default: true)
  snippet?: boolean;

  // Context lines (default: 3)
  context?: number;
}
```

**Examples**:
```bash
# Basic search
prism search "authentication flow"

# Search with options
prism search "user login" --limit 20 --threshold 0.8

# Filter by file type
prism search "database connection" --extensions .ts,.js

# JSON output
prism search "api endpoints" --format json

# Exclude test files
prism search "error handling" --exclude test/**,spec/**
```

**Output** (text format):
```
Searching for "authentication flow"...
Found 15 results (0.24s)

src/auth/login.ts (score: 0.92)
  Line 45: async function login(username, password) {
  Line 46:   const user = await db.users.findOne({ username });
  Line 47:   if (!user) throw new AuthError('User not found');
  Line 48:   if (!await bcrypt.compare(password, user.passwordHash)) {
  Line 49:     throw new AuthError('Invalid password');
  Line 50:   }
  Line 51:   return generateToken(user);
  Line 52: }

src/auth/middleware.ts (score: 0.88)
  Line 12: export function authMiddleware(req, res, next) {
  Line 13:   const token = req.headers.authorization?.split(' ')[1];
  Line 14:   if (!token) return res.status(401).json({ error: 'No token' });
  Line 15:   try {
  Line 16:     const decoded = verifyToken(token);
  Line 17:     req.user = decoded;
  Line 18:     next();
  Line 19:   } catch (error) {
  Line 20:     return res.status(401).json({ error: 'Invalid token' });
  Line 21:   }
  Line 22: }

[13 more results...]
```

**Output** (JSON format):
```json
{
  "query": "authentication flow",
  "results": [
    {
      "filePath": "src/auth/login.ts",
      "score": 0.92,
      "lineRange": [45, 52],
      "snippet": "async function login(username, password) {...",
      "context": "..."
    },
    {
      "filePath": "src/auth/middleware.ts",
      "score": 0.88,
      "lineRange": [12, 22],
      "snippet": "export function authMiddleware(req, res, next) {...",
      "context": "..."
    }
  ],
  "totalResults": 15,
  "searchTime": 240
}
```

---

### 1.4 prism chat

Interactive AI-powered assistance with optimized context.

```bash
prism chat <message> [options]
```

**Arguments**:
- `message` - Question or task description (required)

**Options**:
```typescript
interface ChatOptions {
  // Token budget for context (default: 50000)
  budget?: number;

  // Force specific model
  model?: 'ollama' | 'haiku' | 'sonnet' | 'opus';

  // Include conversation history
  history?: boolean;

  // Output format (default: 'text')
  format?: 'text' | 'json';

  // Show token usage (default: true)
  showUsage?: boolean;

  // Non-interactive mode (default: false)
  nonInteractive?: boolean;
}
```

**Examples**:
```bash
# Ask a question
prism chat "How does the authentication system work?"

# Specify token budget
prism chat "Explain the database schema" --budget 100000

# Force specific model
prism chat "Refactor this function" --model sonnet

# JSON output for scripting
prism chat "Find all API endpoints" --format json
```

**Output** (text format):
```
Query: How does the authentication system work?

Optimizing context...
✓ Retrieved 23 relevant code chunks
✓ Selected 8 chunks within budget (2,134 tokens)
✓ Compressed to 1,892 tokens (88.6% reduction)
✓ Selected model: claude-3.5-sonnet

Answer:
The authentication system uses JWT (JSON Web Tokens) with the following flow:

1. Login (src/auth/login.ts:45-52):
   - User provides username and password
   - System looks up user in database
   - Password is verified using bcrypt
   - JWT token is generated and returned

2. Middleware (src/auth/middleware.ts:12-22):
   - Each request includes Authorization header
   - Token is extracted and verified
   - Decoded user info is attached to request
   - Invalid tokens return 401 Unauthorized

3. Token Generation (src/auth/tokens.ts:15-30):
   - Tokens contain user ID, email, and expiration
   - Signed with HS256 using SECRET_KEY
   - Valid for 24 hours by default

Key security features:
- Password hashing with bcrypt (10 rounds)
- Token expiration and refresh
- CORS configuration for allowed origins

---
Token Usage:
  Input: 1,892 tokens (saved: 14,108 tokens, 88.1%)
  Output: estimated 500-800 tokens
  Model: claude-3.5-sonnet
  Cost: ~$0.01
```

---

### 1.5 prism stats

Display token usage statistics and savings.

```bash
prism stats [options]
```

**Options**:
```typescript
interface StatsOptions {
  // Time period (default: 'session')
  period?: 'session' | 'today' | 'week' | 'all';

  // Output format (default: 'text')
  format?: 'text' | 'json';

  // Show detailed breakdown
  verbose?: boolean;
}
```

**Examples**:
```bash
# Show session stats
prism stats

# Show weekly stats
prism stats --period week

# Detailed JSON output
prism stats --format json --verbose
```

**Output** (text format):
```
PRISM Token Usage Statistics
=============================

Session (since 2 hours ago):
  Queries: 23
  Total tokens used: 45,678
  Total tokens saved: 387,432
  Average savings: 89.5%
  Money saved: ~$1.16

This session:
  Model distribution:
    ollama: 15 (65.2%) - $0.00
    haiku: 5 (21.7%) - $0.01
    sonnet: 3 (13.0%) - $0.14

Top queries:
  1. "authentication flow" - 12.3K tokens, 94.2% saved
  2. "database schema" - 8.9K tokens, 91.7% saved
  3. "API endpoints" - 6.2K tokens, 88.5% saved

Cache performance:
  Embedding cache hit rate: 78.3%
  Search cache hit rate: 65.2%
  Avg query time: 0.34s
```

---

## 2. Core TypeScript Interfaces

### 2.1 Vector Database Interface

```typescript
/**
 * Vector database abstraction layer
 * Supports both local (SQLite) and cloud (Vectorize) storage
 */
interface IVectorDatabase {
  /**
   * Search for similar vectors
   * @param vector - Query vector (384 dimensions for BGE-small)
   * @param options - Search options
   * @returns Ranked results with similarity scores
   */
  search(
    vector: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]>;

  /**
   * Insert or update vectors
   * @param vectors - Vectors to upsert
   * @returns Number of vectors inserted
   */
  upsert(vectors: Vector[]): Promise<number>;

  /**
   * Delete vectors by IDs
   * @param ids - Vector IDs to delete
   * @returns Number of vectors deleted
   */
  delete(ids: string[]): Promise<number>;

  /**
   * Get vector by ID
   * @param id - Vector ID
   * @returns Vector data or null if not found
   */
  get(id: string): Promise<Vector | null>;

  /**
   * Get multiple vectors by IDs
   * @param ids - Vector IDs
   * @returns Map of ID to vector data
   */
  getBatch(ids: string[]): Promise<Map<string, Vector>>;
}

interface VectorSearchOptions {
  topK?: number;           // Number of results (default: 10)
  threshold?: number;     // Minimum similarity 0-1 (default: 0)
  filter?: {              // Metadata filters
    filePath?: string;    // File path pattern
    language?: string;    // Programming language
    elementType?: string; // Element type (function, class, etc)
  };
}

interface Vector {
  id: string;
  values: number[];       // Embedding vector
  metadata: {
    filePath: string;
    elementName: string;
    elementType: string;
    startLine: number;
    endLine: number;
    language: string;
  };
}

interface VectorSearchResult {
  id: string;
  score: number;          // Cosine similarity
  metadata: Vector['metadata'];
}
```

### 2.2 Indexer Interface

```typescript
/**
 * Code indexer using Tree-sitter
 * Parses source code and extracts semantic structure
 */
interface IIndexer {
  /**
   * Index a single file
   * @param filePath - Path to source file
   * @param content - File content
   * @returns Extracted code elements
   */
  indexFile(
    filePath: string,
    content: string
  ): Promise<IndexResult>;

  /**
   * Index multiple files in parallel
   * @param files - Array of file paths and content
   * @returns Array of index results
   */
  indexFiles(
    files: Array<{ path: string; content: string }>
  ): Promise<IndexResult[]>;

  /**
   * Get supported languages
   * @returns Map of file extension to language name
   */
  getSupportedLanguages(): Map<string, string>;

  /**
   * Check if file type is supported
   * @param filePath - File path to check
   * @returns True if file type is supported
   */
  isSupported(filePath: string): boolean;
}

interface IndexResult {
  success: boolean;
  filePath: string;
  elements: CodeElement[];
  chunks: CodeChunk[];
  errors?: string[];
  warnings?: string[];
}

interface CodeElement {
  id: string;
  type: 'function' | 'class' | 'method' | 'interface' | 'variable';
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
    visibility: 'public' | 'private' | 'protected';
  };
  dependencies: string[];
}

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
```

### 2.3 Token Optimizer Interface

```typescript
/**
 * Token optimization service
 * Reduces token usage by selecting and compressing relevant context
 */
interface ITokenOptimizer {
  /**
   * Reconstruct prompt with optimized context
   * @param query - User query
   * @param codebase - All available code chunks
   * @param budget - Token budget
   * @returns Optimized prompt with statistics
   */
  reconstructPrompt(
    query: string,
    codebase: CodeChunk[],
    budget: number
  ): Promise<OptimizedPrompt>;

  /**
   * Estimate token count for text
   * @param text - Text to estimate
   * @returns Estimated token count
   */
  estimateTokens(text: string): number;

  /**
   * Calculate token savings achieved
   * @param original - Original token count
   * @param optimized - Optimized token count
   * @returns Savings statistics
   */
  calculateSavings(
    original: number,
    optimized: number
  ): TokenSavings;
}

interface OptimizedPrompt {
  prompt: string;              // Final prompt to send
  tokens: number;              // Estimated token count
  model: string;               // Recommended model
  savings: TokenSavings;       // Statistics
  chunksUsed: number;          // How many chunks selected
  confidence: number;          // 0-1, how confident we are
}

interface TokenSavings {
  tokensSaved: number;
  percentage: number;
  costSaved: number;           // In USD
}
```

### 2.4 Model Router Interface

```typescript
/**
 * Model routing service
 * Selects optimal AI model based on query complexity and cost
 */
interface IModelRouter {
  /**
   * Select model for given query
   * @param tokens - Estimated token count
   * @param complexity - Query complexity 0-1
   * @param ollamaAvailable - Whether Ollama is available
   * @returns Selected model with rationale
   */
  selectModel(
    tokens: number,
    complexity: number,
    ollamaAvailable: boolean
  ): ModelChoice;

  /**
   * Check if model is available
   * @param model - Model name
   * @returns True if model is available
   */
  isAvailable(model: string): boolean;

  /**
   * Get model capabilities
   * @param model - Model name
   * @returns Model capabilities or null if unknown
   */
  getModelInfo(model: string): ModelInfo | null;
}

interface ModelChoice {
  model: string;
  provider: 'ollama' | 'claude' | 'workers_ai' | 'openai';
  cost: number;              // Estimated USD per 1M tokens
  maxTokens: number;
  reason: string;            // Why this model was chosen
}

interface ModelInfo {
  name: string;
  provider: string;
  inputCost: number;         // USD per 1M input tokens
  outputCost: number;        // USD per 1M output tokens
  maxTokens: number;
  contextWindow: number;
}
```

---

## 3. MCP Tools

### 3.1 Tool Overview

PRISM exposes tools via the Model Context Protocol for integration with Claude Code.

### 3.2 search_repo

Search codebase using semantic vector similarity.

```typescript
interface SearchRepoTool {
  name: 'search_repo';

  description: 'Search code repository for relevant files using semantic vector similarity. Use this tool when you need to find code related to a specific topic or concept without exact keyword matches.';

  input: {
    query: string;           // Natural language search query
    limit?: number;          // Max results (default: 10, max: 100)
    threshold?: number;      // Min similarity 0-1 (default: 0.7)
    extensions?: string[];   // Filter by file extensions
    exclude?: string[];      // Paths to exclude
  };

  output: {
    results: Array<{
      filePath: string;
      score: number;
      snippet: string;
      lineRange: [number, number];
    }>;
    query: string;
    totalResults: number;
    searchTime: number;      // Milliseconds
  };
}
```

**Example usage**:
```json
{
  "query": "authentication middleware",
  "limit": 20,
  "threshold": 0.8,
  "extensions": [".ts", ".js"]
}
```

**Example response**:
```json
{
  "results": [
    {
      "filePath": "src/auth/middleware.ts",
      "score": 0.94,
      "snippet": "export function authMiddleware(req, res, next) { const token = req.headers.authorization?.split(' ')[1]; ... }",
      "lineRange": [12, 22]
    }
  ],
  "query": "authentication middleware",
  "totalResults": 8,
  "searchTime": 156
}
```

---

### 3.3 optimize_context

Optimize context selection for token efficiency.

```typescript
interface OptimizeContextTool {
  name: 'optimize_context';

  description: 'Optimize context selection for a given query. Analyzes which files are most relevant and constructs an optimized context that fits within the token budget while maximizing relevance.';

  input: {
    query: string;           // Current task or question
    maxTokens?: number;      // Maximum token budget (default: 50000)
    budget?: number;         // Alias for maxTokens
  };

  output: {
    selectedFiles: Array<{
      filePath: string;
      relevanceScore: number;
      estimatedTokens: number;
      reason: string;        // Why this file was selected
    }>;
    totalTokens: number;
    budgetUsed: number;      // Percentage of budget used
    estimatedCoverage: number; // 0-1, how well query is covered
    confidence: number;      // 0-1, confidence in selection
  };
}
```

**Example usage**:
```json
{
  "query": "How does the user authentication flow work?",
  "maxTokens": 30000
}
```

**Example response**:
```json
{
  "selectedFiles": [
    {
      "filePath": "src/auth/login.ts",
      "relevanceScore": 0.95,
      "estimatedTokens": 2341,
      "reason": "Contains login function and password verification"
    },
    {
      "filePath": "src/auth/middleware.ts",
      "relevanceScore": 0.91,
      "estimatedTokens": 1876,
      "reason": "Contains JWT verification middleware"
    },
    {
      "filePath": "src/auth/tokens.ts",
      "relevanceScore": 0.87,
      "estimatedTokens": 1523,
      "reason": "Contains token generation and validation logic"
    }
  ],
  "totalTokens": 5740,
  "budgetUsed": 19.1,
  "estimatedCoverage": 0.94,
  "confidence": 0.92
}
```

---

### 3.4 get_usage_stats

Get token usage statistics and savings.

```typescript
interface GetUsageStatsTool {
  name: 'get_usage_stats';

  description: 'Get current token usage statistics including total queries, tokens saved, average reduction rate, and cost savings. Shows both session and cumulative statistics.';

  input: {
    period?: 'session' | 'today' | 'week' | 'all';  // Time period (default: 'session')
  };

  output: {
    session: {
      totalQueries: number;
      totalTokensUsed: number;
      totalTokensSaved: number;
      averageSavings: number;  // Percentage
      costSaved: number;      // USD
    };
    lastQuery?: {
      query: string;
      tokensUsed: number;
      tokensSaved: number;
      filesRetrieved: number;
      modelUsed: string;
    };
    cumulative: {
      queriesMade: number;
      totalFilesProcessed: number;
      tokenReductionRate: number;  // Percentage
    };
    modelDistribution: {
      ollama: number;
      haiku: number;
      sonnet: number;
      opus: number;
    };
  };
}
```

**Example usage**:
```json
{
  "period": "session"
}
```

**Example response**:
```json
{
  "session": {
    "totalQueries": 23,
    "totalTokensUsed": 45678,
    "totalTokensSaved": 387432,
    "averageSavings": 89.5,
    "costSaved": 1.16
  },
  "lastQuery": {
    "query": "authentication flow",
    "tokensUsed": 2134,
    "tokensSaved": 14108,
    "filesRetrieved": 8,
    "modelUsed": "claude-3.5-sonnet"
  },
  "cumulative": {
    "queriesMade": 156,
    "totalFilesProcessed": 456,
    "tokenReductionRate": 87.2
  },
  "modelDistribution": {
    "ollama": 15,
    "haiku": 5,
    "sonnet": 3,
    "opus": 0
  }
}
```

---

### 3.5 explain_usage

Explain current token usage and optimization opportunities.

```typescript
interface ExplainUsageTool {
  name: 'explain_usage';

  description: 'Explain current token usage and optimization opportunities. Returns detailed breakdown of total tokens used in conversation, tokens saved through vector search, context window utilization, and recommendations for further optimization.';

  input: {
    showRecommendations?: boolean;  // Include optimization tips (default: true)
  };

  output: {
    totalTokens: number;
    vectorSearchTokens: number;
    fullContextEquivalent: number;
    tokensSaved: number;
    savingsPercentage: number;
    contextUtilization: number;  // 0-1, how much of context window used
    recommendations?: string[];
  };
}
```

**Example usage**:
```json
{
  "showRecommendations": true
}
```

**Example response**:
```json
{
  "totalTokens": 2134,
  "vectorSearchTokens": 456,
  "fullContextEquivalent": 45678,
  "tokensSaved": 43544,
  "savingsPercentage": 95.3,
  "contextUtilization": 0.43,
  "recommendations": [
    "Consider increasing token budget to capture more context for complex queries",
    "Some frequently accessed files could be cached for faster retrieval",
    "Embedding cache hit rate is 78%, consider pre-warming cache for common queries"
  ]
}
```

---

## 4. Error Codes

### 4.1 Error Code Structure

All errors follow a consistent structure:

```typescript
interface PRISMError {
  code: string;           // Error code (e.g., VANTAGE_001)
  name: string;           // Error name (e.g., ParseError)
  message: string;        // Human-readable message
  category: ErrorCategory;
  severity: ErrorSeverity;
  details?: any;          // Additional error details
  suggestions?: string[]; // How to fix the error
  retryable: boolean;     // Can operation be retried
}

enum ErrorCategory {
  NETWORK = 'network',
  AUTH = 'auth',
  QUOTA = 'quota',
  PARSE = 'parse',
  STORAGE = 'storage',
  LLM = 'llm',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown',
}

enum ErrorSeverity {
  LOW = 'low',             // Warning, continue
  MEDIUM = 'medium',       // Degraded service
  HIGH = 'high',          // Critical, stop operation
}
```

### 4.2 Error Codes Reference

| Code | Name | Category | Severity | Retryable | Description |
|------|------|----------|----------|-----------|-------------|
| **VANTAGE_001** | `NetworkError` | NETWORK | MEDIUM | Yes | Network connectivity issue |
| **VANTAGE_002** | `AuthError` | AUTH | HIGH | No | Authentication failed |
| **VANTAGE_003** | `QuotaExceeded` | QUOTA | MEDIUM | Yes | Rate limit exceeded |
| **VANTAGE_004** | `ParseError` | PARSE | LOW | No | Code parsing failed |
| **VANTAGE_005** | `StorageError` | STORAGE | HIGH | Yes | Database access failed |
| **VANTAGE_006** | `LLMError` | LLM | MEDIUM | Yes | LLM API error |
| **VANTAGE_007** | `ValidationError` | VALIDATION | LOW | No | Invalid input |
| **VANTAGE_008** | `IndexNotFound` | STORAGE | MEDIUM | No | No index found |
| **VANTAGE_009** | `UnsupportedLanguage` | PARSE | LOW | No | Language not supported |
| **VANTAGE_010** | `EmbeddingFailed` | LLM | MEDIUM | Yes | Embedding generation failed |
| **VANTAGE_011** | `VectorSearchFailed` | STORAGE | MEDIUM | Yes | Vector search failed |
| **VANTAGE_012** | `FileTooLarge` | VALIDATION | LOW | No | File exceeds size limit |
| **VANTAGE_013** | `InvalidConfig` | VALIDATION | HIGH | No | Invalid configuration |
| **VANTAGE_014** | `SyncFailed` | NETWORK | MEDIUM | Yes | Sync operation failed |
| **VANTAGE_015** | `ConflictDetected` | STORAGE | LOW | No | Sync conflict detected |

### 4.3 Error Examples

#### VANTAGE_001: NetworkError

```json
{
  "code": "VANTAGE_001",
  "name": "NetworkError",
  "message": "Failed to connect to Cloudflare Workers AI",
  "category": "network",
  "severity": "medium",
  "details": {
    "url": "https://api.cloudflare.com/client/v4/accounts/xxx/ai/run/@cf/baai/bge-small-en-v1.5",
    "statusCode": 503,
    "statusMessage": "Service Unavailable"
  },
  "suggestions": [
    "Check your internet connection",
    "Try using local Ollama fallback: prism config set embeddings.provider ollama",
    "Retry the operation in a few minutes"
  ],
  "retryable": true
}
```

#### VANTAGE_003: QuotaExceeded

```json
{
  "code": "VANTAGE_003",
  "name": "QuotaExceeded",
  "message": "Cloudflare Workers AI free tier quota exceeded",
  "category": "quota",
  "severity": "medium",
  "details": {
    "service": "Workers AI",
    "limit": 10000,
    "used": 10523,
    "resetTime": "2026-01-14T00:00:00Z"
  },
  "suggestions": [
    "Switch to local Ollama: prism config set embeddings.provider ollama",
    "Wait for quota reset (daily at midnight UTC)",
    "Upgrade to paid plan for higher limits"
  ],
  "retryable": true
}
```

#### VANTAGE_004: ParseError

```json
{
  "code": "VANTAGE_004",
  "name": "ParseError",
  "message": "Failed to parse source file",
  "category": "parse",
  "severity": "low",
  "details": {
    "filePath": "src/auth/login.ts",
    "line": 47,
    "column": 15,
    "error": "Unexpected token '}'"
  },
  "suggestions": [
    "Check file for syntax errors",
    "Ensure file is valid TypeScript",
    "Try fixing syntax and re-index: prism index --force"
  ],
  "retryable": false
}
```

#### VANTAGE_008: IndexNotFound

```json
{
  "code": "VANTAGE_008",
  "name": "IndexNotFound",
  "message": "No index found for current directory",
  "category": "storage",
  "severity": "medium",
  "details": {
    "directory": "/home/user/project",
    "indexPath": "/home/user/project/.vantage/vectors.db"
  },
  "suggestions": [
    "Create index: prism index",
    "Specify index path: prism search --index /path/to/index"
  ],
  "retryable": false
}
```

#### VANTAGE_012: FileTooLarge

```json
{
  "code": "VANTAGE_012",
  "name": "FileTooLarge",
  "message": "File exceeds maximum size limit",
  "category": "validation",
  "severity": "low",
  "details": {
    "filePath": "src/large-data.ts",
    "fileSize": 5242880,
    "maxSize": 1048576,
    "maxSizeMB": 1
  },
  "suggestions": [
    "Increase size limit: prism index --max-size 5",
    "Split large file into smaller modules",
    "Exclude file from index: prism index --exclude src/large-data.ts"
  ],
  "retryable": false
}
```

### 4.4 Error Handling Best Practices

**For CLI Users**:
```bash
# Errors are displayed with helpful messages
$ prism search "auth"
Error: VANTAGE_008: No index found for current directory
Suggestions:
  - Create index: prism index
  - Specify index path: prism search --index /path/to/index

# Exit codes for scripting
$ prism search "auth" --format json; echo $?
1  # Non-zero exit code indicates error

# JSON output includes error field
$ prism search "auth" --format json
{
  "success": false,
  "error": {
    "code": "VANTAGE_008",
    "message": "No index found"
  }
}
```

**For MCP Integration**:
```typescript
// Tool execution errors are returned with isError flag
{
  "content": [
    {
      "type": "text",
      "text": "Error: No index found for current directory"
    }
  ],
  "isError": true,
  "error": {
    "code": "VANTAGE_008",
    "message": "No index found"
  }
}
```

---

## 5. Versioning and Compatibility

### 5.1 API Versioning

PRISM uses semantic versioning for API compatibility:

```
MAJOR.MINOR.PATCH

MAJOR: Breaking changes
MINOR: New features, backward compatible
PATCH: Bug fixes, backward compatible
```

### 5.2 Backward Compatibility Guarantees

**CLI Commands**:
- Existing commands will not be removed
- New options will be optional
- Default behavior will remain consistent

**TypeScript Interfaces**:
- New fields will be optional
- Existing fields will not be removed
- Deprecated fields will be marked with `@deprecated` JSDoc

**MCP Tools**:
- Tool signatures will not change in breaking ways
- New tools will be additive
- Tool deprecation will follow 2-version notice period

### 5.3 Deprecation Policy

1. **Announce** - Mark as deprecated in documentation
2. **Warn** - Emit runtime warnings for deprecated usage
3. **Remove** - Remove after 2 minor versions

Example:
```typescript
/**
 * @deprecated Use `searchRepo` instead. Will be removed in v0.3.0
 */
function search(query: string): Promise<SearchResult> {
  console.warn('search is deprecated, use searchRepo instead');
  return searchRepo(query);
}
```

---

**Document Status**: Complete
**Last Updated**: 2026-01-13
**Next Review**: After MVP implementation
