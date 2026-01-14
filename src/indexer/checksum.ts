/**
 * ============================================================================
 * CHECKSUM UTILITIES - Content Hashing for Incremental Indexing
 * ============================================================================
 *
 * **Purpose**: Provides SHA-256 checksum calculation for file content
 * verification and incremental indexing support.
 *
 * **Why SHA-256?**
 * - Fast computation (crypto.subtle is hardware-accelerated)
 * - Low collision probability (2^256 space)
 * - Deterministic output (same input = same hash)
 * - Widely supported (built into Node.js and browsers)
 *
 * **Usage:**
 * ```typescript
 * import { calculateChecksum } from './checksum.js';
 *
 * // Calculate checksum for file content
 * const checksum = await calculateChecksum(fileContent);
 * console.log(checksum); // 'a1b2c3d4...'
 *
 * // Calculate checksum for chunk
 * const chunkChecksum = await calculateChecksum(chunkContent);
 * ```
 *
 * **Performance:**
 * - ~100MB/s on modern CPUs
 * - Streaming for large files (optional)
 * - Memory efficient for large files
 *
 * @see IndexStorage for usage in incremental indexing
 */

import { createHash } from 'crypto';

/**
 * Calculate SHA-256 checksum for content
 *
 * **Purpose**: Computes a deterministic hash of content for change detection.
 * Used for incremental indexing to skip unchanged files.
 *
 * **Algorithm**: SHA-256 (FIPS 180-4)
 * - Produces 256-bit (32-byte) hash
 * - Output as hexadecimal string (64 characters)
 * - Collision resistant: 2^256 search space
 *
 * **Performance**: ~100MB/s on modern CPUs
 *
 * **Usage Example**:
 * ```typescript
 * const checksum = await calculateChecksum('function foo() { return 42; }');
 * console.log(checksum); // '7f9f3e8a1b2c3d4e5f6...'
 * ```
 *
 * @param content - Content to hash (string or Buffer)
 * @returns Hexadecimal SHA-256 checksum
 */
export function calculateChecksum(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Calculate SHA-256 checksum for chunk with context
 *
 * **Purpose**: Computes checksum that includes file path and line numbers
 * to ensure uniqueness across files and prevent false positives.
 *
 * **Context**: Includes file path, start line, end line in hash to ensure
 * that identical code in different files or locations has different checksums.
 *
 * **Usage Example**:
 * ```typescript
 * const checksum = await calculateChunkChecksum(
 *   '/src/auth.ts',
 *   'function login() { ... }',
 *   10,
 *   20
 * );
 * console.log(checksum); // Unique for this chunk in this file
 * ```
 *
 * @param filePath - Path to source file
 * @param content - Chunk content
 * @param startLine - Starting line number
 * @param endLine - Ending line number
 * @returns Hexadecimal SHA-256 checksum
 */
export function calculateChunkChecksum(
  filePath: string,
  content: string,
  startLine: number,
  endLine: number
): string {
  const context = `${filePath}:${startLine}-${endLine}:${content}`;
  return createHash('sha256').update(context).digest('hex');
}

/**
 * Calculate checksum for file metadata
 *
 * **Purpose**: Computes checksum for file metadata (size, mtime) to detect
 * changes without reading full file content. Faster than full content hash.
 *
 * **Usage**: Use this as a quick check before doing full content comparison.
 *
 * **Note**: This is less reliable than full content hash (can have false
 * positives if mtime changes without content change), but is much faster.
 *
 * @param fileSize - File size in bytes
 * @param lastModified - Last modification time (Unix timestamp)
 * @returns Hexadecimal SHA-256 checksum
 */
export function calculateMetadataChecksum(
  fileSize: number,
  lastModified: number
): string {
  const metadata = `${fileSize}:${lastModified}`;
  return createHash('sha256').update(metadata).digest('hex');
}

/**
 * Verify content integrity using checksum
 *
 * **Purpose**: Verifies that content matches expected checksum.
 * Used to detect data corruption or tampering.
 *
 * **Usage Example**:
 * ```typescript
 * const isValid = await verifyChecksum(
 *   storedContent,
 *   expectedChecksum
 * );
 * if (!isValid) {
 *   console.error('Content corrupted!');
 * }
 * ```
 *
 * @param content - Content to verify
 * @param expectedChecksum - Expected checksum
 * @returns True if checksums match
 */
export function verifyChecksum(
  content: string | Buffer,
  expectedChecksum: string
): boolean {
  const actualChecksum = calculateChecksum(content);
  return actualChecksum === expectedChecksum;
}

/**
 * Checksum cache for performance optimization
 *
 * **Purpose**: Caches recently computed checksums to avoid redundant
 * calculations. Useful for repeated operations.
 */
export class ChecksumCache {
  private cache: Map<string, string> = new Map();
  private maxSize: number;

  /**
   * Create a new checksum cache
   *
   * @param maxSize - Maximum number of entries to cache (default: 1000)
   */
  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Get or compute checksum
   *
   * @param key - Cache key (e.g., file path)
   * @param content - Content to hash if not cached
   * @returns Checksum (cached or newly computed)
   */
  getOrCompute(key: string, content: string | Buffer): string {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const checksum = calculateChecksum(content);
    this.set(key, checksum);
    return checksum;
  }

  /**
   * Store checksum in cache
   *
   * @param key - Cache key
   * @param checksum - Checksum to cache
   */
  set(key: string, checksum: string): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, checksum);
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   *
   * @returns Cache size and max size
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Streaming checksum calculator for large files
 *
 * **Purpose**: Calculates checksum for large files without loading
 * entire file into memory. Processes file in chunks.
 *
 * **Usage Example**:
 * ```typescript
 * const calculator = new StreamingChecksum();
 *
 * // Process file in chunks
 * for await (const chunk of fileStream) {
 *   calculator.update(chunk);
 * }
 *
 * const checksum = calculator.digest();
 * ```
 */
export class StreamingChecksum {
  private hash: ReturnType<typeof createHash>;

  constructor() {
    this.hash = createHash('sha256');
  }

  /**
   * Update hash with new data
   *
   * @param data - Data to add to hash
   */
  update(data: string | Buffer): void {
    this.hash.update(data);
  }

  /**
   * Get final checksum
   *
   * @returns Hexadecimal SHA-256 checksum
   */
  digest(): string {
    return this.hash.digest('hex');
  }

  /**
   * Reset calculator for reuse
   */
  reset(): void {
    this.hash = createHash('sha256');
  }
}
