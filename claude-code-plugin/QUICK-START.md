# Quick Start - Claude PRISM Local JSON

This guide explains what the plugin does and how to use it.

## What You'll Get

After installing the plugin:
- Claude Code can search through your project files
- Claude understands your project structure better
- Better code suggestions based on your patterns
- Faster project navigation and understanding

## Installation

### Method 1: One-Click (Recommended)
```bash
/plugin install prism-project-memory@claude-plugins-official
```

### Method 2: Manual
```bash
git clone https://github.com/SuperInstance/Claude-prism-local-json.git
cd Claude-prism-local-json
npm install
claude plugin install .
```

## What Happens After Installation

1. **Plugin starts automatically** - No manual setup needed
2. **Project detection runs** - Identifies your language and framework
3. **Initial indexing** - Scans your project files (takes a few seconds)
4. **Ready to use** - Claude Code now has search capabilities

## Usage Examples

### Before Plugin
```
You: Find the authentication middleware
Claude: I'd need to search for that manually. Can you tell me where to look?
```

### After Plugin
```
You: Find the authentication middleware
Claude: I can search for that in your project. Let me check the codebase...
```

## Available Commands

```bash
# Check plugin status
/prism status

# Search for code (through Claude)
/prism search "authentication middleware"

# Manually reindex if needed
/prism index

# View configuration
/prism config
```

## What's Stored

The plugin creates a `.prism/` directory in your project:
- **Project metadata** (name, language, framework)
- **File index** (list of all indexed files)
- **Search data** (content for searching)

Everything is stored locally as JSON files. No external servers.

## Performance Impact

- **Memory usage**: ~30-50MB total
- **Disk space**: ~1-10MB depending on project size
- **CPU usage**: Minimal background processing
- **Network**: Zero (completely local)

## Where You'll See Improvement

1. **Code search**: Find files and functions quickly
2. **Project context**: Claude understands your structure
3. **Code suggestions**: More relevant based on your patterns
4. **Navigation**: Faster project understanding

## Limitations to Understand

- **Not semantic search**: Matches keywords, not meaning
- **File-based only**: No deep code analysis
- **Simple indexing**: Basic file content scanning
- **No AI features**: Just search and project memory

## Troubleshooting

If it doesn't work:

1. **Check installation**:
   ```bash
   /plugin list
   ```

2. **Test daemon**:
   ```bash
   curl http://localhost:8080/health
   ```

3. **Restart plugin** if needed

## Getting Help

- **Issues**: https://github.com/SuperInstance/Claude-prism-local-json/issues
- **Technical details**: See [TECHNICAL-DOCUMENTATION.md](TECHNICAL-DOCUMENTATION.md)

---

This plugin provides simple, reliable project enhancement without complexity.