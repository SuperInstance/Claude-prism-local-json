# PRISM Integration Guide

**Date**: 2026-01-14
**Status**: Complete
**Component**: Integration Module

## Overview

PRISM can be integrated with various development tools and workflows to enhance your coding experience. This guide covers all major integration options, from IDEs to CI/CD pipelines.

## Prerequisites

Before integrating PRISM, ensure you have:

1. **PRISM Installed**: `npm install -g @claudes-friend/prism`
2. **Codebase Indexed**: Run `prism index` in your project
3. **Basic Configuration**: Set up `~/.prism/config.yaml` (see [Configuration Guide](/docs/user-guide/02-configuration.md))
4. **API Keys**: For cloud services like Cloudflare AI and Anthropic

---

## 1. IDE Integration

### 1.1 VS Code Integration

#### Extension Integration

PRISM can be integrated with VS Code through terminal integration or custom extensions.

**Setup Steps**:

1. **Install PRISM**: Globally install PRISM as above
2. **Configure VS Code Settings** (`.vscode/settings.json`):

```json
{
  "terminal.integrated.defaultProfile.linux": "bash",
  "terminal.integrated.defaultProfile.osx": "bash",
  "terminal.integrated.defaultProfile.windows": "Command Prompt",
  "files.associations": {
    "*.prisma": "typescript"
  }
}
```

3. **Create VS Code Tasks** (`.vscode/tasks.json`):

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "PRISM: Index Codebase",
      "type": "shell",
      "command": "prism index",
      "group": "build",
      "problemMatcher": [],
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "PRISM: Search Code",
      "type": "shell",
      "command": "prism search",
      "args": ["${input:prismQuery}"],
      "group": "build",
      "problemMatcher": [],
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "options": {
        "env": {
          "PRISM_INPUT": "${input:prismQuery}"
        }
      }
    }
  ],
  "inputs": [
    {
      "id": "prismQuery",
      "type": "promptString",
      "description": "Enter search query for PRISM"
    }
  ]
}
```

4. **VS Code Snippets** for quick access:

```json
{
  "Prism Search": {
    "prefix": "prism-search",
    "body": [
      "prism search \"$1\" --limit $2"
    ],
    "description": "Quick PRISM search with query and limit"
  },
  "Prism Index": {
    "prefix": "prism-index",
    "body": [
      "prism index $1"
    ],
    "description": "Index PRISM with options"
  }
}
```

#### Terminal Integration

PRISM works seamlessly in VS Code's integrated terminal:

```bash
# Quick search
prism search "authentication flow" --limit 5

# Context-aware chat
prism chat "Explain this database schema" --budget 100000

# Post-commit reindex
git commit -m "feat: add user authentication"
prism index --exclude "node_modules/**"
```

#### VS Code Extension Example

If you want to create a custom VS Code extension:

```typescript
// extension.ts
import * as vscode from 'vscode';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('prism.searchInEditor', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const selection = editor.selection;
        const query = selection.isEmpty
            ? "this function"
            : editor.document.getText(selection);

        vscode.window.showInformationMessage(`Searching PRISM for: ${query}`);
        exec(`prism search "${query}" --format json`, (error, stdout) => {
            if (error) {
                vscode.window.showErrorMessage(`PRISM Error: ${error.message}`);
                return;
            }
            // Display results in output panel
            vscode.window.showInformationMessage(`Found results for: ${query}`);
        });
    });

    context.subscriptions.push(disposable);
}
```

### 1.2 JetBrains/IntelliJ Integration

#### Terminal Integration

JetBrains IDEs have excellent terminal support for PRISM:

1. **Open Terminal**: View → Tool Windows → Terminal
2. **Aliases** (add to `~/.zshrc` or `~/.bashrc`):

```bash
# PRISM aliases
alias ps='prism search'
alias pc='prism chat'
alias pi='prism index --force'
alias stats='prism stats'

# Quick search with current file context
alias psc='prism search "in this file"'
```

#### Run Configurations

Create custom run configurations:

```xml
<!-- .idea/runConfigurations/prism_search.xml -->
<component name="ProjectRunConfigurationManager">
    <configuration default="false" name="PRISM Search" type="ShConfigurationType">
        <option name="SCRIPT_TEXT" value="prism search $ProjectFileDir$ &quot;$SelectQuery$&quot;" />
        <option name="INTERPRETER_OPTIONS" value="" />
        <option name="INTERPRETER_PATH" value="$USER_HOME$/bin/prism" />
        <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
        <method v="2" />
    </configuration>
</component>
```

#### Code Completion Templates

```
Prism Search: prism search "${query}" --limit ${limit}
Prism Context: prism chat "Explain this function: ${functionName}"
Prism Index: prism index --path "${PROJECT_DIR}" --extensions ${ext}
```

### 1.3 Neovim/Vim Integration

#### Terminal Integration

PRISM works perfectly in Neovim/Vim terminal:

```vim
" ~/.vimrc
" PRISM mappings
nnoremap <leader>ps :!prism search <cword><CR>
nnoremap <leader>pc :!prism chat "What does this <cword> function do?"<CR>
nnoremap <leader>pi :!prism index --exclude node_modules/**<CR>

" Search visual selection
vnoremap <leader>ps :'<,'>!prism search <c-r><c-r><CR>

" Insert mode autocomplete
inoremap <C-space> <C-x><C-u>

" PRISM snippet functions
function! PrismSearch(query)
    execute '!prism search "' . a:query . '" --limit 10 --format json'
endfunction

function! PrismChat(query)
    execute '!prism chat "' . a:query . '" --format json'
endfunction
```

#### Lua Configuration (Neovim):

```lua
-- ~/.config/nvim/init.lua
local function prism_search(query)
    vim.fn.jobstart('prism search "' .. query .. '" --limit 10 --format json', {
        on_stdout = function(_, data)
            -- Display results in quickfix
            local results = {}
            for _, line in ipairs(data) do
                table.insert(results, { text = line })
            end
            vim.fn.setqflist(results, 'r')
            vim.cmd('copen')
        end
    })
end

vim.keymap.set('n', '<leader>ps', function()
    vim.ui.input({ prompt = 'PRISM Search: ' }, function(query)
        if query then prism_search(query) end
    end)
end)

vim.keymap.set('v', '<leader>ps', function()
    local query = vim.fn.getreg('v')
    prism_search(query)
end)
```

#### Vim Plugin Structure

```vim
" plugin/prism.vim
if exists('g:loaded_prism')
    finish
endif
let g:loaded_prism = 1

function! s:PrismSearch(query, ...) abort
    let options = a:0 > 0 ? a:1 : {}
    let limit = get(options, 'limit', 10)
    let format = get(options, 'format', 'text')
    let cmd = 'prism search "' . a:query . '" --limit ' . limit . ' --format ' . format
    execute '!' . cmd
endfunction

function! s:PrismChat(query) abort
    execute '!prism chat "' . a:query . '"'
endfunction

command! -nargs=+ PrSearch call s:PrismSearch(<q-args>)
command! -nargs=1 PrChat call s:PrismChat(<q-args>)
```

---

## 2. CI/CD Integration

### 2.1 GitHub Actions Integration

#### Pre-commit Hook

Add to your `.github/workflows/prism-check.yml`:

```yaml
name: PRISM Code Search Check
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  prism-check:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install PRISM
      run: npm install -g @claudes-friend/prism

    - name: Cache PRISM Index
      uses: actions/cache@v4
      with:
        path: |
          .prism/vectors.db
          .prism/cache/
        key: ${{ runner.os }}-prism-index-${{ hashFiles('**/*.{ts,js,py,go,rs,java}') }}
        restore-keys: |
          ${{ runner.os }}-prism-index-

    - name: Index Codebase
      run: |
        prism index --exclude "node_modules/**,dist/**,build/**,.git/**,coverage/**" \
                   --extensions .ts,.js,.tsx,.jsx,.py,.go,.rs,.java \
                   --workers 4

    - name: Check for Similar Code
      run: |
        if prism search "duplicate code or suspicious patterns" --threshold 0.8 --limit 5 | grep -q "Found"; then
          echo "::warning::Potential code duplication detected"
          prism search "duplicate code or suspicious patterns" --threshold 0.8
          exit 1
        fi

    - name: Document Coverage Check
      run: |
        echo "Checking documentation coverage..."
        prism search "TODO FIXME HACK" --limit 10
        prism search "undefined function" --limit 5
```

#### Post-Deploy Hook

```yaml
name: PRISM Post-Deploy Update
on:
  deployment_status:
    types: [success]

jobs:
  update-prism-index:
    runs-on: ubuntu-latest
    steps:
    - name: Notify PRISM of deployment
      run: |
        curl -X POST ${{ secrets.PRISM_WEBHOOK_URL }} \
          -H "Content-Type: application/json" \
          -d '{
            "event": "deployment",
            "environment": "${{ github.event.deployment_status.environment }}",
            "commit": "${{ github.sha }}",
            "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
          }'
```

### 2.2 GitLab CI Integration

#### `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - deploy
  - post-deploy

prism_index:
  stage: test
  before_script:
    - npm install -g @claudes-friend/prism
    - export NODE_OPTIONS="--max-old-space-size=4096"
  script:
    - prism index --exclude "node_modules/**,dist/**,build/**,.git/**" \
                 --extensions .ts,.js,.tsx,.jsx,.py,.go \
                 --format json > index-report.json
    - prism stats --format json --period today > stats-report.json
  cache:
    paths:
      - .prism/vectors.db
      - .prism/cache/
    key: "$CI_JOB_NAME-$CI_COMMIT_SHA"
  artifacts:
    paths:
      - index-report.json
      - stats-report.json
    reports:
      junit: index-report.json

prism_security:
  stage: test
  before_script:
    - npm install -g @claudes-friend/prism
  script:
    - echo "Checking for security patterns..."
    - prism search "hardcoded secret password api_key" --threshold 0.7 --limit 10
    - prism search "sql injection vulnerable" --threshold 0.8 --limit 5
    - prism search "cross site scripting xss" --threshold 0.8 --limit 5
  allow_failure: true

prism_documentation:
  stage: test
  script:
    - prism search "TODO FIXME HACK" --limit 20
    - prism chat "What is the API documentation structure?" --budget 80000
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: docs/coverage.xml

prism_notify:
  stage: post-deploy
  script:
    - |
      curl -X POST $PRISM_WEBHOOK_URL \
        -H "Content-Type: application/json" \
        -d '{
          "event": "deployment",
          "environment": "production",
          "commit": "$CI_COMMIT_SHA",
          "stats": {
            "totalQueries": 10,
            "tokensSaved": 150000,
            "costSaved": 0.75
          }
        }'
  when: on_success
  only:
    - main
```

### 2.3 Custom CI/CD Pipeline Examples

#### Jenkins Pipeline

```groovy
pipeline {
    agent any

    environment {
        PRISM_CONFIG = credentials('prism-config')
    }

    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g @claudes-friend/prism'
            }
        }

        stage('Index') {
            steps {
                sh '''
                    prism index \
                      --exclude "node_modules/**,dist/**,build/**,.git/**" \
                      --extensions .ts,.js,.py,.go \
                      --workers 4 \
                      --verbose
                '''
            }
        }

        stage('Code Quality') {
            steps {
                script {
                    def result = sh(
                        script: 'prism search "code quality issues" --threshold 0.7 --format json',
                        returnStdout: true
                    )
                    if (result.contains("Found")) {
                        currentBuild.result = 'UNSTABLE'
                }
            }
        }

        stage('Documentation Check') {
            steps {
                sh 'prism chat "Generate documentation for this module" --budget 50000'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: '**/*.db', fingerprint: true
            sh 'prism stats --format json'
        }
        success {
            sh 'echo "PRISM integration completed successfully"'
        }
    }
}
```

#### Azure DevOps Pipeline

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include:
    - main
    - develop

pool:
  vmImage: 'ubuntu-latest'

variables:
  prism.extensions: '.ts,.js,.tsx,.jsx,.py,.go,.rs,.java'
  prism.exclude: 'node_modules/**,dist/**,build/**,.git/**,coverage/**'

steps:
- task: NodeTool@0
  inputs:
    versionSpec: '18.x'
  displayName: 'Install Node.js'

- script: npm install -g @claudes-friend/prism
  displayName: 'Install PRISM'

- script: |
    prism index \
      --exclude "$(prism.exclude)" \
      --extensions "$(prism.extensions)" \
      --workers 4 \
      --format json > index-report.json
  displayName: 'Index Codebase'

- script: |
    echo "## PRISM Analysis" >> $(Build.ArtifactStagingDirectory)/prism-report.md
    echo "### Search Results" >> $(Build.ArtifactStagingDirectory)/prism-report.md
    prism search "API endpoints" --limit 10 >> $(Build.ArtifactStagingDirectory)/prism-report.md
    echo "" >> $(Build.ArtifactStagingDirectory)/prism-report.md
    echo "### Token Savings" >> $(Build.ArtifactStagingDirectory)/prism-report.md
    prism stats --period today >> $(Build.ArtifactStagingDirectory)/prism-report.md
  displayName: 'Generate PRISM Report'

- task: PublishBuildArtifacts@1
  inputs:
    pathtoPublish: '$(Build.ArtifactStagingDirectory)/prism-report.md'
    artifactName: 'prism-report'
```

---

## 3. Git Hooks

### 3.1 Pre-commit Hooks

#### Using Husky + Lint-staged

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,js,tsx,jsx}": [
      "prism search 'lint error patterns' --limit 5",
      "eslint --fix"
    ],
    "*.{py}": [
      "prism search 'python style issues' --limit 3",
      "black --quiet"
    ]
  }
}
```

#### Manual `.git/hooks/pre-commit`

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|js|tsx|jsx|py|go|rs|java)$')

if [ -z "$STAGED_FILES" ]; then
    echo "No staged code files to check with PRISM"
    exit 0
fi

# Check for potential issues
echo "Running PRISM pre-commit checks..."

# Search for problematic patterns
prism search "hardcoded secret api_key password" --limit 3 --threshold 0.7
if [ $? -ne 0 ]; then
    echo "⚠️  Potential hardcoded secrets found!"
fi

prism search "TODO FIXME HACK" --limit 10
if [ $? -ne 0 ]; then
    echo "⚠️  Found TODO/FIXME comments that need attention"
fi

# Check code style
prism search "inconsistent naming convention" --limit 5
if [ $? -ne 0 ]; then
    echo "⚠️  Potential naming convention issues"
fi

echo "✅ PRISM pre-commit checks complete"
exit 0
```

### 3.2 Post-commit Hooks

#### Update Index Automatically

```bash
#!/bin/bash
# .git/hooks/post-commit

# Don't run on merge commits
if git rev-parse -q --verify MERGE_HEAD; then
    exit 0
fi

echo "Updating PRISM index after commit..."

# Incremental index (faster than full reindex)
prism index \
  --exclude "node_modules/**,dist/**,build/**,.git/**" \
  --workers 4 \
  --verbose

# Optional: Generate commit summary with PRISM
prism chat "Summarize the changes in this commit" --budget 30000

echo "✅ PRISM index updated"
```

#### Post-commit Quality Check

```bash
#!/bin/bash
# .git/hooks/post-commit

# Run quality checks after commit
echo "Running post-commit quality checks..."

# Get recent commit
COMMIT_MSG=$(git log -1 --pretty=format:"%s")

# Check if commit mentions "refactor" or "cleanup"
if echo "$COMMIT_MSG" | grep -q -E "(refactor|cleanup|optimize)"; then
    echo "🔍 Running additional checks for refactoring commit..."
    prism search "similar functionality that could be consolidated" --limit 10
fi

# Check test coverage if applicable
prism search "test coverage missing" --limit 5
prism search "integration test needed" --limit 5

echo "✅ Post-commit checks complete"
```

### 3.3 Installation Instructions

#### Global Git Hooks Installation

```bash
#!/bin/bash
# install-git-hooks.sh

#!/bin/bash

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Make hooks executable
chmod +x .git/hooks/*

# Copy pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# PRISM Pre-commit Hook

# Add your pre-commit logic here
echo "Running PRISM pre-commit checks..."

# Example: Check for specific patterns
prism search "hardcoded credentials" --limit 3
prism search "security vulnerabilities" --limit 3

echo "✅ PRISM pre-commit complete"
exit 0
EOF

# Copy post-commit hook
cat > .git/hooks/post-commit << 'EOF'
#!/bin/bash
# PRISM Post-commit Hook

echo "Updating PRISM index..."

# Optional: Update index after commit
prism index --exclude "node_modules/**,.git/**" > /dev/null 2>&1

echo "✅ PRISM post-commit complete"
EOF

chmod +x .git/hooks/pre-commit
chmod +x .git/hooks/post-commit

echo "✅ Git hooks installed successfully"
```

#### Per-Project Hook Installation

```bash
#!/bin/bash
# .githooks/install.sh

#!/bin/bash

echo "Installing PRISM git hooks..."

# Create symlinks
ln -sf ../../scripts/prism-pre-commit.sh .git/hooks/pre-commit
ln -sf ../../scripts/prism-post-commit.sh .git/hooks/post-commit

# Make executable
chmod +x .git/hooks/pre-commit
chmod +x .git/hooks/post-commit

echo "✅ PRISM hooks installed for this project"
```

---

## 4. Claude Desktop Integration

### 4.1 MCP Server Setup

PRISM includes a built-in MCP server for seamless Claude Desktop integration.

#### Basic Configuration

```json
// ~/.claude/config.json
{
  "mcpServers": {
    "prism": {
      "command": "prism",
      "args": ["mcp", "--db", "./.prism/vectors.db"],
      "env": {
        "PRISM_CONFIG": "~/.prism/config.yaml"
      }
    }
  }
}
```

#### Advanced Configuration

```json
// ~/.claude/config.json
{
  "mcpServers": {
    "prism": {
      "command": "prism",
      "args": [
        "mcp",
        "--db", "./.prism/vectors.db",
        "--max-results", "15",
        "--min-score", "0.6",
        "--verbose"
      ],
      "env": {
        "PRISM_CONFIG": "~/.prism/config.yaml",
        "PRISM_LOG_LEVEL": "info"
      }
    },
    "prism-cloud": {
      "command": "prism",
      "args": [
        "mcp",
        "--db", "/cloud/storage/prism.db",
        "--embeddings", "cloudflare",
        "--model", "claude-3.5-sonnet"
      ],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
        "CLOUDFLARE_ACCOUNT_ID": "${CLOUDFLARE_ACCOUNT_ID}"
      }
    }
  }
}
```

### 4.2 Configuration Examples

#### Multi-project Setup

```json
// ~/.claude/config.json
{
  "mcpServers": {
    "prism-current": {
      "command": "prism",
      "args": ["mcp", "--db", "./.prism/vectors.db"],
      "env": {
        "PRISM_CONFIG": "~/.prism/config.yaml"
      }
    },
    "prism-work": {
      "command": "prism",
      "args": ["mcp", "--db", "/projects/work/.prism/vectors.db"],
      "env": {
        "PRISM_CONFIG": "/projects/work/.prism/config.yaml"
      }
    },
    "prism-personal": {
      "command": "prism",
      "args": ["mcp", "--db", "/projects/personal/.prism/vectors.db"],
      "env": {
        "PRISM_CONFIG": "/projects/personal/.prism/config.yaml"
      }
    }
  }
}
```

#### Development Setup

```json
// ~/.claude/config.json
{
  "mcpServers": {
    "prism-dev": {
      "command": "prism",
      "args": [
        "mcp",
        "--db", "./.prism/vectors.db",
        "--embeddings", "ollama",
        "--model", "nomic-embed-text",
        "--max-results", "20"
      ],
      "env": {
        "PRISM_CONFIG": "~/.prism/config.dev.yaml"
      }
    }
  }
}
```

#### Production Setup

```json
// ~/.claude/config.json
{
  "mcpServers": {
    "prism-prod": {
      "command": "prism",
      "args": [
        "mcp",
        "--db", "/var/lib/prism/prod.db",
        "--embeddings", "cloudflare",
        "--model", "bge-small-en-v1.5",
        "--cache-enabled", "true",
        "--cache-ttl", "3600"
      ],
      "env": {
        "PRISM_CONFIG": "/etc/prism/config.prod.yaml",
        "PRISM_API_KEY": "${PRISM_API_KEY}"
      }
    }
  }
}
```

### 4.3 Workflow Examples

#### Code Understanding Workflow

```
You: I need to understand how the authentication system works in this project.

Claude: I'll help you understand the authentication system using PRISM.
[search_repo tool called with "authentication system"]

Found 8 results:
- ./src/auth/login.ts (score: 0.94)
- ./src/auth/middleware.ts (score: 0.91)
- ./src/auth/validators.ts (score: 0.87)
- ./src/auth/utils.ts (score: 0.82)

Let me get the main authentication file:
[get_context tool called with "./src/auth/login.ts"]

The authentication system follows this flow:
1. User authentication via login.ts with JWT token generation
2. Request validation through middleware.ts
3. Input validation in validators.ts
4. Utility functions in utils.ts

Would you like me to dive deeper into any specific component?
```

#### Code Review Workflow

```
You: Can you review this pull request? I need to understand the changes.

Claude: I'll help review the PR changes using PRISM to understand the context.

[search_repo tool called with "user profile changes"]

Found 15 results:
- ./src/components/UserProfile.tsx (score: 0.95)
- ./src/services/userService.ts (score: 0.88)
- ./src/hooks/useUser.ts (score: 0.83)

Let me get the current changes:
[get_context tool called with "./src/components/UserProfile.tsx"]

Based on the code, this PR:
� Adds profile picture upload functionality
� Updates user validation rules
� Implements error handling for API failures
⚠️  Missing tests for new functionality
⚠️  Consider adding accessibility improvements

The changes look good overall. Would you like me to check for any specific concerns?
```

#### Debugging Workflow

```
You: I'm getting a "permission denied" error when trying to access a resource.

Claude: Let me search for permission-related code to help debug this.

[search_repo tool called with "permission denied access control"]

Found 12 results:
- ./src/auth/permissions.ts (score: 0.93)
- ./src/middleware/auth.ts (score: 0.89)
- ./src/utils/checkAccess.ts (score: 0.85)

[explain_usage tool called with "checkPermissions"]

The permission system works as follows:
1. checkPermissions function validates user roles
2. middleware/auth.ts enforces access control
3. permissions.ts defines role hierarchy

The error likely occurs when:
- User doesn't have required role
- Resource is not accessible to user's role
- Token validation fails

Would you like me to check the specific permission logic for your resource?
```

### 4.4 Advanced MCP Usage

#### Custom Tool Integration

```typescript
// custom-prism-tools.ts
import { PrismMCPServer } from '@claudes-friend/prism/mcp';

class EnhancedPrismMCPServer extends PrismMCPServer {
  protected async executeTool(name: string, args: any): Promise<string> {
    if (name === 'analyze_security') {
      return await this.analyzeSecurityPatterns(args);
    }
    if (name === 'generate_docs') {
      return await this.generateDocumentation(args);
    }
    return await super.executeTool(name, args);
  }

  private async analyzeSecurityPatterns(args: any): Promise<string> {
    const results = await Promise.all([
      this.search("hardcoded credentials", 0.8),
      this.search("sql injection", 0.8),
      this.search("xss vulnerable", 0.8)
    ]);
    return this.formatSecurityResults(results);
  }

  private async generateDocumentation(args: any): Promise<string> {
    const moduleInfo = await this.getContext(args.filePath);
    return this.generateMarkdownDocs(moduleInfo);
  }
}
```

#### Multi-Database Setup

```json
// ~/.claude/config.json
{
  "mcpServers": {
    "prism-main": {
      "command": "prism",
      "args": ["mcp", "--db", "main.db", "--name", "main-project"],
      "env": { "PRISM_DB_NAME": "main" }
    },
    "prism-legacy": {
      "command": "prism",
      "args": ["mcp", "--db", "legacy.db", "--name", "legacy-code"],
      "env": { "PRISM_DB_NAME": "legacy" }
    }
  }
}
```

---

## 5. API Integration

### 5.1 Programmatic Usage

#### Basic Node.js Integration

```typescript
// src/prism-integration.ts
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export class PrismIntegration {
  private dbPath: string;

  constructor(dbPath: string = './.prism/vectors.db') {
    this.dbPath = dbPath;
  }

  async search(query: string, options: {
    limit?: number;
    threshold?: number;
    extensions?: string[];
    exclude?: string[];
  } = {}): Promise<any[]> {
    const cmd = `prism search "${query}" --index "${this.dbPath}" --format json` +
      (options.limit ? ` --limit ${options.limit}` : '') +
      (options.threshold ? ` --threshold ${options.threshold}` : '') +
      (options.extensions ? ` --extensions ${options.extensions.join(',')}` : '') +
      (options.exclude ? ` --exclude ${options.exclude.join(',')}` : '');

    const { stdout } = await execAsync(cmd);
    return JSON.parse(stdout).results;
  }

  async askQuestion(question: string, options: {
    budget?: number;
    model?: string;
    history?: boolean;
  } = {}): Promise<any> {
    const cmd = `prism chat "${question}" --index "${this.dbPath}" --format json` +
      (options.budget ? ` --budget ${options.budget}` : '') +
      (options.model ? ` --model ${options.model}` : '');

    const { stdout } = await execAsync(cmd);
    return JSON.parse(stdout);
  }

  async index(options: {
    path?: string;
    extensions?: string[];
    exclude?: string[];
    force?: boolean;
    workers?: number;
  } = {}): Promise<void> {
    const cmd = `prism index --index "${this.dbPath}"` +
      (options.path ? ` --path ${options.path}` : '') +
      (options.extensions ? ` --extensions ${options.extensions.join(',')}` : '') +
      (options.exclude ? ` --exclude ${options.exclude.join(',')}` : '') +
      (options.force ? ' --force' : '') +
      (options.workers ? ` --workers ${options.workers}` : '');

    await execAsync(cmd);
  }

  async getStats(): Promise<any> {
    const { stdout } = await execAsync(`prism stats --index "${this.dbPath}" --format json`);
    return JSON.parse(stdout);
  }
}

// Usage example
const prism = new PrismIntegration();

async function exampleUsage() {
  // Index codebase
  await prism.index({
    path: './src',
    exclude: ['node_modules/**', 'test/**'],
    workers: 4
  });

  // Search for code
  const results = await prism.search('authentication flow', {
    limit: 10,
    threshold: 0.8
  });

  // Ask a question
  const answer = await prism.askQuestion('How does the payment system work?', {
    budget: 80000,
    model: 'claude-3.5-sonnet'
  });

  console.log('Token savings:', answer.tokenUsage?.savingsPercentage);
}
```

#### Python Integration

```python
# prism_client.py
import subprocess
import json
import asyncio
import aiohttp
from typing import Dict, List, Optional, Any

class PrismClient:
    def __init__(self, db_path: str = './.prism/vectors.db'):
        self.db_path = db_path
        self.base_command = ['prism', '--index', db_path]

    async def search_async(self, query: str, **options) -> List[Dict]:
        """Async search implementation"""
        cmd = self._build_search_command(query, **options)
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise Exception(f"PRISM search failed: {stderr.decode()}")

        return json.loads(stdout.decode())['results']

    def search(self, query: str, **options) -> List[Dict]:
        """Synchronous search"""
        cmd = self._build_search_command(query, **options)
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(result.stdout)['results']

    def _build_search_command(self, query: str, **options) -> List[str]:
        cmd = ['prism', 'search', query, '--index', self.db_path, '--format json']

        if options.get('limit'):
            cmd.extend(['--limit', str(options['limit'])])
        if options.get('threshold'):
            cmd.extend(['--threshold', str(options['threshold'])])
        if options.get('extensions'):
            cmd.extend(['--extensions', ','.join(options['extensions'])])
        if options.get('exclude'):
            cmd.extend(['--exclude', ','.join(options['exclude'])])

        return cmd

    def chat(self, question: str, **options) -> Dict:
        cmd = ['prism', 'chat', question, '--index', self.db_path, '--format json']

        if options.get('budget'):
            cmd.extend(['--budget', str(options['budget'])])
        if options.get('model'):
            cmd.extend(['--model', options['model']])
        if options.get('history') is False:
            cmd.append('--non-interactive')

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def index(self, **options) -> None:
        cmd = ['prism', 'index', '--index', self.db_path]

        if options.get('path'):
            cmd.extend(['--path', options['path']])
        if options.get('extensions'):
            cmd.extend(['--extensions', ','.join(options['extensions'])])
        if options.get('exclude'):
            cmd.extend(['--exclude', ','.join(options['exclude'])])
        if options.get('force'):
            cmd.append('--force')
        if options.get('workers'):
            cmd.extend(['--workers', str(options['workers'])])

        subprocess.run(cmd, check=True)

# Usage example
async def example_usage():
    client = PrismClient('./my-project.db')

    # Index the project
    client.index(
        path='./src',
        exclude=['node_modules/**', 'test/**'],
        workers=4
    )

    # Search for code
    results = await client.search_async(
        'user authentication flow',
        limit=10,
        threshold=0.8
    )

    # Ask a question
    answer = client.chat(
        'Explain the database schema',
        budget=100000,
        model='claude-3.5-sonnet'
    )

    print(f"Saved {answer['tokenUsage']['savingsPercentage']}% tokens")
```

### 5.2 Webhook Integration

#### Webhook Server Setup

```typescript
// src/webhook-server.ts
import express from 'express';
import { PrismIntegration } from './prism-integration';

const app = express();
app.use(express.json());

// Initialize PRISM clients for different projects
const prismClients = {
  main: new PrismIntegration('./projects/main.db'),
  api: new PrismIntegration('./projects/api.db'),
  web: new PrismIntegration('./projects/web.db')
};

app.post('/webhook/deploy', async (req, res) => {
  try {
    const { environment, project, commit } = req.body;

    // Update PRISM index after deployment
    await prismClients[project].index({
      path: `./projects/${project}`,
      exclude: ['node_modules/**', '.git/**'],
      force: true
    });

    // Generate deployment summary
    const stats = await prismClients[project].getStats();

    res.json({
      success: true,
      message: `PRISM index updated for ${project}`,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/webhook/search', async (req, res) => {
  try {
    const { query, project = 'main', ...options } = req.body;

    const results = await prismClients[project].search(query, options);

    res.json({
      success: true,
      query,
      project,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/webhook/ask', async (req, res) => {
  try {
    const { question, project = 'main', ...options } = req.body;

    const answer = await prismClients[project].askQuestion(question, options);

    res.json({
      success: true,
      question,
      project,
      answer,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(3000, () => {
  console.log('PRISM Webhook server running on port 3000');
});
```

#### Webhook Client Examples

```bash
# Trigger deployment webhook
curl -X POST http://localhost:3000/webhook/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "environment": "production",
    "project": "main",
    "commit": "abc123",
    "deployment_url": "https://app.example.com"
  }'

# Search via webhook
curl -X POST http://localhost:3000/webhook/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "user authentication flow",
    "project": "main",
    "limit": 10,
    "threshold": 0.8
  }'

# Ask question via webhook
curl -X POST http://localhost:3000/webhook/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How does the payment system work?",
    "project": "api",
    "budget": 100000,
    "model": "claude-3.5-sonnet"
  }'
```

### 5.3 Custom Tooling

#### VS Code Extension with PRISM

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { PrismIntegration } from './prism-integration';

export function activate(context: vscode.ExtensionContext) {
    const prism = new PrismIntegration();

    // Register command for search
    let searchCommand = vscode.commands.registerCommand('prism.searchInEditor', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const selection = editor.selection;
        const query = selection.isEmpty
            ? "this function"
            : editor.document.getText(selection);

        vscode.window.showInformationMessage(`Searching PRISM for: ${query}`);

        prism.search(query, { limit: 5 })
            .then(results => {
                // Display results in webview
                const panel = vscode.window.createWebviewPanel(
                    'prismResults',
                    `PRISM Results: ${query}`,
                    vscode.ViewColumn.Beside,
                    {}
                );

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <body>
                        <h2>Search Results</h2>
                        <div id="results">
                            ${results.map(r => `
                                <div class="result">
                                    <h3>${r.filePath}</h3>
                                    <p>Score: ${(r.score * 100).toFixed(1)}%</p>
                                    <pre><code>${r.snippet}</code></pre>
                                </div>
                            `).join('')}
                        </div>
                    </body>
                    </html>
                `;
            })
            .catch(err => {
                vscode.window.showErrorMessage(`PRISM Error: ${err.message}`);
            });
    });

    context.subscriptions.push(searchCommand);

    // Auto-index on save
    const onDidSave = vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.languageId === 'typescript' ||
            document.languageId === 'javascript' ||
            document.languageId === 'python') {

            prism.index({
                path: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.',
                exclude: ['node_modules/**', '.git/**']
            });
        }
    });

    context.subscriptions.push(onDidSave);
}
```

#### Neovim Plugin

```lua
-- ~/.config/nvim/lua/prism.lua
local M = {}

function M.setup()
  vim.keymap.set('n', '<leader>ps', M.search_in_editor, { noremap = true, desc = "PRISM Search" })
  vim.keymap.set('v', '<leader>ps', M.search_visual, { noremap = true, desc = "PRISM Search Visual" })
  vim.keymap.set('n', '<leader>pc', M.chat_question, { noremap = true, desc = "PRISM Chat" })
  vim.keymap.set('n', '<leader>pi', M.index_project, { noremap = true, desc = "PRISM Index" })
end

function M.search_in_editor()
  local word = vim.fn.expand("<cword>")
  local query = vim.fn.input("PRISM Search: ", word)
  if query == "" then return end

  vim.fn.jobstart({
    'prism', 'search', query, '--limit', '10', '--format', 'json'
  }, {
    on_stdout = function(_, data)
      M.display_results(data)
    end
  })
end

function M.search_visual()
  local lines = vim.fn.getline("'<", "'>")
  local query = table.concat(lines, "\n")
  query = vim.fn.input("PRISM Search Visual: ", query)
  if query == "" then return end

  vim.fn.jobstart({
    'prism', 'search', query, '--limit', '10', '--format', 'json'
  }, {
    on_stdout = function(_, data)
      M.display_results(data)
    end
  })
end

function M.chat_question()
  local question = vim.fn.input("PRISM Question: ")
  if question == "" then return end

  vim.fn.jobstart({
    'prism', 'chat', question, '--format', 'json'
  }, {
    on_stdout = function(_, data)
      local result = vim.fn.json_decode(table.concat(data, ""))
      print("\nAnswer:\n" .. result.answer)
      print("\nToken Usage:")
      print("  Input: " .. result.tokenUsage.input)
      print("  Saved: " .. result.tokenUsage.saved .. " (" ..
             result.tokenUsage.savingsPercentage .. "%)")
    end
  })
end

function M.index_project()
  vim.fn.jobstart({
    'prism', 'index', '--exclude', 'node_modules/**,.git/**'
  }, {
    on_stdout = function(_, data)
      for _, line in ipairs(data) do
        print(line)
      end
    end
  })
end

function M.display_results(data)
  local results = vim.fn.json_decode(table.concat(data, ""))
  vim.fn.setqflist(results, 'r')
  vim.cmd('copen')
end

return M

-- ~/.config/nvim/init.lua
require('prism').setup()
```

---

## Troubleshooting Tips

### Common Integration Issues

#### PRISM Not Found

**Issue**: `prism: command not found`

**Solutions**:
```bash
# Check if PRISM is installed
which prism

# Install globally
npm install -g @claudes-friend/prism

# Add to PATH if needed
echo 'export PATH="$PATH:$HOME/.npm/bin"' >> ~/.bashrc
source ~/.bashrc
```

#### Database Not Found

**Issue**: `Error: No index found`

**Solutions**:
```bash
# Index the codebase first
prism index

# Check database location
ls -la .prism/

# Specify database path explicitly
prism search "query" --index /path/to/your/prism.db
```

#### Permission Issues

**Issue**: Permission denied errors

**Solutions**:
```bash
# Fix permissions on .prism directory
chmod -R 755 .prism/

# Create directory if missing
mkdir -p ~/.prism
chmod 755 ~/.prism

# Fix git hooks permission
chmod +x .git/hooks/*
```

#### Environment Variables Not Working

**Issue**: Environment variables not being recognized

**Solutions**:
```bash
# Check current environment variables
env | grep PRISM

# Set explicitly in command
prism search "query" --verbose --log-level debug

# Verify config file location
echo $PRISM_CONFIG
ls -la ~/.prism/config.yaml
```

### Performance Optimization

#### Fast Indexing

```bash
# Parallel indexing
prism index --workers 8

# Exclude unnecessary files
prism index --exclude "node_modules/**,dist/**,build/**,.git/**,coverage/**"

# Use local embeddings if network is slow
prism index --embeddings ollama

# Limit file size
prism index --max-size 0.5  # 500KB max per file
```

#### Fast Search

```bash
# Use lower threshold for faster results
prism search "query" --threshold 0.5

# Limit results
prism search "query" --limit 5

# Use JSON format for programmatic use
prism search "query" --format json
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Verbose mode
prism index --verbose

# Debug log level
export PRISM_LOG_LEVEL=debug
prism search "test"

# Check logs
tail -f ~/.prism/logs/prism.log
```

### Integration Testing

Test your integration with these commands:

```bash
# Test basic functionality
prism --version
prism index --help
prism search "test" --limit 1

# Test JSON output for programmatic use
prism search "test" --format json

# Test chat functionality
prism chat "Hello, this is a test message" --budget 1000

# Check stats
prism stats --verbose
```

---

## Related Documentation

- [CLI Command Reference](/docs/cli/01-command-reference.md) - Complete CLI usage
- [Configuration Guide](/docs/user-guide/02-configuration.md) - Advanced configuration
- [Getting Started](/docs/user-guide/01-getting-started.md) - Basic setup
- [MCP Integration Guide](/prism/docs/mcp-integration.md) - Claude Desktop integration
- [Examples Cookbook](/docs/examples/01-common-tasks.md) - Common usage patterns

## Support

If you encounter issues with PRISM integrations:

1. **Check logs**: `tail -f ~/.prism/logs/prism.log`
2. **Run with debug**: `prism --verbose search "test"`
3. **Verify installation**: `prism --version`
4. **Check configuration**: `prism stats --verbose`
5. **File an issue**: https://github.com/claudes-friend/prism/issues

---

**Document Status**: Complete
**Last Updated**: 2026-01-14
**Next Review**: After v0.2.0 release