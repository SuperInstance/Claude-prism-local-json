/**
 * ============================================================================
 * PROGRESS REPORTER
 * ============================================================================
 *
 * Tracks and reports indexing progress with real-time statistics and ETA
 * calculation. Provides users with visibility into long-running operations.
 *
 * TRACKED METRICS:
 *
 * 1. PROGRESS PERCENTAGE
 *    - Calculated as (filesProcessed / totalFiles) * 100
 *    - Clamped to 0-100 range
 *    - Updated after each file is processed
 *
 * 2. ETA (Estimated Time to Arrival)
 *    - Calculated using sliding window average
 *    - Formula: remainingFiles * (elapsedTime / processedFiles)
 *    - Updated in real-time as files are processed
 *    - Returns "unknown" if insufficient data
 *
 * 3. THROUGHPUT METRICS
 *    - Files per second: processedFiles / (elapsedTime / 1000)
 *    - Chunks per file: totalChunks / processedFiles
 *    - Used for performance profiling and optimization
 *
 * 4. STATISTICAL BREAKDOWN
 *    - Chunks by programming language
 *    - Chunks by type (function, class, statement, etc)
 *    - Total tokens processed
 *    - Total bytes processed
 *
 * USAGE PATTERN:
 * ```typescript
 * const reporter = new ProgressReporter();
 * reporter.start(1000); // 1000 files to process
 *
 * for (const file of files) {
 *   const chunks = await processFile(file);
 *   reporter.updateFile(file, chunks.length);
 *
 *   const status = reporter.getStatus();
 *   console.log(`${status.progress}%: ${status.eta} remaining`);
 * }
 *
 * const summary = reporter.complete();
 * console.log(`Processed ${summary.totalTokens} tokens in ${summary.duration}ms`);
 * ```
 *
 * FILE HISTORY TRACKING:
 * - Maintains array of FileProgress entries with timestamps
 * - Used for calculating accurate throughput metrics
 * - Enables sliding window ETA calculation
 * - TODO: Add sliding window to smooth out ETA fluctuations
 *
 * @see IndexerOrchestrator for usage in indexing pipeline
 */

import type { CodeChunk } from '../core/types/index.js';

/**
 * Index summary statistics
 */
export interface IndexSummary {
  /** Total tokens processed */
  totalTokens: number;

  /** Chunks by programming language */
  chunksByLanguage: Record<string, number>;

  /** Chunks by type (function, class, etc) */
  chunksByType: Record<string, number>;

  /** Average chunks per file */
  avgChunksPerFile: number;

  /** Total bytes processed */
  totalBytes: number;

  /** Time taken in milliseconds */
  duration?: number;

  /** Files per second */
  filesPerSecond?: number;
}

/**
 * File progress info
 */
interface FileProgress {
  path: string;
  chunks: number;
  timestamp: number;
}

/**
 * Progress reporter for indexing operations
 *
 * Tracks files processed, calculates ETA, and generates summary statistics.
 */
export class ProgressReporter {
  private startTime: number = 0;
  private endTime: number = 0;
  private filesProcessed: number = 0;
  private totalFiles: number = 0;
  private totalChunks: number = 0;
  private totalTokens: number = 0;
  private totalBytes: number = 0;
  private chunksByLanguage: Record<string, number> = {};
  private chunksByType: Record<string, number> = {};
  private fileHistory: FileProgress[] = [];

  /**
   * Start progress tracking
   *
   * @param totalFiles - Total number of files to process
   */
  start(totalFiles: number): void {
    this.startTime = Date.now();
    this.totalFiles = totalFiles;
    this.filesProcessed = 0;
    this.totalChunks = 0;
    this.totalTokens = 0;
    this.totalBytes = 0;
    this.chunksByLanguage = {};
    this.chunksByType = {};
    this.fileHistory = [];
  }

  /**
   * Update progress for a processed file
   *
   * @param file - File path
   * @param chunks - Number of chunks extracted
   * @param tokens - Optional token count
   * @param bytes - Optional byte count
   */
  updateFile(
    file: string,
    chunks: number,
    tokens?: number,
    bytes?: number
  ): void {
    this.filesProcessed++;
    this.totalChunks += chunks;
    this.totalTokens += tokens || 0;
    this.totalBytes += bytes || 0;

    this.fileHistory.push({
      path: file,
      chunks,
      timestamp: Date.now(),
    });
  }

  /**
   * Complete progress tracking and generate summary
   *
   * @returns Index summary
   */
  complete(): IndexSummary {
    this.endTime = Date.now();
    const duration = this.endTime - this.startTime;

    return {
      totalTokens: this.totalTokens,
      totalBytes: this.totalBytes,
      chunksByLanguage: { ...this.chunksByLanguage },
      chunksByType: { ...this.chunksByType },
      avgChunksPerFile: this.calculateAvgChunksPerFile(),
      duration,
      filesPerSecond: this.calculateFilesPerSecond(duration),
    };
  }

  /**
   * Get current progress percentage
   *
   * @returns Progress (0-100)
   */
  getProgress(): number {
    if (this.totalFiles === 0) {
      return 0;
    }
    return Math.min(100, (this.filesProcessed / this.totalFiles) * 100);
  }

  /**
   * Get estimated time to completion
   *
   * @returns ETA in milliseconds
   */
  getETA(): number {
    if (this.filesProcessed === 0 || this.totalFiles === 0) {
      return 0;
    }

    const elapsed = Date.now() - this.startTime;
    const remaining = this.totalFiles - this.filesProcessed;
    const avgTimePerFile = elapsed / this.filesProcessed;

    return Math.round(remaining * avgTimePerFile);
  }

  /**
   * Get number of files processed
   *
   * @returns Files processed count
   */
  getFilesProcessed(): number {
    return this.filesProcessed;
  }

  /**
   * Get total chunks processed
   *
   * @returns Total chunks count
   */
  getTotalChunks(): number {
    return this.totalChunks;
  }

  /**
   * Get number of chunks for a specific file
   *
   * @param filePath - File path to look up
   * @returns Number of chunks for the file, or 0 if not found
   */
  getChunksForFile(filePath: string): number {
    const fileEntry = this.fileHistory.find(f => f.path === filePath);
    return fileEntry?.chunks || 0;
  }

  /**
   * Get formatted ETA string
   *
   * @returns Human-readable ETA
   */
  getETAString(): string {
    const eta = this.getETA();

    if (eta === 0) {
      return 'unknown';
    }

    const seconds = Math.floor(eta / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Update language statistics
   *
   * @param chunks - Chunks to count by language
   */
  updateLanguageStats(chunks: CodeChunk[]): void {
    for (const chunk of chunks) {
      this.chunksByLanguage[chunk.language] =
        (this.chunksByLanguage[chunk.language] || 0) + 1;
      this.chunksByType[chunk.kind] =
        (this.chunksByType[chunk.kind] || 0) + 1;
    }
  }

  /**
   * Calculate average chunks per file
   *
   * @returns Average chunks
   */
  private calculateAvgChunksPerFile(): number {
    if (this.filesProcessed === 0) {
      return 0;
    }
    return Math.round((this.totalChunks / this.filesProcessed) * 100) / 100;
  }

  /**
   * Calculate files processed per second
   *
   * @param duration - Duration in milliseconds
   * @returns Files per second
   */
  private calculateFilesPerSecond(duration: number): number {
    if (duration === 0) {
      return 0;
    }
    return Math.round((this.filesProcessed / (duration / 1000)) * 100) / 100;
  }

  /**
   * Get progress status object
   *
   * @returns Progress status
   */
  getStatus(): {
    progress: number;
    filesProcessed: number;
    totalFiles: number;
    chunks: number;
    eta: string;
    elapsed: string;
  } {
    const elapsed = Date.now() - this.startTime;

    return {
      progress: this.getProgress(),
      filesProcessed: this.filesProcessed,
      totalFiles: this.totalFiles,
      chunks: this.totalChunks,
      eta: this.getETAString(),
      elapsed: this.formatDuration(elapsed),
    };
  }

  /**
   * Format duration in human-readable string
   *
   * @param ms - Duration in milliseconds
   * @returns Formatted duration
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Reset progress tracking
   */
  reset(): void {
    this.startTime = 0;
    this.endTime = 0;
    this.filesProcessed = 0;
    this.totalFiles = 0;
    this.totalChunks = 0;
    this.totalTokens = 0;
    this.totalBytes = 0;
    this.chunksByLanguage = {};
    this.chunksByType = {};
    this.fileHistory = [];
  }
}
