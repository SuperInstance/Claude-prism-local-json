/**
 * Shared utility functions for PRISM
 *
 * This module contains common utilities used across workers and CLI
 * to avoid code duplication and ensure consistency.
 *
 * @module shared/utils
 * @version 0.3.1
 */

// ============================================================================
// Constants
// ============================================================================

export const CONFIG = {
  /** Maximum number of chunks per file */
  MAX_CHUNKS_PER_FILE: 1000,
  /** Maximum lines per chunk */
  MAX_LINES_PER_CHUNK: 50,
  /** Minimum content length for a chunk */
  MIN_CHUNK_CONTENT_LENGTH: 1,
  /** Maximum search results */
  MAX_SEARCH_LIMIT: 100,
  /** Default search results */
  DEFAULT_SEARCH_LIMIT: 10,
  /** Maximum files per indexing batch */
  MAX_FILES_PER_BATCH: 100,
  /** Maximum concurrent embedding generations */
  MAX_EMBEDDING_CONCURRENCY: 10,
  /** Embedding vector dimensions */
  EMBEDDING_DIMENSIONS: 384,
  /** Maximum query length */
  MAX_QUERY_LENGTH: 1000,
  /** Maximum file size (10MB) */
  MAX_FILE_SIZE: 10_000_000,
} as const;

// ============================================================================
// Logging Utilities
// ============================================================================

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

let currentLogLevel = LogLevel.INFO;

/**
 * Set the global log level
 * @param level - Log level to set
 */
export function setLogLevel(level: LogLevel | string): void {
  if (typeof level === 'string') {
    const upper = level.toUpperCase();
    currentLogLevel = LogLevel[upper as keyof typeof LogLevel] ?? LogLevel.INFO;
  } else {
    currentLogLevel = level;
  }
}

/**
 * Set log level from environment variable string
 * @param envLevel - Log level from environment (error, warn, info, debug)
 */
export function setLogLevelFromEnv(envLevel?: string): void {
  if (!envLevel) return;
  setLogLevel(envLevel);
}

/**
 * Logger class for leveled logging
 */
export class Logger {
  constructor(private context: string) {}

  /** Log debug message (only in debug mode) */
  debug(...args: unknown[]): void {
    if (currentLogLevel >= LogLevel.DEBUG) {
      console.debug(`[${this.context}]`, ...args);
    }
  }

  /** Log info message (info and above) */
  info(...args: unknown[]): void {
    if (currentLogLevel >= LogLevel.INFO) {
      console.log(`[${this.context}]`, ...args);
    }
  }

  /** Log warning (warn and above) */
  warn(...args: unknown[]): void {
    if (currentLogLevel >= LogLevel.WARN) {
      console.warn(`[${this.context}]`, ...args);
    }
  }

  /** Log error (always logged) */
  error(...args: unknown[]): void {
    console.error(`[${this.context}]`, ...args);
  }
}

/**
 * Create a logger instance for a context
 * @param context - Logging context (e.g., "Worker", "Indexer")
 * @returns Logger instance
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

// ============================================================================
// Types
// ============================================================================

export interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
  language: string;
}

export interface CodeFile {
  path: string;
  content: string;
  language?: string;
}

// ============================================================================
// Cryptographic Utilities
// ============================================================================

/**
 * Calculate SHA-256 checksum of content
 * @param content - Text content to hash
 * @returns Hex-encoded SHA-256 hash
 */
export async function calculateChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// Language Detection
// ============================================================================

/**
 * Map of file extensions to programming languages
 */
const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  pyi: "python",
  rs: "rust",
  go: "go",
  java: "java",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "c",
  h: "c",
  hpp: "c",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  toml: "toml",
  xml: "xml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "css",
  md: "markdown",
  markdown: "markdown",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
};

/**
 * Detect programming language from file path
 * @param path - File path
 * @returns Detected language or "text"
 */
export function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return LANGUAGE_MAP[ext || ""] || "text";
}

// ============================================================================
// File Chunking
// ============================================================================

/**
 * Chunking strategy type
 */
export type ChunkingStrategy = 'tree-sitter' | 'line-based' | 'hybrid';

/**
 * Chunking options
 */
export interface ChunkingOptions {
  /** Maximum lines per chunk */
  maxLines?: number;
  /** Chunking strategy to use */
  strategy?: ChunkingStrategy;
  /** Include imports with each chunk */
  includeImports?: boolean;
  /** Include docstrings/comments */
  includeDocs?: boolean;
}

/**
 * Split file content into chunks (fallback line-based method)
 *
 * This is a simple line-based chunking strategy used when:
 * - Tree-sitter WASM is not available
 * - The file type is not supported
 * - Performance constraints require simple chunking
 *
 * For better semantic chunking, use the WASM-based WasmIndexer.
 *
 * @param filePath - File path for error reporting
 * @param content - File content
 * @param language - Detected language
 * @param options - Chunking options
 * @returns Array of chunks
 * @throws Error if content is too large
 */
export function chunkFile(
  filePath: string,
  content: string,
  language: string,
  options?: ChunkingOptions
): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  const maxLinesPerChunk = options?.maxLines ?? CONFIG.MAX_LINES_PER_CHUNK;
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
 * Intelligent chunking that tries to use WASM-based semantic chunking first
 *
 * This function provides a hybrid approach:
 * 1. First tries to use the WASM indexer for function-level chunking
 * 2. Falls back to line-based chunking if WASM is unavailable
 *
 * @param filePath - File path
 * @param content - File content
 * @param language - Detected language
 * @param options - Chunking options
 * @returns Promise of chunk array
 */
export async function intelligentChunk(
  filePath: string,
  content: string,
  language: string,
  options?: ChunkingOptions
): Promise<Chunk[]> {
  const strategy = options?.strategy ?? 'hybrid';

  // If strategy is line-based or we're in a non-WASM environment, use line-based
  if (strategy === 'line-based' || typeof WebAssembly === 'undefined') {
    return chunkFile(filePath, content, language, options);
  }

  // Try to use WASM-based chunking
  try {
    // Dynamic import of WasmIndexer
    const { WasmIndexer } = await import('../indexer/WasmIndexer.js');
    const indexer = new WasmIndexer();

    // Initialize the indexer
    await indexer.init();

    // Parse the file
    const parseResult = await indexer.parseFile(content, language);

    // Convert WASM chunks to the legacy Chunk format
    return parseResult.chunks.map(wasmChunk => ({
      content: wasmChunk.text,
      startLine: wasmChunk.start_line,
      endLine: wasmChunk.end_line,
      language: wasmChunk.language
    }));
  } catch (error) {
    // Fall back to line-based chunking if WASM fails
    console.warn(`WASM chunking failed for ${filePath}, falling back to line-based:`, error);
    return chunkFile(filePath, content, language, options);
  }
}

// ============================================================================
// Vector Encoding/Decoding
// ============================================================================

/**
 * Encode float array to Uint8Array for D1 BLOB storage
 * @param array - Float array to encode
 * @returns Uint8Array representation
 */
export function encodeFloat32Array(array: number[]): Uint8Array {
  const float32Array = new Float32Array(array);
  return new Uint8Array(float32Array.buffer);
}

/**
 * Decode D1 BLOB to float array
 * @param blob - Blob from D1 (various formats)
 * @returns Float array
 * @throws Error if blob format is invalid
 */
export function decodeFloat32Array(
  blob: Uint8Array | ArrayLike<number> | Record<string, unknown>
): number[] {
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
    throw new Error(
      `Invalid blob length for float32: ${bytes.length} ` +
      `(must be multiple of 4, got ${bytes.length / 4} float32 values)`
    );
  }

  const float32Array = new Float32Array(bytes.buffer);
  return Array.from(float32Array);
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate file path to prevent path traversal attacks
 * @param path - File path to validate
 * @throws Error if path contains suspicious patterns
 */
export function validatePath(path: string): void {
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
export function validateContent(path: string, content: string): void {
  if (typeof content !== 'string') {
    throw new Error(`Invalid content type for ${path}`);
  }

  if (content.length === 0) {
    throw new Error(`Empty file content: ${path}`);
  }

  if (content.length > CONFIG.MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${path} (${content.length} bytes, ` +
      `max ${CONFIG.MAX_FILE_SIZE})`
    );
  }
}

/**
 * Sanitize search query
 * @param query - Search query
 * @returns Sanitized query
 */
export function sanitizeQuery(query: string): string {
  return query.trim().slice(0, CONFIG.MAX_QUERY_LENGTH);
}

// ============================================================================
// Cosine Similarity
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score between 0 and 1
 * @throws Error if vector dimensions don't match
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimensions must match: ${a.length} != ${b.length}`
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ============================================================================
// HTTP Response Utilities
// ============================================================================

/**
 * Default allowed origins for CORS
 * - localhost for development
 * - null for file:// protocol
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://[::1]:*',
  'file://',
  'null',
];

/**
 * Generate CORS headers with origin validation
 * @param origin - Request origin header
 * @param allowedOrigins - Optional list of allowed origins (supports wildcards)
 * @returns Headers object with CORS if origin is valid
 */
export function getCorsHeaders(
  origin: string | null,
  allowedOrigins: string[] = DEFAULT_ALLOWED_ORIGINS
): Record<string, string> {
  // If no origin (same-origin request) or non-browser request, return basic CORS
  if (!origin) {
    return {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }

  // Check if origin matches any allowed pattern
  const isAllowed = allowedOrigins.some(allowed => {
    if (allowed.endsWith('*')) {
      const prefix = allowed.slice(0, -1);
      return origin.startsWith(prefix);
    }
    return origin === allowed;
  });

  // Only return CORS headers for allowed origins
  if (isAllowed) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    };
  }

  // Origin not allowed - return minimal headers
  return {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

/**
 * Create a JSON response with CORS headers
 * @param data - Response data
 * @param status - HTTP status code
 * @param origin - Request origin for CORS validation
 * @param allowedOrigins - Optional allowed origins list
 * @returns Response object
 */
export function jsonResponse(
  data: unknown,
  status: number = 200,
  origin?: string | null,
  allowedOrigins?: string[]
): Response {
  const corsHeaders = getCorsHeaders(origin || null, allowedOrigins);
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");

  if (status >= 400) {
    return Response.json(
      { success: false, error: data },
      { status, headers }
    );
  }

  return Response.json({ success: true, data }, { status, headers });
}

/**
 * Create an error response
 * @param error - Error message or Error object
 * @param status - HTTP status code
 * @param origin - Request origin for CORS validation
 * @param allowedOrigins - Optional allowed origins list
 * @returns Response object
 */
export function errorResponse(
  error: Error | string,
  status: number = 500,
  origin?: string | null,
  allowedOrigins?: string[]
): Response {
  const message = error instanceof Error ? error.message : error;
  return jsonResponse(message, status, origin, allowedOrigins);
}
