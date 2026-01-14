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

interface IndexRequest {
  path: string;
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
    filePath?: string;
    language?: string;
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
 * Indexes a directory of code files
 *
 * Request body:
 * {
 *   "path": "/path/to/code",
 *   "options": {
 *     "incremental": true,
 *     "include": ["*.ts", "*.js"],
 *     "exclude": ["node_modules"]
 *   }
 * }
 */
async function indexCode(request: Request, ctx: RequestContext): Promise<Response> {
  try {
    const body = await request.json() as IndexRequest;

    // Validate request
    if (!body.path) {
      return Response.json({
        success: false,
        error: 'Missing required field: path',
      } satisfies APIResponse, { status: 400 });
    }

    // TODO: Implement actual indexing
    // For now, return a placeholder response
    const result: IndexResult = {
      files: 0,
      chunks: 0,
      errors: 0,
      duration: 0,
      failedFiles: [],
    };

    return Response.json({
      success: true,
      data: result,
      message: 'Indexing not yet implemented - placeholder response',
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

    // TODO: Implement actual search
    // For now, return a placeholder response
    const results: SearchResult[] = [];

    return Response.json({
      success: true,
      data: {
        results,
        query: body.query,
        total: 0,
      },
      message: 'Search not yet implemented - placeholder response',
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
