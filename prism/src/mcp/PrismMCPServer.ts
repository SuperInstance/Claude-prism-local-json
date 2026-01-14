/**
 * ============================================================================
 * MODEL CONTEXT PROTOCOL (MCP) SERVER
 * ============================================================================
 *
 * Implements the Model Context Protocol (MCP) for integration with Claude Code
 * and other MCP-compatible clients. This server exposes PRISM's code search and
 * context retrieval capabilities as MCP tools.
 *
 * MCP Protocol Overview:
 * ---------------------
 * - Transport Layer: stdio (JSON-RPC 2.0 over stdin/stdout)
 * - Protocol Version: 2024-11-05
 * - Server Type: Tool provider (no resources or prompts in current implementation)
 *
 * Key Concepts:
 * ------------
 * 1. Tools: Callable functions that LLMs can invoke (search_repo, get_context, etc)
 * 2. JSON-RPC 2.0: All communication uses JSON-RPC request/response pattern
 * 3. Input Schema: Each tool defines its parameters using JSON Schema
 * 4. Error Handling: Errors returned as JSON-RPC error objects
 *
 * Server Capabilities:
 * -------------------
 * - tools: Exposes semantic code search tools
 * - resources: Not implemented (future: direct file access)
 * - prompts: Not implemented (future: query templates)
 *
 * Tool Definitions:
 * ----------------
 * - search_repo: Semantic code search using vector embeddings
 * - get_context: Retrieve all chunks from a specific file
 * - explain_usage: Find symbol definitions and usage locations
 * - list_indexed_files: List all indexed files grouped by language
 * - get_chunk: Retrieve a specific chunk by ID
 *
 * Embedding Service Configuration:
 * ================================
 * The MCP server uses semantic embeddings for search queries. Configure via:
 *
 * 1. Cloudflare Workers AI (Primary - Recommended):
 *    - Free tier: 10,000 neurons/day
 *    - Model: @cf/baai/bge-small-en-v1.5 (384 dimensions)
 *    - Set environment variables:
 *      export CLOUDFLARE_ACCOUNT_ID=your-account-id
 *      export CLOUDFLARE_API_KEY=your-api-key
 *
 * 2. Ollama (Fallback - Local):
 *    - Free, local inference
 *    - Model: nomic-embed-text (768 dimensions)
 *    - Requires Ollama running: ollama serve
 *    - Default endpoint: http://localhost:11434
 *
 * 3. Hash-based Placeholder (Last Resort):
 *    - Used when both providers are unavailable
 *    - Issues warning to console
 *    - Poor search quality (not semantic!)
 *
 * Integration with Claude Code:
 * ----------------------------
 * 1. Add server to Claude Code settings.json:
 *    {
 *      "mcpServers": {
 *        "prism": {
 *          "command": "node",
 *          "args": ["/path/to/prism/dist/mcp/cli.js", "--db", "./prism.db"],
 *          "env": {
 *            "CLOUDFLARE_ACCOUNT_ID": "your-account-id",
 *            "CLOUDFLARE_API_KEY": "your-api-key"
 *          }
 *        }
 *      }
 *    }
 *
 * 2. Claude Code discovers tools via ListToolsRequest
 * 3. LLM invokes tools via CallToolRequest with parameters
 * 4. Server returns results as text content
 *
 * Request/Response Format:
 * -----------------------
 * Request (JSON-RPC):
 * {
 *   "jsonrpc": "2.0",
 *   "id": 1,
 *   "method": "tools/call",
 *   "params": {
 *     "name": "search_repo",
 *     "arguments": {
 *       "query": "authentication logic",
 *       "limit": 10
 *     }
 *   }
 * }
 *
 * Response (JSON-RPC):
 * {
 *   "jsonrpc": "2.0",
 *   "id": 1,
 *   "result": {
 *     "content": [
 *       {
 *         "type": "text",
 *         "text": "Found 5 results..."
 *       }
 *     ]
 *   }
 * }
 *
 * Error Handling:
 * --------------
 * - Invalid parameters: Return JSON-RPC error with code -32602
 * - Tool execution errors: Return success with isError: true flag
 * - Unknown tools: Return error with descriptive message
 *
 * @see https://modelcontextprotocol.io
 * @see docs/architecture/06-mcp-integration.md
 * @see https://spec.modelcontextprotocol.io/specification/
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
import { EmbeddingService } from '../embeddings/index.js';

/**
 * ============================================================================
 * CONFIGURATION
 * ============================================================================
 */

/**
 * Configuration interface for the Prism MCP Server.
 *
 * Required Parameters:
 * -------------------
 * @param vectorDB - Vector database instance (SQLiteVectorDB or compatible)
 *
 * Optional Parameters:
 * -------------------
 * @param maxResults - Default maximum number of results to return from searches
 *                     (default: 10). Can be overridden per-request.
 * @param embeddingService - Custom embedding service instance. If not provided,
 *                           a default one will be created using environment variables.
 *
 * Example:
 * -------
 * const server = new PrismMCPServer({
 *   vectorDB: new SQLiteVectorDB({ path: './prism.db' }),
 *   maxResults: 20
 * });
 *
 * // With custom embedding service
 * const server = new PrismMCPServer({
 *   vectorDB: new SQLiteVectorDB({ path: './prism.db' }),
 *   maxResults: 20,
 *   embeddingService: new EmbeddingService({
 *     cloudflareAccountId: 'your-account-id',
 *     cloudflareApiKey: 'your-api-key'
 *   })
 * });
 */
export interface PrismMCPServerConfig {
  vectorDB: IVectorDB;
  maxResults?: number;
  embeddingService?: EmbeddingService;
}

/**
 * ============================================================================
 * SERVER CLASS
 * ============================================================================
 */

/**
 * Prism MCP Server - Main server implementation.
 *
 * This class implements the Model Context Protocol server, exposing PRISM's
 * code search and retrieval capabilities as MCP tools that can be called by
 * LLMs (like Claude) via JSON-RPC over stdio.
 *
 * Lifecycle:
 * ---------
 * 1. Create instance with config (vectorDB connection)
 * 2. Call start() to begin listening on stdin/stdout
 * 3. Server handles incoming JSON-RPC requests
 * 4. Call stop() to gracefully shutdown
 *
 * Threading Model:
 * ---------------
 * - Single-threaded event loop (Node.js)
 * - All I/O is async (await vectorDB operations)
 * - No shared mutable state between requests
 * - Each request is independent
 *
 * Error Handling Strategy:
 * -----------------------
 * - Tool errors return response with isError: true
 * - Invalid parameters throw Error (caught by handler)
 * - Database errors propagated as error messages
 * - Never crash - always return valid JSON-RPC response
 *
 * Usage Example:
 * -------------
 * ```typescript
 * const server = new PrismMCPServer({
 *   vectorDB: new SQLiteVectorDB({ path: './prism.db' }),
 *   maxResults: 20
 * });
 *
 * await server.start(); // Blocks, listening on stdio
 * // ... handle requests ...
 * await server.stop();
 * ```
 */
export class PrismMCPServer {
  /** MCP SDK server instance (handles JSON-RPC protocol) */
  private server: Server;

  /** Vector database for code chunk storage and retrieval */
  private vectorDB: IVectorDB;

  /** Default maximum results to return from search tools */
  private maxResults: number;

  /** Embedding service for generating query embeddings */
  private embeddingService: EmbeddingService;

  /**
   * Create a new Prism MCP Server instance.
   *
   * The constructor initializes the MCP SDK server, sets up request handlers
   * for tool listing and execution, but does NOT start listening on stdio.
   * Call start() to begin accepting connections.
   *
   * @param config - Server configuration
   */
  constructor(config: PrismMCPServerConfig) {
    this.vectorDB = config.vectorDB;
    this.maxResults = config.maxResults || 10;

    // Initialize embedding service (use provided or create default)
    this.embeddingService = config.embeddingService || new EmbeddingService();

    // Create MCP server with SDK
    // The server handles JSON-RPC protocol details (parsing, validation, etc)
    this.server = new Server(
      {
        name: 'prism-server',
        version: '0.1.0',
      },
      {
        // Declare our capabilities
        // Currently only tools, future may add resources and prompts
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up request handlers for the MCP protocol
    // These handlers respond to JSON-RPC requests from the client
    this.setupHandlers();
  }

  /**
   * ============================================================================
   * REQUEST HANDLERS
   * ============================================================================
   */

  /**
   * Register JSON-RPC request handlers with the MCP SDK.
   *
   * The MCP protocol uses JSON-RPC 2.0, which defines several request types:
   * - tools/list: Get available tools (ListToolsRequestSchema)
   * - tools/call: Execute a tool (CallToolRequestSchema)
   * - resources/list: Get available resources (not implemented)
   * - prompts/list: Get available prompts (not implemented)
   *
   * This method registers handlers for the tool-related requests. Each handler
   * receives the parsed JSON-RPC request and returns a response object.
   *
   * Request Flow:
   * -----------
   * 1. Client sends JSON-RPC request via stdin
   * 2. SDK parses request (validates JSON, checks method name)
   * 3. SDK calls registered handler based on request schema
   * 4. Handler returns response object
   * 5. SDK serializes response to stdout
   *
   * Example Request (tools/list):
   * ----------------------------
   * {"jsonrpc":"2.0","id":1,"method":"tools/list"}
   *
   * Example Response:
   * -----------------
   * {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
   *
   * @private
   */
  private setupHandlers(): void {
    // ------------------------------------------------------------------------
    // Handler: tools/list
    // ------------------------------------------------------------------------
    // Called by client to discover available tools
    // Returns tool definitions with names, descriptions, and input schemas
    // ------------------------------------------------------------------------
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolDefinitions(),
      };
    });

    // ------------------------------------------------------------------------
    // Handler: tools/call
    // ------------------------------------------------------------------------
    // Called by client to execute a specific tool
    // Parameters are validated against tool's input schema
    // Returns tool execution result or error
    // ------------------------------------------------------------------------
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Execute the tool with provided arguments
        const result = await this.executeTool(name, args || {});

        // Return successful response
        // MCP requires content array (even for single text result)
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        // Return error response
        // MCP uses isError flag instead of JSON-RPC error object
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
   * Return tool definitions for the MCP protocol.
   *
   * Each tool definition includes:
   * - name: Unique identifier (used in tool calls)
   * - description: Human-readable explanation for the LLM
   * - inputSchema: JSON Schema for parameter validation
   *
   * Tool Design Principles:
   * ----------------------
   * 1. Descriptive names that explain what the tool does
   * 2. Clear descriptions that help LLMs understand when to use the tool
   * 3. Specific parameter types with validation rules
   * 4. Sensible defaults for optional parameters
   * 5. Examples in descriptions to guide usage
   *
   * JSON Schema Validation:
   * ----------------------
   * The MCP SDK validates incoming tool arguments against the inputSchema.
   * Invalid arguments trigger a JSON-RPC error with code -32602.
   *
   * @returns Array of tool definitions
   * @private
   */
  private getToolDefinitions(): Tool[] {
    return [
      // ========================================================================
      // Tool: search_repo
      // ========================================================================
      // Semantic code search using vector embeddings.
      //
      // Use Cases:
      // - "Show me authentication logic"
      // - "Find error handling patterns"
      // - "Where is the database connection code?"
      //
      // Features:
      // - Uses Cloudflare Workers AI embeddings (free tier)
      // - Falls back to Ollama if available
      // - Returns semantically similar code chunks
      // - Supports similarity score filtering
      //
      // Limitations:
      // - Requires indexed codebase (run 'prism index' first)
      // - Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_KEY env vars
      //   or Ollama running locally for best results
      // - Returns chunks, not full files
      //
      // Example Call:
      // {
      //   "name": "search_repo",
      //   "arguments": {
      //     "query": "user authentication",
      //     "limit": 5,
      //     "minScore": 0.5
      //   }
      // }
      //
      // Example Response:
      // "Found 5 result(s) for query: \"user authentication\"\n\n
      //  [85.3% match] src/auth/login.ts:45-67\n
      //  Language: typescript | Symbols: authenticateUser, validateCredentials\n
      //  async function authenticateUser(username, password) {\n
      //    const user = await db.users.findOne({ username });\n
      //    ..."
      // ========================================================================
      {
        name: 'search_repo',
        description:
          'Search the indexed codebase for relevant code snippets using semantic search. Returns the most similar code chunks with their similarity scores.',
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

      // ========================================================================
      // Tool: get_context
      // ========================================================================
      // Retrieve all code chunks from a specific file.
      //
      // Use Cases:
      // - "Show me the complete auth file"
      // - "Get all chunks from utils/helpers.ts"
      // - "What's in the server configuration file?"
      //
      // Returns:
      // - All chunks from the file, sorted by line number
      // - Each chunk includes line range and content
      // - Useful for understanding complete file structure
      //
      // Example Call:
      // {
      //   "name": "get_context",
      //   "arguments": {
      //     "filePath": "./src/auth/login.ts"
      //   }
      // }
      // ========================================================================
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

      // ========================================================================
      // Tool: explain_usage
      // ========================================================================
      // Find symbol definitions and all usage locations.
      //
      // Use Cases:
      // - "Where is authenticateUser defined?"
      // - "Show me all uses of the Database class"
      // - "Where is handleError called?"
      //
      // Returns:
      // - Definition chunk (first occurrence)
      // - All usage locations
      // - File paths and line numbers for each usage
      //
      // Limitations:
      // - Only finds exact symbol name matches
      // - Requires symbols to be extracted during indexing
      // - May miss dynamically generated references
      //
      // Example Call:
      // {
      //   "name": "explain_usage",
      //   "arguments": {
      //     "symbol": "authenticateUser",
      //     "limit": 20
      //   }
      // }
      // ========================================================================
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

      // ========================================================================
      // Tool: list_indexed_files
      // ========================================================================
      // List all files currently in the vector database.
      //
      // Use Cases:
      // - "What files are indexed?"
      // - "Show me all Python files"
      // - "How many TypeScript files are in the index?"
      //
      // Returns:
      // - Files grouped by programming language
      // - Chunk count per file
      // - Total file count
      //
      // Example Call:
      // {
      //   "name": "list_indexed_files",
      //   "arguments": {
      //     "language": "typescript"
      //   }
      // }
      // ========================================================================
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

      // ========================================================================
      // Tool: get_chunk
      // ========================================================================
      // Retrieve a specific chunk by its unique ID.
      //
      // Use Cases:
      // - "Get the full content for chunk ID abc123"
      // - Retrieve chunk details from previous search result
      //
      // When to Use:
      // - search_repo returns chunk IDs and previews
      // - Use this tool to get full content of a specific chunk
      // - More efficient than re-searching
      //
      // Example Call:
      // {
      //   "name": "get_chunk",
      //   "arguments": {
      //     "chunkId": "chunk_abc123"
      //   }
      // }
      // ========================================================================
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
    ];
  }

  /**
   * ============================================================================
   * TOOL EXECUTION
   * ============================================================================
   */

  /**
   * Execute a tool by name with provided arguments.
   *
   * This is the main dispatcher for all tool calls. It:
   * 1. Routes to the appropriate tool implementation
   * 2. Validates tool name (throws for unknown tools)
   * 3. Passes arguments to tool implementation
   * 4. Returns formatted result string
   *
   * Tool implementations are responsible for:
   * - Validating their own arguments
   * - Returning human-readable results
   * - Throwing errors for invalid input
   *
   * @param name - Tool name (must match one of the defined tools)
   * @param args - Tool arguments from the JSON-RPC request
   * @returns Formatted result string
   * @throws Error if tool name is unknown
   * @private
   */
  private async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
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
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Tool: search_repo - Semantic code search.
   *
   * Performs vector similarity search to find code chunks related to the query.
   *
   * Algorithm:
   * 1. Generate embedding for query text using EmbeddingService
   * 2. Search vector DB for similar chunks
   * 3. Filter results by minimum score
   * 4. Return formatted results
   *
   * Performance:
   * - Query embedding: ~100-300ms (Cloudflare) / ~500-2000ms (Ollama)
   * - Vector search: ~50ms for 10K chunks
   * - Total: <500ms for typical queries with caching
   *
   * Embedding Provider:
   * - Primary: Cloudflare Workers AI (@cf/baai/bge-small-en-v1.5)
   * - Fallback: Ollama (nomic-embed-text)
   * - Last Resort: Hash-based placeholder (issues warning)
   *
   * Configuration:
   * Set environment variables for Cloudflare:
   * - CLOUDFLARE_ACCOUNT_ID
   * - CLOUDFLARE_API_KEY
   *
   * Or ensure Ollama is running locally at http://localhost:11434
   *
   * @param args - Tool arguments (query, limit, minScore)
   * @returns Formatted search results
   * @throws Error if query is missing
   * @private
   */
  private async searchRepo(args: Record<string, unknown>): Promise<string> {
    const query = args.query as string;
    const limit = (args.limit as number) || this.maxResults;
    const minScore = (args.minScore as number) || 0.0;

    if (!query) {
      throw new Error('Query is required');
    }

    // Generate query embedding using the embedding service
    // This will use Cloudflare, Ollama, or fallback to hash-based placeholder
    const queryEmbedding = await this.embeddingService.embed(query);

    // Search vector database
    // Get 2x results to allow for filtering by minScore
    const results = await this.vectorDB.search(queryEmbedding, limit * 2);

    // Filter by minimum score and format results
    const filtered = results
      .filter((r) => r.score >= minScore)
      .slice(0, limit)
      .map((r) => this.formatSearchResult(r));

    if (filtered.length === 0) {
      return `No results found for query: "${query}"`;
    }

    return `Found ${filtered.length} result(s) for query: "${query}"\n\n` + filtered.join('\n\n');
  }

  /**
   * Tool: get_context - Retrieve all chunks from a file.
   *
   * Fetches all code chunks belonging to the specified file and returns them
   * in line number order. Useful for getting complete file context.
   *
   * Path Matching:
   * - Supports both relative and absolute paths
   * - Normalizes backslashes to forward slashes
   * - Matches if path ends with the provided path (for relative paths)
   *
   * Example:
   * - Input: "./src/auth/login.ts"
   * - Matches: "/home/user/project/src/auth/login.ts"
   * - Does not match: "/home/user/project/src/auth/login.test.ts"
   *
   * @param args - Tool arguments (filePath)
   * @returns Formatted file content with all chunks
   * @throws Error if filePath is missing
   * @private
   */
  private async getContext(args: Record<string, unknown>): Promise<string> {
    const filePath = args.filePath as string;

    if (!filePath) {
      throw new Error('File path is required');
    }

    // Get all chunks from database
    const allChunks = await this.getAllChunks();

    // Filter by file path
    // Normalize paths for cross-platform comparison
    const normalizedPath = filePath.replace(/\\/g, '/');
    const fileChunks = allChunks.filter((c) => {
      const normalizedChunkPath = c.filePath.replace(/\\/g, '/');
      return normalizedChunkPath === normalizedPath || normalizedChunkPath.endsWith(normalizedPath);
    });

    if (fileChunks.length === 0) {
      return `No indexed chunks found for file: "${filePath}"`;
    }

    // Sort chunks by line number to reconstruct file order
    fileChunks.sort((a, b) => a.startLine - b.startLine);

    // Format each chunk with indentation for readability
    const formatted = fileChunks.map(
      (chunk) =>
        `Lines ${chunk.startLine}-${chunk.endLine}:\n${this.indentCode(chunk.content, 2)}`
    );

    const firstChunk = fileChunks[0];
    return `File: ${filePath}\nLanguage: ${firstChunk?.language || 'unknown'}\nChunks: ${fileChunks.length}\n\n` + formatted.join('\n\n');
  }

  /**
   * Tool: explain_usage - Find symbol definition and usage.
   *
   * Searches for all occurrences of a symbol (function, class, variable) and
   * returns the definition plus all usage locations.
   *
   * Symbol Matching:
   * 1. Checks chunk.symbols array (extracted during indexing)
   * 2. Falls back to regex search in chunk content
   * 3. Uses word boundary matching to avoid partial matches
   *
   * Definition Detection:
   * - Assumes first occurrence is the definition
   * - Only if symbol is in chunk.symbols (AST-extracted)
   * - Content-based matches are treated as usage only
   *
   * Limitations:
   * - Cannot distinguish between multiple definitions
   * - May miss dynamically generated symbols
   * - Depends on symbol extraction during indexing
   *
   * @param args - Tool arguments (symbol, limit)
   * @returns Formatted symbol usage information
   * @throws Error if symbol is missing
   * @private
   */
  private async explainUsage(args: Record<string, unknown>): Promise<string> {
    const symbol = args.symbol as string;
    const limit = (args.limit as number) || 20;

    if (!symbol) {
      throw new Error('Symbol is required');
    }

    // Get all chunks from database
    const allChunks = await this.getAllChunks();

    // Find chunks that mention the symbol
    const matchingChunks = allChunks
      .filter((chunk) => {
        // Primary: Check if symbol is in the symbols array (AST-extracted)
        if (chunk.symbols && chunk.symbols.includes(symbol)) {
          return true;
        }
        // Fallback: Check if symbol is mentioned in content
        // Use word boundary regex to avoid partial matches
        const regex = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(chunk.content);
      })
      .slice(0, limit);

    if (matchingChunks.length === 0) {
      return `No usage found for symbol: "${symbol}"`;
    }

    // Find definition (first occurrence with symbol in symbols array)
    const definition = matchingChunks.find((c) => c.symbols && c.symbols.includes(symbol));

    // Format results
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
      // Skip definition in usage list
      if (definition && chunk.id === definition.id) return;
      const firstLine = chunk.content.split('\n')[0] ?? '';
      output += `  ${i + 1}. ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}\n`;
      output += `     ${this.indentCode(firstLine, 6)}\n`;
    });

    return output;
  }

  /**
   * Tool: list_indexed_files - List all indexed files.
   *
   * Returns a list of all files in the vector database, grouped by programming
   * language. Useful for understanding what's available for search.
   *
   * Data Processing:
   * 1. Fetch all chunks from database
   * 2. Group chunks by file path
   * 3. Count chunks per file
   * 4. Group files by language
   * 5. Format output with hierarchy
   *
   * Performance:
   * - O(n) where n = number of chunks
   * - May be slow for large codebases (100K+ chunks)
   *
   * Future Improvements:
   * - Cache file list in database
   * - Add pagination for large results
   * - Support sorting by size/recency
   *
   * @param args - Tool arguments (language filter)
   * @returns Formatted list of indexed files
   * @private
   */
  private async listIndexedFiles(args: Record<string, unknown>): Promise<string> {
    const language = args.language as string;

    // Get all chunks from database
    const allChunks = await this.getAllChunks();

    // Group by file path to count chunks per file
    const fileMap = new Map<string, { chunks: number; language: string }>();
    for (const chunk of allChunks) {
      const existing = fileMap.get(chunk.filePath);
      if (existing) {
        existing.chunks++;
      } else {
        fileMap.set(chunk.filePath, { chunks: 1, language: chunk.language });
      }
    }

    // Filter by language if specified
    let files = Array.from(fileMap.entries());
    if (language) {
      files = files.filter(([, info]) => info.language === language);
    }

    // Group by language for hierarchical display
    const byLanguage = new Map<string, string[]>();
    for (const [path, info] of files) {
      const lang = info.language;
      if (!byLanguage.has(lang)) {
        byLanguage.set(lang, []);
      }
      byLanguage.get(lang)!.push(path);
    }

    // Format output
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
   * Tool: get_chunk - Retrieve a specific chunk by ID.
   *
   * Fetches a single code chunk by its unique identifier. Useful when you have
   * a chunk ID from a previous search result and need the full content.
   *
   * Use Case:
   * - search_repo returns chunk previews
   * - Use this tool to get full content of interesting chunks
   * - More efficient than re-running search
   *
   * @param args - Tool arguments (chunkId)
   * @returns Detailed chunk information
   * @throws Error if chunkId is missing
   * @private
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
   * ============================================================================
   * HELPER METHODS
   * ============================================================================
   */

  /**
   * Format a search result for human-readable display.
   *
   * Converts a CodeChunk + similarity score into a formatted string with:
   * - Similarity score as percentage
   * - File path and line range
   * - Language and symbols
   * - Indented code preview
   *
   * @param result - Search result with chunk and score
   * @returns Formatted result string
   * @private
   */
  private formatSearchResult(result: { chunk: CodeChunk; score: number }): string {
    const { chunk, score } = result;
    const scorePercent = (score * 100).toFixed(1);

    return `[${scorePercent}% match] ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}\n` +
           `Language: ${chunk.language} | Symbols: ${chunk.symbols.join(', ') || 'none'}\n` +
           `${this.indentCode(chunk.content, 2)}`;
  }

  /**
   * Indent multi-line code for display formatting.
   *
   * Adds leading spaces to each line of code for readability in output.
   * This helps distinguish code from metadata in tool responses.
   *
   * Example:
   * Input: "function foo() {\n  return 42;\n}"
   * Output (spaces=2): "  function foo() {\n    return 42;\n  }"
   *
   * @param code - Code to indent
   * @param spaces - Number of spaces to indent
   * @returns Indented code
   * @private
   */
  private indentCode(code: string, spaces: number): string {
    const indent = ' '.repeat(spaces);
    return code
      .split('\n')
      .map((line) => indent + line)
      .join('\n');
  }

  /**
   * Retrieve all code chunks from the vector database.
   *
   * This method attempts to call getAllChunks() on the vector DB if available.
   * If not, it falls back to a search with a zero vector to get all results.
   *
   * Fallback Strategy:
   * - Primary: Use getAllChunks() if implemented by vector DB
   * - Fallback: Search with zero vector (matches everything)
   * - Limit: Use MAX_SAFE_INTEGER to get all results
   *
   * Performance Note:
   * This can be slow for large databases. Consider:
   * - Implementing getAllChunks() in vector DB
   * - Caching results for repeated calls
   * - Adding pagination for large result sets
   *
   * @returns All code chunks in the database
   * @private
   */
  private async getAllChunks(): Promise<CodeChunk[]> {
    // Try optimized path if vector DB supports it
    if ('getAllChunks' in this.vectorDB) {
      return await (this.vectorDB as any).getAllChunks();
    }

    // Fallback: Search with zero vector to get all results
    // Zero vector has distance 1.0 from all vectors in normalized space
    const results = await this.vectorDB.search(new Array(384).fill(0), Number.MAX_SAFE_INTEGER);
    return results.map((r) => r.chunk);
  }

  /**
   * ============================================================================
   * SERVER LIFECYCLE
   * ============================================================================
   */

  /**
   * Start the MCP server and begin listening for requests.
   *
   * This method:
   * 1. Creates stdio transport layer (reads from stdin, writes to stdout)
   * 2. Connects transport to MCP server
   * 3. Starts listening for JSON-RPC requests
   * 4. Blocks until server is stopped
   *
   * Transport Layer:
   * - StdioServerTransport handles JSON-RPC over stdin/stdout
   * - Each line is a JSON-RPC request or response
   * - SDK handles parsing, serialization, and protocol details
   *
   * Usage:
   * ```typescript
   * const server = new PrismMCPServer({ vectorDB });
   * await server.start(); // Blocks here
   * ```
   *
   * @throws Error if transport connection fails
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  /**
   * Stop the MCP server and close connections.
   *
   * Gracefully shuts down the server by:
   * 1. Closing the stdio transport
   * 2. Stopping request handlers
   * 3. Releasing resources
   *
   * After calling this method, the server will not accept new requests.
   *
   * Usage:
   * ```typescript
   * await server.start();
   * // ... handle requests ...
   * await server.stop();
   * ```
   */
  async stop(): Promise<void> {
    await this.server.close();
  }
}
