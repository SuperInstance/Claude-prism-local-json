/**
 * Type definitions for the indexer module
 *
 * These types bridge between the Rust/WASM types and TypeScript interfaces
 */

import type { CodeChunk } from '../core/types/index.js';

/**
 * Result from parsing a file
 */
export interface ParseResult {
  /** Whether there were parsing errors */
  has_errors: boolean;

  /** Error nodes if parsing failed */
  error_nodes: ErrorNode[];

  /** Extracted code chunks (now function-level) */
  chunks: WASMCodeChunk[];

  /** Extracted functions */
  functions: FunctionInfo[];

  /** Extracted classes */
  classes: ClassInfo[];
}

/**
 * WASM Code Chunk (from Rust)
 * This is the raw chunk format returned by the WASM module
 */
export interface WASMCodeChunk {
  /** Unique chunk identifier */
  id: string;

  /** Chunk text content */
  text: string;

  /** Starting line number (1-indexed) */
  start_line: number;

  /** Ending line number (1-indexed) */
  end_line: number;

  /** Estimated token count */
  tokens: number;

  /** Programming language */
  language: string;

  /** Functions in this chunk */
  functions: FunctionInfo[];

  /** Classes in this chunk */
  classes: ClassInfo[];

  /** Import statements */
  imports: ImportInfo[];

  /** Dependencies extracted from chunk */
  dependencies: string[];
}

/**
 * Error node information
 */
export interface ErrorNode {
  /** Error message */
  message: string;

  /** Location in source */
  location: SourceLocation;

  /** Text at error location */
  text: string;
}

/**
 * Source location
 */
export interface SourceLocation {
  /** Starting row (0-indexed) */
  start_row: number;

  /** Starting column */
  start_column: number;

  /** Ending row (0-indexed) */
  end_row: number;

  /** Ending column */
  end_column: number;
}

/**
 * Function information
 */
export interface FunctionInfo {
  /** Function name */
  name: string;

  /** Function signature */
  signature: string;

  /** Starting line number */
  start_line: number;

  /** Ending line number */
  end_line: number;

  /** Parameter names */
  parameters: string[];

  /** Return type if available */
  return_type?: string;

  /** Is this async? */
  is_async: boolean;

  /** Is this exported? */
  is_exported: boolean;
}

/**
 * Class information
 */
export interface ClassInfo {
  /** Class name */
  name: string;

  /** Base class if extends */
  extends?: string;

  /** Implemented interfaces */
  implements: string[];

  /** Methods */
  methods: FunctionInfo[];

  /** Starting line number */
  start_line: number;

  /** Ending line number */
  end_line: number;
}

/**
 * Import information
 */
export interface ImportInfo {
  /** Source module/path */
  source: string;

  /** Imported names */
  imported_names: string[];

  /** Is this a type-only import? */
  is_type_only: boolean;

  /** Import location */
  location: SourceLocation;
}

/**
 * Options for chunking
 */
export interface ChunkOptions {
  /** Maximum chunk size in tokens */
  max_size?: number;

  /** Overlap between chunks in tokens */
  overlap?: number;

  /** Use semantic boundaries (functions, classes) */
  semantic?: boolean;

  /** Include docstrings and comments */
  include_docs?: boolean;

  /** Include imports with each chunk */
  include_imports?: boolean;
}

/**
 * Options for indexing
 */
export interface IndexOptions {
  /** Include file paths in results */
  include_paths?: boolean;

  /** Generate embeddings? */
  generate_embeddings?: boolean;

  /** Follow imports */
  follow_imports?: boolean;

  /** Maximum file size to process (bytes) */
  max_file_size?: number;
}

/**
 * Language detection result
 */
export interface LanguageDetection {
  /** Detected language */
  language: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** File extension */
  extension: string;
}

/**
 * Chunking strategy
 */
export type ChunkingStrategy = 'tree-sitter' | 'line-based' | 'hybrid';

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  /** Chunking strategy to use */
  strategy: ChunkingStrategy;

  /** Maximum chunk size in tokens */
  maxChunkSize?: number;

  /** Number of context lines to include */
  contextLines?: number;

  /** Enable caching of parsed ASTs */
  enableCache?: boolean;

  /** Supported languages */
  supportedLanguages?: string[];

  /** Maximum cache size */
  cacheSize?: number;
}
