# Getting Started - Development Guide

**Component**: PRISM Development Guide
**Status**: Development Document
**Priority**: Foundational
**Last Updated**: 2026-01-13

## Purpose

This document provides comprehensive guidance for setting up a development environment, understanding the codebase, contributing to the project, and following best practices for PRISM development.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Development Workflow](#3-development-workflow)
4. [Project Structure](#4-project-structure)
5. [Contributing Guidelines](#5-contributing-guidelines)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Prerequisites

### 1.1 Required Software

| Tool | Version | Purpose | Installation |
|------|---------|---------|--------------|
| **Node.js** | 18.0+ | Runtime for CLI and proxy | [nodejs.org](https://nodejs.org/) |
| **Rust** | 1.70+ | Compiler for WASM indexer | [rust-lang.org](https://www.rust-lang.org/) |
| **wasm-pack** | Latest | Build Rust → WASM | `cargo install wasm-pack` |
| **Wrangler** | 3.0+ | Cloudflare Workers CLI | `npm install -g wrangler` |
| **Git** | 2.30+ | Version control | [git-scm.com](https://git-scm.com/) |

### 1.2 Optional Software

| Tool | Purpose | Installation |
|------|---------|--------------|
| **Ollama** | Local LLM for testing | [ollama.ai](https://ollama.ai/) |
| **Docker** | Containerized testing | [docker.com](https://www.docker.com/) |
| **VS Code** | Recommended IDE | [code.visualstudio.com](https://code.visualstudio.com/) |

### 1.3 Verify Installation

```bash
# Check Node.js
node --version  # Should be v18.0.0 or higher

# Check Rust
rustc --version  # Should be 1.70.0 or higher

# Check wasm-pack
wasm-pack --version

# Check Wrangler
wrangler --version

# Check Git
git --version
```

---

## 2. Installation

### 2.1 Clone Repository

```bash
# Clone the repository
git clone https://github.com/yourusername/vantage.git
cd vantage

# Verify repository structure
ls -la
# Should see: src/, vantage-indexer/, docs/, etc.
```

### 2.2 Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install development dependencies
npm install --save-dev

# Verify installation
npm list --depth=0
```

### 2.3 Build WASM Indexer

```bash
# Navigate to indexer directory
cd vantage-indexer

# Build WASM module
wasm-pack build --target web --release

# Return to root
cd ..

# Verify build
ls -la vantage-indexer/pkg/
# Should see: vantage_indexer_bg.wasm, vantage_indexer.js, etc.
```

### 2.4 Build CLI

```bash
# Build TypeScript
npm run build

# Link CLI globally (for development)
npm link

# Verify installation
prism --version
# Should output: vantage-cli/0.1.0
```

### 2.5 Configure Environment

```bash
# Create configuration file
cp .env.example .env

# Edit .env with your settings
nano .env
```

**Example `.env` file**:
```bash
# Cloudflare Account ID
CLOUDFLARE_ACCOUNT_ID=your_account_id

# Cloudflare API Token
CLOUDFLARE_API_TOKEN=your_api_token

# Vectorize Index Name
VECTORIZE_INDEX_NAME=vantage-codebase-prod

# Default embeddings provider
EMBEDDINGS_PROVIDER=workers_ai

# Default LLM provider
LLM_PROVIDER=ollama

# Ollama endpoint (if using local)
OLLAMA_ENDPOINT=http://localhost:11434

# Log level
LOG_LEVEL=info
```

### 2.6 Initialize First Index

```bash
# Navigate to a test project
cd /path/to/your/project

# Initialize PRISM
prism init

# Index the codebase
prism index

# Verify index
prism stats
```

---

## 3. Development Workflow

### 3.1 Typical Development Cycle

```
1. Create branch           git checkout -b feature/your-feature
2. Make changes           Edit files in src/ or vantage-indexer/
3. Test locally           prism test or npm test
4. Build                  npm run build
5. Link for testing       npm link
6. Manual testing         prism index, prism search, etc.
7. Commit changes         git commit -m "Description"
8. Push to remote         git push origin feature/your-feature
9. Create PR             GitHub pull request
10. Address feedback      Iterate on review comments
11. Merge                PR approved and merged
```

### 3.2 Local Development

#### Running CLI Locally

```bash
# From project root
npm run dev -- index --path ./test-project
npm run dev -- search "authentication"
npm run dev -- chat "How does auth work?"
```

#### Running with Hot Reload

```bash
# Install nodemon (if not already installed)
npm install --save-dev nodemon

# Run with hot reload
npx nodemon --exec "npm run build && npm link" --watch src
```

#### Debugging

```bash
# Run with debug output
LOG_LEVEL=debug npm run dev -- index --path ./test-project

# Run with Node debugger
node --inspect-brk dist/cli.js index --path ./test-project

# Then connect with Chrome DevTools or VS Code debugger
```

### 3.3 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "Indexer"

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint

# Run type checker
npm run type-check
```

### 3.4 Building for Production

```bash
# Clean build artifacts
npm run clean

# Production build
npm run build:prod

# Create distribution package
npm run package

# Verify build
npm run verify
```

---

## 4. Project Structure

### 4.1 Directory Layout

```
vantage/
├── src/                          # Main TypeScript source
│   ├── cli/                      # CLI interface
│   │   ├── index.ts              # Entry point
│   │   ├── commands/             # Command implementations
│   │   │   ├── index.ts          # prism index
│   │   │   ├── search.ts         # prism search
│   │   │   ├── chat.ts           # prism chat
│   │   │   └── stats.ts          # prism stats
│   │   └── config.ts             # Configuration management
│   │
│   ├── services/                 # Core services
│   │   ├── indexer/              # Indexer service wrapper
│   │   ├── vector/               # Vector database abstraction
│   │   ├── optimizer/            # Token optimization
│   │   ├── router/               # Model routing
│   │   └── sync/                 # Cloud sync service
│   │
│   ├── mcp/                      # MCP server implementation
│   │   ├── server.ts             # MCP server
│   │   ├── tools.ts              # Tool definitions
│   │   └── resources.ts          # Resource providers
│   │
│   ├── storage/                  # Storage layer
│   │   ├── local/                # Local SQLite storage
│   │   ├── cloudflare/           # Cloud services (Vectorize, D1, etc)
│   │   └── cache/                # Caching layer
│   │
│   └── utils/                    # Utility functions
│       ├── logger.ts             # Logging utilities
│       ├── error.ts              # Error handling
│       └── config.ts             # Config parsing
│
├── vantage-indexer/              # Rust WASM indexer
│   ├── Cargo.toml                # Rust project config
│   ├── src/
│   │   ├── lib.rs                # WASM exports
│   │   ├── parser.rs             # Parser wrapper
│   │   ├── languages.rs          # Language registry
│   │   ├── extractor.rs          # AST extraction
│   │   ├── chunker.rs            # Code chunking
│   │   └── error.rs              # Error types
│   ├── grammars/                 # Tree-sitter grammars
│   │   ├── typescript/
│   │   ├── javascript/
│   │   ├── python/
│   │   ├── rust/
│   │   ├── go/
│   │   └── java/
│   └── pkg/                      # Built WASM artifacts
│       ├── vantage_indexer_bg.wasm
│       ├── vantage_indexer.js
│       └── vantage_indexer.d.ts
│
├── docs/                         # Documentation
│   ├── architecture/             # Architecture documents
│   ├── api/                      # API specifications
│   ├── development/              # Development guides
│   └── research/                 # Research documents
│
├── tests/                        # Test files
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── fixtures/                 # Test fixtures
│   └── helpers/                  # Test helpers
│
├── scripts/                      # Build and utility scripts
│   ├── build.sh                  # Build script
│   ├── test.sh                   # Test script
│   └── release.sh                # Release script
│
├── .github/                      # GitHub configuration
│   └── workflows/                # CI/CD workflows
│       ├── test.yml
│       ├── release.yml
│       └── deploy.yml
│
├── package.json                  # Node.js dependencies
├── tsconfig.json                 # TypeScript configuration
├── .eslintrc.js                  # ESLint configuration
├── .prettierrc                   # Prettier configuration
├── .gitignore                    # Git ignore rules
├── .env.example                  # Environment variables template
├── README.md                     # Project overview
├── LICENSE                       # License file
└── CLAUDE.md                     # Claude-specific instructions
```

### 4.2 Key Files Explained

#### package.json

Defines Node.js dependencies and scripts:

```json
{
  "name": "@vantage/cli",
  "version": "0.1.0",
  "description": "PRISM - Token-efficient code search with AI",
  "main": "dist/index.js",
  "bin": {
    "prism": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "build:prod": "tsc && npm run build:wasm",
    "build:wasm": "cd vantage-indexer && wasm-pack build --target web --release",
    "dev": "ts-node src/cli/index.ts",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write \"src/**/*.ts\"",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "commander": "^11.0.0",
    "ora": "^6.0.0",
    "chalk": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

#### tsconfig.json

TypeScript compiler configuration:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "types": ["node", "jest"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 5. Contributing Guidelines

### 5.1 Code Style

#### TypeScript Style Guide

**Naming Conventions**:
```typescript
// Classes: PascalCase
class VectorDatabase { }

// Interfaces: PascalCase with 'I' prefix
interface IVectorDatabase { }

// Functions: camelCase
function searchVector() { }

// Constants: UPPER_SNAKE_CASE
const MAX_RESULTS = 100;

// Private members: underscore prefix
class Example {
  private _internal: string;
}
```

**File Organization**:
```typescript
// 1. Imports
import { Type } from 'module';

// 2. Type definitions
interface MyInterface { }

// 3. Constants
const CONSTANT = 'value';

// 4. Class/function
class MyClass {
  // Public methods first
  public doSomething() { }

  // Private methods last
  private _helper() { }
}
```

**Best Practices**:
```typescript
// Use async/await over Promises
async function getData() {
  const result = await fetch(url);
  return result.json();
}

// Use const/let over var
const data = [];
for (let i = 0; i < 10; i++) { }

// Use template literals over string concatenation
const message = `Hello ${name}`;

// Use arrow functions for callbacks
array.forEach(item => console.log(item));

// Use destructuring
const { name, age } = user;

// Use spread operator over Object.assign
const merged = { ...obj1, ...obj2 };
```

#### Rust Style Guide

**Naming Conventions**:
```rust
// Functions: snake_case
fn parse_file() { }

// Structs: PascalCase
struct CodeElement { }

// Constants: UPPER_SNAKE_CASE
const MAX_SIZE: usize = 1024;

// Private members: no underscore prefix (Rust convention)
impl CodeElement {
    fn internal_helper(&self) { }
}
```

### 5.2 Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification.

**Format**:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes
- `perf`: Performance improvements

**Examples**:
```bash
# New feature
git commit -m "feat(indexer): add support for Go language"

# Bug fix
git commit -m "fix(vector): handle empty search results correctly"

# Documentation
git commit -m "docs(api): update token optimizer interface"

# Refactoring
git commit -m "refactor(optimizer): simplify scoring algorithm"

# Tests
git commit -m "test(indexer): add tests for error handling"
```

### 5.3 Pull Request Process

1. **Create Branch**:
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make Changes**:
   - Write clean, well-documented code
   - Add tests for new functionality
   - Update documentation

3. **Commit Changes**:
   ```bash
   git add .
   git commit -m "feat(scope): description"
   ```

4. **Push Branch**:
   ```bash
   git push origin feature/your-feature
   ```

5. **Create Pull Request**:
   - Go to GitHub
   - Click "New Pull Request"
   - Fill out PR template:
     ```markdown
     ## Description
     Brief description of changes

     ## Type of Change
     - [ ] Bug fix
     - [ ] New feature
     - [ ] Breaking change
     - [ ] Documentation update

     ## Testing
     - [ ] Unit tests added/updated
     - [ ] Integration tests added/updated
     - [ ] Manual testing completed

     ## Checklist
     - [ ] Code follows style guidelines
     - [ ] Self-review completed
     - [ ] Comments added to complex code
     - [ ] Documentation updated
     - [ ] No new warnings generated
     - [ ] Tests pass locally
     ```

6. **Address Review**:
   - Respond to review comments
   - Make requested changes
   - Push updates to branch

7. **Merge**:
   - PR approved by maintainer
   - Squash and merge to main
   - Delete branch after merge

### 5.4 Code Review Guidelines

**For Reviewers**:
- Be constructive and respectful
- Explain reasoning for suggestions
- Approve if changes are good enough (not perfect)
- Test changes locally if possible

**For Authors**:
- Respond to all review comments
- Explain reasoning if disagreeing
- Make requested changes promptly
- Mark comments as resolved

---

## 6. Troubleshooting

### 6.1 Common Issues

#### Issue: WASM Build Fails

```bash
# Problem
error: failed to run custom build command for `wasm-bindgen`

# Solution: Update Rust toolchain
rustup update stable
rustup target add wasm32-unknown-unknown
cargo clean
wasm-pack build
```

#### Issue: Node Module Errors

```bash
# Problem
Error: Cannot find module '@modelcontextprotocol/sdk'

# Solution: Clean and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### Issue: TypeScript Compilation Errors

```bash
# Problem
error TS2307: Cannot find module '...'

# Solution: Rebuild TypeScript
npm run clean
npm run build
```

#### Issue: Wrangler Authentication

```bash
# Problem
Error: Authentication error

# Solution: Re-authenticate
wrangler logout
wrangler login
```

#### Issue: Vector Search Returns No Results

```bash
# Problem: Search returns empty results

# Solution: Rebuild index
prism index --force

# Or check index status
prism stats
```

### 6.2 Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug prism index --path ./test-project

# Enable verbose output
prism index --verbose --path ./test-project

# Trace execution
NODE_OPTIONS='--trace-warnings' prism index
```

### 6.3 Getting Help

**Resources**:
- Documentation: `docs/`
- GitHub Issues: [github.com/yourusername/vantage/issues](https://github.com/yourusername/vantage/issues)
- Discord: (link if available)

**When reporting issues**, include:
- PRISM version: `prism --version`
- Node.js version: `node --version`
- Operating system
- Error message
- Steps to reproduce

---

## 7. Next Steps

After completing setup:

1. **Read Architecture Documents**:
   - `docs/architecture/01-system-overview.md`
   - `docs/architecture/02-data-flow.md`

2. **Review API Specification**:
   - `docs/api/01-core-api.md`

3. **Explore Example Projects**:
   - Test on your own codebase
   - Try the example projects in `/examples/`

4. **Join Development**:
   - Pick up a good first issue
   - Join discussions in GitHub
   - Contribute improvements

---

**Document Status**: Complete
**Last Updated**: 2026-01-13
**Next Review**: After MVP implementation
