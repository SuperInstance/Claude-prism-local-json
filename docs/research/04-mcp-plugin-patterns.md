# MCP Plugin Integration Patterns for Claude Code

**Research Document**: Comprehensive guide to Model Context Protocol (MCP) plugin development for PRISM super-agent plugin

**Date**: 2025-01-13
**Version**: 1.0
**Status**: Research Complete

---

## Executive Summary

The Model Context Protocol (MCP) is an open standard that enables AI applications to connect to external tools and data sources through a uniform, safe protocol. This document provides comprehensive research findings on MCP integration patterns, best practices, and architectural considerations for building PRISM as an MCP server plugin for Claude Code.

**Key Findings:**
- MCP uses JSON-RPC 2.0 over two transport mechanisms: STDIO (local) and Streamable HTTP (remote)
- Tool design quality is the primary factor in successful LLM integration
- FastMCP (Python) and official TypeScript SDK provide the best developer experience
- Proper schema definition, error handling, and response design are critical
- Vector search as an MCP tool requires careful performance optimization

---

## Table of Contents

1. [MCP Technical Overview](#1-mcp-technical-overview)
2. [Claude Code Integration](#2-claude-code-integration)
3. [Tool Design Patterns](#3-tool-design-patterns)
4. [Performance Considerations](#4-performance-considerations)
5. [Reference Implementations](#5-reference-implementations)
6. [Vantage-Specific Recommendations](#6-vantage-specific-recommendations)
7. [Integration Checklist](#7-integration-checklist)
8. [Common Pitfalls and Solutions](#8-common-pitfalls-and-solutions)
9. [Resources and References](#9-resources-and-references)

---

## 1. MCP Technical Overview

### 1.1 Protocol Architecture

MCP follows a **client-server architecture** with three main participants:

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  MCP Host       │─────▶│  MCP Client     │─────▶│  MCP Server     │
│  (Claude Code)  │      │  (per server)   │      │  (PRISM)      │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

**Key Components:**

- **MCP Host**: The AI application (Claude Code) that coordinates one or multiple MCP clients
- **MCP Client**: Component that maintains a connection to a single MCP server
- **MCP Server**: Program that provides context through tools, resources, and prompts

### 1.2 Transport Mechanisms

MCP supports two transport mechanisms:

#### **STDIO Transport**
- **Best for**: Local, low-latency, single-client scenarios
- **How it works**: Uses standard input/output streams
- **Advantages**:
  - More secure (no network layer overhead)
  - Simpler implementation
  - Optimal performance
- **Use Cases**: Desktop apps, local development tools

#### **Streamable HTTP Transport**
- **Best for**: Remote access, multi-client scenarios
- **How it works**: Uses HTTP POST with optional SSE for streaming
- **Advantages**:
  - Supports remote clients
  - Standard HTTP authentication
  - Better for web-scale deployments
- **Use Cases**: Cloud services, remote APIs

**Important**: SSE (Server-Sent Events) is deprecated; use Streamable HTTP instead.

### 1.3 Core Primitives

MCP defines three core primitives that servers can expose:

#### **Tools**
Executable functions that AI applications can invoke:
```python
@mcp.tool()
def search_repo(query: str) -> str:
    """Search code repository for relevant files"""
    return search_results
```

#### **Resources**
Data sources providing contextual information:
```python
@mcp.resource("repo://{file_path}")
def get_file(file_path: str) -> str:
    """Get file contents"""
    return file_contents
```

#### **Prompts**
Reusable templates for structuring interactions:
```python
@mcp.prompt("code_review")
def code_review_prompt() -> str:
    """Generate code review prompt template"""
    return "Please review the following code..."
```

### 1.4 Data Layer Protocol

MCP uses **JSON-RPC 2.0** as the underlying RPC protocol. Key lifecycle methods:

- `tools/list` - Discover available tools
- `tools/call` - Execute a tool
- `resources/list` - Discover available resources
- `resources/read` - Read a resource
- `prompts/list` - Discover available prompts
- `prompts/get` - Get a prompt template

---

## 2. Claude Code Integration

### 2.1 Configuration Files

Claude Code discovers and loads MCP servers through configuration files at multiple scopes:

#### **Local Scope** (Default)
- **Location**: `~/.claude.json` under project path
- **Visibility**: Private to current project
- **Use Case**: Personal development servers

#### **Project Scope**
- **Location**: `.mcp.json` at project root
- **Visibility**: Shared across team (version controlled)
- **Use Case**: Team collaboration

#### **User Scope**
- **Location**: `~/.claude.json`
- **Visibility**: Available across all projects
- **Use Case**: Personal utility servers

#### **Plugin-Provided MCP Servers**
- **Location**: Plugin root `.mcp.json` or inline in `plugin.json`
- **Visibility**: Automatic when plugin is enabled
- **Use Case**: Bundled tools with plugins

### 2.2 Configuration Format

**STDIO Server Example:**
```json
{
  "mcpServers": {
    "vantage": {
      "command": "python",
      "args": [
        "-m", "vantage.mcp_server",
        "--config", "${CLAUDE_PLUGIN_ROOT}/config.json"
      ],
      "env": {
        "VECTOR_DB_PATH": "${VECTOR_DB_PATH:-/default/path}"
      }
    }
  }
}
```

**HTTP Server Example:**
```json
{
  "mcpServers": {
    "vantage-remote": {
      "type": "http",
      "url": "${VANTAGE_API_URL:-https://api.vantage.dev}/mcp",
      "headers": {
        "Authorization": "Bearer ${VANTAGE_API_KEY}"
      }
    }
  }
}
```

### 2.3 Environment Variable Expansion

Claude Code supports environment variable expansion in `.mcp.json`:

- `${VAR}` - Expand to value of VAR (error if not set)
- `${VAR:-default}` - Expand to VAR if set, otherwise use default

**Expansion locations:**
- `command` - Server executable path
- `args` - Command-line arguments
- `env` - Environment variables for server
- `url` - For HTTP servers
- `headers` - For HTTP authentication

### 2.4 How Tools Appear in Context

Tools from MCP servers appear in Claude's context through:

1. **Discovery**: Claude Code queries `tools/list` on server startup
2. **Capability Advertisement**: Server exposes tool metadata (name, description, schema)
3. **Dynamic Updates**: Server sends `list_changed` notifications when tools change
4. **Tool Invocation**: Claude calls `tools/call` with arguments
5. **Result Streaming**: Results streamed back to context

**Tool Metadata Structure:**
```json
{
  "name": "search_repo",
  "description": "Search code repository for relevant files using semantic vector search",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language search query"
      },
      "limit": {
        "type": "integer",
        "description": "Maximum number of results",
        "default": 10
      }
    },
    "required": ["query"]
  }
}
```

### 2.5 Plugin Integration

For Vantage as a Claude Code plugin, MCP servers can be defined:

**Option 1: Separate `.mcp.json` at plugin root**
```json
{
  "mcpServers": {
    "vantage": {
      "command": "${CLAUDE_PLUGIN_ROOT}/venv/bin/python",
      "args": ["-m", "vantage.mcp_server"]
    }
  }
}
```

**Option 2: Inline in `plugin.json`**
```json
{
  "name": "vantage",
  "mcpServers": {
    "vantage": {
      "command": "${CLAUDE_PLUGIN_ROOT}/venv/bin/python",
      "args": ["-m", "vantage.mcp_server"]
    }
  }
}
```

---

## 3. Tool Design Patterns

### 3.1 Tool Naming Conventions

**Best Practices:**
- Use 1-128 characters
- Use only ASCII letters, digits, underscore, hyphen, dot
- Case-sensitive
- No spaces or special characters

**Good Examples:**
- `search_repo` - Clear, action-oriented
- `get_token_usage` - Descriptive
- `vector_search` - Simple

**Bad Examples:**
- `doSearch` - Inconsistent casing
- `search the repo` - Contains spaces
- `Tool1` - Not descriptive

### 3.2 Input Schema Design

**Use JSON Schema for validation:**

```python
@mcp.tool()
def search_repo(
    query: str,
    limit: int = 10,
    filters: dict[str, Any] | None = None
) -> str:
    """Search repository using semantic vector search.

    Args:
        query: Natural language search query
        limit: Maximum number of results (default: 10, max: 100)
        filters: Optional filters for file types, paths, etc.
    """
    # Implementation
```

**Generated JSON Schema:**
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Natural language search query"
    },
    "limit": {
      "type": "integer",
      "description": "Maximum number of results",
      "default": 10,
      "minimum": 1,
      "maximum": 100
    },
    "filters": {
      "type": "object",
      "description": "Optional filters for file types, paths, etc."
    }
  },
  "required": ["query"]
}
```

**Schema Best Practices:**

1. **Be Specific**: Use enums, minimum/maximum bounds
2. **Provide Defaults**: Make optional parameters clear
3. **Clear Descriptions**: Explain what each parameter does
4. **Validate Input**: Check constraints at runtime

### 3.3 Output Schema Design

**Define output structure for better integration:**

```python
@mcp.tool()
def search_repo(query: str, limit: int = 10) -> dict:
    """Search repository using semantic vector search."""

    results = perform_search(query, limit)

    return {
        "results": [
            {
                "file_path": r["path"],
                "score": r["similarity"],
                "snippet": r["content"][:200]
            }
            for r in results
        ],
        "query": query,
        "total_results": len(results),
        "search_time_ms": elapsed_ms
    }
```

**Output Schema Annotation:**
```python
# Can be added to tool definition
"outputSchema": {
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "file_path": {"type": "string"},
          "score": {"type": "number"},
          "snippet": {"type": "string"}
        }
      }
    },
    "query": {"type": "string"},
    "total_results": {"type": "integer"},
    "search_time_ms": {"type": "number"}
  }
}
```

### 3.4 Tool Description Patterns

**Good Description Structure:**

```python
def search_repo(query: str, limit: int = 10) -> str:
    """Search code repository using semantic vector similarity.

    Use this tool when you need to:
    - Find code related to a specific topic or concept
    - Locate files that implement a particular feature
    - Discover relevant code sections without exact keyword matching

    The search uses vector embeddings to find semantically similar code,
    returning results ranked by relevance score.

    Args:
        query: Natural language description of what you're looking for
        limit: Number of results to return (1-100, default: 10)
    """
```

**Key Elements:**
1. **What it does**: Clear summary
2. **When to use**: Specific scenarios
3. **How it works**: Brief technical explanation
4. **Parameters**: Detailed parameter descriptions

### 3.5 Error Handling Patterns

**Two Types of Errors:**

#### **Protocol Errors** (JSON-RPC level)
```python
# Unknown tool - handled by MCP framework
# Invalid JSON schema - handled by MCP framework
```

#### **Tool Execution Errors** (application level)
```python
@mcp.tool()
def search_repo(query: str) -> str:
    try:
        results = perform_search(query)
        return format_results(results)
    except ValidationError as e:
        return {
            "content": [{"type": "text", "text": f"Invalid query: {e}"}],
            "isError": True
        }
    except SearchError as e:
        return {
            "content": [{"type": "text", "text": f"Search failed: {e}"}],
            "isError": True
        }
```

**Error Response Format:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Query must be at least 3 characters long"
    }
  ],
  "isError": true
}
```

**Best Practices:**
1. **Provide Actionable Feedback**: Tell LLM how to fix the error
2. **Use Tool Execution Errors**: Not protocol errors
3. **Include Context**: What went wrong and why
4. **Suggest Corrections**: Guide LLM to successful retry

### 3.6 Streaming for Long-Running Operations

**For operations taking >1-2 seconds:**

```python
@mcp.tool()
async def index_repo(repo_path: str) -> AsyncIterator[str]:
    """Index a repository for vector search.

    Yields progress updates during indexing.
    """

    yield "Starting repository scan..."

    files = await scan_repository(repo_path)
    yield f"Found {len(files)} files to index"

    for i, file in enumerate(files):
        await index_file(file)
        if i % 10 == 0:
            yield f"Indexed {i}/{len(files)} files..."

    yield f"Indexing complete: {len(files)} files indexed"
```

**Progress Tracking:**
- Use `yield` for streaming updates
- Provide meaningful progress indicators
- Report completion status

---

## 4. Performance Considerations

### 4.1 Response Time Expectations

**Target Response Times:**
- **Simple queries**: <100ms
- **Vector search**: 100-500ms
- **Complex operations**: 500ms-2s
- **Long operations**: Use streaming

**Optimization Strategies:**
1. **Cache embeddings**: Don't recompute on every search
2. **Index optimization**: Use efficient vector indexes (HNSW, IVF)
3. **Batch operations**: Process multiple files together
4. **Lazy loading**: Only load what's needed

### 4.2 Caching Strategies

#### **Embedding Cache**
```python
from functools import lru_cache

@lru_cache(maxsize=1000)
def get_embedding(text: str) -> np.ndarray:
    """Compute and cache text embeddings."""
    return embedding_model.encode(text)
```

#### **Search Results Cache**
```python
import hashlib
from typing import Optional

def cache_key(query: str, limit: int) -> str:
    return hashlib.md5(f"{query}:{limit}".encode()).hexdigest()

# Store recent searches
search_cache: dict[str, SearchResults] = {}

def search_with_cache(query: str, limit: int = 10) -> SearchResults:
    key = cache_key(query, limit)
    if key in search_cache:
        return search_cache[key]

    results = perform_search(query, limit)
    search_cache[key] = results
    return results
```

#### **Invalidation Strategies**
- Time-based: Clear cache after N minutes
- Size-based: Limit cache size with LRU eviction
- Change-based: Clear on file modifications

### 4.3 Rate Limiting and Throttling

**Implement rate limiting for API calls:**

```python
from asyncio import Semaphore
from contextlib import asynccontextmanager

# Limit concurrent API calls
api_semaphore = Semaphore(10)

@asynccontextmanager
async def rate_limit():
    async with api_semaphore:
        yield

@mcp.tool()
async def batch_search(queries: list[str]) -> list[SearchResult]:
    """Search multiple queries with rate limiting."""
    results = []
    for query in queries:
        async with rate_limit():
            result = await perform_search(query)
            results.append(result)
    return results
```

### 4.4 Handling Large Payloads

**For large code chunks or search results:**

#### **Pagination**
```python
@mcp.tool()
def search_repo(
    query: str,
    limit: int = 10,
    offset: int = 0
) -> dict:
    """Search repository with pagination support."""

    results = perform_search(query, limit, offset)

    return {
        "results": format_results(results),
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": count_total_results(query),
            "has_more": offset + limit < count_total_results(query)
        }
    }
```

#### **Chunking**
```python
@mcp.tool()
def get_file_content(file_path: str, max_size: int = 10000) -> dict:
    """Get file content with size limits."""

    content = read_file(file_path)

    if len(content) > max_size:
        return {
            "file_path": file_path,
            "content": content[:max_size],
            "truncated": True,
            "total_size": len(content),
            "message": f"File truncated. Use get_file_chunk for full content."
        }

    return {
        "file_path": file_path,
        "content": content,
        "truncated": False
    }
```

#### **Resource Links**
```python
@mcp.tool()
def search_repo(query: str) -> dict:
    """Search returning resource links for large results."""

    results = perform_search(query)

    return {
        "summary": f"Found {len(results)} results",
        "results": [
            {
                "type": "resource_link",
                "uri": f"file://{result['path']}",
                "name": result['path'],
                "description": f"Score: {result['score']:.2f}",
                "mimeType": "text/x-python"
            }
            for result in results[:5]  # Only top 5
        ]
    }
```

### 4.5 Memory Management

**For vector search with large codebases:**

```python
import numpy as np

class VectorIndex:
    def __init__(self, max_memory_mb: int = 500):
        self.max_memory = max_memory_mb * 1024 * 1024
        self.embeddings: dict[str, np.ndarray] = {}

    def add(self, key: str, embedding: np.ndarray):
        # Check memory before adding
        current_memory = sum(e.nbytes for e in self.embeddings.values())

        if current_memory + embedding.nbytes > self.max_memory:
            # Evict oldest entries
            self._evict_lru(embedding.nbytes)

        self.embeddings[key] = embedding

    def _evict_lru(self, required_bytes: int):
        """Evict least recently used entries to free memory."""
        freed = 0
        for key in list(self.embeddings.keys()):
            if freed >= required_bytes:
                break
            del self.embeddings[key]
            freed += self.embeddings[key].nbytes
```

---

## 5. Reference Implementations

### 5.1 Existing MCP Servers

#### **Filesystem Servers**
- [cyanheads/filesystem-mcp-server](https://github.com/cyanheads/filesystem-mcp-server) - Platform-agnostic file operations
- [calebmwelsh/file-system-mcp-server](https://github.com/calebmwelsh/file-system-mcp-server) - FastMCP-based implementation

#### **Database Servers**
- [Bytebase DBHub](https://github.com/modelcontextprotocol/servers/tree/main/src/dbhub) - PostgreSQL query tool
- [Oracle AI Vector Search](https://redstack.dev/2025/10/08/lets-make-a-simple-mcp-tool-for-oracle-ai-vector-search/) - Vector search example

#### **Vector Search Implementations**
- [hugoduncan/mcp-vector-search](https://github.com/hugoduncan/mcp-vector-search) - Semantic search for knowledge bases
- [spences10/mcp-embedding-search](https://github.com/spences10/mcp-embedding-search) - Transcript segment search

### 5.2 Code Examples

#### **FastMCP Server (Python)**

```python
from fastmcp import FastMCP
import numpy as np

mcp = FastMCP(name="vantage")

@mcp.tool()
async def search_repo(
    query: str,
    limit: int = 10,
    threshold: float = 0.7
) -> dict:
    """Search code repository using semantic vector similarity.

    Use this tool to find code related to a specific topic or concept.
    The search uses vector embeddings to find semantically similar code.

    Args:
        query: Natural language description of what you're looking for
        limit: Number of results to return (1-100, default: 10)
        threshold: Minimum similarity score (0.0-1.0, default: 0.7)

    Returns:
        Dictionary with search results ranked by relevance
    """
    # Validate inputs
    if limit < 1 or limit > 100:
        return {
            "error": "limit must be between 1 and 100",
            "isError": True
        }

    if threshold < 0.0 or threshold > 1.0:
        return {
            "error": "threshold must be between 0.0 and 1.0",
            "isError": True
        }

    # Perform vector search
    query_embedding = await get_embedding(query)
    results = vector_index.search(query_embedding, limit, threshold)

    return {
        "results": [
            {
                "file_path": r.path,
                "score": float(r.score),
                "snippet": r.content[:200],
                "line_numbers": r.line_range
            }
            for r in results
        ],
        "query": query,
        "total_results": len(results)
    }

@mcp.resource("stats://token-usage")
def get_token_stats() -> dict:
    """Get token usage statistics for the current session."""
    return {
        "tokens_saved": token_tracker.total_saved(),
        "queries_made": token_tracker.query_count(),
        "average_reduction": token_tracker.avg_reduction()
    }

if __name__ == "__main__":
    mcp.run()
```

#### **TypeScript MCP Server**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "vantage",
  version: "1.0.0",
});

server.registerTool(
  "search_repo",
  {
    description: "Search code repository using semantic vector similarity",
    inputSchema: {
      query: z.string().min(3).describe("Search query"),
      limit: z.number().min(1).max(100).default(10).describe("Max results"),
      threshold: z.number().min(0).max(1).default(0.7).describe("Min similarity")
    },
  },
  async ({ query, limit, threshold }) => {
    const results = await vectorSearch.search(query, limit, threshold);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results: results.map(r => ({
              filePath: r.path,
              score: r.score,
              snippet: r.content.substring(0, 200)
            })),
            query,
            totalResults: results.length
          }, null, 2)
        }
      ]
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Vantage MCP Server running");
}

main().catch(console.error);
```

### 5.3 Common Patterns

#### **Tool Compositing**
```python
@mcp.tool()
def analyze_codebase(query: str) -> dict:
    """High-level analysis combining multiple tools."""

    # Search for relevant code
    search_results = search_repo(query, limit=20)

    # Get context from top results
    file_contexts = [
        get_file_context(r["file_path"])
        for r in search_results["results"][:5]
    ]

    # Analyze patterns
    patterns = identify_patterns(file_contexts)

    return {
        "summary": f"Found {len(search_results['results'])} relevant files",
        "patterns": patterns,
        "top_files": [r["file_path"] for r in search_results["results"][:5]]
    }
```

#### **Session State Management**
```python
from contextvars import ContextVar

# Session-scoped state
session_state: ContextVar[dict] = ContextVar("session_state", default={})

@mcp.tool()
def set_search_preference(key: str, value: str) -> str:
    """Set search preference for current session."""
    state = session_state.get()
    state[key] = value
    session_state.set(state)
    return f"Set {key} = {value}"

@mcp.tool()
def get_search_preferences() -> dict:
    """Get all search preferences for current session."""
    return session_state.get()
```

---

## 6. Vantage-Specific Recommendations

### 6.1 Vector Search as MCP Tool

**Recommended Tool Design:**

```python
@mcp.tool()
async def search_repo(
    query: str,
    limit: int = 10,
    threshold: float = 0.7,
    file_types: list[str] | None = None,
    exclude_paths: list[str] | None = None
) -> dict:
    """Search code repository using semantic vector similarity.

    This tool uses vector embeddings to find code that is semantically
    similar to your query, even without exact keyword matches.

    Use cases:
    - Find code related to a specific concept or feature
    - Locate implementations without knowing exact function names
    - Discover related code across multiple files

    Args:
        query: Natural language description of what you're looking for
        limit: Maximum number of results (1-100, default: 10)
        threshold: Minimum similarity score 0.0-1.0 (default: 0.7)
        file_types: Filter by file extensions (e.g., [".py", ".ts"])
        exclude_paths: Paths to exclude (e.g., ["tests/", "vendor/"])

    Returns:
        Search results with file paths, similarity scores, and code snippets
    """
```

**Performance Optimizations:**
1. **Pre-compute embeddings** for all code files
2. **Use HNSW index** for fast approximate nearest neighbor search
3. **Cache recent queries** to avoid redundant searches
4. **Batch embedding requests** when processing multiple files

### 6.2 Token Optimization Feedback

```python
@mcp.tool()
def explain_token_usage() -> dict:
    """Explain current token usage and optimization opportunities.

    Returns detailed breakdown of:
    - Total tokens used in conversation
    - Tokens saved through vector search
    - Context window utilization
    - Recommendations for further optimization
    """
    usage_stats = calculate_token_usage()

    return {
        "total_tokens": usage_stats.total,
        "vector_search_tokens": usage_stats.vector_search,
        "full_context_tokens": usage_stats.full_context_equivalent,
        "tokens_saved": usage_stats.saved,
        "savings_percentage": (usage_stats.saved / usage_stats.full_context_equivalent * 100),
        "recommendations": generate_recommendations(usage_stats)
    }

@mcp.tool()
def optimize_context(query: str, max_tokens: int = 50000) -> dict:
    """Optimize context selection for given query.

    Analyzes which files are most relevant and constructs an optimized
    context that fits within the token budget while maximizing relevance.

    Args:
        query: Current task or question
        max_tokens: Maximum token budget (default: 50000)

    Returns:
        Optimized file selection with token counts and relevance scores
    """
    relevant_files = search_repo(query, limit=50)

    # Select files to maximize relevance within token budget
    selected = knapsack_selection(
        relevant_files["results"],
        max_tokens=max_tokens,
        value_key="score",
        weight_key="estimated_tokens"
    )

    return {
        "selected_files": selected,
        "total_tokens": sum(f["estimated_tokens"] for f in selected),
        "estimated_coverage": calculate_coverage(query, selected)
    }
```

### 6.3 Displaying Savings/Usage Stats

```python
@mcp.resource("stats://usage")
def get_usage_stats() -> dict:
    """Get current token usage statistics."""

    return {
        "session_stats": {
            "total_queries": tracker.query_count,
            "total_tokens_saved": tracker.total_saved,
            "average_savings_per_query": tracker.avg_savings()
        },
        "last_query": {
            "query": tracker.last_query,
            "tokens_used": tracker.last_query_tokens,
            "tokens_saved": tracker.last_query_saved,
            "files_retrieved": len(tracker.last_query_files)
        },
        "cumulative": {
            "queries_made": tracker.query_count,
            "total_files_processed": tracker.total_files,
            "token_reduction_rate": f"{tracker.reduction_rate()}%"
        }
    }

@mcp.prompt("usage-summary")
def usage_summary_prompt() -> str:
    """Generate a usage summary prompt for display."""
    stats = get_usage_stats()

    return f"""# Vantage Token Usage Summary

This session:
- Queries: {stats['session_stats']['total_queries']}
- Tokens saved: {stats['session_stats']['total_tokens_saved']:,}
- Average savings: {stats['session_stats']['average_savings_per_query']:.1%}

Last query:
- Query: "{stats['last_query']['query']}"
- Tokens used: {stats['last_query']['tokens_used']}
- Tokens saved: {stats['last_query']['tokens_saved']}
- Files retrieved: {stats['last_query']['files_retrieved']}

Cumulative impact:
- Total queries: {stats['cumulative']['queries_made']}
- Total files processed: {stats['cumulative']['total_files_processed']}
- Token reduction rate: {stats['cumulative']['token_reduction_rate']}
"""
```

### 6.4 Multi-Repo Support

```python
@mcp.tool()
def search_multiple_repos(
    query: str,
    repos: list[dict],
    limit_per_repo: int = 5
) -> dict:
    """Search across multiple repositories simultaneously.

    Args:
        query: Search query
        repos: List of repo configs [{"name": "repo1", "path": "/path/to/repo1"}]
        limit_per_repo: Maximum results per repository

    Returns:
        Aggregated results from all repositories with repo labels
    """
    all_results = []

    for repo in repos:
        repo_index = load_repo_index(repo["path"])
        results = repo_index.search(query, limit=limit_per_repo)

        for result in results:
            result["repo"] = repo["name"]
            all_results.append(result)

    # Sort by combined relevance
    all_results.sort(key=lambda r: r["score"], reverse=True)

    return {
        "query": query,
        "repos_searched": len(repos),
        "total_results": len(all_results),
        "results": all_results
    }

@mcp.tool()
def switch_repo(repo_path: str) -> dict:
    """Switch active repository for search operations.

    Args:
        repo_path: Path to the repository to activate

    Returns:
        Confirmation with repository info
    """
    index = load_repo_index(repo_path)

    return {
        "active_repo": repo_path,
        "file_count": index.file_count,
        "indexed_at": index.created_at,
        "status": "ready"
    }
```

---

## 7. Integration Checklist

### 7.1 Pre-Integration

- [ ] **Choose SDK**: FastMCP (Python) or TypeScript SDK
- [ ] **Define Tools**: List all tools Vantage will expose
- [ ] **Design Schemas**: Create JSON schemas for all tool inputs/outputs
- [ ] **Plan Transport**: STDIO (local) or HTTP (remote)
- [ ] **Setup Testing**: Create test harness for tool validation

### 7.2 Implementation

- [ ] **Tool Registration**: Register all tools with proper metadata
- [ ] **Input Validation**: Implement schema validation for all inputs
- [ ] **Error Handling**: Return proper error responses
- [ ] **Logging**: Use stderr for logs (not stdout in STDIO mode)
- [ ] **Resource Links**: Support resource links for large payloads

### 7.3 Claude Code Configuration

- [ ] **Create `.mcp.json`**: Add Vantage server configuration
- [ ] **Environment Variables**: Setup required env vars
- [ ] **Plugin Integration**: Add to plugin.json if bundling
- [ ] **Scope Selection**: Choose local, project, or user scope
- [ ] **Test Discovery**: Verify tools appear in `/mcp` command

### 7.4 Testing

- [ ] **Unit Tests**: Test each tool in isolation
- [ ] **Integration Tests**: Test with MCP Inspector
- [ ] **LLM Testing**: Test with actual Claude Code
- [ ] **Error Cases**: Test invalid inputs and error handling
- [ ] **Performance**: Measure response times and optimize

### 7.5 Production Readiness

- [ ] **Security**: Validate inputs, sanitize outputs
- [ ] **Rate Limiting**: Implement throttling for API calls
- [ ] **Monitoring**: Add logging and metrics
- [ ] **Documentation**: Document tool usage and parameters
- [ ] **Version Management**: Handle schema versioning

---

## 8. Common Pitfalls and Solutions

### 8.1 Tool Design Mistakes

#### **Pitfall: Too Many Similar Tools**
```python
# ❌ BAD: Overlapping tools
@mcp.tool()
def search_python_files(query: str): ...
@mcp.tool()
def search_js_files(query: str): ...
@mcp.tool()
def search_ts_files(query: str): ...

# ✅ GOOD: Single tool with filters
@mcp.tool()
def search_repo(query: str, file_types: list[str] | None = None): ...
```

#### **Pitfall: Vague Tool Descriptions**
```python
# ❌ BAD: Unclear when to use
@mcp.tool()
def process_code(code: str) -> str:
    """Process the code"""

# ✅ GOOD: Clear purpose and use case
@mcp.tool()
def analyze_complexity(code: str) -> dict:
    """Analyze code complexity and identify potential issues.

    Use this tool when you need to:
    - Evaluate code maintainability
    - Identify overly complex functions
    - Find refactoring opportunities

    Args:
        code: Source code to analyze
    """
```

### 8.2 Performance Issues

#### **Pitfall: No Caching**
```python
# ❌ BAD: Recomputes embeddings every time
def search(query: str):
    query_embedding = compute_embedding(query)  # Expensive!
    return vector_search(query_embedding)

# ✅ GOOD: Cache embeddings
from functools import lru_cache

@lru_cache(maxsize=1000)
def get_cached_embedding(text: str) -> np.ndarray:
    return compute_embedding(text)

def search(query: str):
    query_embedding = get_cached_embedding(query)
    return vector_search(query_embedding)
```

#### **Pitfall: Large Payloads**
```python
# ❌ BAD: Returns entire file contents
def search_repo(query: str):
    results = vector_search(query)
    return [{"file": r.path, "content": open(r.path).read()} for r in results]

# ✅ GOOD: Return snippets with resource links
def search_repo(query: str):
    results = vector_search(query)
    return [
        {
            "file": r.path,
            "snippet": r.content[:200],
            "resource_uri": f"file://{r.path}"
        }
        for r in results
    ]
```

### 8.3 Error Handling Mistakes

#### **Pitfall: Returning Protocol Errors**
```python
# ❌ BAD: Raises exceptions (protocol errors)
@mcp.tool()
def search_repo(query: str):
    if len(query) < 3:
        raise ValueError("Query too short")  # Breaks connection!

# ✅ GOOD: Returns tool execution errors
@mcp.tool()
def search_repo(query: str) -> dict:
    if len(query) < 3:
        return {
            "content": [{"type": "text", "text": "Query must be at least 3 characters"}],
            "isError": True
        }
```

### 8.4 Logging Issues (STDIO Transport)

#### **Pitfall: Writing to stdout**
```python
# ❌ BAD: Corrupts JSON-RPC protocol
@mcp.tool()
def search_repo(query: str):
    print(f"Searching for: {query}")  # Breaks MCP!
    return results

# ✅ GOOD: Write to stderr
import logging

logging.basicConfig(stream=sys.stderr)

@mcp.tool()
def search_repo(query: str):
    logging.info(f"Searching for: {query}")
    return results
```

### 8.5 Security Concerns

#### **Pitfall: No Input Validation**
```python
# ❌ BAD: Trusts user input
@mcp.tool()
def get_file(file_path: str):
    return open(file_path).read()  # Path traversal vulnerability!

# ✅ GOOD: Validate and sanitize
@mcp.tool()
def get_file(file_path: str):
    # Ensure path is within allowed directory
    full_path = Path(allowed_dir) / file_path
    full_path.resolve().relative_to(allowed_dir).resolve()

    if not full_path.exists():
        return {"error": "File not found", "isError": True}

    return full_path.read_text()
```

#### **Pitfall: Excessive Permissions**
```python
# ❌ BAD: Reads entire filesystem
def get_any_file(path: str):
    return open(path).read()

# ✅ GOOD: Restricted to specific directories
ALLOWED_DIRS = ["/home/user/projects", "/home/user/code"]

def get_project_file(path: str):
    if not any(path.startswith(d) for d in ALLOWED_DIRS):
        return {"error": "Access denied", "isError": True}
    return open(path).read()
```

---

## 9. Resources and References

### 9.1 Official Documentation

- [Model Context Protocol Official Site](https://modelcontextprotocol.io/)
- [MCP Architecture Overview](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP Tools Specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [Build an MCP Server](https://modelcontextprotocol.io/docs/develop/build-server)

### 9.2 SDK Documentation

#### **Python SDK**
- [Official Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [FastMCP Documentation](https://gofastmcp.com/)
- [FastMCP Tutorial](https://gofastmcp.com/tutorials/create-mcp-server)

#### **TypeScript SDK**
- [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [NPM Package](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

### 9.3 Claude Code Integration

- [Connect Claude Code to Tools via MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code Settings](https://code.claude.com/docs/zh-CN/settings)
- [Plugin Components Reference](https://code.claude.com/docs/en/plugins/components)

### 9.4 Best Practices Guides

- [Implementing MCP: Tips, Tricks, and Pitfalls](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/)
- [Block's Playbook for Designing MCP Servers](https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers)
- [15 Best Practices for Building MCP Servers in Production](https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/)
- [The MCP Security Survival Guide](https://towardsdatascience.com/the-mcp-security-survival-guide-best-practices-pitfalls-and-real-world-lessons/)

### 9.5 Reference Implementations

- [MCP Example Servers](https://modelcontextprotocol.io/examples)
- [Anthropic Official Plugins](https://github.com/anthropics/claude-plugins-official)
- [Awesome Claude Code](https://github.com/hesreallyhim/awesome-claude-code)
- [hugoduncan/mcp-vector-search](https://github.com/hugoduncan/mcp-vector-search)
- [spences10/mcp-embedding-search](https://github.com/spences10/mcp-embedding-search)

### 9.6 Performance Resources

- [Advanced Caching Strategies for MCP Servers](https://medium.com/@parichay2406/advanced-caching-strategies-for-mcp-servers-from-theory-to-production-1ff82a594177)
- [MCP Server Performance Optimization](https://www.catchmetrics.io/blog/a-brief-introduction-to-mcp-server-performance-optimization)
- [MCP Protocol: Bandwidth & Latency Optimization](https://blog.csdn.net/weixin_41429382/article/details/148666917)

### 9.7 Community Resources

- [MCP Market](https://mcpmarket.com/) - Directory of MCP servers
- [MCP Subreddit](https://www.reddit.com/r/MCP/) - Community discussions
- [MCP GitHub Discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions)

---

## Appendix A: Quick Reference

### A.1 Tool Definition Template

```python
@mcp.tool()
async def tool_name(
    param1: str,
    param2: int = 10,
    optional_param: dict[str, Any] | None = None
) -> dict:
    """One-line summary of what the tool does.

    Detailed description explaining:
    - When to use this tool
    - How it works
    - What it returns

    Args:
        param1: Description of required parameter
        param2: Description of optional parameter with default
        optional_param: Description of truly optional parameter

    Returns:
        Description of return value structure

    Raises:
        Description of error conditions
    """
```

### A.2 Error Response Template

```python
# Tool execution error
return {
    "content": [
        {
            "type": "text",
            "text": "Clear error message with actionable guidance"
        }
    ],
    "isError": True
}

# Success response
return {
    "content": [
        {
            "type": "text",
            "text": "Success message or formatted results"
        }
    ],
    "isError": False,
    "data": {}  # Optional structured data
}
```

### A.3 Configuration Template

```json
{
  "mcpServers": {
    "vantage": {
      "command": "python",
      "args": [
        "-m", "vantage.mcp_server",
        "--config", "${VANTAGE_CONFIG_PATH}"
      ],
      "env": {
        "VECTOR_DB_PATH": "${VECTOR_DB_PATH:-/default/path}",
        "LOG_LEVEL": "${LOG_LEVEL:-INFO}"
      }
    }
  }
}
```

---

## Appendix B: Glossary

- **MCP Host**: The AI application (Claude Code) that manages MCP clients
- **MCP Client**: Component that connects to one MCP server
- **MCP Server**: Program that exposes tools, resources, and prompts
- **STDIO Transport**: Local communication via standard input/output
- **Streamable HTTP**: Remote communication via HTTP POST
- **Tool**: Executable function that LLMs can invoke
- **Resource**: Data source that provides contextual information
- **Prompt**: Reusable template for structuring interactions
- **JSON-RPC 2.0**: underlying protocol for MCP communication
- **Vector Embedding**: Numerical representation of text/code for semantic search
- **HNSW**: Hierarchical Navigable Small World algorithm for fast vector search

---

**Document End**

For questions or updates to this research document, please refer to the official MCP documentation and community resources listed in Section 9.
