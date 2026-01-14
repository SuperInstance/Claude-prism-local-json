/**
 * ============================================================================
 * CLOUDFLARE WORKER ENTRY POINT
 * ============================================================================
 *
 * This is the main entry point for PRISM running on Cloudflare Workers.
 * It provides HTTP API endpoints for indexing and searching code.
 *
 * Architecture:
 * - HTTP Request → itty-router → Service handlers → Response
 * - Services use D1 for persistence and Workers AI for embeddings
 * - Authentication via JWT/API keys (middleware)
 *
 * @see docs/production/deployment.md
 */

import type { Env } from './types/worker.js';
import type { ExportedHandler } from '@cloudflare/workers-types';
import {
  calculateChecksum,
  chunkFile,
  CONFIG,
  decodeFloat32Array,
  detectLanguage,
  encodeFloat32Array,
  cosineSimilarity,
  type Chunk,
} from './shared/utils.js';

// ============================================================================
// IMPORTS
// ============================================================================

// Note: itty-router should be installed via npm
// For now, we'll create a simple router inline
// In production, we'll use: import { Router } from 'itty-router';

// ============================================================================
// TYPES
// ============================================================================

interface RequestContext {
  env: Env;
  request: Request;
}

interface CodeFile {
  path: string;
  content: string;
  language?: string;
}

interface IndexRequest {
  path?: string;  // Deprecated: Use files array instead
  files?: CodeFile[];
  options?: {
    incremental?: boolean;
    include?: string[];
    exclude?: string[];
    maxFileSize?: number;
    languages?: string[];
  };
}

interface SearchRequest {
  query: string;
  limit?: number;
  minScore?: number;
  filters?: {
    filePath?: string;       // Filter by file path (supports wildcards: src/**/*.ts)
    language?: string;       // Filter by language (typescript, python, etc.)
    pathPrefix?: string;     // Filter by path prefix (e.g., "src/", "lib/")
    createdAfter?: number;   // Filter by creation time (Unix timestamp ms)
    createdBefore?: number;  // Filter by creation time (Unix timestamp ms)
  };
}

interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface IndexResult {
  files: number;
  chunks: number;
  errors: number;
  duration: number;
  failedFiles: string[];
}

interface SearchResult {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  score: number;
}

// ============================================================================
// ROUTER
// ============================================================================

/**
 * Simple router for Cloudflare Workers
 * In production, replace with itty-router for more features
 */
class WorkerRouter {
  private routes: Map<string, Map<string, (request: Request, ctx: RequestContext) => Promise<Response>>> = new Map();

  /**
   * Register a GET route
   */
  get(path: string, handler: (request: Request, ctx: RequestContext) => Promise<Response>): void {
    this.addRoute('GET', path, handler);
  }

  /**
   * Register a POST route
   */
  post(path: string, handler: (request: Request, ctx: RequestContext) => Promise<Response>): void {
    this.addRoute('POST', path, handler);
  }

  /**
   * Register a route for any method
   */
  private addRoute(
    method: string,
    path: string,
    handler: (request: Request, ctx: RequestContext) => Promise<Response>
  ): void {
    if (!this.routes.has(method)) {
      this.routes.set(method, new Map());
    }
    this.routes.get(method)!.set(path, handler);
  }

  /**
   * Match and execute route
   */
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    const methodRoutes = this.routes.get(method);
    if (!methodRoutes) {
      return this.notFound();
    }

    // Try exact match first
    let handler = methodRoutes.get(path);
    if (handler) {
      return handler(request, { env, request });
    }

    // Try prefix match for dynamic routes
    const routes = Array.from(methodRoutes.entries());
    for (const [routePath, routeHandler] of routes) {
      if (this.matchRoute(routePath, path)) {
        return routeHandler(request, { env, request });
      }
    }

    return this.notFound();
  }

  /**
   * Simple route matching (supports :params)
   */
  private matchRoute(routePath: string, requestPath: string): boolean {
    // Convert route pattern to regex
    const pattern = routePath
      .replace(/:[^/]+/g, '([^/]+)')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(requestPath);
  }

  /**
   * 404 Not Found response
   */
  private notFound(): Response {
    return Response.json(
      {
        success: false,
        error: 'Not Found',
        message: 'The requested endpoint does not exist',
      } satisfies APIResponse,
      { status: 404 }
    );
  }
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * Health check endpoint
 *
 * GET /health
 *
 * Returns worker status and basic metrics
 */
async function healthCheck(request: Request, ctx: RequestContext): Promise<Response> {
  try {
    // Check D1 connection
    const dbResult = await ctx.env.DB.prepare('SELECT COUNT(*) as count FROM hnsw_metadata').first();

    return Response.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '0.2.0',
        environment: ctx.env.ENVIRONMENT || 'development',
        hnsw_initialized: dbResult && (dbResult as any).count > 0,
      },
    } satisfies APIResponse);
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Health check failed',
    } satisfies APIResponse, { status: 500 });
  }
}

/**
 * Index endpoint
 *
 * POST /api/index
 *
 * Indexes code files passed in the request body.
 * For Cloudflare Workers, files must be passed directly since there's no filesystem access.
 *
 * Request body:
 * {
 *   "files": [
 *     {
 *       "path": "src/example.ts",
 *       "content": "function example() { return true; }",
 *       "language": "typescript"
 *     }
 *   ],
 *   "options": {
 *     "incremental": true
 *   }
 * }
 */
async function indexCode(request: Request, ctx: RequestContext): Promise<Response> {
  try {
    const body = await request.json() as IndexRequest;

    // Validate request - support both old format (path) and new format (files array)
    if (!body.files && !body.path) {
      return Response.json({
        success: false,
        error: 'Missing required field: files or path',
      } satisfies APIResponse, { status: 400 });
    }

    // If path is provided, return info about the new format
    if (body.path && !body.files) {
      return Response.json({
        success: false,
        error: 'Direct filesystem access not available in Workers. Please provide files array.',
        message: 'Use { "files": [{"path": "...", "content": "..."}] } instead of { "path": "..." }',
      } satisfies APIResponse, { status: 400 });
    }

    const files = body.files || [];
    const options = body.options || {};
    const startTime = Date.now();

    // Track results
    let indexedFiles = 0;
    let indexedChunks = 0;
    let errors = 0;
    const failedFiles: string[] = [];

    // Process each file
    for (const file of files) {
      try {
        // Check if file should be skipped (incremental indexing)
        if (options.incremental) {
          const existingRecord = await ctx.env.DB.prepare(
            'SELECT checksum, last_modified FROM file_index WHERE path = ?'
          ).bind(file.path).first();

          if (existingRecord) {
            // Calculate checksum
            const checksum = await calculateChecksum(file.content);

            // If checksum matches, skip
            if ((existingRecord as any).checksum === checksum) {
              continue;
            }
          }
        }

        // Chunk the file (simple chunking by lines for now)
        const chunks = chunkFile(file.path, file.content, file.language || detectLanguage(file.path));

        // Generate embeddings for chunks
        const embeddings: number[][] = [];
        for (const chunk of chunks) {
          try {
            const embedding = await generateEmbedding(ctx, chunk.content);
            embeddings.push(embedding);
          } catch (error) {
            console.error(`Failed to generate embedding for ${file.path}:${chunk.startLine}:`, error);
            throw error;
          }
        }

        // Store chunks in D1
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = embeddings[i];
          const checksum = await calculateChecksum(chunk.content);

          await ctx.env.DB.prepare(`
            INSERT OR REPLACE INTO vector_chunks
            (id, file_path, content, start_line, end_line, language, embedding, checksum, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            `${file.path}:${i}`,
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
        const fileChecksum = await calculateChecksum(file.content);
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

    const duration = Date.now() - startTime;

    const result: IndexResult = {
      files: indexedFiles,
      chunks: indexedChunks,
      errors,
      duration,
      failedFiles,
    };

    return Response.json({
      success: true,
      data: result,
    } satisfies APIResponse);
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Indexing failed',
    } satisfies APIResponse, { status: 500 });
  }
}

/**
 * Search endpoint
 *
 * POST /api/search
 *
 * Searches indexed code using semantic similarity
 *
 * Request body:
 * {
 *   "query": "function to authenticate user",
 *   "limit": 10,
 *   "minScore": 0.7
 * }
 */
async function searchCode(request: Request, ctx: RequestContext): Promise<Response> {
  try {
    const body = await request.json() as SearchRequest;

    // Validate request
    if (!body.query) {
      return Response.json({
        success: false,
        error: 'Missing required field: query',
      } satisfies APIResponse, { status: 400 });
    }

    const limit = body.limit || 10;
    const minScore = body.minScore || 0.0;
    const filters = body.filters || {};

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(ctx, body.query);
    console.log(`Query embedding dimension: ${queryEmbedding.length}`);

    // Build SQL query with filters
    let sql = 'SELECT id, file_path, content, start_line, end_line, language, embedding, created_at FROM vector_chunks WHERE deleted_at IS NULL';
    const params: any[] = [];

    // Apply filters
    if (filters.language) {
      sql += ' AND language = ?';
      params.push(filters.language);
    }

    if (filters.pathPrefix) {
      sql += ' AND file_path LIKE ?';
      params.push(`${filters.pathPrefix}%`);
    }

    if (filters.filePath) {
      // Support both exact match and wildcard with %
      sql += ' AND file_path LIKE ?';
      params.push(filters.filePath.replace('*', '%'));
    }

    if (filters.createdAfter) {
      sql += ' AND created_at >= ?';
      params.push(filters.createdAfter);
    }

    if (filters.createdBefore) {
      sql += ' AND created_at <= ?';
      params.push(filters.createdBefore);
    }

    console.log(`SQL: ${sql}, params: ${params.join(', ')}`);

    // Execute query with filters
    // D1 requires all bind parameters in a single call
    let dbQuery = ctx.env.DB.prepare(sql);
    if (params.length > 0) {
      dbQuery = dbQuery.bind(...params);
    }
    const chunksResult = await dbQuery.all();

    console.log(`Found ${chunksResult.results.length} chunks in database (after filters)`);

    // Calculate similarities and sort
    const results: SearchResult[] = [];
    for (const row of chunksResult.results as any[]) {
      if (!row.embedding) continue;

      try {
        const chunkEmbedding = decodeFloat32Array(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

        if (similarity >= minScore) {
          results.push({
            id: row.id,
            filePath: row.file_path,
            content: row.content,
            startLine: row.start_line,
            endLine: row.end_line,
            language: row.language,
            score: similarity,
          });
        }
      } catch (error) {
        console.error(`Failed to process chunk ${row.id}:`, error);
        continue;
      }
    }

    // Sort by score descending and limit
    results.sort((a, b) => b.score - a.score);
    const limitedResults = results.slice(0, limit);

    return Response.json({
      success: true,
      data: {
        results: limitedResults,
        query: body.query,
        total: limitedResults.length,
      },
    } satisfies APIResponse);
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
    } satisfies APIResponse, { status: 500 });
  }
}

/**
 * Stats endpoint
 *
 * GET /api/stats
 *
 * Returns index statistics
 */
async function getStats(request: Request, ctx: RequestContext): Promise<Response> {
  try {
    // Get stats from D1
    const chunkCount = await ctx.env.DB.prepare('SELECT COUNT(*) as count FROM vector_chunks WHERE deleted_at IS NULL').first();
    const fileCount = await ctx.env.DB.prepare('SELECT COUNT(*) as count FROM file_index').first();

    return Response.json({
      success: true,
      data: {
        chunks: (chunkCount as any)?.count || 0,
        files: (fileCount as any)?.count || 0,
        indexedAt: new Date().toISOString(),
      },
    } satisfies APIResponse);
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    } satisfies APIResponse, { status: 500 });
  }
}

/**
 * Debug endpoint: Get all raw chunks with embedding info
 *
 * GET /api/debug/chunks
 *
 * Returns all chunks with embedding dimensions and sample values
 */
async function getRawChunks(request: Request, ctx: RequestContext): Promise<Response> {
  try {
    const chunksResult = await ctx.env.DB.prepare(`
      SELECT id, file_path, content, start_line, end_line, language, embedding
      FROM vector_chunks
      WHERE deleted_at IS NULL
      LIMIT 10
    `).all();

    const chunks = (chunksResult.results as any[]).map(row => {
      console.log(`Row ${row.id}: embedding type=${typeof row.embedding}, instanceof Uint8Array=${row.embedding instanceof Uint8Array}, length=${row.embedding?.length}`);

      let embedding: number[] = [];
      if (row.embedding) {
        try {
          embedding = decodeFloat32Array(row.embedding);
        } catch (e) {
          console.error(`Failed to decode embedding for ${row.id}:`, e);
        }
      }

      return {
        id: row.id,
        filePath: row.file_path,
        content: row.content.substring(0, 100) + '...',  // Truncate for readability
        startLine: row.start_line,
        endLine: row.end_line,
        language: row.language,
        embeddingDim: embedding.length,
        embeddingSample: embedding.slice(0, 5),  // First 5 values
      };
    });

    return Response.json({
      success: true,
      data: {
        chunks,
        total: chunks.length,
      },
    } satisfies APIResponse);
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get chunks',
    } satisfies APIResponse, { status: 500 });
  }
}

/**
 * Debug endpoint: Search using an existing chunk's embedding
 *
 * POST /api/debug/search-similarity
 *
 * Uses the first chunk's embedding as the query to test similarity calculation
 */
async function searchWithSimilarity(request: Request, ctx: RequestContext): Promise<Response> {
  try {
    // Get all chunks
    const chunksResult = await ctx.env.DB.prepare(`
      SELECT id, file_path, content, start_line, end_line, language, embedding
      FROM vector_chunks
      WHERE deleted_at IS NULL
    `).all();

    const chunks = chunksResult.results as any[];

    if (chunks.length === 0) {
      return Response.json({
        success: true,
        data: {
          results: [],
          message: 'No chunks in database',
        },
      } satisfies APIResponse);
    }

    // Use first chunk's embedding as query
    const firstChunk = chunks[0];
    const queryEmbedding = firstChunk.embedding ? decodeFloat32Array(firstChunk.embedding) : [];

    console.log(`Query embedding dim: ${queryEmbedding.length}`);
    console.log(`Total chunks: ${chunks.length}`);

    // Calculate similarities
    const results: SearchResult[] = [];
    for (const row of chunks) {
      if (!row.embedding) continue;

      try {
        const chunkEmbedding = decodeFloat32Array(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

        console.log(`Chunk ${row.id}: dim=${chunkEmbedding.length}, similarity=${similarity}`);

        results.push({
          id: row.id,
          filePath: row.file_path,
          content: row.content,
          startLine: row.start_line,
          endLine: row.end_line,
          language: row.language,
          score: similarity,
        });
      } catch (error) {
        console.error(`Failed to process chunk ${row.id}:`, error);
        continue;
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return Response.json({
      success: true,
      data: {
        results,
        queryUsed: `Using embedding from chunk: ${firstChunk.id}`,
        queryDim: queryEmbedding.length,
        total: results.length,
      },
    } satisfies APIResponse);
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
    } satisfies APIResponse, { status: 500 });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate embedding using Cloudflare Workers AI
 */
async function generateEmbedding(ctx: RequestContext, text: string): Promise<number[]> {
  try {
    const model = ctx.env.EMBEDDING_MODEL || '@cf/baai/bge-small-en-v1.5';

    // Call Workers AI with correct format for text embeddings
    const response = await ctx.env.AI.run(model, {
      text: [text]
    }) as {
      data?: number[][];
      shape?: number[];
    };

    if (!response || !response.data || !response.data[0] || response.data[0].length === 0) {
      throw new Error('Invalid embedding response');
    }

    return response.data[0];
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// WORKER EXPORT
// ============================================================================

// Create router and register routes
const router = new WorkerRouter();

// Health check
router.get('/health', healthCheck);

// API endpoints
router.post('/api/index', indexCode);
router.post('/api/search', searchCode);
router.get('/api/stats', getStats);

// Debug endpoints (for local testing without AI binding)
router.get('/api/debug/chunks', getRawChunks);
router.post('/api/debug/search-similarity', searchWithSimilarity);

/**
 * Cloudflare Worker fetch handler
 *
 * This is the main entry point that Cloudflare Workers calls
 * for every HTTP request
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route the request
      const response = await router.handle(request, env);

      // Add CORS headers to response
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    } catch (error) {
      // Global error handler
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      } satisfies APIResponse, {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
} satisfies ExportedHandler<Env>;
