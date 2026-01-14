# PRISM CLI Quick Reference

## Installation & Setup

```bash
# Install dependencies
npm install

# Index your codebase
prism index ./src
```

---

## Search Command

### Basic Syntax
```bash
prism search <query> [options]
```

### Common Options
| Option | Description | Example |
|--------|-------------|---------|
| `--limit <n>` | Max results | `--limit 20` |
| `--min-score <x>` | Min relevance (0-1) | `--min-score 0.7` |
| `--show-code` | Show code snippets | `--show-code` |
| `--lang <lang>` | Filter by language | `--lang typescript` |
| `--format json` | JSON output | `--format json` |

### Examples
```bash
# Basic search
prism search "authentication"

# With code
prism search "database" --show-code

# Filter by language
prism search "api" --lang typescript

# High relevance only
prism search "login" --min-score 0.7

# JSON output
prism search "validation" --format json
```

---

## Chat Command

### Basic Syntax
```bash
prism chat [options]
```

### Options
| Option | Description | Example |
|--------|-------------|---------|
| `--history` | Save/load history | `--history` |
| `--model <name>` | Specific model | `--model claude-3-opus` |

### Chat Commands
| Command | Action |
|---------|--------|
| `quit` or `exit` | Exit chat |
| `clear` | Clear screen |
| `history` | Show history |
| `help` | Show help |

### Examples
```bash
# Start chat
prism chat

# With history
prism chat --history

# Example questions
> How does authentication work?
> Where is the error handling?
> Show me the database connection code
```

---

## Output Formats

### Text Output (Default)
```
1. src/auth.ts:25-40 (85.3% match)
   Language: typescript
   ───────────────────────────────────────
    25 │ export function authenticate() {
    26 │   // ...
```

### JSON Output
```json
{
  "count": 2,
  "results": [
    {
      "file": "src/auth.ts",
      "score": 0.853,
      "language": "typescript"
    }
  ]
}
```

---

## Common Workflows

### Find and Understand Code
```bash
# Search
prism search "authentication" --show-code

# Ask questions
prism chat
> How does authenticateUser work?
```

### Code Review
```bash
# Find TODOs
prism search "TODO" --show-code --limit 50

# Explore areas
prism chat
> What needs improvement?
```

### Debug Issues
```bash
# Find error handling
prism search "error" --show-code

# Understand flow
prism chat
> How are errors propagated?
```

---

## Troubleshooting

### "No index found"
```bash
# Solution: Index your code
prism index ./src
```

### "No results found"
```bash
# Solutions:
# Lower threshold
prism search "query" --min-score 0.3

# Increase limit
prism search "query" --limit 50

# Try different terms
prism search "login"  # instead of "authenticate"
```

### Slow performance
```bash
# Use filters
prism search "api" --lang typescript

# Reduce context
prism search "query" --show-code --context-lines 3
```

---

## Tips & Tricks

### Better Search Results
- Use specific terms: "authenticate" vs "auth"
- Try variations: "login", "signin", "authentication"
- Use function/class names from your code
- Filter by language to narrow results

### Better Chat Questions
- Be specific: "How does the authenticateUser function work?"
- Use context: "What errors can authenticateUser throw?"
- Follow up: "What parameters does it take?"

### Automation
```bash
# Count results by language
prism search "api" --format json | jq '.results[] | .language' | sort | uniq -c

# Extract file paths
prism search "database" --format json | jq -r '.results[].file'

# Find high-relevance results
prism search "auth" --format json | jq '.results[] | select(.score > 0.8)'
```

---

## Configuration

Config file: `~/.prism/config.yaml`

```yaml
vectorDB:
  type: sqlite
  path: ~/.prism/vector.db

modelRouter:
  preferLocal: false
  apiKey: ${ANTHROPIC_API_KEY}
```

---

## More Information

- Full documentation: `/home/eileen/projects/claudes-friend/docs/usage/cli-commands.md`
- Implementation summary: `/home/eileen/projects/claudes-friend/docs/implementation-summary.md`
- Tests: `/home/eileen/projects/claudes-friend/tests/unit/cli/`
