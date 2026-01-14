/**
 * PRISM Worker with Cloudflare Vectorize Integration
 *
 * Architecture:
 * - Vectorize: Fast vector similarity search with ANN indexing
 * - D1: Metadata storage, file tracking, SHA-256 checksums
 * - Workers AI: Embedding generation
 *
 * Benefits:
 * - <10ms search time even for 100K+ chunks
 * - Metadata filtering support
 * - Automatic scaling
 *
 * @version 0.3.1
 */

// ============================================
// Constants
// ============================================

const CONFIG = {
  MAX_CHUNKS_PER_FILE: 1000,
  MAX_LINES_PER_CHUNK: 50,
  MIN_CHUNK_CONTENT_LENGTH: 1,
  MAX_SEARCH_LIMIT: 100,
  DEFAULT_SEARCH_LIMIT: 10,
  MAX_FILES_PER_BATCH: 100,
  MAX_EMBEDDING_CONCURRENCY: 10,
  EMBEDDING_DIMENSIONS: 384,
} as const;

// ============================================
// Type Definitions
// ============================================

interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: {
    filePath?: string;
    language?: string;
    startLine?: number;
    endLine?: number;
    checksum?: string;
    [key: string]: string | number | undefined;
  };
}

interface VectorizeMatch {
  id: string;
  score: number;
  vector?: number[];
  metadata?: Record<string, string | number>;
}

interface VectorizeFilter {
  [key: string]: string | number | boolean;
}

interface VectorizeQueryResult {
  matches: VectorizeMatch[];
  count?: number;
}

interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
  language: string;
}

interface IndexRequest {
  files?: Array<{
    path: string;
    content: string;
    language?: string;
  }>;
  path?: string;
  options?: {
    incremental?: boolean;
  };
}

interface SearchRequest {
  query: string;
  limit?: number;
  minScore?: number;
  filters?: {
    filePath?: string;
    language?: string;
    pathPrefix?: string;
    createdAfter?: number;
    createdBefore?: number;
  };
}

interface IndexResult {
  files: number;
  chunks: number;
  errors: number;
  duration: number;
  failedFiles: string[];
}

interface SearchFilters {
  language?: string;
  pathPrefix?: string;
  filePath?: string;
  createdAfter?: number;
  createdBefore?: number;
}

interface Env {
  /** Vectorize index for vector search */
  VECTORIZE: VectorizeIndex;
  /** D1 database for metadata */
  DB: D1Database;
  /** Workers AI for embeddings */
  AI: Ai;
  /** Environment name */
  ENVIRONMENT: string;
  /** Logging level */
  LOG_LEVEL: string;
  /** Embedding model to use */
  EMBEDDING_MODEL: string;
}

// Type for router handler functions
type RouteHandler = (request: Request, ctx: { env: Env; request: Request }) => Promise<Response>;

// ============================================
// Simple Router
// ============================================

class WorkerRouter {
  private routes = new Map<string, Map<string, RouteHandler>>();

  get(path: string, handler: RouteHandler): void {
    this.addRoute("GET", path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.addRoute("POST", path, handler);
  }

  private addRoute(method: string, path: string, handler: RouteHandler): void {
    if (!this.routes.has(method)) {
      this.routes.set(method, new Map());
    }
    this.routes.get(method)!.set(path, handler);
  }

  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    const methodRoutes = this.routes.get(method);
    if (!methodRoutes) {
      return this.notFound();
    }

    const handler = methodRoutes.get(path);
    if (handler) {
      return handler(request, { env, request });
    }

    // Try pattern matching
    for (const [routePath, routeHandler] of methodRoutes.entries()) {
      if (this.matchRoute(routePath, path)) {
        return routeHandler(request, { env, request });
      }
    }

    return this.notFound();
  }

  private matchRoute(routePath: string, requestPath: string): boolean {
    const pattern = routePath
      .replace(/:[^/]+/g, "([^/]+)")
      .replace(/\*/g, ".*");
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(requestPath);
  }

  private notFound(): Response {
    return Response.json(
      {
        success: false,
        error: "Not Found",
        message: "The requested endpoint does not exist"
      },
      { status: 404 }
    );
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate SHA-256 checksum of content
 * @param content - Text content to hash
 * @returns Hex-encoded SHA-256 hash
 */
async function calculateChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Detect programming language from file path
 * @param path - File path
 * @returns Detected language or "text"
 */
function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    c: "c",
    h: "c",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    kt: "kotlin",
    swift: "swift",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    yaml: "yaml",
    yml: "yaml",
    json: "json",
    md: "markdown",
    toml: "toml",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sql: "sql",
  };
  return languageMap[ext || ""] || "text";
}

/**
 * Split file content into chunks
 * @param filePath - File path for error reporting
 * @param content - File content
 * @param language - Detected language
 * @returns Array of chunks
 * @throws Error if content is too large
 */
function chunkFile(filePath: string, content: string, language: string): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  const maxLinesPerChunk = CONFIG.MAX_LINES_PER_CHUNK;
  let startLine = 0;

  while (startLine < lines.length) {
    const endLine = Math.min(startLine + maxLinesPerChunk, lines.length);
    const chunkContent = lines.slice(startLine, endLine).join("\n");

    // Only include non-empty chunks
    if (chunkContent.trim().length >= CONFIG.MIN_CHUNK_CONTENT_LENGTH) {
      chunks.push({
        content: chunkContent,
        startLine: startLine + 1, // 1-indexed
        endLine,
        language
      });
    }

    startLine = endLine;
  }

  // Validate chunk count
  if (chunks.length > CONFIG.MAX_CHUNKS_PER_FILE) {
    throw new Error(
      `File ${filePath} has too many chunks (${chunks.length}). ` +
      `Maximum allowed: ${CONFIG.MAX_CHUNKS_PER_FILE}`
    );
  }

  return chunks;
}

/**
 * Generate embedding for text using Workers AI
 * @param ctx - Context with env binding
 * @param text - Text to embed
 * @returns Embedding vector
 * @throws Error if embedding generation fails
 */
async function generateEmbedding(
  ctx: { env: Env },
  text: string
): Promise<number[]> {
  try {
    const model = ctx.env.EMBEDDING_MODEL || "@cf/baai/bge-small-en-v1.5";
    const response = await ctx.env.AI.run(model, {
      text: [text]
    }) as { data?: number[][]; shape?: number[] };

    if (!response?.data?.[0]?.length) {
      throw new Error("Invalid embedding response from Workers AI");
    }

    const embedding = response.data[0];
    if (embedding.length !== CONFIG.EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Invalid embedding dimensions: expected ${CONFIG.EMBEDDING_DIMENSIONS}, ` +
        `got ${embedding.length}`
      );
    }

    return embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Embedding generation failed: ${message}`);
  }
}

/**
 * Encode float array to Uint8Array for D1 BLOB storage
 * @param array - Float array to encode
 * @returns Uint8Array representation
 */
function encodeFloat32Array(array: number[]): Uint8Array {
  const float32Array = new Float32Array(array);
  return new Uint8Array(float32Array.buffer);
}

/**
 * Decode D1 BLOB to float array
 * @param blob - Blob from D1 (various formats)
 * @returns Float array
 */
function decodeFloat32Array(blob: Uint8Array | ArrayLike<number> | Record<string, unknown>): number[] {
  let bytes: Uint8Array;

  if (blob instanceof Uint8Array) {
    bytes = blob;
  } else if (Array.isArray(blob)) {
    bytes = new Uint8Array(blob);
  } else if (blob && typeof blob === 'object') {
    if (blob.buffer instanceof ArrayBuffer) {
      bytes = new Uint8Array(blob.buffer);
    } else {
      // Handle D1 object format
      bytes = new Uint8Array(Object.values(blob).filter((v): v is number => typeof v === 'number'));
    }
  } else {
    throw new Error(`Invalid blob type: ${typeof blob}`);
  }

  if (bytes.length % 4 !== 0) {
    throw new Error(`Invalid blob length for float32: ${bytes.length} (must be multiple of 4)`);
  }

  const float32Array = new Float32Array(bytes.buffer);
  return Array.from(float32Array);
}

/**
 * Validate file path to prevent path traversal attacks
 * @param path - File path to validate
 * @returns True if valid
 * @throws Error if path contains suspicious patterns
 */
function validatePath(path: string): void {
  // Check for path traversal attempts
  if (path.includes('..') || path.includes('~')) {
    throw new Error(`Invalid file path: ${path}`);
  }

  // Check for absolute paths (not allowed in Workers)
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    throw new Error(`Absolute paths not allowed: ${path}`);
  }

  // Check for null bytes
  if (path.includes('\0')) {
    throw new Error(`Null bytes not allowed in path`);
  }
}

/**
 * Validate file content
 * @param path - File path for error reporting
 * @param content - File content
 * @throws Error if content is invalid
 */
function validateContent(path: string, content: string): void {
  if (typeof content !== 'string') {
    throw new Error(`Invalid content type for ${path}`);
  }

  if (content.length === 0) {
    throw new Error(`Empty file content: ${path}`);
  }

  if (content.length > 10_000_000) { // 10MB limit
    throw new Error(`File too large: ${path} (${content.length} bytes)`);
  }
}

/**
 * Sanitize search query
 * @param query - Search query
 * @returns Sanitized query
 */
function sanitizeQuery(query: string): string {
  return query.trim().slice(0, 1000); // Max 1000 chars
}

/**
 * Apply additional filters to search results
 * @param filters - Search filters
 * @param chunkRow - Chunk data from D1
 * @returns True if chunk passes all filters
 */
function applyFilters(filters: SearchFilters, chunkRow: Record<string, unknown>): boolean {
  if (filters.language && chunkRow.language !== filters.language) {
    return false;
  }

  if (filters.pathPrefix && !String(chunkRow.file_path).startsWith(filters.pathPrefix)) {
    return false;
  }

  if (filters.filePath) {
    const pattern = filters.filePath.replace('*', '');
    if (!String(chunkRow.file_path).includes(pattern)) {
      return false;
    }
  }

  return true;
}

// ============================================
// Endpoint Handlers
// ============================================

/**
 * Health check endpoint
 */
async function healthCheck(
  request: Request,
  ctx: { env: Env; request: Request }
): Promise<Response> {
  try {
    // Check D1
    const dbResult = await ctx.env.DB
      .prepare("SELECT COUNT(*) as count FROM hnsw_metadata")
      .first();

    // Check Vectorize
    const vectorizeInfo = await ctx.env.VECTORIZE.describe();

    return Response.json({
      success: true,
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "0.3.1",
        environment: ctx.env.ENVIRONMENT || "development",
        vectorize: {
          dimensions: vectorizeInfo.dimensions,
          metric: vectorizeInfo.metric,
          count: vectorizeInfo.count
        },
        d1_initialized: dbResult && dbResult.count > 0
      }
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Health check failed"
    }, { status: 500 });
  }
}

/**
 * Index code endpoint
 */
async function indexCode(
  request: Request,
  ctx: { env: Env; request: Request }
): Promise<Response> {
  try {
    const body = await request.json() as IndexRequest;

    // Validate request
    if (!body.files && !body.path) {
      return Response.json({
        success: false,
        error: "Missing required field: files or path"
      }, { status: 400 });
    }

    if (body.path && !body.files) {
      return Response.json({
        success: false,
        error: "Direct filesystem access not available in Workers",
        message: 'Use { "files": [{"path": "...", "content": "..."}] }'
      }, { status: 400 });
    }

    const files = body.files || [];
    const options = body.options || {};
    const startTime = Date.now();

    // Validate file count
    if (files.length > CONFIG.MAX_FILES_PER_BATCH) {
      return Response.json({
        success: false,
        error: `Too many files: ${files.length}. Maximum: ${CONFIG.MAX_FILES_PER_BATCH}`
      }, { status: 400 });
    }

    let indexedFiles = 0;
    let indexedChunks = 0;
    let errors = 0;
    const failedFiles: string[] = [];
    const vectorsToUpsert: VectorizeVector[] = [];

    for (const file of files) {
      try {
        // Validate inputs
        validatePath(file.path);
        validateContent(file.path, file.content);

        // Check incremental
        if (options.incremental) {
          const existingRecord = await ctx.env.DB
            .prepare("SELECT checksum FROM file_index WHERE path = ?")
            .bind(file.path)
            .first();

          if (existingRecord) {
            const checksum = await calculateChecksum(file.content);
            if (existingRecord.checksum === checksum) {
              console.log(`Skipping unchanged file: ${file.path}`);
              continue;
            }
          }
        }

        // Process file
        const language = file.language || detectLanguage(file.path);
        const chunks = chunkFile(file.path, file.content, language);

        // Generate embeddings with concurrency limit
        const embeddings: number[][] = [];
        for (let i = 0; i < chunks.length; i += CONFIG.MAX_EMBEDDING_CONCURRENCY) {
          const batch = chunks.slice(i, i + CONFIG.MAX_EMBEDDING_CONCURRENCY);
          const batchEmbeddings = await Promise.all(
            batch.map(chunk => generateEmbedding(ctx, chunk.content))
          );
          embeddings.push(...batchEmbeddings);
        }

        // Calculate file checksum once
        const fileChecksum = await calculateChecksum(file.content);

        // Prepare vectors and D1 inserts
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = embeddings[i];
          const chunkId = `${file.path}:${i}`;
          const checksum = await calculateChecksum(chunk.content);

          // Add to Vectorize batch
          vectorsToUpsert.push({
            id: chunkId,
            values: embedding,
            metadata: {
              filePath: file.path,
              language: chunk.language,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              checksum
            }
          });

          // Store in D1
          await ctx.env.DB.prepare(`
            INSERT OR REPLACE INTO vector_chunks
            (id, file_path, content, start_line, end_line, language, embedding, checksum, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            chunkId,
            file.path,
            chunk.content,
            chunk.startLine,
            chunk.endLine,
            chunk.language,
            encodeFloat32Array(embedding),
            checksum,
            Date.now(),
            Date.now()
          ).run();
        }

        // Update file index
        await ctx.env.DB.prepare(`
          INSERT OR REPLACE INTO file_index
          (path, checksum, file_size, last_modified, last_indexed, chunk_count)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          file.path,
          fileChecksum,
          file.content.length,
          Date.now(),
          Date.now(),
          chunks.length
        ).run();

        indexedFiles++;
        indexedChunks += chunks.length;

      } catch (error) {
        errors++;
        failedFiles.push(file.path);
        console.error(`Failed to index ${file.path}:`, error);
      }
    }

    // Batch upsert to Vectorize
    if (vectorsToUpsert.length > 0) {
      try {
        const upsertResult = await ctx.env.VECTORIZE.upsert(vectorsToUpsert);
        console.log(`Vectorize upsert: ${upsertResult.mutationId}, ${vectorsToUpsert.length} vectors`);
      } catch (error) {
        console.error("Vectorize upsert failed:", error);
        // Data is safe in D1
      }
    }

    const duration = Date.now() - startTime;

    return Response.json({
      success: true,
      data: {
        files: indexedFiles,
        chunks: indexedChunks,
        errors,
        duration,
        failedFiles
      } as IndexResult
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Indexing failed"
    }, { status: 500 });
  }
}

/**
 * Search code endpoint
 */
async function searchCode(
  request: Request,
  ctx: { env: Env; request: Request }
): Promise<Response> {
  try {
    const body = await request.json() as SearchRequest;

    // Validate request
    if (!body.query) {
      return Response.json({
        success: false,
        error: "Missing required field: query"
      }, { status: 400 });
    }

    const query = sanitizeQuery(body.query);
    const limit = Math.min(
      body.limit || CONFIG.DEFAULT_SEARCH_LIMIT,
      CONFIG.MAX_SEARCH_LIMIT
    );
    const minScore = Math.max(0, Math.min(1, body.minScore ?? 0));
    const filters = body.filters || {};

    console.log(`Searching for: "${query}" with limit ${limit}`);

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(ctx, query);

    // Build query options
    const queryOptions = {
      topK: limit * 2, // Get extra for post-filtering
      returnValues: false,
      returnMetadata: "all" as const,
    };

    // Execute vector search
    let matches: VectorizeMatch[];
    try {
      const queryResult = await ctx.env.VECTORIZE.query(queryEmbedding, queryOptions) as VectorizeQueryResult;
      matches = queryResult.matches || [];
      console.log(`Vectorize returned ${matches.length} matches`);
    } catch (error) {
      console.error("Vectorize query failed:", error);
      return Response.json({
        success: false,
        error: `Vector search failed: ${error instanceof Error ? error.message : String(error)}`
      }, { status: 500 });
    }

    // Fetch full content and apply filters
    const results: Array<{
      id: string;
      filePath: string;
      content: string;
      startLine: number;
      endLine: number;
      language: string;
      score: number;
    }> = [];
    const processedIds = new Set<string>();

    for (const match of matches) {
      // Skip low scores
      if (match.score < minScore) continue;

      // Skip duplicates
      if (processedIds.has(match.id)) continue;
      processedIds.add(match.id);

      // Fetch from D1
      const chunkRow = await ctx.env.DB
        .prepare("SELECT id, file_path, content, start_line, end_line, language FROM vector_chunks WHERE id = ?")
        .bind(match.id)
        .first();

      if (!chunkRow) {
        console.warn(`Chunk ${match.id} not found in D1`);
        continue;
      }

      // Apply filters
      if (!applyFilters(filters, chunkRow)) continue;

      results.push({
        id: String(chunkRow.id),
        filePath: String(chunkRow.file_path),
        content: String(chunkRow.content),
        startLine: Number(chunkRow.start_line),
        endLine: Number(chunkRow.end_line),
        language: String(chunkRow.language),
        score: match.score
      });

      // Stop if we have enough
      if (results.length >= limit) break;
    }

    console.log(`Returning ${results.length} results after filtering`);

    return Response.json({
      success: true,
      data: {
        results,
        query,
        total: results.length
      }
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Search failed"
    }, { status: 500 });
  }
}

/**
 * Get index statistics
 */
async function getStats(
  request: Request,
  ctx: { env: Env; request: Request }
): Promise<Response> {
  try {
    const [chunkCount, fileCount, vectorizeInfo] = await Promise.all([
      ctx.env.DB.prepare("SELECT COUNT(*) as count FROM vector_chunks WHERE deleted_at IS NULL").first(),
      ctx.env.DB.prepare("SELECT COUNT(*) as count FROM file_index").first(),
      ctx.env.VECTORIZE.describe()
    ]);

    return Response.json({
      success: true,
      data: {
        chunks: chunkCount?.count ?? 0,
        files: fileCount?.count ?? 0,
        vectorize: {
          dimensions: vectorizeInfo.dimensions,
          metric: vectorizeInfo.metric,
          count: vectorizeInfo.count
        },
        indexedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get stats"
    }, { status: 500 });
  }
}

// ============================================
// Router Setup
// ============================================

const router = new WorkerRouter();

router.get("/health", healthCheck);
router.post("/api/index", indexCode);
router.post("/api/search", searchCode);
router.get("/api/stats", getStats);

// ============================================
// Worker Entry Point
// ============================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const response = await router.handle(request, env);

      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        headers: newHeaders
      });

    } catch (error) {
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      }, {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};
