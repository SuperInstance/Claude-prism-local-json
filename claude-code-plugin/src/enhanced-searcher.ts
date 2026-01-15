import { z } from "zod";
import { glob } from "fast-glob";
import * as path from "path";
import * as fs from "fs/promises";

import { StorageManager } from "./optimized-storage/index.js";
import { Logger } from "./utils.js";

// Define types
export interface SearchResult {
  file_path: string;
  line_number: number;
  content: string;
  score: number;
  language: string;
  context?: {
    before: string[];
    after: string[];
  };
}

export interface ContextResult {
  file_path: string;
  content: string;
  language: string;
  context_before: string[];
  context_after: string[];
}

export interface UsageResult {
  name: string;
  type: string;
  usages: Array<{
    file_path: string;
    line_number: number;
    content: string;
  }>;
}

// Configuration schema
const ConfigSchema = z.object({
  indexPath: z.string().default("./.prism-index"),
  include: z.array(z.string()).default(["src/**/*", "lib/**/*", "**/*.ts", "**/*.js", "**/*.py"]),
  exclude: z.array(z.string()).default(["node_modules/**/*", "dist/**/*", ".git/**/*"]),
  languages: z.array(z.string()).default(["typescript", "javascript", "python"]),
  chunkSize: z.number().default(50),
  autoIndex: z.boolean().default(true),
  useOptimizedStorage: z.boolean().default(true),
});

type Config = z.infer<typeof ConfigSchema>;

export class EnhancedCodeSearcher {
  private logger: Logger;
  private config: Config;
  private storageManager: StorageManager | null = null;
  private isInitialized = false;

  constructor(config?: Partial<Config>) {
    this.logger = new Logger("EnhancedCodeSearcher");
    this.config = ConfigSchema.parse(config);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info("Initializing enhanced code searcher");

      // Initialize optimized storage if enabled
      if (this.config.useOptimizedStorage) {
        this.storageManager = new StorageManager(this.config.indexPath);
        await this.storageManager.initialize();
        this.logger.info("Using optimized storage system");
      } else {
        this.logger.info("Using traditional storage system");
      }

      this.isInitialized = true;
      this.logger.info("Enhanced code searcher initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize searcher:", error);
      throw error;
    }
  }

  async search(query: string, options: {
    limit?: number;
    language?: string;
    path?: string;
    minScore?: number;
    fuzzy?: boolean;
    exact?: boolean;
    caseSensitive?: boolean;
  } = {}): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      throw new Error("Searcher not initialized");
    }

    try {
      this.logger.info(`Searching for: "${query}"`, options);

      // Use optimized storage if available
      if (this.storageManager) {
        return await this.optimizedSearch(query, options);
      }

      // Fall back to traditional search
      return await this.traditionalSearch(query, options);
    } catch (error) {
      this.logger.error("Search failed:", error);
      throw error;
    }
  }

  async getContext(
    filePath: string,
    options: {
      lineNumber?: number;
      contextLines?: number;
    } = {}
  ): Promise<ContextResult | null> {
    if (!this.isInitialized) {
      throw new Error("Searcher not initialized");
    }

    try {
      this.logger.info(`Getting context for: ${filePath}`, options);

      const { lineNumber, contextLines = 5 } = options;

      // Read the file
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      // Determine range
      const startLine = lineNumber ? Math.max(0, lineNumber - contextLines - 1) : 0;
      const endLine = lineNumber ? Math.min(lines.length, lineNumber + contextLines) : Math.min(lines.length, contextLines * 2);

      // Extract context
      const contextBefore = lines.slice(startLine, lineNumber ? lineNumber - 1 : contextLines);
      const contextAfter = lineNumber ? lines.slice(lineNumber, endLine) : [];
      const relevantContent = lineNumber ? lines[lineNumber - 1] : lines.slice(startLine, endLine).join("\n");

      // Detect language
      const language = this.detectLanguage(filePath);

      return {
        file_path: filePath,
        content: relevantContent,
        language,
        context_before: contextBefore,
        context_after: contextAfter,
      };
    } catch (error) {
      this.logger.error(`Failed to get context for ${filePath}:`, error);
      return null;
    }
  }

  async findUsages(name: string, type?: string): Promise<UsageResult> {
    if (!this.isInitialized) {
      throw new Error("Searcher not initialized");
    }

    try {
      this.logger.info(`Finding usages of: ${name}`, { type });

      // Use optimized search if available
      if (this.storageManager) {
        const results = await this.storageManager.searchFiles(name, {
          language: type,
          limit: 100,
        });

        const usages = results.map(result => {
          const lines = result.metadata.language ?
            this.extractLinesFromFile(result.filePath, 1) :
            [{ line: result.metadata.lastModified }];

          return {
            file_path: result.filePath,
            line_number: 1, // TODO: Extract actual line number
            content: lines[0]?.content || '',
          };
        });

        return {
          name,
          type: type || "unknown",
          usages: usages.slice(0, 10), // Limit to 10 results
        };
      }

      // Fall back to traditional implementation
      return await this.traditionalFindUsages(name, type);
    } catch (error) {
      this.logger.error("Failed to find usages:", error);
      throw error;
    }
  }

  async indexFiles(files: string[]): Promise<void> {
    this.logger.info(`Indexing ${files.length} files`);

    if (this.storageManager) {
      // Use optimized storage
      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const language = this.detectLanguage(filePath);
          await this.storageManager.addFile(filePath, content, language);
        } catch (error) {
          this.logger.error(`Failed to index file ${filePath}:`, error);
        }
      }

      // Optimize storage after indexing
      await this.storageManager.optimizeStorage();
    } else {
      // Use traditional indexing
      await this.traditionalIndexFiles(files);
    }
  }

  async findProjectFiles(projectPath: string): Promise<string[]> {
    try {
      this.logger.info(`Finding project files in: ${projectPath}`);

      // Resolve include patterns relative to project path
      const includePatterns = this.config.include.map(pattern =>
        path.resolve(projectPath, pattern)
      );

      // Resolve exclude patterns relative to project path
      const excludePatterns = this.config.exclude.map(pattern =>
        path.resolve(projectPath, pattern)
      );

      // Find files
      const files = await glob(includePatterns, {
        ignore: excludePatterns,
        absolute: true,
        onlyFiles: true,
      });

      this.logger.info(`Found ${files.length} files to index`);
      return files;
    } catch (error) {
      this.logger.error("Failed to find project files:", error);
      throw error;
    }
  }

  async getIndexInfo(projectPath?: string): Promise<{
    total_files: number;
    total_chunks: number;
    languages: Record<string, number>;
    last_indexed: string | null;
    index_size_mb: number;
    performance?: {
      search_time_avg: number;
      compression_ratio: number;
      cache_hits: number;
    };
  }> {
    try {
      const resolvedPath = projectPath || process.cwd();
      const indexPath = path.join(resolvedPath, this.config.indexPath);

      if (this.storageManager) {
        // Get metrics from optimized storage
        const metrics = await this.storageManager.getMetrics();
        const status = await this.storageManager.getStatus();

        return {
          total_files: metrics.totalFiles,
          total_chunks: 0, // TODO: Calculate chunk count
          languages: metrics.languages,
          last_indexed: metrics.newestFile,
          index_size_mb: metrics.indexSize / (1024 * 1024),
          performance: {
            search_time_avg: 0, // TODO: Track actual search times
            compression_ratio: metrics.compressionRatio,
            cache_hits: 0, // TODO: Track cache hits
          },
        };
      }

      // Fall back to traditional implementation
      return await this.traditionalGetIndexInfo(indexPath);
    } catch (error) {
      this.logger.error("Failed to get index info:", error);
      throw error;
    }
  }

  async clearIndex(projectPath?: string): Promise<void> {
    try {
      const resolvedPath = projectPath || process.cwd();
      const indexPath = path.join(resolvedPath, this.config.indexPath);

      if (this.storageManager) {
        // Use optimized storage cleanup
        await this.storageManager.cleanup({
          maxBackups: 0,
          removeOrphanedFiles: true,
        });
      } else {
        // Traditional cleanup
        await fs.rm(indexPath, { recursive: true, force: true });
      }

      this.logger.info("Index cleared successfully");
    } catch (error) {
      this.logger.error("Failed to clear index:", error);
      throw error;
    }
  }

  async getPerformanceReport(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: any;
    recommendations: string[];
  }> {
    if (this.storageManager) {
      const status = await this.storageManager.getStatus();
      const metrics = await this.storageManager.getMetrics();

      return {
        healthy: status.healthy,
        issues: status.issues,
        metrics,
        recommendations: [
          ...(metrics.totalSize > 50 * 1024 * 1024 ? ["Consider cleanup to reduce storage size"] : []),
          ...(metrics.totalFiles > 5000 ? ["Large number of files may impact performance"] : []),
        ],
      };
    }

    return {
      healthy: true,
      issues: [],
      metrics: {},
      recommendations: [],
    };
  }

  private async optimizedSearch(query: string, options: any): Promise<SearchResult[]> {
    if (!this.storageManager) {
      throw new Error("Storage manager not initialized");
    }

    const results = await this.storageManager.searchFiles(query, {
      language: options.language,
      limit: options.limit || 10,
      minScore: options.minScore || 0,
    });

    return results.map(result => ({
      file_path: result.filePath,
      line_number: 1, // TODO: Extract actual line number
      content: result.metadata ? this.extractFirstLine(result.filePath) : '',
      score: result.score,
      language: result.metadata?.language || 'unknown',
    }));
  }

  private async traditionalSearch(query: string, options: any): Promise<SearchResult[]> {
    // Placeholder for traditional search implementation
    // This would implement the old search algorithm
    return [];
  }

  private async traditionalFindUsages(name: string, type?: string): Promise<UsageResult> {
    // Placeholder for traditional usage finding
    return {
      name,
      type: type || "unknown",
      usages: [],
    };
  }

  private async traditionalIndexFiles(files: string[]): Promise<void> {
    // Placeholder for traditional indexing
  }

  private async traditionalGetIndexInfo(indexPath: string): Promise<any> {
    // Placeholder for traditional index info
    return {
      total_files: 0,
      total_chunks: 0,
      languages: {},
      last_indexed: null,
      index_size_mb: 0,
    };
  }

  private extractFirstLine(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      return lines[0] || '';
    } catch {
      return '';
    }
  }

  private extractLinesFromFile(filePath: string, count: number): Array<{ line: number; content: string }> {
    // Placeholder for line extraction
    return [];
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const languageMap: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".py": "python",
      ".java": "java",
      ".go": "go",
      ".rs": "rust",
      ".c": "c",
      ".cpp": "cpp",
      ".h": "c",
      ".hpp": "cpp",
      ".cs": "csharp",
      ".php": "php",
      ".rb": "ruby",
      ".kt": "kotlin",
      ".swift": "swift",
      ".sh": "shell",
      ".bash": "shell",
      ".zsh": "shell",
    };

    return languageMap[ext] || "unknown";
  }
}