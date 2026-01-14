# Getting Started with PRISM

**Target Audience**: Developers using Claude Code
**Prerequisites**: Node.js 18+, basic CLI knowledge
**Time to Complete**: 15 minutes

---

## What is PRISM?

PRISM is an AI-powered codebase indexer and semantic search engine that integrates with Claude Code. It reduces token usage by 90%+ by intelligently selecting only the most relevant code for each query.

### Key Benefits

- **90%+ Token Savings**: Only send relevant code to Claude
- **Semantic Search**: Find code by meaning, not just keywords
- **Offline-Capable**: Works with local models (Ollama)
- **Free Tier**: Full functionality on Cloudflare's free tier
- **Drop-in Integration**: Works seamlessly with Claude Code via MCP

### How PRISM Works

```
Your Codebase (100K+ LOC)
         ↓
    [Indexing]
    - Parse code structure
    - Extract functions/classes
    - Generate vector embeddings
         ↓
    [Vector Database]
    - Store semantic meaning
    - Enable fast search
         ↓
    [Query]
    - "How does auth work?"
    - Find relevant code
    - Optimize context
         ↓
Claude receives only what it needs
```

---

## Installation

### Method 1: npm (Recommended)

```bash
npm install -g @claudes-friend/prism
```

### Method 2: yarn

```bash
yarn global add @claudes-friend/prism
```

### Method 3: pnpm

```bash
pnpm add -g @claudes-friend/prism
```

### Method 4: Clone from Source

For development or latest features:

```bash
git clone https://github.com/claudes-friend/prism.git
cd prism
npm install
npm run build
npm link
```

### Verify Installation

```bash
prism --version
# Expected output: prism version 0.1.0
```

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **Node.js** | 18.0.0 | 20.x LTS |
| **OS** | Linux, macOS, WSL | Native Linux/macOS |
| **Memory** | 100MB | 1GB+ |
| **Disk** | 50MB + index size | 500MB+ |
| **Network** | Optional (for Cloudflare) | Required for cloud features |

Check your system:

```bash
# Check Node version
node --version  # Should be v18+

# Check available memory
# Linux/macOS
free -h

# Windows
systeminfo | findstr /C:"Available Physical Memory"

# Check disk space
# Linux/macOS
df -h

# Windows
fsutil volume diskfree C:
```

---

## First-Time Setup

### Step 1: Navigate to Your Project

```bash
cd /path/to/your/project
```

### Step 2: Initialize PRISM (Optional)

PRISM can create a default configuration file for you:

```bash
prism init
```

**Expected Output**:

```
✓ Created .prism/config.yaml
✓ Created .prism/.gitignore
✓ Detected project type: TypeScript

Configuration created! Edit .prism/config.yaml to customize.
```

This creates `.prism/config.yaml` with sensible defaults:

```yaml
# PRISM Configuration
indexing:
  extensions:
    - .ts
    - .js
    - .tsx
    - .jsx
    - .py
    - .rs
    - .go
    - .java
  exclude:
    - node_modules/**
    - .git/**
    - dist/**
    - build/**
    - "**/*.test.ts"
    - "**/*.spec.ts"

embeddings:
  provider: auto  # auto, cloudflare, ollama
  model: bge-small-en-v1.5

storage:
  type: sqlite  # sqlite, vectorize
  path: .prism/vectors.db

chat:
  budget: 50000
  model: auto  # auto, ollama, haiku, sonnet, opus
```

### Step 3: Configure API Keys (Optional)

If you want to use cloud features, add your API keys:

```bash
# Option 1: Environment variables (recommended)
export ANTHROPIC_API_KEY=your-key-here
export CLOUDFLARE_ACCOUNT_ID=your-account-id
export CLOUDFLARE_API_TOKEN=your-token-here

# Option 2: Add to config file
cat >> ~/.prism/config.yaml << EOF
chat:
  apiKey: your-anthropic-key-here

cloudflare:
  accountId: your-cloudflare-account-id
  apiToken: your-cloudflare-api-token
EOF
```

### Step 4: Index Your Codebase

```bash
prism index
```

**Expected Output**:

```
Indexing /home/user/project...
✓ Found 247 files matching criteria
✓ Parsed 247 files (3.2s)
✓ Extracted 3,456 code elements
✓ Generated 3,456 embeddings (18.4s)
✓ Indexed 3,456 chunks (1.2s)

Index complete!
Files: 247 | Chunks: 3,456 | Time: 22.8s
Storage: .prism/vectors.db (12.4 MB)
```

**What's Happening**:

1. **Scanning**: PRISM scans your project for supported file types
2. **Parsing**: Tree-sitter (Rust WASM) parses code structure
3. **Extraction**: Functions, classes, and methods are extracted
4. **Embedding**: Cloudflare Workers AI generates vector embeddings
5. **Storage**: Vectors stored in SQLite database for fast search

---

## First Run

### 1. Navigate to Your Project

```bash
cd /path/to/your/project
```

### 2. Initialize PRISM (Optional)

PRISM can create a default configuration file:

```bash
prism init
```

This creates `.prism/config.yaml` with default settings:

```yaml
# PRISM Configuration
indexing:
  extensions:
    - .ts
    - .js
    - .tsx
    - .jsx
    - .py
    - .rs
    - .go
    - .java
  exclude:
    - node_modules/**
    - .git/**
    - dist/**
    - build/**
    - "**/*.test.ts"
    - "**/*.spec.ts"

embeddings:
  provider: auto  # auto, cloudflare, ollama
  model: bge-small-en-v1.5

storage:
  type: sqlite  # sqlite, vectorize
  path: .prism/vectors.db

chat:
  budget: 50000
  model: auto  # auto, ollama, haiku, sonnet, opus
```

### 3. Index Your Codebase

```bash
prism index
```

**Expected Output**:

```
Indexing /home/user/project...
✓ Found 247 files matching criteria
✓ Parsed 247 files (3.2s)
✓ Extracted 3,456 code elements
✓ Generated 3,456 embeddings (18.4s)
✓ Indexed 3,456 chunks (1.2s)

Index complete!
Files: 247 | Chunks: 3,456 | Time: 22.8s
Storage: .prism/vectors.db (12.4 MB)
```

**What's Happening**:
1. PRISM scans your project for supported file types
2. Tree-sitter (Rust WASM) parses code structure
3. Functions, classes, and methods are extracted
4. Cloudflare Workers AI generates embeddings (vectors)
5. Vectors are stored in SQLite database

---

## Your First Search

### Basic Semantic Search

```bash
prism search "how does authentication work?"
```

**Expected Output**:

```
Searching for "how does authentication work?"...
Found 8 results (0.18s)

src/auth/login.ts (score: 0.94)
  Line 45: async function login(username, password) {
  Line 46:   const user = await db.users.findOne({ username });
  Line 47:   if (!user) throw new AuthError('User not found');
  Line 48:   if (!await bcrypt.compare(password, user.passwordHash)) {
  Line 49:     throw new AuthError('Invalid password');
  Line 50:   }
  Line 51:   return generateToken(user);
  Line 52: }

src/auth/middleware.ts (score: 0.91)
  Line 12: export function authMiddleware(req, res, next) {
  Line 13:   const token = req.headers.authorization?.split(' ')[1];
  Line 14:   if (!token) return res.status(401).json({ error: 'No token' });
  Line 15:   const decoded = verifyToken(token);
  Line 16:   req.user = decoded;
  Line 17:   next();
  Line 18:   }

src/types/auth.ts (score: 0.76)
  Line 8: export interface User {
  Line 9:   id: string;
  Line 10:   username: string;
  Line 11:   email: string;
  Line 12:   roles: Role[];
  Line 13: }
```

### Advanced Search Options

```bash
# Filter by file type
prism search "database connection" --extensions .ts,.js

# Get more results
prism search "API endpoints" --limit 20

# Lower similarity threshold
prism search "error handling" --threshold 0.6

# Exclude test files
prism search "user model" --exclude "test/**,spec/**"

# JSON output for scripting
prism search "authentication" --format json | jq '.results[].file'
```

---

## Your First Chat Query

### Ask a Question

```bash
prism chat "Explain how the payment system works"
```

**Expected Output**:

```
Query: Explain how the payment system works

Optimizing context...
✓ Retrieved 17 relevant code chunks
✓ Selected 6 chunks within budget (2,847 tokens)
✓ Compressed to 1,234 tokens (56.7% reduction)
✓ Selected model: claude-3.5-sonnet

Answer:
The payment system integrates with Stripe for processing:

1. Payment Flow (src/payments/flow.ts:23-45):
   - User initiates payment via checkout
   - System creates Stripe PaymentIntent
   - Client confirms payment using Stripe.js
   - Webhook confirms payment status

2. Webhook Handler (src/payments/webhook.ts:12-34):
   - Receives payment confirmation from Stripe
   - Verifies webhook signature
   - Updates order status in database
   - Triggers fulfillment workflow

3. Error Handling (src/payments/errors.ts:8-22):
   - Handles declined payments
   - Retry logic for temporary failures
   - User notification on errors

---
Token Usage:
  Input: 1,234 tokens (saved: 8,613 tokens, 87.5%)
  Output: estimated 400-600 tokens
  Model: claude-3.5-sonnet
  Cost: ~$0.01
```

### Check Your Savings

```bash
prism stats
```

**Expected Output**:

```
PRISM Token Usage Statistics
=============================

Session (since 15 minutes ago):
  Queries: 3
  Total tokens used: 3,456
  Total tokens saved: 28,912
  Average savings: 89.3%
  Money saved: ~$0.09

Model distribution:
  sonnet: 2 (66.7%) - $0.01
  haiku:  1 (33.3%) - $0.00

Cache performance:
  Embedding cache hit rate: 82.1%
  Search cache hit rate: 71.4%
  Avg query time: 0.28s

Index information:
  Total chunks: 3,456
  Storage size: 12.4 MB
  Last indexed: 5 minutes ago
```

---

## Common Workflows

### Workflow 1: Daily Development

**Scenario**: Working on a feature, need to understand existing code.

```bash
# Morning - Update index after pulling changes
git pull
prism index

# Throughout the day - Search for relevant code
prism search "user registration flow"
prism search "email validation logic"

# Ask questions about code
prism chat "How do I add a new field to the user model?"

# End of day - Check savings
prism stats
```

### Workflow 2: Code Review

**Scenario**: Reviewing a PR, need to understand changes.

```bash
# Index the PR branch
git checkout feature/new-auth
prism index --force

# Search for changed functionality
prism search "authentication changes" --limit 20

# Ask about impact
prism chat "What are the security implications of these changes?"

# Compare with main branch
git checkout main
prism index --force
prism search "authentication"
```

### Workflow 3: Onboarding to New Codebase

**Scenario**: Joined a new project, need to understand architecture.

```bash
# Index the codebase
prism index

# High-level architecture questions
prism chat "What is the overall architecture of this application?"
prism chat "How are different modules organized?"

# Deep dive into specific areas
prism search "data models"
prism search "API routes"

# Understand patterns
prism chat "What are the common design patterns used here?"

# Track your learning
prism stats --period week
```

### Workflow 4: Debugging

**Scenario**: Investigating a bug, need to find related code.

```bash
# Search for error-related code
prism search "error handling" --limit 30

# Find specific functionality
prism search "user permissions check"

# Ask about potential causes
prism chat "What could cause 'permission denied' in the user module?"

# Exclude test files to focus on production code
prism search "login validation" --exclude "test/**,spec/**"
```

---

## Integration with Claude Code

PRISM works as an MCP (Model Context Protocol) server with Claude Code:

### Enable MCP Integration

```bash
# Check if Claude Code is installed
claude --version

# Install PRISM MCP plugin
prism mcp install
```

### Configure Claude Code

Add to your Claude Code config (`~/.config/claude-code/config.json`):

```json
{
  "mcpServers": {
    "prism": {
      "command": "prism",
      "args": ["mcp", "server"],
      "env": {
        "PRISM_PROJECT": "/path/to/your/project"
      }
    }
  }
}
```

### Use in Claude Code

Now you can use PRISM tools directly in Claude Code:

```bash
claude
# Inside Claude Code session:
# "Use prism_search to find authentication code"
# "Use prism_chat to ask about the payment flow"
```

---

## Troubleshooting

### Problem: "Index not found" Error

**Error Message**:
```
Error: VANTAGE_008: No index found for current directory
```

**Solution**:
```bash
# Create index
prism index

# Or specify index path
prism search "test" --index /path/to/index
```

---

### Problem: Slow Indexing

**Symptoms**: Indexing takes >60 seconds

**Solutions**:

1. **Reduce file size limit**:
```bash
prism index --max-size 0.5  # 500KB instead of 1MB
```

2. **Exclude more directories**:
```bash
prism index --exclude "node_modules/**,dist/**,build/**,coverage/**,.git/**"
```

3. **Use local embeddings** (if Ollama installed):
```bash
prism index --embeddings ollama
```

4. **Increase parallel workers**:
```bash
prism index --workers 8  # Default is 4
```

---

### Problem: No Search Results

**Symptoms**: Search returns 0 results

**Solutions**:

1. **Lower threshold**:
```bash
prism search "query" --threshold 0.5  # Default is 0.7
```

2. **Check index exists**:
```bash
prism stats
```

3. **Rebuild index**:
```bash
prism index --force
```

4. **Verify file types**:
```bash
prism search "query" --extensions .ts,.js,.py
```

---

### Problem: Embedding Generation Failed

**Error Message**:
```
Error: VANTAGE_010: Embedding generation failed
```

**Solutions**:

1. **Check internet connection** (for Cloudflare)
2. **Switch to local Ollama**:
```bash
# Install Ollama first
curl https://ollama.ai/install.sh | sh

# Pull embedding model
ollama pull nomic-embed-text

# Use Ollama for embeddings
prism index --embeddings ollama
```

3. **Check API quota**:
```bash
# View current usage
prism stats --verbose
```

---

### Problem: Chat Not Working

**Error Message**:
```
Error: VANTAGE_008: No API key found
```

**Solutions**:

1. **Set API key**:
```bash
export ANTHROPIC_API_KEY=your-key-here
```

2. **Or add to config**:
```yaml
# ~/.prism/config.yaml
chat:
  apiKey: your-key-here
```

3. **Use local Ollama**:
```bash
# Install and run Ollama
ollama run deepseek-coder-v2

# Use Ollama for chat
prism chat "your question" --model ollama
```

---

### Problem: Out of Memory

**Symptoms**: Process killed during indexing

**Solutions**:

1. **Reduce workers**:
```bash
prism index --workers 2  # Reduce parallel processing
```

2. **Index in batches**:
```bash
# Index src directory only
prism index --path ./src

# Then index other directories
prism index --path ./lib --output .prism/lib.db
```

3. **Increase Node.js memory**:
```bash
export NODE_OPTIONS="--max-old-space-size=4096"  # 4GB
prism index
```

---

## Getting Help

### Command Help

```bash
# General help
prism --help

# Specific command help
prism index --help
prism search --help
prism chat --help
prism stats --help
```

### Verbose Mode

Enable verbose output for debugging:

```bash
prism index --verbose
prism search "test" --verbose
```

### Debug Mode

Set environment variable for extra debugging:

```bash
export PRISM_LOG_LEVEL=debug
prism index
```

### Check Logs

Logs are stored in:
- **Linux/macOS**: `~/.prism/logs/`
- **Windows**: `%APPDATA%\prism\logs\`

```bash
# View recent logs
tail -f ~/.prism/logs/prism.log

# View error logs
cat ~/.prism/logs/error.log
```

### Community Support

- **GitHub Issues**: https://github.com/claudes-friend/prism/issues
- **Discussions**: https://github.com/claudes-friend/prism/discussions
- **Documentation**: https://docs.prism.ai

---

## Next Steps

Now that you have PRISM installed and running:

1. **Integrate with Claude Code**: See [MCP Integration Guide](../integration/mcp-setup.md)
2. **Customize Configuration**: See [Configuration Guide](configuration.md)
3. **Learn Advanced Usage**: See [Usage Guide](usage.md)
4. **Explore Examples**: See [Examples](examples.md)
5. **Read FAQ**: See [FAQ](faq.md)
6. **Understand Architecture**: See [Architecture Docs](../architecture/)

---

## Checklist

- [ ] Installed PRISM globally
- [ ] Verified installation (`prism --version`)
- [ ] Checked System Requirements
- [ ] Initialized PRISM config (`prism init`) - optional
- [ ] Indexed your codebase (`prism index`)
- [ ] Performed first search (`prism search`)
- [ ] Asked first question (`prism chat`)
- [ ] Checked savings (`prism stats`)
- [ ] Integrated with Claude Code (optional)

---

**Document Status**: Complete (Consolidated from user-guide)
**Last Updated**: 2026-01-14
**Version**: 0.1.0
