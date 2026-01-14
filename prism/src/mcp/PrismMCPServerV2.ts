/**
 * ============================================================================
 * MODEL CONTEXT PROTOCOL (MCP) SERVER - V2 WITH SEMANTIC EMBEDDINGS
 * ============================================================================
 *
 * Enhanced MCP Server implementation with true semantic embeddings using
 * Cloudflare Workers AI, replacing hash-based embeddings for dramatically
 * improved search relevance.
 *
 * KEY IMPROVEMENTS:
 * ----------------
 * 1. True semantic embeddings (384 dimensions)
 * 2. D1-based persistent caching with LRU eviction
 * 3. Comprehensive metrics and monitoring
 * 4. Batch processing for efficiency
 * 5. Graceful fallback strategies
 *
 * ARCHITECTURE:
 * ------------
 * - Uses SemanticEmbeddingsService for embedding generation
 * - Maintains backward compatibility with existing MCP protocol
 * - Provides migration path from hash-based embeddings
 * - Includes health monitoring and diagnostics
 *
 * @see docs/migrations/004_semantic_embeddings.md
 * @see prism/src/mcp/semantic-embeddings.ts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IVectorDB } from '../vector-db/index.js';
import type { CodeChunk } from '../core/types.js';
import { SemanticEmbeddingsService, type Embedding } from './semantic-embeddings.js';

/**
 * ============================================================================
 * TYPES AND INTERFACES
 * ============================================================================
 */

/**
 * Enhanced MCP Server configuration
 */
export interface PrismMCPServerV2Config {
  /** Vector database instance */
  vectorDB: IVectorDB;

  /** Default maximum results */
  maxResults?: number;

  /** Semantic embeddings service */
  embeddingsService?: SemanticEmbeddingsService;

  /** Embeddings service configuration */
  embeddingsConfig?: {
    cloudflareAccountId?: string;
    cloudflareApiKey?: string;
    cachePath?: string;
    cacheTTL?: number;
    maxCacheSize?: number;
    enableMetrics?: boolean;
    fallbackToHash?: boolean;
  };

  /** Enable detailed logging */
  enableLogging?: boolean;

  /** Enable health monitoring */
  enableHealthMonitoring?: boolean;
}

/**
 * Server health status
 */
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  embeddings: {
    available: boolean;
    provider: string;
    lastGeneration: number;
    averageTime: number;
  };
  cache: {
    entries: number;
    hitRate: number;
    size: number;
  };
  vectorDB: {
    connected: boolean;
    chunkCount: number;
  };
}

/**
 * ============================================================================
 * MCP SERVER V2 CLASS
 * ============================================================================
 */

/**
 * Enhanced Prism MCP Server with semantic embeddings
 *
 * This server provides true semantic search capabilities using Cloudflare
 * Workers AI embeddings, with comprehensive caching, metrics, and fallback
 * strategies for production reliability.
 */
export class PrismMCPServerV2 {
  /** MCP SDK server instance */
  private server: Server;

  /** Vector database */
  private vectorDB: IVectorDB;

  /** Semantic embeddings service */
  private embeddings: SemanticEmbeddingsService;

  /** Default maximum results */
  private maxResults: number;

  /** Logging enabled */
  private enableLogging: boolean;

  /** Health monitoring enabled */
  private enableHealthMonitoring: boolean;

  /** Health status */
  private healthStatus: HealthStatus;

  constructor(config: PrismMCPServerV2Config) {
    this.vectorDB = config.vectorDB;
    this.maxResults = config.maxResults || 10;
    this.enableLogging = config.enableLogging || false;
    this.enableHealthMonitoring = config.enableHealthMonitoring !== false;

    // Initialize embeddings service
    if (config.embeddingsService) {
      this.embeddings = config.embeddingsService;
    } else {
      this.embeddings = new SemanticEmbeddingsService({
        cloudflareAccountId: config.embeddingsConfig?.cloudflareAccountId,
        cloudflareApiKey: config.embeddingsConfig?.cloudflareApiKey,
        cachePath: config.embeddingsConfig?.cachePath || ':memory:',
        cacheTTL: config.embeddingsConfig?.cacheTTL,
        maxCacheSize: config.embeddingsConfig?.maxCacheSize,
        enableMetrics: config.embeddingsConfig?.enableMetrics,
        fallbackToHash: config.embeddingsConfig?.fallbackToHash,
      });
    }

    // Initialize health status
    this.healthStatus = {
      status: 'healthy',
      timestamp: Date.now(),
      embeddings: {
        available: true,
        provider: 'unknown',
        lastGeneration: 0,
        averageTime: 0,
      },
      cache: {
        entries: 0,
        hitRate: 0,
        size: 0,
      },
      vectorDB: {
        connected: true,
        chunkCount: 0,
      },
    };

    // Create MCP server
    this.server = new Server(
      {
        name: 'prism-server-v2',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up handlers
    this.setupHandlers();

    // Start health monitoring if enabled
    if (this.enableHealthMonitoring) {
      this.startHealthMonitoring();
    }
  }

  /**
   * ============================================================================
   * REQUEST HANDLERS
   * ============================================================================
   */

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolDefinitions(),
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.executeTool(name, args || {});
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        this.log('error', `Tool execution error: ${error}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * ============================================================================
   * TOOL DEFINITIONS
   * ============================================================================
   */

  /**
   * Get tool definitions
   */
  private getToolDefinitions(): Tool[] {
    return [
      // search_repo - Enhanced with semantic embeddings
      {
        name: 'search_repo',
        description:
          'Search the indexed codebase for relevant code snippets using TRUE SEMANTIC SEARCH with Cloudflare Workers AI embeddings. Returns semantically similar code chunks with similarity scores.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "authentication logic", "error handling")',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
              default: 10,
            },
            minScore: {
              type: 'number',
              description: 'Minimum similarity score (0-1, default: 0.0)',
              default: 0.0,
            },
          },
          required: ['query'],
        },
      },

      // get_context - Unchanged
      {
        name: 'get_context',
        description:
          'Get context for a specific file, including all chunks from that file with their line numbers and content.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'File path to get context for (e.g., "./src/auth/login.ts")',
            },
          },
          required: ['filePath'],
        },
      },

      // explain_usage - Unchanged
      {
        name: 'explain_usage',
        description:
          'Get usage information for a symbol (function, class, variable) including its definition and all places where it is used.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Symbol name to search for (e.g., "authenticateUser")',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 20)',
              default: 20,
            },
          },
          required: ['symbol'],
        },
      },

      // list_indexed_files - Unchanged
      {
        name: 'list_indexed_files',
        description:
          'List all files that are currently indexed in the database, grouped by language.',
        inputSchema: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              description:
                'Filter by language (e.g., "typescript", "python"). If not provided, shows all languages.',
            },
          },
        },
      },

      // get_chunk - Unchanged
      {
        name: 'get_chunk',
        description:
          'Get a specific chunk by ID. Useful when you have a chunk ID from a previous search and need the full content.',
        inputSchema: {
          type: 'object',
          properties: {
            chunkId: {
              type: 'string',
              description: 'Chunk ID to retrieve',
            },
          },
          required: ['chunkId'],
        },
      },

      // NEW: get_embeddings_health
      {
        name: 'get_embeddings_health',
        description:
          'Get health status and metrics for the semantic embeddings service, including cache statistics and provider information.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // NEW: clear_embeddings_cache
      {
        name: 'clear_embeddings_cache',
        description:
          'Clear the embeddings cache. Useful for freeing memory or forcing regeneration of embeddings.',
        inputSchema: {
          type: 'object',
          properties: {
            confirm: {
              type: 'boolean',
              description: 'Set to true to confirm cache clearing',
            },
          },
          required: ['confirm'],
        },
      },
    ];
  }

  /**
   * ============================================================================
   * TOOL EXECUTION
   * ============================================================================
   */

  /**
   * Execute tool by name
   */
  private async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    this.log('info', `Executing tool: ${name}`);

    switch (name) {
      case 'search_repo':
        return await this.searchRepo(args);
      case 'get_context':
        return await this.getContext(args);
      case 'explain_usage':
        return await this.explainUsage(args);
      case 'list_indexed_files':
        return await this.listIndexedFiles(args);
      case 'get_chunk':
        return await this.getChunk(args);
      case 'get_embeddings_health':
        return await this.getEmbeddingsHealth();
      case 'clear_embeddings_cache':
        return await this.clearEmbeddingsCache(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Tool: search_repo - ENHANCED with semantic embeddings
   */
  private async searchRepo(args: Record<string, unknown>): Promise<string> {
    const query = args.query as string;
    const limit = (args.limit as number) || this.maxResults;
    const minScore = (args.minScore as number) || 0.0;

    if (!query) {
      throw new Error('Query is required');
    }

    this.log('info', `Searching for: "${query}"`);

    // Generate semantic embedding for query
    const embeddingResult = await this.embeddings.generateEmbedding(query);

    this.log('info', `Embedding generated in ${embeddingResult.generationTime}ms`);
    this.log('info', `Provider: ${embeddingResult.provider}, Cache hit: ${embeddingResult.cacheHit}`);

    // Update health status
    this.healthStatus.embeddings.lastGeneration = Date.now();
    this.healthStatus.embeddings.averageTime = embeddingResult.generationTime;
    this.healthStatus.embeddings.provider = embeddingResult.provider;

    // Search vector database
    const results = await this.vectorDB.search(embeddingResult.values, limit * 2);

    // Filter by minimum score and format
    const filtered = results
      .filter((r) => r.score >= minScore)
      .slice(0, limit)
      .map((r) => this.formatSearchResult(r));

    if (filtered.length === 0) {
      return `No results found for query: "${query}"\n\nEmbedding provider: ${embeddingResult.provider}\nCache hit: ${embeddingResult.cacheHit}`;
    }

    return `Found ${filtered.length} result(s) for query: "${query}"\n\n` + filtered.join('\n\n');
  }

  /**
   * Tool: get_context
   */
  private async getContext(args: Record<string, unknown>): Promise<string> {
    const filePath = args.filePath as string;

    if (!filePath) {
      throw new Error('File path is required');
    }

    const allChunks = await this.getAllChunks();
    const normalizedPath = filePath.replace(/\\/g, '/');
    const fileChunks = allChunks.filter((c) => {
      const normalizedChunkPath = c.filePath.replace(/\\/g, '/');
      return normalizedChunkPath === normalizedPath || normalizedChunkPath.endsWith(normalizedPath);
    });

    if (fileChunks.length === 0) {
      return `No indexed chunks found for file: "${filePath}"`;
    }

    fileChunks.sort((a, b) => a.startLine - b.startLine);

    const formatted = fileChunks.map(
      (chunk) =>
        `Lines ${chunk.startLine}-${chunk.endLine}:\n${this.indentCode(chunk.content, 2)}`
    );

    const firstChunk = fileChunks[0];
    return `File: ${filePath}\nLanguage: ${firstChunk?.language || 'unknown'}\nChunks: ${fileChunks.length}\n\n` + formatted.join('\n\n');
  }

  /**
   * Tool: explain_usage
   */
  private async explainUsage(args: Record<string, unknown>): Promise<string> {
    const symbol = args.symbol as string;
    const limit = (args.limit as number) || 20;

    if (!symbol) {
      throw new Error('Symbol is required');
    }

    const allChunks = await this.getAllChunks();

    const matchingChunks = allChunks
      .filter((chunk) => {
        if (chunk.symbols && chunk.symbols.includes(symbol)) {
          return true;
        }
        const regex = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(chunk.content);
      })
      .slice(0, limit);

    if (matchingChunks.length === 0) {
      return `No usage found for symbol: "${symbol}"`;
    }

    const definition = matchingChunks.find((c) => c.symbols && c.symbols.includes(symbol));

    let output = `Symbol: ${symbol}\n`;
    output += `Found in ${matchingChunks.length} chunk(s)\n\n`;

    if (definition) {
      output += `Definition:\n`;
      output += `  File: ${definition.filePath}\n`;
      output += `  Lines: ${definition.startLine}-${definition.endLine}\n`;
      output += `  Code:\n${this.indentCode(definition.content, 4)}\n\n`;
    }

    output += `Usage:\n`;
    matchingChunks.forEach((chunk, i) => {
      if (definition && chunk.id === definition.id) return;
      const firstLine = chunk.content.split('\n')[0] ?? '';
      output += `  ${i + 1}. ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}\n`;
      output += `     ${this.indentCode(firstLine, 6)}\n`;
    });

    return output;
  }

  /**
   * Tool: list_indexed_files
   */
  private async listIndexedFiles(args: Record<string, unknown>): Promise<string> {
    const language = args.language as string;

    const allChunks = await this.getAllChunks();

    const fileMap = new Map<string, { chunks: number; language: string }>();
    for (const chunk of allChunks) {
      const existing = fileMap.get(chunk.filePath);
      if (existing) {
        existing.chunks++;
      } else {
        fileMap.set(chunk.filePath, { chunks: 1, language: chunk.language });
      }
    }

    let files = Array.from(fileMap.entries());
    if (language) {
      files = files.filter(([, info]) => info.language === language);
    }

    const byLanguage = new Map<string, string[]>();
    for (const [path, info] of files) {
      const lang = info.language;
      if (!byLanguage.has(lang)) {
        byLanguage.set(lang, []);
      }
      byLanguage.get(lang)!.push(path);
    }

    let output = `Indexed Files: ${files.length} file(s)\n\n`;

    for (const [lang, paths] of byLanguage.entries()) {
      output += `${lang} (${paths.length} file(s)):\n`;
      paths.forEach((path) => {
        const chunks = fileMap.get(path)!.chunks;
        output += `  - ${path} (${chunks} chunk(s))\n`;
      });
      output += '\n';
    }

    return output;
  }

  /**
   * Tool: get_chunk
   */
  private async getChunk(args: Record<string, unknown>): Promise<string> {
    const chunkId = args.chunkId as string;

    if (!chunkId) {
      throw new Error('Chunk ID is required');
    }

    const allChunks = await this.getAllChunks();
    const chunk = allChunks.find((c) => c.id === chunkId);

    if (!chunk) {
      return `Chunk not found: "${chunkId}"`;
    }

    return `Chunk ID: ${chunk.id}\n` +
           `File: ${chunk.filePath}\n` +
           `Lines: ${chunk.startLine}-${chunk.endLine}\n` +
           `Language: ${chunk.language}\n` +
           `Symbols: ${chunk.symbols.join(', ') || 'none'}\n\n` +
           `Content:\n${chunk.content}`;
  }

  /**
   * Tool: get_embeddings_health - NEW
   */
  private async getEmbeddingsHealth(): Promise<string> {
    const metrics = this.embeddings.getMetrics();
    const cacheStats = this.embeddings.getCacheStats();

    let output = '=== Semantic Embeddings Health Status ===\n\n';

    output += 'Provider Information:\n';
    output += `  Cloudflare: ${metrics.providerUsage.cloudflare} embeddings\n`;
    output += `  Ollama: ${metrics.providerUsage.ollama} embeddings\n`;
    output += `  Placeholder: ${metrics.providerUsage.placeholder} embeddings\n\n`;

    output += 'Performance Metrics:\n';
    output += `  Total generated: ${metrics.totalGenerated}\n`;
    output += `  Average time: ${metrics.averageGenerationTime.toFixed(1)}ms\n`;
    output += `  Cache hits: ${metrics.totalCacheHits}\n`;
    output += `  Cache misses: ${metrics.totalCacheMisses}\n\n`;

    output += 'Cache Statistics:\n';
    output += `  Entries: ${cacheStats.totalEntries}\n`;
    output += `  Hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%\n`;
    output += `  Size: ${(cacheStats.cacheSize / 1024).toFixed(2)}KB\n\n`;

    output += 'Error Counts:\n';
    output += `  Cloudflare: ${metrics.errors.cloudflare}\n`;
    output += `  Ollama: ${metrics.errors.ollama}\n`;
    output += `  Network: ${metrics.errors.network}\n`;
    output += `  Timeout: ${metrics.errors.timeout}\n`;

    return output;
  }

  /**
   * Tool: clear_embeddings_cache - NEW
   */
  private async clearEmbeddingsCache(args: Record<string, unknown>): Promise<string> {
    const confirm = args.confirm as boolean;

    if (!confirm) {
      throw new Error('Must set confirm=true to clear cache');
    }

    await this.embeddings.clearCache();

    return 'Embeddings cache cleared successfully.';
  }

  /**
   * ============================================================================
   * HELPER METHODS
   * ============================================================================
   */

  /**
   * Format search result
   */
  private formatSearchResult(result: { chunk: CodeChunk; score: number }): string {
    const { chunk, score } = result;
    const scorePercent = (score * 100).toFixed(1);

    return `[${scorePercent}% match] ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}\n` +
           `Language: ${chunk.language} | Symbols: ${chunk.symbols.join(', ') || 'none'}\n` +
           `${this.indentCode(chunk.content, 2)}`;
  }

  /**
   * Indent code for display
   */
  private indentCode(code: string, spaces: number): string {
    const indent = ' '.repeat(spaces);
    return code
      .split('\n')
      .map((line) => indent + line)
      .join('\n');
  }

  /**
   * Get all chunks from vector DB
   */
  private async getAllChunks(): Promise<CodeChunk[]> {
    if ('getAllChunks' in this.vectorDB) {
      return await (this.vectorDB as any).getAllChunks();
    }

    const results = await this.vectorDB.search(new Array(384).fill(0), Number.MAX_SAFE_INTEGER);
    return results.map((r) => r.chunk);
  }

  /**
   * ============================================================================
   * HEALTH MONITORING
   * ============================================================================
   */

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    setInterval(async () => {
      await this.updateHealthStatus();
    }, 60000); // Every minute
  }

  /**
   * Update health status
   */
  private async updateHealthStatus(): Promise<void> {
    try {
      const cacheStats = this.embeddings.getCacheStats();
      const metrics = this.embeddings.getMetrics();

      this.healthStatus.timestamp = Date.now();
      this.healthStatus.embeddings.available = true;
      this.healthStatus.embeddings.averageTime = metrics.averageGenerationTime;

      this.healthStatus.cache.entries = cacheStats.totalEntries;
      this.healthStatus.cache.hitRate = cacheStats.hitRate;
      this.healthStatus.cache.size = cacheStats.cacheSize;

      if ('getStats' in this.vectorDB) {
        const dbStats = (this.vectorDB as any).getStats();
        this.healthStatus.vectorDB.chunkCount = dbStats.chunkCount;
      }

      // Determine overall status
      if (cacheStats.hitRate < 0.3 || metrics.errors.cloudflare > 10) {
        this.healthStatus.status = 'degraded';
      } else {
        this.healthStatus.status = 'healthy';
      }
    } catch (error) {
      this.log('error', `Health monitoring error: ${error}`);
      this.healthStatus.status = 'unhealthy';
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * ============================================================================
   * LOGGING
   * ============================================================================
   */

  /**
   * Log message if logging is enabled
   */
  private log(level: 'info' | 'warn' | 'error', message: string): void {
    if (!this.enableLogging) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
      case 'info':
        console.log(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'error':
        console.error(logMessage);
        break;
    }
  }

  /**
   * ============================================================================
   * SERVER LIFECYCLE
   * ============================================================================
   */

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    this.log('info', 'Starting Prism MCP Server V2 with semantic embeddings');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.log('info', 'Server started successfully');
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    this.log('info', 'Stopping Prism MCP Server V2');
    await this.server.close();
    this.embeddings.close();
    this.log('info', 'Server stopped successfully');
  }

  /**
   * Get embeddings service (for testing/monitoring)
   */
  getEmbeddingsService(): SemanticEmbeddingsService {
    return this.embeddings;
  }
}

/**
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export default PrismMCPServerV2;
