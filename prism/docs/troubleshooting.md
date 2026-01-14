# PRISM Troubleshooting Guide

**Last Updated**: 2026-01-14
**Version**: 0.1.0
**Status**: Active Development

## Overview

This comprehensive troubleshooting guide helps you diagnose and resolve common issues when using PRISM. The guide covers installation, configuration, indexing, search, and deployment problems with actionable solutions.

---

## Quick Diagnostics

Run these commands first to check system health and identify issues:

### Health Check Commands
```bash
# Check PRISM installation and configuration
prism config
prism doctor

# Check system requirements
node --version
npm --version
wrangler --version

# Test Cloudflare authentication
wrangler whoami

# Check database health
prism stats --database

# Test vector database connection
prism health --vector-db
```

### Status Check Commands
```bash
# Check CLI command availability
which prism
prism --help

# Verify PRISM can be imported
node -e "import('prism'); console.log('PRISM import successful')"

# Check if WRANGLER is configured
wrangler deployments list

# Test basic functionality
prism health
```

### Log Locations
```bash
# PRISM logs
~/.prism/logs/prism.log
~/.prism/logs/debug.log

# Wrangler logs (Cloudflare)
~/.wrangler/logs/

# Application logs
wrangler tail --format pretty

# Database logs
~/.prism/vector.db-journal
```

---

## Common Issues (with Solutions)

### Installation Issues

#### 1. Node.js Version Conflicts

**Error Message:**
```
Error: Requires Node.js >=18.0.0
Current version: v16.20.0
```

**Solution:**
```bash
# Check Node version
node --version

# Install Node.js 18+ (using NVM)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# Or use Node Version Manager
nvm install --lts
nvm use --lts

# Verify installation
node --version
```

#### 2. npm Install Failures

**Error Message:**
```
npm ERR! Cannot resolve dependency: @anthropic-ai/sdk@^0.27.0
npm ERR! code ERESOLVE
```

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# If still failing, try with specific registry
npm install --registry https://registry.npmjs.org/

# Or use yarn as alternative
npm install -g yarn
yarn install
```

#### 3. Permission Errors

**Error Message:**
```
Error: EACCES: permission denied, open '~/.prism/config.json'
```

**Solution:**
```bash
# Check permissions on .prism directory
ls -la ~/.prism

# Fix permissions
mkdir -p ~/.prism
chmod 755 ~/.prism

# For macOS/Linux (if needed)
sudo chown -R $(whoami) ~/.prism

# For Windows (run as administrator or adjust permissions)
icacls ~/.prism /grant Everyone:F
```

#### 4. Wrangler Installation Failures

**Error Message:**
```bash
npm ERR! Cannot install wrangler@4.59.1
npm ERR! gyp ERR! build failed
```

**Solution:**
```bash
# Install wrangler globally first
npm install -g wrangler

# Or try alternative installation methods
# Using npm ci for cleaner install
npm ci

# If Python/gyp issues, install build tools
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install -y build-essential

# macOS:
xcode-select --install

# Windows: Install Visual Studio Build Tools
```

---

### Configuration Issues

#### 1. Invalid wrangler.toml

**Error Message:**
```bash
✘ [ERROR] Wrangler.toml parse error
  × Invalid TOML syntax at line 15: "unexpected token"
```

**Solution:**
```bash
# Validate wrangler.toml syntax
toml-cli validate wrangler.toml

# Common fixes:
# - Ensure proper quotes around values
# - Check for missing commas
# - Validate environment sections

# Example correct structure:
cat > wrangler.toml << 'EOF'
name = "prism"
main = "dist/worker.js"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "production"
EOF
```

#### 2. Missing Environment Variables

**Error Message:**
```
Error: Missing required environment variable: ANTHROPIC_API_KEY
```

**Solution:**
```bash
# Set environment variables
export ANTHROPIC_API_KEY="your-api-key-here"
export CF_API_TOKEN="your-cloudflare-token"

# Or use wrangler secrets
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put CF_API_TOKEN

# Check existing secrets
wrangler secret list

# For development, create .env file
echo "ANTHROPIC_API_KEY=your-key" > .env
echo "CF_API_TOKEN=your-token" >> .env
```

#### 3. Cloudflare Authentication Failures

**Error Message:**
```
Error: You are not authenticated. Please run `wrangler login`
```

**Solution:**
```bash
# Log in to Cloudflare
wrangler login

# Verify login status
wrangler whoami

# If issues with login:
# 1. Clear wrangler cache
rm -rf ~/.wrangler/

# 2. Try API token authentication
wrangler auth login --api-token your-token

# 3. Check token permissions
# Should include: Cloudflare Workers, D1, KV, R2, Vectorize
```

#### 4. Database Binding Errors

**Error Message:**
```
Error: D1 binding 'DB' not found. Check your configuration.
```

**Solution:**
```bash
# Create D1 database
wrangler d1 create prism-db

# Update wrangler.toml with database ID
[[env.production.d1_databases]]
binding = "DB"
database_name = "prism-db"
database_id = "your-database-id-here"

# Verify bindings
wrangler d1 list
```

---

### Indexing Issues

#### 1. Files Not Being Indexed

**Error Message:**
```bash
⚠ No files found to index
Include patterns: **/*.{ts,tsx,js,jsx}
Exclude patterns: **/node_modules/**,**/dist/**
```

**Solution:**
```bash
# Check current directory and files
pwd
ls -la

# Test file patterns
prism index --verbose

# Override include patterns
prism index --include-patterns "**/*.{ts,tsx,js,jsx,py,rs,go}"

# Check .gitignore conflicts
cat .gitignore

# Exclude specific problematic directories
prism index --exclude-patterns "**/test/**,**/tests/**,**/dist/**"
```

#### 2. Chunk Size Too Large

**Error Message:**
```
Error: Chunk size exceeded: 8192 > 5000
```

**Solution:**
```bash
# Check current configuration
prism config

# Override chunk size for this index
prism index --chunk-size 3000

# Or update configuration permanently
# Edit ~/.prism/config.json
{
  "indexer": {
    "chunkSize": 3000,
    "overlap": 100
  }
}

# Validate configuration
prism config
```

#### 3. Memory Errors

**Error Message:**
```
Error: JavaScript heap out of memory
<--- Last few GCs --->
```

**Solution:**
```bash
# Increase Node.js memory limit
prism index --max-old-space-size=8192

# Or set environment variable
export NODE_OPTIONS="--max-old-space-size=8192"

# Process smaller batches
prism index --include-patterns "**/*.ts"  # Start with one type

# Monitor memory usage
node --inspect index  # Use Chrome DevTools

# Check for memory leaks in long runs
prism index --timeout=300  # 5 minute timeout
```

#### 4. Rate Limiting

**Error Message:**
```
Error: 429 Too Many Requests
Rate limit exceeded for embeddings API
```

**Solution:**
```bash
# Add exponential backoff retry
prism index --retry-attempts=5 --retry-delay=1000

# Reduce concurrency
prism index --max-concurrency=1

# Use local model as fallback
prism index --use-local-model

# Check Cloudflare rate limits
wrangler tail --format pretty

# Implement indexing with delays
for dir in src tests; do
  prism index $dir
  sleep 10  # 10 second delay
done
```

#### 5. Language Detection Failures

**Error Message:**
```
Error: Unsupported language: .custom-file-ext
```

**Solution:**
```bash
# Check supported languages
prism config

# Add custom language mapping
prism index --languages "typescript,javascript,python,go,rust"

# Force language for specific files
prism index --language-mapping ".custom=typescript"

# Update config to include custom extensions
{
  "indexer": {
    "languages": ["typescript", "javascript", "python", "go", "rust", "custom"],
    "languageMappings": {
      ".custom": "typescript"
    }
  }
}
```

---

### Search Issues

#### 1. No Results Returned

**Error Message:**
```bash
$ prism search "authentication"
🔍 Searching for: "authentication"
✗ No results found
```

**Solution:**
```bash
# Check if index exists
prism stats

# Re-index if needed
prism index --force

# Test with simpler query
prism search "function"

# Check database health
prism health --vector-db

# Verify search configuration
prism config

# Try different search strategies
prism search --fuzziness 2 "authentication"
prism search --boost-function-names "auth"
```

#### 2. Slow Search Performance

**Error Message:**
*No error message, but search takes >5 seconds*

**Solution:**
```bash
# Check vector database size
prism stats --database

# Optimize search configuration
prism search --limit=10 --fuzziness=1 "query"

# Rebuild index with better chunking
prism index --chunk-size 1000 --overlap 100

# Monitor query performance
prism search "test" --profile

# Consider using local vector DB for faster searches
prism config --vector-db-type "hnswlib"
```

#### 3. Relevance Problems

**Error Message:**
*Search returns irrelevant results*

**Solution:**
```bash
# Adjust relevance scoring
prism search --min-relevance 0.5 "query"

# Check and update embeddings
prism index --rebuild-embeddings

# Use different embedding model
prism config --embedding-model "text-embedding-3-small"

# Try different search strategies
prism search --semantic-search "auth"
prism search --keyword-search "auth"
prism search --hybrid-search "auth"

# Monitor search quality
prism search "test" --show-scores
```

#### 4. Filter Not Working

**Error Message:**
*File type filters don't work as expected*

**Solution:**
```bash
# Check available filters
prism search --help

# Test filters individually
prism search "auth" --type "typescript"
prism search "auth" --extension ".ts"

# Verify filter syntax
prism search "auth" --filter "path:src/**"

# Debug filter application
prism search "test" --debug-filters

# Check configuration for default filters
prism config
```

---

### Deployment Issues

#### 1. Deployment Failures

**Error Message:**
```bash
✘ [ERROR] Build Step Failed
  × Build failed with exit code 1
```

**Solution:**
```bash
# Check build locally
npm run build

# Validate wrangler configuration
wrangler deploy --dry-run

# Check build logs
wrangler tail --format pretty

# Fix common build issues:
# 1. Install missing dependencies
npm install

# 2. Check TypeScript errors
npx tsc --noEmit

# 3. Validate WASM build
npm run build:wasm

# 4. Check file permissions
chmod +x prism/prism-indexer/build.sh
```

#### 2. Worker Not Responding

**Error Message:**
```
Error: FetchError: request to https://prism.workers.dev failed
```

**Solution:**
```bash
# Test local worker
wrangler dev

# Check worker logs
wrangler tail --format pretty

# Verify deployment
wrangler deployments list

# Redeploy
wrangler deploy

# Check Cloudflare dashboard for worker status
wrangler tail --format pretty --env production
```

#### 3. CORS Errors

**Error Message:**
```
Access to fetch at 'https://prism.workers.dev/search'
from origin 'http://localhost:3000' has been blocked
```

**Solution:**
```bash
# Check worker CORS headers
wrangler dev --local

# Update worker to include CORS headers
// In your worker code:
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Add to response headers
return new Response(JSON.stringify(data), {
  headers: {
    'Content-Type': 'application/json',
    ...corsHeaders,
  },
});
```

#### 4. Binding Errors

**Error Message:**
```
Error: KV binding 'KV' not found
```

**Solution:**
```bash
# Create KV namespace
wrangler kv:namespace create PRISM_INDEX

# Update wrangler.toml
[[env.production.kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"

# Verify bindings
wrangler kv:namespace list

# Check environment variables
wrangler secret list
```

---

## Getting Help

### How to Report Bugs

When reporting bugs, please include:

1. **System Information**
   ```bash
   prism doctor
   node --version
   npm --version
   wrangler --version
   uname -a  # System info
   ```

2. **Steps to Reproduce**
   ```bash
   # Exact commands you ran
   prism index ./src
   prism search "authentication"
   ```

3. **Complete Error Output**
   ```bash
   # Include full error stack trace
   prism index 2>&1 | tee error.log
   ```

4. **Configuration Details**
   ```bash
   prism config
   cat ~/.prism/config.json
   cat wrangler.toml
   ```

5. **Reproduction Code**
   ```bash
   # Minimal example that reproduces the issue
   echo 'console.log("hello");' > test.js
   prism index test.js
   prism search "console"
   ```

### What Information to Include

**Essential Information:**
- PRISM version (`prism --version`)
- Node.js version and platform
- Complete error messages and stack traces
- Steps to reproduce the issue
- Expected vs actual behavior

**Helpful Information:**
- Size of codebase being indexed
- Number of files in index
- Search query examples
- Performance metrics (if available)
- Screenshots of errors (for UI issues)

### Where to Get Community Support

**Official Channels:**
1. **GitHub Issues**: [Report bugs and request features](https://github.com/claudes-friend/prism/issues)
2. **Discussions**: [Community discussions and Q&A](https://github.com/claudes-friend/prism/discussions)
3. **Discord**: [Real-time chat support](https://discord.gg/prism) (if available)

**Documentation:**
1. **User Guide**: [Complete user documentation](./user-guide/)
2. **Architecture Docs**: [Technical implementation details](./architecture/)
3. **API Reference**: [Endpoint documentation](./api/)

**Community Resources:**
1. **Example Projects**: [Sample implementations](https://github.com/claudes-friend/prism/examples)
2. **Best Practices**: [Community-contributed guides](https://github.com/claudes-friend/prism/wiki)
3. **Video Tutorials**: [Screen recordings and demos](https://github.com/claudes-friend/prism/discussions/categories/tutorials)

### Before Asking for Help

1. **Check this guide** - Your issue may already be documented here
2. **Search existing issues** - Avoid duplicates
3. **Try the diagnostic commands** - They may solve your problem
4. **Update PRISM** - Ensure you're using the latest version
5. **Provide complete information** - Helps us help you faster

### Creating a Good Bug Report

Template for effective bug reports:

```markdown
## Bug Description
Brief description of the issue

## Environment
- PRISM Version: 0.1.0
- Node.js: v20.10.0
- Platform: Ubuntu 22.04
- Wrangler: 4.59.1

## Steps to Reproduce
1. Run command: `prism index ./src`
2. See error: [Error message here]
3. Additional context if needed

## Expected Behavior
What should have happened instead

## Actual Behavior
What actually happened

## Additional Information
- Configuration details
- Log files
- Screenshots (if applicable)
```

---

## Common Error Codes Reference

| Code | Category | Description |
|------|----------|-------------|
| 1000-1099 | Configuration | Config-related errors |
| 2000-2099 | Indexing | File processing and indexing errors |
| 3000-3099 | Database | Vector DB and storage errors |
| 4000-4099 | Model | AI model and API errors |
| 5000-5099 | File System | File access and permission errors |
| 6000-6099 | Network | Connection and timeout errors |
| 7000-7099 | Validation | Input validation errors |
| 8000-8099 | MCP | Model Context Protocol errors |
| 9999 | Unknown | Uncategorized errors |

### Understanding Error Messages

PRISM errors follow this pattern:
```
Error: [Short description]
  Code: [ERROR_CODE]
  Details: [Additional context]
  Suggestions:
    1. [First suggestion]
    2. [Second suggestion]
```

**Code Structure:**
- First digit: Category (1=Config, 2=Indexing, etc.)
- Second digit: Sub-category
- Last two digits: Specific error number

**Exit Codes:**
- 0: Success
- 1: General error
- 2: Configuration error
- 3: Indexing error
- 4: Database error
- 5: File system error
- 6: Network error
- 7: Validation error
- 8: MCP error

---

## Performance Optimization Tips

### Indexing Performance
```bash
# Optimal for large codebases
prism index --chunk-size 2000 --overlap 100 --max-concurrency 4

# For memory-constrained systems
prism index --max-old-space-size=4096 --max-concurrency 1

# Incremental updates (when available)
prism index --incremental
```

### Search Performance
```bash
# Fast searches for development
prism search --limit=5 --fuzziness=0 "query"

# Comprehensive searches for production
prism search --limit=20 --fuzziness=2 --min-relevance 0.3 "query"
```

### Memory Management
```bash
# Monitor memory usage
node --max-old-space-size=8192 prism search "query"

# Check for memory leaks
prism index --verbose --memory-profile
```

---

## Related Documentation

- [User Guide](./user-guide/getting-started.md)
- [Configuration Reference](./user-guide/configuration.md)
- [Indexing Architecture](./architecture/indexer-architecture.md)
- [Vector Database Guide](./vector-db.md)
- [MCP Integration](./mcp-integration.md)
- [API Reference](./api/)

## Contributing to This Guide

We welcome contributions to improve this troubleshooting guide! Please:

1. Fork the repository
2. Create a new branch for your changes
3. Add your troubleshooting tips and solutions
4. Submit a pull request with clear descriptions

For more information on contributing, see the [contributing guidelines](../CONTRIBUTING.md).