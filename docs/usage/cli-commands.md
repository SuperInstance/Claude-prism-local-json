# PRISM CLI Commands

## Overview

PRISM provides two main commands for interacting with your indexed codebase:

- **`prism search`** - Semantic code search with relevance ranking
- **`prism chat`** - Interactive Q&A about your code

Both commands work on an indexed codebase created with `prism index`.

---

## `prism search` - Semantic Code Search

### Basic Usage

```bash
prism search "authentication"
```

Search your indexed codebase using natural language queries or code terms.

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--limit <number>` | `-l` | Maximum number of results | 10 |
| `--min-score <score>` | `-m` | Minimum relevance score (0-1) | 0.0 |
| `--format <format>` | `-f` | Output format (text\|json) | text |
| `--verbose` | `-v` | Show detailed information | false |
| `--show-code` | | Show code snippets in results | false |
| `--context-lines <number>` | | Number of context lines to show | 5 |
| `--lang <language>` | | Filter by programming language | - |
| `--path <pattern>` | | Filter by file path pattern | - |

### Examples

**Basic search:**
```bash
prism search "authentication"
```

**More results:**
```bash
prism search "database" --limit 20
```

**Higher relevance threshold:**
```bash
prism search "login" --min-score 0.7
```

**Show code snippets:**
```bash
prism search "error handling" --show-code
```

**Filter by language:**
```bash
prism search "user" --lang typescript
```

**Filter by path:**
```bash
prism search "api" --path src/api
```

**JSON output for scripting:**
```bash
prism search "validation" --format json | jq '.results[] | {file, score}'
```

**More context lines:**
```bash
prism search "configuration" --show-code --context-lines 15
```

### Output Format

**Text mode** (default):
```
1. src/auth/login.ts:25-40 (85.3% match)
   Language: typescript
   ────────────────────────────────────────────────────────────
     25 │ export function authenticateUser(credentials: Credentials) {
     26 │   const user = await database.users.findByEmail(credentials.email);
     27 │   if (!user) {
     28 │     throw new AuthenticationError('Invalid credentials');
     29 │   }
     ...

──────────────────────────────────────────────────────────────────────
Found 3 results for "authentication"
Search completed in 125ms
Average relevance: 72.5%
```

**JSON mode:**
```json
{
  "count": 2,
  "results": [
    {
      "id": "chunk_abc123",
      "file": "src/auth/login.ts",
      "startLine": 25,
      "endLine": 40,
      "score": 0.853,
      "language": "typescript",
      "text": "export function authenticateUser...",
      "symbols": ["authenticateUser"]
    }
  ]
}
```

### Search Tips

- **Use specific terms**: Function names, class names, or specific concepts work better than generic terms
- **Try variations**: If "authenticate" doesn't work, try "login", "auth", "authentication flow"
- **Lower the threshold**: Use `--min-score 0.3` to see more results
- **Filter by language**: Use `--lang` to narrow down to specific languages
- **Use code snippets**: Add `--show-code` to see the actual code

---

## `prism chat` - Interactive Code Q&A

### Basic Usage

```bash
prism chat
```

Start an interactive chat session to ask questions about your code.

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--model <model>` | Model to use for responses | From config |
| `--max-tokens <number>` | Maximum tokens in response | 2000 |
| `--temperature <temp>` | Response temperature (0-1) | 0.7 |
| `--verbose` | Show detailed information | false |
| `--history` | Load/save conversation history | false |

### Examples

**Start chat with defaults:**
```bash
prism chat
```

**Start with conversation history:**
```bash
prism chat --history
```

**Use specific model:**
```bash
prism chat --model claude-3-opus
```

**Lower temperature for more focused responses:**
```bash
prism chat --temperature 0.3
```

### Chat Commands

Once in chat mode, you can use these commands:

| Command | Description |
|---------|-------------|
| `quit`, `exit`, `q` | Exit chat mode |
| `clear`, `cls` | Clear the screen |
| `history` | Show conversation history |
| `help`, `?` | Show help message |

### Example Questions

```
❯ How does the authentication system work?

Assistant:
──────────────────────────────────────────────────────────────────────
I found 2 relevant code sections:

1. src/auth/login.ts:25-40
   Symbols: authenticateUser

2. src/auth/validator.ts:10-20
   Symbols: validateCredentials

──────────────────────────────────────────────────────────────────────

Based on the code, here's what I can tell you about "How does the authentication system work?":

The codebase contains relevant sections that may help answer your question.
I found references to: authenticateUser, validateCredentials.

Note: This is a simulated response. The full RAG implementation with actual LLM
integration will provide detailed explanations based on the retrieved code context.
```

### Conversation History

Enable history persistence:

```bash
prism chat --history
```

History is saved to `~/.prism/chat-history.json` and automatically loaded on next start.

### Multi-turn Conversations

```
❯ What is the authentication flow?

[Assistant responds with context about authentication]

❯ What parameters does it take?

[Assistant remembers previous question and provides specific parameters]
```

---

## Common Workflows

### Workflow 1: Find and Understand Code

1. **Search for relevant code:**
   ```bash
   prism search "authentication" --show-code
   ```

2. **Ask detailed questions:**
   ```bash
   prism chat
   > How does the authenticateUser function work?
   > What errors can it throw?
   ```

### Workflow 2: Code Review

1. **Search for specific patterns:**
   ```bash
   prism search "TODO" --show-code --limit 50
   ```

2. **Get explanations:**
   ```bash
   prism chat
   > What are the main areas that need work?
   ```

### Workflow 3: Onboarding

1. **Search for main entry points:**
   ```bash
   prism search "main entry point" --lang typescript
   ```

2. **Explore architecture:**
   ```bash
   prism chat
   > What is the overall architecture?
   > How do the components interact?
   ```

### Workflow 4: Bug Investigation

1. **Search for error-related code:**
   ```bash
   prism search "error handling" --show-code
   ```

2. **Understand error flows:**
   ```bash
   prism chat
   > How are errors handled in the authentication flow?
   ```

---

## Integration with Other Tools

### Pipe to Other Tools

```bash
# Count results by language
prism search "api" --format json | jq '.results[] | .language' | sort | uniq -c

# Extract file paths
prism search "database" --format json | jq -r '.results[].file'

# Find high-relevance results
prism search "auth" --format json | jq '.results[] | select(.score > 0.8)'
```

### Use in Scripts

```bash
#!/bin/bash
# Find all TypeScript files related to authentication
FILES=$(prism search "authenticate" --format json --lang typescript | jq -r '.results[].file')

echo "Found files:"
echo "$FILES"
```

### Combine with grep

```bash
# Search for files containing specific patterns
prism search "validation" --format json | jq -r '.results[].file' | xargs grep -l "throw"
```

---

## Performance Tips

1. **Use appropriate limits:**
   - Default: 10 results (fast)
   - Research: 50-100 results (slower)
   - Comprehensive: 200+ results (slowest)

2. **Filter early:**
   ```bash
   # Fast: Filter by language first
   prism search "user" --lang typescript

   # Slower: Get all results then filter
   prism search "user" --limit 100 | grep typescript
   ```

3. **Use JSON for batch processing:**
   ```bash
   # Faster than parsing text output
   prism search "api" --format json | jq '.results'
   ```

---

## Troubleshooting

### "No index found" Error

**Problem:**
```
No index found at: /home/user/.prism/vector.db

To create an index, run:
  prism index <path>
```

**Solution:**
```bash
prism index ./src
```

### "Index is empty" Error

**Problem:**
```
No chunks in the index.
```

**Solution:**
Re-index with force flag:
```bash
prism index ./src --force
```

### No Results Found

**Problem:**
```
No results found.
```

**Solutions:**
1. Lower the minimum score:
   ```bash
   prism search "query" --min-score 0.3
   ```

2. Increase the limit:
   ```bash
   prism search "query" --limit 50
   ```

3. Try different terms:
   ```bash
   prism search "login"  # instead of "authenticate"
   ```

4. Check if code is indexed:
   ```bash
   prism stats  # shows chunk count
   ```

### Slow Search Performance

**Solutions:**
1. Use filters to reduce search space:
   ```bash
   prism search "api" --lang typescript
   ```

2. Reduce context lines:
   ```bash
   prism search "query" --show-code --context-lines 3
   ```

3. Use JSON output (faster processing):
   ```bash
   prism search "query" --format json
   ```

---

## Advanced Usage

### Batch Queries

Create a file with queries (`queries.txt`):
```
authentication
database connection
error handling
API endpoints
```

Process all queries:
```bash
while read query; do
  echo "=== Searching for: $query ==="
  prism search "$query" --limit 5
  echo ""
done < queries.txt
```

### Automated Documentation

Generate documentation for key components:
```bash
#!/bin/bash
for component in "auth" "database" "api" "utils"; do
  echo "# $component"
  prism search "$component" --show-code --limit 3
  echo ""
done > docs/components.md
```

### Code Metrics

Count code by language:
```bash
prism search "." --format json | jq '.results | group_by(.language) | map({language: .[0].language, count: length})'
```

---

## Configuration

Configure default behavior in `~/.prism/config.yaml`:

```yaml
vectorDB:
  type: sqlite
  path: ~/.prism/vector.db

modelRouter:
  preferLocal: false
  apiKey: ${ANTHROPIC_API_KEY}
```

---

## Next Steps

- Read [Indexing Guide](./indexing.md) for creating indexes
- Read [Architecture](../architecture/overview.md) for system design
- Read [API Reference](../api/cli.md) for complete API documentation
