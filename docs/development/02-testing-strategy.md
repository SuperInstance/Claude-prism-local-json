# Testing Strategy

**Component**: PRISM Testing Strategy
**Status**: Development Document
**Priority**: Foundational
**Last Updated**: 2026-01-13

## Purpose

This document defines the comprehensive testing strategy for PRISM, including unit testing, integration testing, performance testing, and quality gates. All tests are designed to ensure reliability, performance, and maintainability.

---

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [Unit Testing](#2-unit-testing)
3. [Integration Testing](#3-integration-testing)
4. [Performance Testing](#4-performance-testing)
5. [Quality Gates](#5-quality-gates)
6. [Test Coverage](#6-test-coverage)
7. [Continuous Integration](#7-continuous-integration)

---

## 1. Testing Philosophy

### 1.1 Testing Principles

1. **Test Early, Test Often** - Write tests alongside code
2. **Test Behavior, Not Implementation** - Focus on what, not how
3. **Fast Feedback** - Unit tests should run in milliseconds
4. **Isolation** - Tests should not depend on each other
5. **Reproducibility** - Tests should be deterministic
6. **Maintainability** - Tests should be easy to understand and modify

### 1.2 Test Pyramid

```
        ▲
       /E2E\          10% - Few, slow, expensive
      /------\
     /Integration\    30% - Medium, moderate speed
    /------------\
   /   Unit Tests  \  60% - Many, fast, cheap
  /----------------\
```

**Distribution**:
- **60% Unit Tests**: Test individual functions and classes
- **30% Integration Tests**: Test service interactions
- **10% E2E Tests**: Test complete workflows

---

## 2. Unit Testing

### 2.1 Framework Setup

**TypeScript Tests**:
```json
// package.json
{
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "roots": ["<rootDir>/src"],
    "testMatch": ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
    "transform": {
      "^.+\\.ts$": "ts-jest"
    },
    "collectCoverageFrom": [
      "src/**/*.ts",
      "!src/**/*.d.ts",
      "!src/**/__tests__/**"
    ],
    "coverageThresholds": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

**Rust Tests**:
```rust
// vantage-indexer/Cargo.toml
[dev-dependencies]
wasm-bindgen-test = "0.3"
criterion = "0.5"

[[bench]]
name = "parser_benchmark"
harness = false
```

### 2.2 Unit Test Structure

**File Organization**:
```
src/
├── services/
│   ├── vector/
│   │   ├── storage.ts
│   │   ├── storage.test.ts        # Co-located test
│   │   └── __tests__/             # Or in __tests__ dir
│   │       ├── storage.test.ts
│   │       └── search.test.ts
```

**Test Template**:
```typescript
describe('VectorStorage', () => {
  let storage: VectorStorage;

  beforeEach(() => {
    // Setup before each test
    storage = new VectorStorage(':memory:');
  });

  afterEach(() => {
    // Cleanup after each test
    storage.close();
  });

  describe('search', () => {
    it('should return empty array when no vectors exist', async () => {
      const results = await storage.search(generateRandomVector(), { topK: 10 });
      expect(results).toEqual([]);
    });

    it('should return vectors sorted by similarity', async () => {
      // Arrange
      const query = [1, 0, 0];
      await storage.upsert([
        { id: '1', values: [1, 0, 0], metadata: {} },
        { id: '2', values: [0, 1, 0], metadata: {} },
        { id: '3', values: [0, 0, 1], metadata: {} },
      ]);

      // Act
      const results = await storage.search(query, { topK: 10 });

      // Assert
      expect(results[0].id).toBe('1');
      expect(results[0].score).toBeCloseTo(1.0);
      expect(results).toHaveLength(3);
    });

    it('should respect topK limit', async () => {
      const query = [1, 0, 0];
      await storage.upsert(generateTestVectors(20));

      const results = await storage.search(query, { topK: 5 });

      expect(results).toHaveLength(5);
    });
  });
});
```

### 2.3 Test Utilities

**Test Fixtures**:
```typescript
// tests/helpers/fixtures.ts
export function generateRandomVector(dimensions = 384): number[] {
  return Array.from({ length: dimensions }, () => Math.random());
}

export function generateTestVectors(count: number): Vector[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `vec-${i}`,
    values: generateRandomVector(),
    metadata: { index: i },
  }));
}

export function createMockIndexResult(): IndexResult {
  return {
    success: true,
    filePath: '/test/file.ts',
    elements: [
      {
        id: 'func-1',
        type: 'function',
        name: 'testFunction',
        signature: 'function testFunction()',
        content: 'function testFunction() { return true; }',
        filePath: '/test/file.ts',
        startLine: 1,
        endLine: 3,
        startByte: 0,
        endByte: 40,
        metadata: { async: false, exported: true },
        dependencies: [],
      },
    ],
    chunks: [],
  };
}
```

**Test Helpers**:
```typescript
// tests/helpers/mocks.ts
export class MockVectorDatabase implements IVectorDatabase {
  private vectors = new Map<string, Vector>();

  async search(vector: number[], options: VectorSearchOptions) {
    return Array.from(this.vectors.values())
      .map(v => ({
        id: v.id,
        score: cosineSimilarity(vector, v.values),
        metadata: v.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
  }

  async upsert(vectors: Vector[]) {
    vectors.forEach(v => this.vectors.set(v.id, v));
    return vectors.length;
  }

  // ... other methods
}

export function createMockIndexer(): IIndexer {
  return {
    indexFile: jest.fn().mockResolvedValue(createMockIndexResult()),
    indexFiles: jest.fn(),
    getSupportedLanguages: jest.fn(),
    isSupported: jest.fn(),
  };
}
```

### 2.4 Rust Unit Tests

```rust
// vantage-indexer/src/parser.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_function() {
        let code = r#"
            function test() {
                return 42;
            }
        "#;

        let result = parse_code(code, "typescript").unwrap();
        assert_eq!(result.elements.len(), 1);
        assert_eq!(result.elements[0].name, "test");
    }

    #[test]
    fn test_parse_with_syntax_error() {
        let code = r#"
            function broken(
                return 42;
            }
        "#;

        let result = parse_code(code, "typescript").unwrap();
        assert!(result.has_errors);
        assert_eq!(result.elements.len(), 0); // Or partial results
    }

    #[test]
    fn test_estimate_tokens() {
        let text = "function test() { return 42; }";
        let tokens = estimate_tokens(text);
        assert!(tokens > 0 && tokens < 100);
    }
}
```

---

## 3. Integration Testing

### 3.1 Integration Test Setup

```typescript
// tests/integration/indexer.integration.test.ts
describe('Indexer Integration', () => {
  let indexer: PRISMIndexer;
  let testRepoPath: string;

  beforeAll(async () => {
    // Setup test repository
    testRepoPath = await createTestRepository({
      files: {
        'src/auth.ts': `export function login() { ... }`,
        'src/api.ts': `export function createApi() { ... }`,
      },
    });

    // Initialize indexer
    indexer = new PRISMIndexer();
    await indexer.initialize();
  });

  afterAll(async () => {
    // Cleanup
    await indexer.close();
    await cleanupTestRepository(testRepoPath);
  });

  it('should index entire repository', async () => {
    const result = await indexer.indexDirectory(testRepoPath);

    expect(result.success).toBe(true);
    expect(result.stats.filesIndexed).toBe(2);
    expect(result.stats.chunksCreated).toBeGreaterThan(0);
  });

  it('should handle incremental updates', async () => {
    // Initial index
    await indexer.indexDirectory(testRepoPath);

    // Modify file
    await modifyFile(testRepoPath, 'src/auth.ts', 'export function logout() { ... }');

    // Re-index
    const result = await indexer.indexDirectory(testRepoPath);

    expect(result.stats.filesIndexed).toBe(1); // Only modified file
  });
});
```

### 3.2 Service Integration Tests

```typescript
// tests/integration/token-optimizer.integration.test.ts
describe('Token Optimizer Integration', () => {
  let optimizer: TokenOptimizer;
  let vectorDB: MockVectorDatabase;
  let codebase: CodeChunk[];

  beforeAll(async () => {
    // Setup real codebase chunks
    codebase = await loadTestCodebase();

    // Setup vector DB with embeddings
    vectorDB = new MockVectorDatabase();
    for (const chunk of codebase) {
      const embedding = await generateEmbedding(chunk.content);
      await vectorDB.upsert([{
        id: chunk.id,
        values: embedding,
        metadata: chunk.metadata,
      }]);
    }

    optimizer = new TokenOptimizer(vectorDB);
  });

  it('should optimize query within budget', async () => {
    const query = 'how does authentication work?';
    const budget = 5000;

    const result = await optimizer.reconstructPrompt(query, codebase, budget);

    expect(result.tokens).toBeLessThanOrEqual(budget * 1.1); // Allow 10% overage
    expect(result.chunksUsed).toBeGreaterThan(0);
    expect(result.savings.percentage).toBeGreaterThan(50);
  });
});
```

### 3.3 MCP Integration Tests

```typescript
// tests/integration/mcp-server.integration.test.ts
describe('MCP Server Integration', () => {
  let server: MCPServer;
  let client: MCPClient;

  beforeAll(async () => {
    server = new MCPServer();
    await server.start();

    client = new MCPClient(server.transport);
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
    await server.stop();
  });

  it('should discover available tools', async () => {
    const tools = await client.listTools();

    expect(tools).toContainEqual({
      name: 'search_repo',
      description: expect.any(String),
    });
  });

  it('should execute search_repo tool', async () => {
    const result = await client.callTool('search_repo', {
      query: 'authentication',
      limit: 10,
    });

    expect(result.success).toBe(true);
    expect(result.data.results).toBeInstanceOf(Array);
  });
});
```

### 3.4 Cloudflare Workers Integration Tests

```typescript
// tests/integration/cloudflare.integration.test.ts
describe('Cloudflare Workers Integration', () => {
  // Skip tests if credentials not available
  const skip = !process.env.CLOUDFLARE_API_TOKEN;

  beforeAll(skip ? undefined : async () => {
    // Setup Cloudflare test environment
    await setupTestEnvironment();
  });

  it('should generate embeddings via Workers AI', async () => {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/baai/bge-small-en-v1.5`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'test query' }),
      }
    );

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.result.data[0]).toHaveLength(384);
  }, 30000); // 30s timeout
});
```

---

## 4. Performance Testing

### 4.1 Benchmark Setup

**TypeScript Benchmarks**:
```typescript
// tests/benchmarks/indexer.benchmark.ts
import { Benchmark } from 'benchmark';

const suite = new Benchmark.Suite();

suite
  .add('parse small file', {
    defer: true,
    fn: async (deferred) => {
      await indexer.indexFile('test/fixtures/small.ts');
      deferred.resolve();
    },
  })
  .add('parse medium file', {
    defer: true,
    fn: async (deferred) => {
      await indexer.indexFile('test/fixtures/medium.ts');
      deferred.resolve();
    },
  })
  .add('parse large file', {
    defer: true,
    fn: async (deferred) => {
      await indexer.indexFile('test/fixtures/large.ts');
      deferred.resolve();
    },
  })
  .on('cycle', (event: any) => {
    console.log(String(event.target));
  })
  .on('complete', function(this: any) {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
  })
  .run({ async: true });
```

**Rust Benchmarks**:
```rust
// vantage-indexer/benches/parser_benchmark.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench_parse_small(c: &mut Criterion) {
    let code = include_str!("../fixtures/small.rs");
    c.bench_function("parse small", |b| {
        b.iter(|| parse_code(black_box(code), "rust"))
    });
}

fn bench_parse_large(c: &mut Criterion) {
    let code = include_str!("../fixtures/large.rs");
    c.bench_function("parse large", |b| {
        b.iter(|| parse_code(black_box(code), "rust"))
    });
}

criterion_group!(benches, bench_parse_small, bench_parse_large);
criterion_main!(benches);
```

### 4.2 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Parse 1K LOC** | <10ms | Criterion benchmark |
| **Parse 100K LOC** | <1s | Integration test |
| **Memory (100K LOC)** | <50MB | Heap profiling |
| **Index 1M LOC** | <30s | End-to-end test |
| **Search Latency** | <200ms P95 | Load test |
| **WASM size** | <1MB | Build output |

### 4.3 Load Testing

```typescript
// tests/load/search.load.test.ts
import { loadTest } from '@loadtest/loadtest';

describe('Search Load Test', () => {
  it('should handle 100 concurrent searches', async () => {
    const result = await loadTest({
      url: 'http://localhost:3000/api/search',
      concurrency: 100,
      maxDuration: 30000, // 30s
      method: 'POST',
      body: {
        query: 'authentication',
        limit: 10,
      },
    });

    expect(result.errors).toBe(0);
    expect(result.meanLatency).toBeLessThan(500); // <500ms
    expect(result.percentiles['p95']).toBeLessThan(1000); // <1s
  });
});
```

### 4.4 Memory Profiling

```typescript
// tests/performance/memory.test.ts
describe('Memory Usage', () => {
  it('should not leak memory during indexing', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Index 1000 files
    for (let i = 0; i < 1000; i++) {
      await indexer.indexFile(`test/file-${i}.ts`);
    }

    // Force garbage collection (if available)
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Should use less than 100MB for 1000 files
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
  });
});
```

---

## 5. Quality Gates

### 5.1 Pre-Commit Hooks

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run linter
npm run lint -- --fix

# Run type checker
npm run type-check

# Run unit tests
npm test -- --passWithNoTests

# Check formatting
npm run format -- --check

# If any check fails, commit is blocked
```

### 5.2 Pre-Push Hooks

```bash
# .husky/pre-push
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run all tests
npm test

# Run integration tests if available
npm run test:integration

# Check test coverage
npm run test:coverage

# Block push if coverage < threshold
```

### 5.3 Continuous Integration

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-unknown-unknown

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run type checker
        run: npm run type-check

      - name: Run unit tests
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

      - name: Build WASM
        run: npm run build:wasm

      - name: Build TypeScript
        run: npm run build

      - name: Run integration tests
        run: npm run test:integration
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Run benchmarks
        run: npm run benchmark

      - name: Check bundle size
        run: npm run check-size
```

### 5.4 Quality Metrics

**Code Quality Thresholds**:
```javascript
// .eslintrc.js
module.exports = {
  rules: {
    // Max complexity
    complexity: ['error', 10],

    // Max function lines
    'max-lines-per-function': ['error', 50],

    // Max file lines
    'max-lines': ['error', 500],

    // Max function parameters
    'max-params': ['error', 4],

    // Max depth
    'max-depth': ['error', 4],
  },
};
```

**Test Coverage Thresholds**:
```json
{
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    },
    "src/services/**/*.ts": {
      "branches": 90,
      "functions": 90,
      "lines": 90,
      "statements": 90
    }
  }
}
```

---

## 6. Test Coverage

### 6.1 Coverage Goals

| Component | Target | Priority |
|-----------|--------|----------|
| **Core Services** | 90%+ | High |
| **CLI Commands** | 80%+ | High |
| **MCP Tools** | 85%+ | High |
| **Storage Layer** | 85%+ | High |
| **Utilities** | 80%+ | Medium |
| **Tests** | 70%+ | Low |

### 6.2 Coverage Report

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/lcov-report/index.html

# Check specific file coverage
npm run test:coverage -- --collectCoverageFrom='src/services/**'
```

### 6.3 Coverage Badges

```markdown
<!-- README.md -->
[![Coverage](https://codecov.io/gh/yourusername/vantage/branch/main/graph/badge.svg)](https://codecov.io/gh/yourusername/vantage)
```

---

## 7. Continuous Integration

### 7.1 CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    TRIGGER: Push/PR                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    INSTALL DEPENDENCIES                     │
│  • Node.js modules                                          │
│  • Rust toolchain                                           │
│  • wasm-pack                                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    LINT & TYPE CHECK                        │
│  • ESLint                                                   │
│  • Prettier check                                           │
│  • TypeScript compiler                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                ┌──────┴──────┐
                │             │
                ▼             ▼
            PASS          FAIL
                │             │
                ▼             ▼
┌─────────────────────────┐  ┌─────────────────────────────┐
│      RUN TESTS          │  │     REPORT FAILURE          │
│  • Unit tests           │  └─────────────────────────────┘
│  • Integration tests    │
│  • Coverage report      │
└──────────────────────┬──┘
                       │
                ┌──────┴──────┐
                │             │
                ▼             ▼
            PASS          FAIL
                │             │
                ▼             ▼
┌─────────────────────────┐  ┌─────────────────────────────┐
│      BUILD ARTIFACTS    │  │     REPORT FAILURE          │
│  • WASM module          │  └─────────────────────────────┘
│  • TypeScript bundle    │
│  • Documentation        │
└──────────────────────┬──┘
                       │
                ┌──────┴──────┐
                │             │
                ▼             ▼
            PASS          FAIL
                │             │
                ▼             ▼
┌─────────────────────────┐  ┌─────────────────────────────┐
│      DEPLOY (if main)   │  │     REPORT FAILURE          │
│  • Publish to npm       │  └─────────────────────────────┘
│  • Create release       │
│  • Deploy docs          │
└─────────────────────────┘
```

### 7.2 Release Criteria

**Automated Checks**:
- [ ] All tests pass
- [ ] Coverage ≥ 80%
- [ ] No lint errors
- [ ] No TypeScript errors
- [ ] Benchmarks pass
- [ ] Security scan passes

**Manual Checks**:
- [ ] Changelog updated
- [ ] Version bumped
- [ ] Documentation updated
- [ ] Release notes drafted

---

## 8. Test Data Management

### 8.1 Test Fixtures

```typescript
// tests/fixtures/code-samples.ts
export const FIXTURES = {
  typescript: {
    simple: `
      function add(a: number, b: number): number {
        return a + b;
      }
    `,
    complex: `
      export class UserService {
        constructor(private db: Database) {}

        async findUser(id: string): Promise<User | null> {
          const result = await this.db.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
          );
          return result.rows[0] || null;
        }
      }
    `,
  },
  python: {
    simple: `
      def add(a, b):
          return a + b
    `,
  },
};
```

### 8.2 Test Database

```typescript
// tests/helpers/database.ts
export async function setupTestDatabase(): Promise<VectorDatabase> {
  const db = new VectorDatabase(':memory:');

  // Seed with test data
  await db.upseed([
    { id: 'test-1', values: [1, 0, 0], metadata: { name: 'test' } },
    { id: 'test-2', values: [0, 1, 0], metadata: { name: 'test' } },
    { id: 'test-3', values: [0, 0, 1], metadata: { name: 'test' } },
  ]);

  return db;
}

export async function cleanupTestDatabase(db: VectorDatabase): Promise<void> {
  await db.close();
}
```

---

## 9. Testing Best Practices

### 9.1 DO's

- **DO** write descriptive test names
  ```typescript
  it('should return empty array when no vectors match query', () => { });
  ```

- **DO** use arrange-act-assert pattern
  ```typescript
  it('should calculate token savings', () => {
    // Arrange
    const original = 10000;
    const optimized = 1000;

    // Act
    const savings = calculateSavings(original, optimized);

    // Assert
    expect(savings.percentage).toBe(90);
  });
  ```

- **DO** test edge cases
  ```typescript
  it('should handle empty input', () => { });
  it('should handle null values', () => { });
  it('should handle maximum allowed values', () => { });
  ```

- **DO** mock external dependencies
  ```typescript
  jest.mock('@cloudflare/workers-types', () => ({
    // Mock implementation
  }));
  ```

### 9.2 DON'Ts

- **DON'T** test implementation details
  ```typescript
  // Bad
  it('should call the database twice', () => {
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  // Good
  it('should return cached result on second call', () => {
    const result1 = await service.getData();
    const result2 = await service.getData();
    expect(result1).toEqual(result2);
  });
  ```

- **DON'T** write fragile tests
  ```typescript
  // Bad - depends on exact timing
  it('should complete in 100ms', async () => {
    const start = Date.now();
    await operation();
    expect(Date.now() - start).toBeLessThan(100);
  });

  // Good - uses reasonable timeout
  it('should complete quickly', async () => {
    await expect(operation()).resolves.toBeDefined();
  }, 200);
  ```

- **DON'T** skip tests without reason
  ```typescript
  // Bad
  it.skip('should handle large files', () => { });

  // Good
  it('should handle large files', () => {
    // Implementation
  }, 30000); // 30s timeout for large file test
  ```

---

## 10. Debugging Tests

### 10.1 Running Specific Tests

```bash
# Run specific test file
npm test -- indexer.test.ts

# Run specific test suite
npm test -- --testNamePattern="Indexer"

# Run tests matching pattern
npm test -- --testPathPattern="vector"
```

### 10.2 Debugging Tests

```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Run tests in watch mode
npm test -- --watch

# Run tests with verbose output
npm test -- --verbose

# Run tests with coverage for specific file
npm test -- --coverage --collectCoverageFrom=src/services/vector/*
```

### 10.3 Test Logs

```typescript
// Use debug logging in tests
const debug = require('debug')('vantage:test');

it('should index file', () => {
  debug('Starting test...');
  const result = await indexer.indexFile('test.ts');
  debug('Result:', result);
});
```

---

**Document Status**: Complete
**Last Updated**: 2026-01-13
**Next Review**: After MVP implementation
