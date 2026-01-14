# Contributing to PRISM

Thank you for your interest in contributing to PRISM! This document will help you get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Setting Up Your Development Environment](#setting-up-your-development-environment)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation Standards](#documentation-standards)
- [Submitting Changes](#submitting-changes)
- [Project Structure](#project-structure)

---

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something great together.

- **Be respectful**: Value different viewpoints and experiences
- **Be constructive**: Focus on what is best for the community
- **Be collaborative**: Work together to solve problems
- **Be inclusive**: Welcome contributors from all backgrounds

---

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

When creating a bug report, include:
- **Clear title** describing the bug
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Environment details** (OS, Node version, PRISM version)
- **Logs or screenshots** if applicable

**Bug Report Template:**
```markdown
### Description
[Clear description of the bug]

### Steps to Reproduce
1. Step one
2. Step two
3. Step three

### Expected Behavior
[What you expected to happen]

### Actual Behavior
[What actually happened]

### Environment
- OS: [e.g., Ubuntu 22.04]
- Node: [e.g., v20.10.0]
- PRISM: [e.g., v0.3.1]

### Additional Context
[Any other relevant information]
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When suggesting an enhancement:

- **Use a clear title** describing the enhancement
- **Provide a detailed description** of the proposed enhancement
- **Explain the use case** and why it would be useful
- **List examples** of how it would work
- **Consider alternatives** you've already considered

### Pull Requests

We welcome pull requests for:
- Bug fixes
- New features
- Documentation improvements
- Performance optimizations
- Test coverage

---

## Setting Up Your Development Environment

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**
- **Git**
- **Cloudflare account** (for deployment testing)
- **wasm-pack** (optional, for WASM indexer)

### Installation

1. **Fork and clone the repository:**
```bash
git clone https://github.com/YOUR_USERNAME/PRISM.git
cd PRISM
```

2. **Install dependencies:**
```bash
npm install
```

3. **Build the project:**
```bash
npm run build
```

4. **Run tests:**
```bash
npm test
```

5. **Link CLI locally (optional):**
```bash
npm link
prism --version
```

### Setting Up Cloudflare Resources

For local development with Workers:

1. **Install Wrangler CLI:**
```bash
npm install -g wrangler
```

2. **Authenticate:**
```bash
wrangler login
```

3. **Create D1 database:**
```bash
wrangler d1 create claudes-friend-dev-db
```

4. **Create Vectorize index:**
```bash
wrangler vectorize create claudes-friend-dev-index --dimensions=384 --metric=cosine
```

5. **Update `wrangler.toml`** with your new resource IDs

6. **Run migrations:**
```bash
wrangler d1 execute claudes-friend-dev-db --file=./migrations/002_vector_index.sql --local
```

7. **Start local development server:**
```bash
npm run dev
```

---

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch naming convention:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or changes
- `perf/` - Performance improvements

### 2. Make Your Changes

- Write clean, readable code
- Follow the [Coding Standards](#coding-standards)
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:worker

# Lint code
npm run lint

# Type check
npm run typecheck

# Build
npm run build
```

### 4. Commit Your Changes

Follow conventional commits:

```bash
feat: add support for Rust language detection
fix: resolve race condition in batch indexing
docs: update installation instructions
refactor: simplify vector encoding logic
test: add tests for cosine similarity edge cases
perf: optimize embedding generation with batching
```

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub with:
- Clear title describing the change
- Detailed description of what you changed and why
- Link to related issues
- Screenshots for UI changes (if applicable)

---

## Coding Standards

### TypeScript

- **Use TypeScript strict mode**
- **Avoid `any` types** - use proper interfaces or `unknown`
- **Use async/await** instead of Promises chains
- **Use arrow functions** for callbacks
- **Prefer `const` over `let`**

Example:
```typescript
// ✅ Good
interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
}

async function processChunk(chunk: Chunk): Promise<void> {
  const trimmed = chunk.content.trim();
  if (trimmed.length === 0) return;
  // ...
}

// ❌ Bad
function processChunk(chunk: any) {
  var content = chunk.content; // Don't use 'var'
  // ...
}
```

### Naming Conventions

- **Variables/functions**: `camelCase`
- **Classes/Interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Private members**: `_camelCase`
- **Files**: `kebab-case.ts` or `kebab-case.js`

Example:
```typescript
const MAX_CHUNK_SIZE = 1000;

class VectorDatabase {
  private _index: Map<string, number[]>;

  async search(query: string): Promise<Result[]> {
    // ...
  }
}
```

### Code Organization

```typescript
// 1. Imports
import { foo } from './foo.js';

// 2. Type definitions
interface Foo {
  bar: string;
}

// 3. Constants
const BAZ = 'qux';

// 4. Class/function implementation
export class Example {
  // Public methods first
  public doSomething() {}

  // Private methods last
  private _helper() {}
}
```

### Comments and Documentation

- **Use JSDoc** for public APIs
- **Comment complex logic** (why, not what)
- **Keep comments up to date**

Example:
```typescript
/**
 * Calculate cosine similarity between two vectors
 * @param a - First vector (384 dimensions)
 * @param b - Second vector (384 dimensions)
 * @returns Similarity score between 0 and 1
 * @throws Error if vector dimensions don't match
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match');
  }
  // ... implementation
}
```

---

## Testing Guidelines

### Unit Tests

- Test **public APIs**, not implementation details
- Use **descriptive test names**
- Follow **AAA pattern** (Arrange, Act, Assert)
- **Mock external dependencies**

Example:
```typescript
describe('cosineSimilarity', () => {
  it('should return 1.0 for identical vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [1, 0, 0];

    const result = cosineSimilarity(vec1, vec2);

    expect(result).toBeCloseTo(1.0);
  });

  it('should return 0.0 for orthogonal vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [0, 1, 0];

    const result = cosineSimilarity(vec1, vec2);

    expect(result).toBeCloseTo(0.0);
  });

  it('should throw error for mismatched dimensions', () => {
    const vec1 = [1, 0];
    const vec2 = [1, 0, 0];

    expect(() => cosineSimilarity(vec1, vec2)).toThrow();
  });
});
```

### Integration Tests

- Test **end-to-end workflows**
- Use **real Workers environment** (wrangler dev)
- Test **API endpoints** with various inputs

### Test Coverage

- Aim for **80%+ coverage** on core logic
- Focus on **utility functions** and **algorithms**
- Don't worry about 100% coverage for trivial code

---

## Documentation Standards

### Code Documentation

- **JSDoc comments** for all public exports
- **Parameter types** and **return types**
- **Usage examples** for complex functions
- **@throws** for functions that can throw

### README Documentation

- Keep **README.md** up to date with:
  - Installation instructions
  - Quick start guide
  - CLI command reference
  - API usage examples
  - Performance benchmarks

### Inline Comments

- Comment **why**, not **what**
- Update comments when code changes
- Remove outdated comments

---

## Submitting Changes

### Pull Request Checklist

Before submitting your PR, ensure:

- [ ] Code follows [Coding Standards](#coding-standards)
- [ ] Tests pass locally (`npm test`)
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] Commits follow conventional commits
- [ ] PR description clearly explains changes
- [ ] Related issues linked

### Pull Request Template

```markdown
## Description
[Brief description of changes]

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Fixes #123
Related to #456

## Testing
[How you tested your changes]

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Added tests for new functionality

## Screenshots (if applicable)
[Paste screenshots here]
```

---

## Project Structure

```
PRISM/
├── src/
│   ├── shared/              # Shared utilities
│   │   └── utils.ts
│   ├── worker.ts            # D1 brute-force worker (fallback)
│   ├── worker-vectorize.ts  # Vectorize-enabled worker (primary)
│   ├── types/               # TypeScript type definitions
│   ├── vector-db/           # Vector database implementations
│   ├── indexer/             # Indexing logic
│   └── core/                # Core interfaces and types
├── prism-cli.js             # CLI entry point
├── migrations/              # Database migrations
├── tests/                   # Test files
│   ├── unit/
│   └── integration/
├── docs/                    # Documentation
│   ├── publish/             # Publish-ready markdowns
│   ├── prism-cli.md         # CLI documentation
│   └── benchmark-results.md # Performance benchmarks
├── scripts/                 # Utility scripts
├── dist/                    # Compiled output
├── wrangler.toml            # Cloudflare Workers config
├── package.json
├── tsconfig.json
└── README.md
```

---

## Areas to Contribute

### High Priority

1. **Language Support**
   - Add more programming languages
   - Improve language detection
   - Language-specific chunking strategies

2. **Search Algorithms**
   - Improve relevance scoring
   - Add hybrid semantic + keyword search
   - Implement query expansion

3. **Performance**
   - Optimize embedding generation
   - Parallel processing for indexing
   - Caching strategies

### Medium Priority

4. **CLI Features**
   - Interactive search mode
   - Search result highlighting
   - Export functionality

5. **Documentation**
   - API documentation
   - Architecture diagrams
   - Video tutorials

6. **Testing**
   - Increase test coverage
   - Add performance benchmarks
   - Integration tests

### Low Priority

7. **Nice to Have**
   - Web UI
   - VS Code extension
   - Browser extension

---

## Getting Help

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and ideas
- **Discord/Slack**: (Coming soon) Real-time chat

---

## Recognition

Contributors will be:
- Listed in the CONTRIBUTORS.md file
- Mentioned in release notes for significant contributions
- Invited to become maintainers for consistent contributions

---

## License

By contributing, you agree that your contributions will be licensed under the **MIT License**.

---

**Thank you for contributing to PRISM! 🚀**

Every contribution, no matter how small, helps make PRISM better for everyone.
