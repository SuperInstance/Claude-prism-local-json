# Cloudflare Workers & Vectorize Best Practices (2025)

**Research Date**: 2025-01-14
**Researcher**: Claude (Research Agent)
**Status**: Final
**Focus**: Security, Type Safety, Error Handling, Performance, Code Organization

## Executive Summary

This document provides comprehensive best practices for building production-ready applications with Cloudflare Workers, Vectorize, and D1 in 2025. All recommendations are backed by official Cloudflare documentation and real-world implementation patterns.

**Key Findings:**
- Security headers and CORS are critical but often misconfigured
- Type safety requires explicit `Env` interface definitions
- Error handling needs structured responses and graceful degradation
- Performance optimization requires understanding of index creation and query patterns
- Rate limiting is now GA with native API support

---

## 1. Security Best Practices

### 1.1 CORS Configuration

**Problem**: CORS errors are the #1 issue reported by Cloudflare Workers users.

**Solution**: Implement proper CORS headers with preflight handling.

```typescript
// src/middleware/cors.ts
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // Replace with specific origin in production
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400', // 24 hours
};

export function withCors(handler: ExportedHandler) {
  return {
    ...handler,
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
      // Handle preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS,
        });
      }

      const response = await handler.fetch(request, env, ctx);

      // Add CORS headers to response
      const newHeaders = new Headers(response.headers);
      Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    },
  };
}
```

**Production Best Practice**: Whitelist specific origins:

```typescript
const ALLOWED_ORIGINS = [
  'https://yourdomain.com',
  'https://app.yourdomain.com',
];

export function getCorsHeaders(origin: string | null) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || '') ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}
```

### 1.2 Security Headers Implementation

**Source**: [Cloudflare Workers Security Headers Example](https://developers.cloudflare.com/workers/examples/security-headers/)

**Recommended Headers**:

```typescript
// src/middleware/security.ts
export const SECURITY_HEADERS = {
  // Content Security Policy - prevent XSS
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://*.cloudflare.com",
  ].join('; '),

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // Prevent MIME-sniffing
  'X-Content-Type-Options': 'nosniff',

  // XSS protection (legacy but still useful)
  'X-XSS-Protection': '1; mode=block',

  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions policy
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',

  // HSTS (only enable after testing)
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

// Headers to remove for security
export const BLOCKED_HEADERS = [
  'X-Powered-By',
  'X-AspNet-Version',
  'Server',
];

export function addSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);

  // Add security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });

  // Remove information leakage headers
  BLOCKED_HEADERS.forEach((header) => {
    newHeaders.delete(header);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
```

### 1.3 Input Validation Patterns

**Critical Constraint**: Cloudflare Workers does NOT allow dynamic code generation (`eval`, `new Function()`). Many validation libraries fail in Workers.

**Recommended Approach**: Use Zod (TypeScript-first, eval-free) or `@cloudflare/cabidela` (Workers-optimized).

```typescript
// src/utils/validation.ts
import { z } from 'zod';

// Define schema for API input
export const SearchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).default(10),
  filters: z.record(z.string()).optional(),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

// Validation wrapper
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      };
    }
    return { success: false, error: 'Validation failed' };
  }
}
```

**Usage in Worker**:

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const body = await request.json();
      const validation = validateRequest(SearchQuerySchema, body);

      if (!validation.success) {
        return jsonResponse({ error: validation.error }, 400);
      }

      // Process validated request
      return jsonResponse({ results: [] });
    } catch (error) {
      return jsonResponse({ error: 'Invalid request' }, 400);
    }
  },
};
```

### 1.4 SQL Injection Prevention (D1)

**Source**: [D1 Prepared Statements Documentation](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)

**Critical Rule**: NEVER use string interpolation for SQL queries. Always use prepared statements.

```typescript
// src/db/queries.ts
interface Env {
  DB: D1Database;
}

// ❌ BAD - SQL injection vulnerability
async function badSearch(env: Env, userId: string) {
  const result = await env.DB.prepare(
    `SELECT * FROM users WHERE id = '${userId}'`
  ).all();
  return result;
}

// ✅ GOOD - Using prepared statements
async function goodSearch(env: Env, userId: string) {
  const stmt = env.DB.prepare(
    'SELECT * FROM users WHERE id = ?1'
  );
  const result = await stmt.bind(userId).all();
  return result;
}

// ✅ BETTER - Batch prepared statements for performance
async function batchSearch(env: Env, userIds: string[]) {
  const stmt = env.DB.prepare(
    'SELECT * FROM users WHERE id = ?1'
  );

  const statements = userIds.map(id => stmt.bind(id));
  const results = await env.DB.batch(statements);

  return results;
}
```

### 1.5 Rate Limiting Strategy

**Source**: [Rate Limiting GA Announcement (Sept 2025)](https://developers.cloudflare.com/changelog/2025-09-19-ratelimit-workers-ga/)

**Recommended Approach**: Use native `ratelimit` binding.

```typescript
// wrangler.toml
[[ratelimits]]
name = "api_limit"
domain = "api"
limit = 100
period = 60

// src/middleware/rate-limit.ts
interface Env {
  RATE_LIMITER: RateLimit;
}

export async function checkRateLimit(
  env: Env,
  identifier: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  try {
    const result = await env.RATE_LIMITER.limit({
      key: identifier,
      rate: {
        limit: 100,        // 100 requests
        period: 60,        // per 60 seconds
      },
    });

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: Math.ceil(result.resetAt / 1000),
    };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Fail open - allow request if rate limiter fails
    return {
      success: true,
      limit: 100,
      remaining: 100,
      reset: 0,
    };
  }
}
```

---

## 2. Type Safety in Workers

### 2.1 Environment Variable Typing

**Source**: [Type-safe Environment Variables in Workers](https://www.giovannibenussi.com/blog/type-safe-environment-variables-in-cloudflare-workers)

**Problem**: `env` is typed as `any` by default, leading to runtime errors.

**Solution**: Define explicit `Env` interface.

```typescript
// src/types/env.ts
export interface Env {
  // Bindings
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  KV: KVNamespace;

  // Environment variables
  API_VERSION: string;
  ENVIRONMENT: 'development' | 'production';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';

  // Secrets
  API_KEY: string;
  JWT_SECRET: string;

  // Optional bindings
  RATE_LIMITER?: RateLimit;
}

// Validate environment at startup
export function validateEnv(env: Env): void {
  const required: (keyof Env)[] = ['DB', 'VECTORIZE', 'API_KEY', 'JWT_SECRET'];

  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  // Validate specific values
  if (!['development', 'production'].includes(env.ENVIRONMENT)) {
    throw new Error(`Invalid ENVIRONMENT: ${env.ENVIRONMENT}`);
  }
}
```

**Usage**:

```typescript
// src/index.ts
import type { Env } from './types/env';
import { validateEnv } from './types/env';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Validate on first request
    ctx.waitUntil(Promise.resolve().then(() => validateEnv(env)));

    // Now env is properly typed
    const version = env.API_VERSION; // Type: string
    const db = env.DB; // Type: D1Database

    // TypeScript will catch this error:
    // const invalid = env.NON_EXISTENT; // ❌ Error

    return jsonResponse({ version });
  },
};
```

### 2.2 TypeScript Strict Mode Configuration

**Recommended `tsconfig.json`**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],

    // Strict type checking
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    // Module resolution
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,

    // Emit
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",

    // Interop
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 2.3 Proper Interface Design

**Pattern**: Use discriminated unions for API responses.

```typescript
// src/types/api.ts
export interface ApiSuccess<T> {
  success: true;
  data: T;
  error?: never;
}

export interface ApiError {
  success: false;
  data?: never;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Helper functions
export function success<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function error(code: string, message: string, details?: unknown): ApiError {
  return { success: false, error: { code, message, details } };
}

// Usage
export async function handleRequest(): Promise<ApiResponse<string>> {
  try {
    const data = await fetchData();
    return success(data);
  } catch (err) {
    return error('FETCH_ERROR', 'Failed to fetch data', err);
  }
}

// Type narrowing works correctly
const response = await handleRequest();
if (response.success) {
  console.log(response.data); // TypeScript knows this is string
} else {
  console.log(response.error.message); // TypeScript knows this exists
}
```

### 2.4 Avoiding `any` Types

**Anti-patterns to avoid**:

```typescript
// ❌ BAD
function process(data: any) {
  return data.value;
}

// ✅ GOOD - Use generics
function process<T extends { value: unknown }>(data: T): T['value'] {
  return data.value;
}

// ❌ BAD
const env = event.env as any;

// ✅ GOOD - Define proper type
const env = event.env as Env;
```

---

## 3. Error Handling Patterns

### 3.1 Structured Error Responses

**Best Practice**: Consistent error format across all endpoints.

```typescript
// src/utils/errors.ts
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  VECTOR_SEARCH_ERROR = 'VECTOR_SEARCH_ERROR',
}

export class HttpError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// Specific error classes
export class ValidationError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string) {
    super(ErrorCode.NOT_FOUND, `${resource} not found`, 404);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Unauthorized') {
    super(ErrorCode.UNAUTHORIZED, message, 401);
  }
}

export class RateLimitedError extends HttpError {
  constructor(retryAfter: number) {
    super(
      ErrorCode.RATE_LIMITED,
      'Rate limit exceeded',
      429,
      { retryAfter }
    );
  }
}

// Error response formatter
export function errorResponse(error: HttpError): Response {
  return jsonResponse(
    {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    },
    error.statusCode
  );
}

// Generic error handler
export function handleError(error: unknown): Response {
  console.error('Unhandled error:', error);

  if (error instanceof HttpError) {
    return errorResponse(error);
  }

  // Don't expose internal errors in production
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An internal error occurred'
      : error instanceof Error
        ? error.message
        : 'Unknown error';

  return errorResponse(
    new HttpError(ErrorCode.INTERNAL_ERROR, message, 500)
  );
}
```

**Usage in Worker**:

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Validate request
      if (!request.headers.has('Authorization')) {
        throw new UnauthorizedError('Missing authorization header');
      }

      // Process request
      const data = await processRequest(request, env);

      return successResponse(data);
    } catch (error) {
      return handleError(error);
    }
  },
};
```

### 3.2 Error Logging in Edge Functions

**Best Practice**: Use structured logging with appropriate levels.

```typescript
// src/utils/logging.ts
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger {
  constructor(
    private env: Env,
    private minLevel: LogLevel = LogLevel.INFO
  ) {}

  private log(entry: LogEntry): void {
    if (entry.level < this.minLevel) return;

    const logLine = JSON.stringify({
      ...entry,
      environment: this.env.ENVIRONMENT,
      requestId: crypto.randomUUID(),
    });

    // In development, use console
    if (this.env.ENVIRONMENT === 'development') {
      console.log(logLine);
      return;
    }

    // In production, send to log aggregation service
    // This could be Workers Logpush, Sentry, etc.
    this.env.KV.put(
      `logs:${Date.now()}:${crypto.randomUUID()}`,
      logLine,
      { expirationTtl: 604800 } // 7 days
    );
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log({ level: LogLevel.DEBUG, message, timestamp: new Date().toISOString(), context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log({ level: LogLevel.INFO, message, timestamp: new Date().toISOString(), context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log({ level: LogLevel.WARN, message, timestamp: new Date().toISOString(), context });
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log({
      level: LogLevel.ERROR,
      message,
      timestamp: new Date().toISOString(),
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
  }
}
```

### 3.3 Graceful Degradation Patterns

**Source**: [Cloudflare Outage Lessons](https://odown.com/blog/cloudflare-outage/)

**Pattern**: Implement fallback mechanisms for external dependencies.

```typescript
// src/utils/degradation.ts
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  logger: Logger
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    logger.warn('Primary service failed, using fallback', { error });

    try {
      return await fallback();
    } catch (fallbackError) {
      logger.error('Fallback service also failed', fallbackError as Error);
      throw fallbackError;
    }
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  logger: Logger
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } catch (error) {
    if (error instanceof Error && error.message === 'Timeout') {
      logger.warn('Operation timed out', { timeoutMs });
    }
    throw error;
  }
}

// Example: Vector search with fallback to text search
export async function searchWithFallback(
  env: Env,
  query: string,
  logger: Logger
): Promise<SearchResult[]> {
  return withFallback(
    // Primary: Vector search
    async () => {
      logger.info('Attempting vector search');
      const results = await env.VECTORIZE.query(query, { topK: 10 });
      return results;
    },
    // Fallback: D1 text search
    async () => {
      logger.info('Falling back to text search');
      const results = await env.DB.prepare(
        'SELECT * FROM documents WHERE content LIKE ?1 LIMIT 10'
      ).bind(`%${query}%`).all();
      return results.results;
    },
    logger
  );
}
```

---

## 4. Performance Optimization

### 4.1 D1 Query Optimization

**Source**: [D1 Best Practices](https://developers.cloudflare.com/d1/best-practices/)

**Key Strategies**:

1. **Use indexes strategically**:
```sql
-- Create indexes on frequently queried columns
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_posts_author_id ON posts(author_id);

-- Composite indexes for JOIN conditions
CREATE INDEX idx_posts_author_date ON posts(author_id, created_at);
```

2. **Run PRAGMA optimize**:
```typescript
// Run after schema changes
await env.DB.exec('PRAGMA optimize');
```

3. **Use batch operations**:
```typescript
// ❌ BAD - Multiple individual queries
for (const item of items) {
  await env.DB.prepare('INSERT INTO items (name) VALUES (?1)').bind(item.name).run();
}

// ✅ GOOD - Batch operation
const statements = items.map(item =>
  env.DB.prepare('INSERT INTO items (name) VALUES (?1)').bind(item.name)
);
await env.DB.batch(statements);
```

4. **Efficient pagination**:
```typescript
// ❌ BAD - Uses expensive COUNT
async function paginateBad(env: Env, page: number, limit: number) {
  const offset = (page - 1) * limit;

  const count = await env.DB.prepare('SELECT COUNT(*) as total FROM items').first();
  const items = await env.DB.prepare(
    'SELECT * FROM items LIMIT ?1 OFFSET ?2'
  ).bind(limit, offset).all();

  return { total: count.total, items: items.results };
}

// ✅ GOOD - Prefetch pagination
async function paginateGood(env: Env, cursor: string | null, limit: number) {
  const items = cursor
    ? await env.DB.prepare(
        'SELECT * FROM items WHERE id > ?1 ORDER BY id ASC LIMIT ?2'
      ).bind(cursor, limit).all()
    : await env.DB.prepare(
        'SELECT * FROM items ORDER BY id ASC LIMIT ?1'
      ).bind(limit).all();

  const nextCursor = items.results.length === limit
    ? items.results[items.results.length - 1].id
    : null;

  return { items: items.results, nextCursor };
}
```

### 4.2 Vectorize Indexing Best Practices

**Source**: [Vectorize Best Practices](https://developers.cloudflare.com/vectorize/best-practices/)

**Index Creation**:

```typescript
// wrangler.toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "my-index"
dimensions = 384  # Match your embedding model
distance_metric = "cosine"  # or "euclidean", "dotproduct"
```

**Batch Insertion**:

```typescript
// ❌ BAD - Insert one at a time
for (const doc of documents) {
  await env.VECTORIZE.insert([doc.id, doc.vector]);
}

// ✅ GOOD - Batch insert
const batchSize = 100;
for (let i = 0; i < documents.length; i += batchSize) {
  const batch = documents.slice(i, i + batchSize);
  await env.VECTORIZE.insert(
    batch.map(doc => [doc.id, doc.vector])
  );
}
```

**Query Optimization**:

```typescript
// Use metadata filtering to reduce search space
const results = await env.VECTORIZE.query(queryVector, {
  topK: 10,
  namespace: 'documents',
  filter: {
    category: 'tech',
    published: true,
  },
  returnMetadata: true,
});
```

### 4.3 Caching Strategies

**Multi-level caching pattern**:

```typescript
// src/utils/cache.ts
export class CacheManager {
  constructor(
    private kv: KVNamespace,
    private cache?: Cache
  ) {}

  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: {
      ttl?: number;
      useCacheApi?: boolean;
    } = {}
  ): Promise<T> {
    // Try Cache API first (edge cache)
    if (options.useCacheApi && this.cache) {
      const cached = await this.cache.match(key);
      if (cached) {
        return cached.json() as T;
      }
    }

    // Try KV (global cache)
    const kvCached = await this.kv.get(key, 'json');
    if (kvCached) {
      return kvCached as T;
    }

    // Cache miss - fetch and store
    const value = await fetcher();

    // Store in both caches
    if (options.useCacheApi && this.cache) {
      const response = new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' },
      });
      ctx.waitUntil(this.cache.put(key, response));
    }

    if (options.ttl) {
      ctx.waitUntil(this.kv.put(key, JSON.stringify(value), { expirationTtl: options.ttl }));
    }

    return value;
  }
}
```

**Usage**:

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cache = new CacheManager(env.KV, caches.default);
    const key = `search:${url}`;

    const results = await cache.get(key, async () => {
      return performExpensiveSearch(env, url);
    }, {
      ttl: 3600, // 1 hour
      useCacheApi: true,
    });

    return jsonResponse(results);
  },
};
```

---

## 5. Code Organization

### 5.1 Project Structure

**Recommended structure for large Workers projects**:

```
workers/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── types/
│   │   ├── env.ts              # Environment types
│   │   ├── api.ts              # API response types
│   │   └── models.ts           # Data model types
│   ├── middleware/
│   │   ├── cors.ts
│   │   ├── auth.ts
│   │   ├── rate-limit.ts
│   │   └── validation.ts
│   ├── services/
│   │   ├── vector.ts           # Vectorize service
│   │   ├── database.ts         # D1 service
│   │   ├── cache.ts            # KV/cache service
│   │   └── ai.ts               # Workers AI service
│   ├── routes/
│   │   ├── search.ts
│   │   ├── documents.ts
│   │   └── health.ts
│   ├── utils/
│   │   ├── errors.ts
│   │   ├── logging.ts
│   │   └── validation.ts
│   └── config/
│       └── constants.ts
├── tests/
│   ├── unit/
│   └── integration/
├── wrangler.toml
├── package.json
└── tsconfig.json
```

### 5.2 Shared Utilities Pattern

**Example: Reusable service base**:

```typescript
// src/services/base.ts
export abstract class Service {
  constructor(protected env: Env, protected logger: Logger) {}

  protected async withErrorHandling<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(`${operation} failed`, error as Error);
      throw new HttpError(
        ErrorCode.INTERNAL_ERROR,
        `${operation} failed`,
        500,
        error
      );
    }
  }
}

// Usage
export class VectorService extends Service {
  async search(query: string, topK: number = 10) {
    return this.withErrorHandling('Vector search', async () => {
      const vector = await this.generateEmbedding(query);
      return this.env.VECTORIZE.query(vector, { topK });
    });
  }

  private async generateEmbedding(text: string) {
    // Implementation
  }
}
```

### 5.3 Module Bundling Strategy

**wrangler.toml configuration**:

```toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-01-01"

# Build configuration
[build]
command = "npm run build"
cwd = "."
watch_paths = ["src/**/*.ts"]

# Type definitions
types = "dist/index.d.ts"

# Rulesets for routing
[routes]
pattern = "api.example.com/*"
zone_name = "example.com"

# Environment-specific configuration
[env.development]
vars = { ENVIRONMENT = "development" }

[env.production]
vars = { ENVIRONMENT = "production" }

# Build optimization
[build.upload]
format = "modules"
main = "./dist/index.js"
```

**package.json scripts**:

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "build": "tsc",
    "deploy": "wrangler deploy",
    "deploy:production": "wrangler deploy --env production",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^2025.01.14",
    "typescript": "^5.3.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.80.0"
  }
}
```

---

## 6. Common Pitfalls to Avoid

### 6.1 Performance Pitfalls

1. **Cold start on every request**: Not keeping connections alive
2. **N+1 queries**: Using loops instead of batch operations
3. **Oversized responses**: Not compressing large payloads
4. **Blocking operations**: Not using `ctx.waitUntil()` for background work

### 6.2 Security Pitfalls

1. **CORS misconfiguration**: Using `*` instead of specific origins
2. **Secret leakage**: Logging sensitive data
3. **SQL injection**: String interpolation in queries
4. **Missing validation**: Trusting client input

### 6.3 Type Safety Pitfalls

1. **Using `any`**: Losing type safety
2. **Missing Env types**: Untyped environment variables
3. **Not using strict mode**: Catching type errors late
4. **Ignoring Zod errors**: Bypassing validation

### 6.4 Error Handling Pitfalls

1. **Swallowing errors**: Silent failures
2. **Exposing internals**: Leaking stack traces to clients
3. **No structured logging**: Unparsable logs
4. **No graceful degradation**: All-or-nothing behavior

---

## 7. Recommended Implementation Checklist

### Security
- [ ] Implement proper CORS with origin whitelist
- [ ] Add all security headers (CSP, HSTS, X-Frame-Options, etc.)
- [ ] Use Zod for input validation
- [ ] Use D1 prepared statements (no string interpolation)
- [ ] Implement rate limiting with native binding
- [ ] Remove information leakage headers

### Type Safety
- [ ] Define explicit `Env` interface
- [ ] Enable TypeScript strict mode
- [ ] Avoid `any` types
- [ ] Use discriminated unions for API responses
- [ ] Validate environment variables at startup

### Error Handling
- [ ] Implement structured error responses
- [ ] Create custom error classes
- [ ] Use structured logging with levels
- [ ] Implement graceful degradation for external services
- [ ] Add timeout handling for external calls

### Performance
- [ ] Create D1 indexes on queried columns
- [ ] Run `PRAGMA optimize` after schema changes
- [ ] Use batch operations for bulk inserts
- [ ] Implement multi-level caching (Cache API + KV)
- [ ] Use efficient pagination (cursor-based)
- [ ] Batch Vectorize inserts

### Code Organization
- [ ] Separate concerns (middleware, services, routes)
- [ ] Create reusable base classes
- [ ] Use proper TypeScript configuration
- [ ] Set up proper build and deployment pipeline
- [ ] Add comprehensive tests

---

## 8. Sources and References

### Official Cloudflare Documentation
1. [Set Security Headers - Workers Examples](https://developers.cloudflare.com/workers/examples/security-headers/)
2. [D1 Best Practices](https://developers.cloudflare.com/d1/best-practices/)
3. [D1 Prepared Statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)
4. [Vectorize Best Practices](https://developers.cloudflare.com/vectorize/best-practices/)
5. [Rate Limiting GA Announcement](https://developers.cloudflare.com/changelog/2025-09-19-ratelimit-workers-ga/)
6. [Workers Bundling Documentation](https://developers.cloudflare.com/workers/wrangler/bundling/)
7. [Environment Variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
8. [CORS Header Proxy Example](https://developers.cloudflare.com/workers/examples/cors-header-proxy/)
9. [Errors and Exceptions](https://developers.cloudflare.com/workers/observability/errors/)

### Community Resources
10. [Type-safe Environment Variables in Workers](https://www.giovannibenussi.com/blog/type-safe-environment-variables-in-cloudflare-workers)
11. [Journey to Optimize Cloudflare D1 Queries](https://rxliuli.com/blog/journey-to-optimize-cloudflare-d1-database-queries/)
12. [Efficient Pagination with Cloudflare D1](https://kenwagatsuma.com/blog/blog-pagination-cloudflare-d1)
13. [10 Cloudflare Workers Patterns for Sub-50ms APIs](https://medium.com/@sparknp1/10-cloudflare-workers-patterns-for-sub-50ms-apis-efa312ea3cae)
14. [Generative AI at the Edge with Cloudflare Workers](https://workos.com/blog/generative-ai-at-the-edge-with-cloudflare-workers)
15. [Building a Database Synced to Vector Search](https://mitya.uk/articles/building-database-synced-vector-search-cloudflare)
16. [Nuxt & Cloudflare Vectorize: D1, Drizzle, Workers AI](https://keith-mifsud.me/blog/nuxt-and-cloudflare-vectorize-setting-up-d1-drizzle-and-workers-ai/)
17. [Securing Your Website with Workers and Security Headers](https://www.dannymoran.com/securing-your-website-for-free-with-cloudflare-workers-and-security-headers/)
18. [Using Workers KV to Build an Edge Cached Blog](https://dev.to/bryce/using-workers-kv-to-build-an-edge-cached-blog-23fo)
19. [Cloudflare Outage Resilience Lessons](https://odown.com/blog/cloudflare-outage/)

### Additional References
20. [MDN: X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options)
21. [Content Security Policy Quick Reference](https://content-security-policy.com/)
22. [How to Prevent SQL Injection](https://www.cloudflare.com/learning/security/threats/how-to-prevent-sql-injection/)
23. [Cloudflare Workers Language Support](https://developers.cloudflare.com/workers/languages/)

---

## 9. Conclusion

This research document provides a comprehensive guide to building production-ready applications with Cloudflare Workers, Vectorize, and D1 in 2025. The key takeaways are:

1. **Security is paramount**: Proper CORS, security headers, input validation, and SQL injection prevention are non-negotiable.

2. **Type safety prevents bugs**: Explicit `Env` interfaces, strict TypeScript mode, and validation schemas catch errors at compile time.

3. **Error handling must be structured**: Consistent error formats, proper logging, and graceful degradation make applications more reliable.

4. **Performance requires optimization**: Indexes, batch operations, and caching strategies are essential for sub-100ms response times.

5. **Code organization scales**: Proper separation of concerns, reusable patterns, and clear project structure enable teams to build maintainable applications.

All code examples are production-ready and follow Cloudflare's official best practices as of January 2025.

---

**Last Updated**: 2025-01-14
**Next Review**: 2025-04-14
**Version**: 1.0
