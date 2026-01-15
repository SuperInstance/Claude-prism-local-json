// Main exports for optimized JSON storage system
export { OptimizedJSONStorage } from './OptimizedJSONStorage.js';
export { OptimizedSearchEngine } from './OptimizedSearchEngine.js';
export { JSONStreamingHandler } from './JSONStreamingHandler.js';
export { DataIntegrityValidator } from './DataIntegrityValidator.js';
export { StorageManager } from './StorageManager.js';
export { PerformanceBenchmark } from './PerformanceBenchmark.js';

// Type exports
export type {
  StorageConfig,
  IndexMetadata,
  IndexPathEntry,
  OptimizedIndex,
} from './OptimizedJSONStorage.js';

export type {
  SearchResult,
  SearchQuery,
  SearchStats,
} from './OptimizedSearchEngine.js';

export type {
  StreamingOptions,
} from './JSONStreamingHandler.js';

export type {
  IntegrityCheck,
  BackupInfo,
} from './DataIntegrityValidator.js';

export type {
  StorageMetrics,
  CleanupReport,
} from './StorageManager.js';

export type {
  BenchmarkResult,
  BenchmarkSuite,
} from './PerformanceBenchmark.js';