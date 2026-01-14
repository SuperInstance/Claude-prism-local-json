# MCP Plugin Specification

**Version**: 1.0.0
**Last Updated**: 2025-01-14
**Status**: Complete
**Component**: Model Context Protocol Integration

## Overview

This document specifies the Model Context Protocol (MCP) plugin implementation for PRISM, enabling seamless integration with Claude Code and other AI development tools. The plugin provides code search, context retrieval, and analysis capabilities directly within the Claude Code interface.

## Purpose and Scope

### Primary Objectives

- Enable Claude Code to search indexed codebases using natural language queries
- Provide context-aware code assistance through precise chunk retrieval
- Support multi-file analysis with cross-reference capabilities
- Reduce token usage by retrieving only relevant code snippets
- Enable real-time project structure navigation

### Scope

**In Scope:**
- Full MCP server implementation with stdio transport
- Comprehensive tool suite for code search and analysis
- Configuration management for multiple projects
- Error handling and user-friendly error messages
- Performance optimization with caching and batching

**Out of Scope:**
- Real-time file watching and auto-indexing
- Advanced code generation features
- Multi-repository management
- User authentication and permissions
- Cloud synchronization features

## MCP Protocol Compliance

### Version Support

- **MCP Version**: 0.5.0
- **Transport Layer**: stdio (stdin/stdout)
- **Encoding**: JSON-RPC 2.0

### Message Format

All communication follows the MCP JSON-RPC 2.0 specification:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_repo",
    "arguments": {
      "query": "authentication logic",
      "limit": 10,
      "minScore": 0.5
    }
  }
}
```

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────┐
│                   Claude Code                       │
└─────────────────────┬───────────────────────────────┘
                    │ stdio
                    ▼
┌─────────────────────────────────────────────────────┐
│                 MCP Server                           │
│  ┌─────────────────┬─────────────────┬─────────────┐ │
│  │  PrismMCPServer │    Router      │  CLI       │ │
│  │                 │                │            │ │
│  └─────────────────┴─────────────────┴─────────────┘ │
└─────────────────────┬───────────────────────────────┘
                    │ Tools & Capabilities
                    ▼
┌─────────────────────────────────────────────────────┐
│                 PRISM Core                           │
│  ┌─────────────────┬─────────────────┬─────────────┐ │
│  │   Vector DB     │  Indexer        │  Config     │ │
│  │                 │                │            │ │
│  └─────────────────┴─────────────────┴─────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Components

#### PrismMCPServer

**Location**: `/prism/src/mcp/PrismMCPServer.ts`

**Responsibilities**:
- Handle MCP protocol messages
- Route tool calls to appropriate handlers
- Manage vector database connections
- Format responses according to MCP specification

**Key Methods**:
```typescript
class PrismMCPServer {
  private vectorDB: IVectorDatabase;
  private config: PrismConfig;

  async start(): Promise<void>        // Start stdio server
  async handleRequest(request: MCPRequest): Promise<MCPResponse>
  private getToolDefinitions(): Tool[] // Available tools
  async executeTool(name: string, args: any): Promise<string>
}
```

#### MCP Router

**Location**: `/prism/src/mcp/index.ts`

**Responsibilities**:
- Tool definition management
- Request routing and validation
- Error handling and formatting
- Server lifecycle management

#### CLI Interface

**Location**: `/prism/src/mcp/cli.ts`

**Responsibilities**:
- Command-line interface for MCP server
- Configuration file management
- Database path resolution
- Process management

## Available Tools

### 1. search_repo

**Purpose**: Semantic search across indexed codebase

**Parameters**:
```typescript
interface SearchRepoArgs {
  query: string;              // Search query (required)
  limit?: number;             // Max results (default: 10)
  minScore?: number;          // Minimum similarity (default: 0.0)
  language?: string;          // Filter by language
  pathPrefix?: string;        // Filter by path prefix
  after?: number;             // Unix timestamp, only after this time
  before?: number;            // Unix timestamp, only before this time
}
```

**Response Format**:
```
Found 5 result(s) for query: "authentication logic"

[95.3% match] ./src/auth/login.ts:15-25
Language: typescript | Symbols: authenticateUser, validateCredentials
  function authenticateUser(username, password) {
    const user = database.findUser(username);
    if (!user) return null;
    return verifyPassword(password, user.hash);
  }
```

**Implementation**:
```typescript
async executeSearchRepo(args: SearchRepoArgs): Promise<string> {
  const results = await this.vectorDB.search({
    query: args.query,
    limit: args.limit || 10,
    minScore: args.minScore || 0.0,
    filters: {
      language: args.language,
      pathPrefix: args.pathPrefix,
      createdAfter: args.after,
      createdBefore: args.before,
    },
  });

  return this.formatSearchResults(results);
}
```

### 2. get_context

**Purpose**: Retrieve all chunks from a specific file

**Parameters**:
```typescript
interface GetContextArgs {
  filePath: string;           // File path (required)
}
```

**Response Format**:
```
File: ./src/auth/login.ts
Language: typescript
Chunks: 3

Lines 1-14:
  import { database } from './database';
  import { verifyPassword } from './crypto';

Lines 15-25:
  function authenticateUser(username, password) {
    const user = database.findUser(username);
    if (!user) return null;
    return verifyPassword(password, user.hash);
  }

Lines 26-30:
  export { authenticateUser };
```

**Implementation**:
```typescript
async executeGetContext(args: GetContextArgs): Promise<string> {
  const chunks = await this.vectorDB.getChunksByFile(args.filePath);
  return this.formatFileContext(chunks);
}
```

### 3. explain_usage

**Purpose**: Find usage patterns for a specific symbol

**Parameters**:
```typescript
interface ExplainUsageArgs {
  symbol: string;            // Symbol name (required)
  limit?: number;             // Max results (default: 20)
}
```

**Response Format**:
```
Symbol: authenticateUser
Found in 5 chunk(s)

Definition:
  File: ./src/auth/login.ts
  Lines: 15-25
  Code:
    function authenticateUser(username, password) {
      const user = database.findUser(username);
      if (!user) return null;
      return verifyPassword(password, user.hash);
    }

Usage:
  1. ./src/routes/auth.ts:10-15
       authenticateUser(req.body.username, req.body.password)

  2. ./src/tests/auth.test.ts:5-10
       test('authenticateUser', () => { ... })
```

**Implementation**:
```typescript
async executeExplainUsage(args: ExplainUsageArgs): Promise<string> {
  const definition = await this.findSymbolDefinition(args.symbol);
  const usages = await this.findSymbolUsages(args.symbol, args.limit || 20);

  return this.formatSymbolExplanation(definition, usages);
}
```

### 4. list_indexed_files

**Purpose**: List all indexed files with metadata

**Parameters**:
```typescript
interface ListIndexedFilesArgs {
  language?: string;        // Filter by language
  pathPrefix?: string;       // Filter by path prefix
}
```

**Response Format**:
```
Indexed Files: 45 file(s)

typescript (10 file(s)):
  - ./src/auth/login.ts (3 chunk(s))
  - ./src/routes/auth.ts (2 chunk(s))
  - ./src/models/user.ts (4 chunk(s))

python (5 file(s)):
  - ./src/api/auth.py (2 chunk(s))
  - ./src/services/data.py (1 chunk(s))
```

### 5. get_chunk

**Purpose**: Retrieve a specific chunk by ID

**Parameters**:
```typescript
interface GetChunkArgs {
  chunkId: string;           // Chunk ID (required)
}
```

**Response Format**:
```
Chunk ID: chunk_abc123
File: ./src/auth/login.ts
Lines: 15-25
Language: typescript
Symbols: authenticateUser, validateCredentials

Content:
function authenticateUser(username, password) {
  const user = database.findUser(username);
  if (!user) return null;
  return verifyPassword(password, user.hash);
}
```

## Configuration

### Configuration File

Location: `~/.claude/config.json`

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": [
        "/path/to/prism/dist/mcp/cli.js",
        "--db", "/path/to/your/project/prism.db",
        "--max-results", "20",
        "--verbose"
      ]
    }
  }
}
```

### Command Line Options

```bash
node dist/mcp/cli.js [options]

Options:
  --db <path>              Path to vector database (default: ./prism.db)
  --max-results <number>   Maximum results per search (default: 10)
  --cache-size <number>    Cache size for frequent queries (default: 1000)
  --verbose                Enable verbose logging
  --help                   Show help message
```

### Database Configuration

**SQLite Database**:
- Path: Configurable via `--db` flag
- Schema: Automatically created on first run
- Indexes: Optimized for search queries

**Cloudflare D1** (Future):
- Automatic cloud sync
- Multi-project support
- Enhanced collaboration features

## Performance Characteristics

### Response Times

| Tool | Database Size | 95th Percentile | Optimization Notes |
|------|---------------|-----------------|---------------------|
| search_repo | 10K chunks | ~50ms | Vector search bottleneck |
| get_context | 100 chunks/file | ~10ms | Fast file lookup |
| explain_usage | Full scan | ~100ms | Requires symbol resolution |
| list_indexed_files | 1000 files | ~20ms | In-memory metadata |
| get_chunk | Any size | ~5ms | Direct ID lookup |

### Memory Usage

- **Base Memory**: ~50MB (server startup)
- **Per Connection**: ~10MB
- **Cache**: Configurable (default: 1MB for 1000 cached queries)
- **Vector DB**: ~0.8MB per 1000 chunks (384-dimensional float32)

### Throughput

- **Concurrent Requests**: 10-50 (limited by vector DB performance)
- **Requests per Second**: 100-200 (with caching)
- **Error Rate**: <0.1% (proper error handling)

## Error Handling

### Error Categories

1. **Connection Errors**
   - Database not found
   - Permission denied
   - Network issues

2. **Query Errors**
   - Invalid parameters
   - Malformed queries
   - Missing required arguments

3. **Processing Errors**
   - Symbol not found
   - File not indexed
   - Parsing errors

### Error Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params: Query is required",
    "data": {
      "type": "ValidationError",
      "details": {
        "field": "query",
        "expected": "string",
        "received": null
      }
    }
  }
}
```

### Recovery Strategies

1. **Graceful Degradation**: Return partial results on non-critical errors
2. **Retry Logic**: Automatically retry transient errors (network, temporary failures)
3. **Cache Fallback**: Use cached results for recent queries
4. **User Guidance**: Provide actionable error messages

## Security Considerations

### Data Access

- **File System Access**: Read-only access to project files
- **Database Security**: SQLite file permissions only
- **No Network Access**: Local-only operation by design

### Input Validation

- **Path Validation**: Prevent directory traversal attacks
- **Query Sanitization**: Prevent injection in search queries
- **Size Limits**: Configurable limits for large operations

### Privacy

- **Local Processing**: All processing happens locally
- **No Telemetry**: No data sent to external services
- **User Control**: Full control over indexed data

## Testing

### Test Strategy

**Unit Tests**: `/tests/unit/mcp/`
- Tool validation
- Response formatting
- Error handling
- Configuration parsing

**Integration Tests**: `/tests/integration/mcp/`
- End-to-end MCP communication
- Real vector database interactions
- Performance benchmarks

**Manual Testing**:
- MCP inspector testing
- Claude Code integration
- Multiple project scenarios

### Test Cases

```typescript
describe('search_repo tool', () => {
  it('should return relevant results for valid query', async () => {
    const result = await server.executeTool('search_repo', {
      query: 'authentication',
      limit: 5
    });

    expect(result).toContain('Found');
    expect(result).toContain('match');
  });

  it('should handle empty database gracefully', async () => {
    const result = await server.executeTool('search_repo', {
      query: 'nonexistent'
    });

    expect(result).toContain('No matches found');
  });
});
```

## Deployment

### Installation

1. **Build PRISM**:
   ```bash
   npm run build
   ```

2. **Install MCP Server**:
   ```bash
   npm run build:mcp
   ```

3. **Configure Claude Code**:
   Add to `~/.claude/config.json` as shown above

### Distribution

**NPM Package**: Future plan for easier installation
**Binary Distribution**: Standalone executable option
**Docker Support**: Containerized deployment option

## Monitoring and Metrics

### Metrics Collection

**Performance Metrics**:
- Request latency percentiles
- Query success rates
- Cache hit ratios
- Memory usage trends

**Usage Metrics**:
- Tool usage frequency
- Popular search queries
- Database growth patterns
- Error rates by tool type

### Logging

**Log Levels**:
- `error`: Critical failures
- `warn`: Non-critical issues
- `info`: Important operations
- `debug`: Detailed debugging information

**Log Format**:
```json
{
  "timestamp": "2025-01-14T10:00:00Z",
  "level": "info",
  "component": "MCP",
  "tool": "search_repo",
  "duration": 47,
  "query": "auth",
  "results": 3,
  "cache": false
}
```

## Extensibility

### Custom Tools

**Extending the MCP Server**:

```typescript
class CustomMCPServer extends PrismMCPServer {
  protected getToolDefinitions(): Tool[] {
    const baseTools = super.getToolDefinitions();

    return [
      ...baseTools,
      {
        name: 'custom_analysis',
        description: 'Perform custom code analysis',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string' },
            analysisType: { type: 'string' }
          },
          required: ['filePath', 'analysisType']
        }
      }
    ];
  }

  protected async executeTool(name: string, args: any): Promise<string> {
    switch (name) {
      case 'custom_analysis':
        return await this.handleCustomAnalysis(args);
      default:
        return await super.executeTool(name, args);
    }
  }
}
```

### Plugin Architecture

**Future Enhancements**:
- Plugin system for custom tools
- Language-specific analyzers
- Third-party integration hooks
- Custom embedding models

## Version History

### v1.0.0 (2025-01-14)
- Initial MCP server implementation
- Complete tool suite (5 tools)
- SQLite database support
- Comprehensive error handling

### Planned v1.1.0
- Cloudflare D1 backend
- Real-time file watching
- Plugin system
- Enhanced caching

## Related Documentation

- [Indexer Architecture](./04-indexer-architecture.md) - Code parsing and chunking
- [System Overview](./01-system-overview.md) - High-level architecture
- [Data Flow](./02-data-flow.md) - Complete request lifecycle
- [MCP Integration Guide](../../prism/docs/mcp-integration.md) - Implementation details

## References

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Claude Code Integration](https://claude.ai/code)
- [SQLite Vector Database](./04-indexer-architecture.md#vector-storage)

---

**Specification Owner**: Architecture Team
**Last Updated**: 2025-01-14
**Version**: 1.0.0
**Next Review**: v1.1.0 release