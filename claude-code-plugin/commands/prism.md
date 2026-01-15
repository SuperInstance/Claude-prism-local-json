# /prism

Enhanced project memory and code search for your development environment.

## Usage

```bash
/prism index [path]
/prism search <query>
/prism status
/prism config [key] [value]
```

## Commands

### `/prism index [path]`

Index files in the specified path for enhanced search capabilities.

**Arguments:**
- `path` (optional): Path to index. Defaults to current directory.

**Examples:**
```bash
/prism index
/prism index ./src
/prism index ./lib --recursive
```

### `/prism search <query>`

Search through your codebase with semantic understanding.

**Arguments:**
- `query`: Search query in natural language.

**Examples:**
```bash
/prism search "authentication middleware"
/prism search "database connection setup"
/prism search "function to calculate fibonacci"
```

### `/prism status`

Show current project memory status and statistics.

**Examples:**
```bash
/prism status
```

**Output:**
```json
{
  "project": "my-app",
  "language": "javascript",
  "indexed_files": 156,
  "total_size": "2.3MB",
  "last_index": "2024-01-14T10:30:00Z",
  "search_performance": {
    "avg_response_time": "45ms",
    "cache_hit_rate": "87%"
  }
}
```

### `/prism config [key] [value]`

Get or set configuration options.

**Arguments:**
- `key` (optional): Configuration key to get or set.
- `value` (optional): Value to set.

**Examples:**
```bash
/prism config
/prism config log_level debug
/prism config cache_size 1000
```

## Features

- **Semantic Search**: Natural language queries that understand code context
- **Project Auto-Detection**: Automatically identifies language, framework, and dependencies
- **Background Indexing**: Continuous indexing without blocking your workflow
- **Smart Caching**: Intelligent caching for frequently accessed code
- **Real-time Updates**: Automatic reindexing when files change

## Configuration

### Environment Variables

- `LOG_LEVEL`: Set logging level (debug, info, warn, error)
- `CACHE_DIR`: Override cache directory location
- `INDEX_DIR`: Override index directory location
- `MAX_INDEX_SIZE`: Maximum size for index in MB

### Configuration File

Create a `.prism-config.json` file in your project root:

```json
{
  "logLevel": "info",
  "cacheDir": "./.prism/cache",
  "indexDir": "./.prism/index",
  "maxIndexSize": 1000,
  "excludePatterns": [
    "node_modules/**",
    ".git/**",
    "dist/**"
  ],
  "indexPatterns": [
    "**/*.{js,ts,jsx,tsx}",
    "**/*.{py,go,rs,java}",
    "**/*.{md,json,yaml,yml}"
  ]
}
```

## Integration

The plugin integrates seamlessly with Claude Code:

- **Auto-Start**: Background daemon starts automatically when installed
- **Context Awareness**: Claude automatically has access to project context
- **Enhanced Suggestions**: Code suggestions are based on your project structure
- **Smart Memory**: Remembers your project architecture and patterns

## Troubleshooting

### Common Issues

**Indexing is slow:**
- Check if you're excluding large directories like `node_modules` or `dist`
- Consider increasing `MAX_INDEX_SIZE` if you have a large codebase

**Search results are inaccurate:**
- Try reindexing with `/prism index`
- Check if your file extensions are included in `indexPatterns`

**Plugin not working:**
- Verify installation: `/plugin list`
- Check plugin status: `/prism status`
- Look at daemon logs: Check background process

### Getting Help

For issues and feature requests:
- GitHub: https://github.com/SuperInstance/Claude-prism-local-json
- Issues: https://github.com/SuperInstance/Claude-prism-local-json/issues