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
 * @version 0.3.2
 */

// ============================================================================
// Imports
// ============================================================================

import {
  calculateChecksum,
  chunkFile,
  CONFIG,
  decodeFloat32Array,
  detectLanguage,
  encodeFloat32Array,
  errorResponse,
  jsonResponse,
  sanitizeQuery,
  getCorsHeaders,
  createLogger,
  setLogLevelFromEnv,
  type Chunk,
  validateContent,
  validatePath,
} from "./shared/utils.js";

// Initialize logger
const logger = createLogger('PRISM-Worker');

// ============================================================================
// Type Definitions
// ============================================================================

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
    const origin = request.headers.get('Origin');

    // Handle OPTIONS preflight request
    if (method === 'OPTIONS') {
      const corsHeaders = getCorsHeaders(origin);
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const methodRoutes = this.routes.get(method);
    if (!methodRoutes) {
      return this.notFound(origin);
    }

    const handler = methodRoutes.get(path);
    if (handler) {
      return handler(request, { env, request, origin });
    }

    // Try pattern matching
    for (const [routePath, routeHandler] of methodRoutes.entries()) {
      if (this.matchRoute(routePath, path)) {
        return routeHandler(request, { env, request, origin });
      }
    }

    return this.notFound(origin);
  }

  private matchRoute(routePath: string, requestPath: string): boolean {
    const pattern = routePath
      .replace(/:[^/]+/g, "([^/]+)")
      .replace(/\*/g, ".*");
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(requestPath);
  }

  private notFound(origin: string | null): Response {
    const corsHeaders = getCorsHeaders(origin);
    return Response.json(
      {
        success: false,
        error: "Not Found",
        message: "The requested endpoint does not exist"
      },
      { status: 404, headers: corsHeaders }
    );
  }
}

// ============================================
// Utility Functions
// ============================================


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
  ctx: { env: Env; request: Request; origin?: string | null }
): Promise<Response> {
  try {
    // Check D1
    const dbResult = await ctx.env.DB
      .prepare("SELECT COUNT(*) as count FROM hnsw_metadata")
      .first();

    // Check Vectorize
    const vectorizeInfo = await ctx.env.VECTORIZE.describe();

    return jsonResponse({
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
    }, 200, ctx.origin);
  } catch (error) {
    return errorResponse(error, 500, ctx.origin);
  }
}

/**
 * Index code endpoint
 */
async function indexCode(
  request: Request,
  ctx: { env: Env; request: Request; origin?: string | null }
): Promise<Response> {
  try {
    const body = await request.json() as IndexRequest;

    // Validate request
    if (!body.files && !body.path) {
      return errorResponse("Missing required field: files or path", 400, ctx.origin);
    }

    if (body.path && !body.files) {
      return errorResponse(
        "Direct filesystem access not available in Workers. " +
        'Use { "files": [{"path": "...", "content": "..."}] }',
        400,
        ctx.origin
      );
    }

    const files = body.files || [];
    const options = body.options || {};
    const startTime = Date.now();

    // Validate file count
    if (files.length > CONFIG.MAX_FILES_PER_BATCH) {
      return errorResponse(
        `Too many files: ${files.length}. Maximum: ${CONFIG.MAX_FILES_PER_BATCH}`,
        400,
        ctx.origin
      );
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
              logger.debug(`Skipping unchanged file: ${file.path}`);
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
        logger.error(`Failed to index ${file.path}:`, error);
      }
    }

    // Batch upsert to Vectorize
    if (vectorsToUpsert.length > 0) {
      try {
        const upsertResult = await ctx.env.VECTORIZE.upsert(vectorsToUpsert);
        logger.debug(`Vectorize upsert: ${upsertResult.mutationId}, ${vectorsToUpsert.length} vectors`);
      } catch (error) {
        logger.error("Vectorize upsert failed:", error);
        // Data is safe in D1
      }
    }

    const duration = Date.now() - startTime;

    return jsonResponse({
      files: indexedFiles,
      chunks: indexedChunks,
      errors,
      duration,
      failedFiles
    } as IndexResult, 200, ctx.origin);

  } catch (error) {
    return errorResponse(error, 500, ctx.origin);
  }
}

/**
 * Search code endpoint
 */
async function searchCode(
  request: Request,
  ctx: { env: Env; request: Request; origin?: string | null }
): Promise<Response> {
  try {
    const body = await request.json() as SearchRequest;

    // Validate request
    if (!body.query) {
      return errorResponse("Missing required field: query", 400, ctx.origin);
    }

    const query = sanitizeQuery(body.query);

    // Check if query is empty after sanitization
    if (query.length === 0) {
      return errorResponse("Query cannot be empty", 400, ctx.origin);
    }
    const limit = Math.max(
      1,
      Math.min(
        body.limit || CONFIG.DEFAULT_SEARCH_LIMIT,
        CONFIG.MAX_SEARCH_LIMIT
      )
    );
    const minScore = Math.max(0, Math.min(1, body.minScore ?? 0));
    const filters = body.filters || {};

    // Validate date filters if provided
    if (filters.createdAfter !== undefined) {
      const timestamp = Number(filters.createdAfter);
      if (isNaN(timestamp) || timestamp < 0) {
        return errorResponse("Invalid createdAfter value: must be a positive timestamp", 400, ctx.origin);
      }
    }

    if (filters.createdBefore !== undefined) {
      const timestamp = Number(filters.createdBefore);
      if (isNaN(timestamp) || timestamp < 0) {
        return errorResponse("Invalid createdBefore value: must be a positive timestamp", 400, ctx.origin);
      }
    }

    logger.debug(`Searching for: "${query}" with limit ${limit}`);

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
      logger.debug(`Vectorize returned ${matches.length} matches`);
    } catch (error) {
      logger.error("Vectorize query failed:", error);
      return errorResponse(
        `Vector search failed: ${error instanceof Error ? error.message : String(error)}`,
        500,
        ctx.origin
      );
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
        logger.warn(`Chunk ${match.id} not found in D1`);
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

    logger.debug(`Returning ${results.length} results after filtering`);

    return jsonResponse({
      results,
      query,
      total: results.length
    }, 200, ctx.origin);

  } catch (error) {
    return errorResponse(error, 500, ctx.origin);
  }
}

/**
 * Get index statistics
 */
async function getStats(
  request: Request,
  ctx: { env: Env; request: Request; origin?: string | null }
): Promise<Response> {
  try {
    const [chunkCount, fileCount, vectorizeInfo] = await Promise.all([
      ctx.env.DB.prepare("SELECT COUNT(*) as count FROM vector_chunks WHERE deleted_at IS NULL").first(),
      ctx.env.DB.prepare("SELECT COUNT(*) as count FROM file_index").first(),
      ctx.env.VECTORIZE.describe()
    ]);

    return jsonResponse({
      chunks: chunkCount?.count ?? 0,
      files: fileCount?.count ?? 0,
      vectorize: {
        dimensions: vectorizeInfo.dimensions,
        metric: vectorizeInfo.metric,
        count: vectorizeInfo.count
      },
      indexedAt: new Date().toISOString()
    }, 200, ctx.origin);

  } catch (error) {
    return errorResponse(error, 500, ctx.origin);
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
    // Initialize log level from environment
    setLogLevelFromEnv(env.LOG_LEVEL);

    return router.handle(request, env);
  }
};
