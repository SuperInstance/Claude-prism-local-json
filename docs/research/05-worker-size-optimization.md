# Cloudflare Worker Size Optimization Strategies

**Complete guide to staying under the 3MB bundle size limit for Cloudflare Workers**

---

## Table of Contents

1. [Understanding the 3MB Limit](#understanding-the-3mb-limit)
2. [What Counts Toward the Limit](#what-counts-toward-the-limit)
3. [Bundle Analysis Tools](#bundle-analysis-tools)
4. [Build Tool Comparison & Configuration](#build-tool-comparison--configuration)
5. [Dependency Strategies](#dependency-strategies)
6. [TypeScript → Worker Pipeline](#typescript--worker-pipeline)
7. [WASM Optimization](#wasm-optimization)
8. [Specific Library Recommendations](#specific-library-recommendations)
9. [Testing & Validation](#testing--validation)
10. [Development Workflow](#development-workflow)
11. [Optimization Checklist](#optimization-checklist)

---

## Understanding the 3MB Limit

### Size Limits by Plan

| Plan | Bundle Size Limit | Notes |
|------|-------------------|-------|
| **Free** | 3 MB (after compression) | Strict limit, cannot be exceeded |
| **Paid** | 10 MB (after compression) | Workers Paid plan required |

### Critical Details

- **Compressed Size**: The limit applies to the bundle **after gzip/brotli compression**
- **Combined Total**: JavaScript code + WASM modules + all bundled dependencies
- **Error Message**: When exceeding the limit, deployment fails with:
  ```
  Your Worker exceeded the size limit of 3 MiB.
  Please upgrade to a paid plan to deploy Workers up to 10 MiB.
  ```
- **Pages Functions**: Separate limit of **25 MB** (higher than Workers)

### wrangler publish vs wrangler deploy

**Important**: `wrangler publish` is **deprecated** and will be removed in Wrangler v4.

| Command | Status | Usage |
|---------|--------|-------|
| `wrangler publish` | ⚠️ Deprecated (removed in v4) | Old command, avoid using |
| `wrangler deploy` | ✅ Recommended | Current standard command |

Both commands enforce the same size limits, but `deploy` is the future-proof choice.

---

## What Counts Toward the Limit

### Includes

1. **Your TypeScript/JavaScript code** (after transpilation)
2. **All npm dependencies** bundled by your build tool
3. **Imported modules** from node_modules
4. **WASM files** (base64-encoded or bundled as modules)
5. **Inline assets** (images, fonts, etc. if bundled)
6. **Polyfills** from compatibility flags

### Excludes

1. **Environment variables** (`[vars]` in wrangler.toml)
2. **Secrets** (via `wrangler secret`)
3. **Bindings configuration** (D1, KV, R2, etc.)
4. **Assets stored externally** (R2, CDN)
5. **Dynamically imported modules** from URLs

### Compression Impact

Cloudflare applies **gzip compression** before checking the limit:

- **Typical compression ratio**: 60-70% size reduction
- **Brotli potential**: 19% better than gzip (but not counted toward limit)
- **Minimum thresholds**:
  - Gzip: 48 bytes minimum
  - Brotli: 50 bytes minimum

**Example**: If your uncompressed bundle is 8 MB, it might compress to ~2.4 MB (70% reduction), staying under the 3 MB limit.

---

## Bundle Analysis Tools

### 1. Webpack Bundle Analyzer

**Best for**: Visualizing webpack bundles

```bash
npm install --save-dev webpack-bundle-analyzer
```

Configuration in `webpack.config.js`:
```javascript
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      generateStatsFile: true
    })
  ]
};
```

**Resources**:
- [Webpack Bundle Analyzer Deep Analysis Guide](https://tianyaschool.medium.com/webpack-bundle-analyzer-deep-analysis-and-optimization-of-your-bundle-78bee9a2f053)
- [Everything You Need to Know About Bundle Analyzer](https://dev.to/mbarzeev/everything-you-need-to-know-about-webpacks-bundle-analyzer-g0l)

### 2. esbuild Metafile

**Best for**: Fast build + size analysis

```javascript
// build.js
const esbuild = require('esbuild');

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  metafile: true, // Enable metafile generation
  outfile: 'dist/index.js'
});

// Analyze with esbuild-visualizer or custom scripts
```

Visualization:
```bash
npx esbuild-visualizer --metadata ./dist/meta.json --open
```

### 3. size-limit

**Best for**: CI/CD integration and enforcing budgets

```bash
npm install --save-dev size-limit
```

Configuration in `package.json`:
```json
{
  "size-limit": [
    {
      "path": "dist/index.js",
      "limit": "3 MB",
      "gzip": true
    }
  ]
}
```

Run with:
```bash
npx size-limit
```

**Resources**:
- [Size Limit NPM Package](https://www.npmjs.com/package/size-limit/v/11.0.1)
- [How to Use size-limit Package](https://stackoverflow.com/questions/63885617/how-to-use-size-limit-package)

### 4. BundleMon

**Alternative to size-limit** with similar functionality

```bash
npm install --save-dev bundlemon
```

**Resources**:
- [BundleMon NPM Package](https://www.npmjs.com/package/bundlemon)

### 5. Cloudflare-Specific Analysis

Use Wrangler's built-in size reporting:

```bash
# Dry-run to see bundle size without deploying
wrangler deploy --dry-run

# Check deployment logs for size info
wrangler deploy --verbose
```

---

## Build Tool Comparison & Configuration

### Tool Comparison

| Build Tool | Bundle Size | Build Speed | Tree Shaking | Minification | Cloudflare Support |
|------------|-------------|-------------|--------------|--------------|-------------------|
| **esbuild** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Native |
| **Rollup** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Via plugins |
| **webpack** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Native |
| **Wrangler bundled** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ✅ Default |

**Recommendation**: Use **esbuild** for best balance of speed and size optimization, with **Rollup** for maximum size reduction.

### esbuild Configuration (Recommended)

**Create `esbuild.config.js`:**

```javascript
const esbuild = require('esbuild');

(async () => {
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
    bundle: true,
    minify: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    treeShaking: true,
    sourcemap: true,
    metafile: true, // For bundle analysis
    target: 'es2022',
    format: 'esm',
    // External bindings (don't bundle Cloudflare APIs)
    external: ['@cloudflare/workers-types'],
  });
})();
```

**Update `wrangler.toml`:**

```toml
[build]
command = "node esbuild.config.js"

[build.upload]
format = "modules"
main = "./dist/index.js"
```

**Resources**:
- [esbuild API Documentation](https://esbuild.github.io/api/)
- [Downsize Your JavaScript: Mastering Bundler Optimizations](https://dev.to/filipsobol/downsize-your-javascript-mastering-bundler-optimizations-2485)

### Rollup Configuration (Maximum Optimization)

**Install dependencies:**
```bash
npm install --save-dev rollup @rollup/plugin-node-resolve @rollup/plugin-commonjs @rollup/plugin-typescript rollup-plugin-esbuild
```

**Create `rollup.config.js`:**

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import esbuild from 'rollup-plugin-esbuild';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [
    resolve({ browser: true }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
    }),
    esbuild({
      minify: true,
      treeShaking: true,
      target: 'es2022'
    })
  ],
  external: ['@cloudflare/workers-types']
};
```

### Webpack Configuration

**Cloudflare provides official webpack bundling support:**

```javascript
// webpack.config.js
const path = require('path');

module.exports = {
  entry: './src/index.ts',
  mode: 'production',
  optimization: {
    minimize: true,
    usedExports: true,
    sideEffects: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      type: 'module',
    },
  },
  experiments: {
    outputModule: true,
  },
};
```

**Resources**:
- [Cloudflare Bundling Documentation](https://developers.cloudflare.com/workers/wrangler/bundling/)
- [Using Webpack to Bundle Workers](https://blog.cloudflare.com/using-webpack-to-bundle-workers/)

### Wrangler Built-in Bundling

**Simplest option** (uses esbuild internally):

```toml
# wrangler.toml
[build]
command = "npm run build"

[build.upload]
format = "modules"
main = "./src/index.ts"

# Enable minification
minify = true
```

---

## Dependency Strategies

### 1. CDN Imports vs npm Packages

**CDN Imports** (esm.sh, Skypack, jsDelivr):

```typescript
// Import from CDN - NOT bundled
import { lodash } from 'https://esm.sh/lodash@4.17.21';
```

**Pros:**
- ✅ Doesn't count toward 3 MB limit
- ✅ Always latest version (or pinned version)
- ✅ Good for large, rarely-used dependencies

**Cons:**
- ❌ Runtime network overhead (slower cold starts)
- ❌ External dependency reliability
- ❌ Not available in all environments

**npm Packages** (bundled):

```typescript
// Bundled with your Worker
import { lodash } from 'lodash';
```

**Pros:**
- ✅ No runtime fetch (faster execution)
- ✅ Self-contained (no external dependencies)
- ✅ Works offline

**Cons:**
- ❌ Counts toward 3 MB limit
- ❌ Increases bundle size

**Recommendation**: Use **CDN imports for large libraries** (>500KB uncompressed) and **npm packages for core utilities** (<100KB).

### 2. Tree-Shaking Best Practices

**Ensure ESM compatibility:**

```json
// package.json
{
  "type": "module",
  "sideEffects": false  // Tells bundler all modules are side-effect free
}
```

**Use named exports instead of default exports:**

```typescript
// ❌ Bad: Default export (harder to tree-shake)
export default function myUtil() { ... }

// ✅ Good: Named export (tree-shakeable)
export function myUtil() { ... }
```

**Import only what you need:**

```typescript
// ❌ Bad: Imports entire library
import * as _ from 'lodash';

// ✅ Good: Imports only needed functions
import { debounce } from 'lodash';
```

### 3. Dynamic Imports

**Lazy-load dependencies only when needed:**

```typescript
// Instead of: import { heavyLib } from 'heavy-lib';

// Use dynamic import
async function handler(request: Request) {
  if (needsHeavyLib) {
    const { heavyLib } = await import('heavy-lib');
    return heavyLib.process();
  }
}
```

**Note**: Cloudflare Workers supports dynamic imports, but unused dynamic imports can still slow down TTFB (Time to First Byte).

### 4. Minimal Dependencies

**Audit your dependencies regularly:**

```bash
# Check dependency sizes
npx cost-of-modules

# Find unused dependencies
npx depcheck

# Analyze bundle composition
npx source-map-explorer dist/index.js
```

---

## TypeScript → Worker Pipeline

### Optimized tsconfig.json

```json
{
  "compilerOptions": {
    // Target modern ES features (smaller polyfills)
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],

    // Output optimization
    "outDir": "./dist",
    "rootDir": "./src",
    "removeComments": true,  // ✅ Remove comments
    "declaration": false,     // ✅ Don't emit .d.ts files in production
    "declarationMap": false,  // ✅ Don't emit declaration maps
    "sourceMap": true,        // ✅ Keep for debugging (remove in prod if needed)
    "importHelpers": true,    // ✅ Use tslib helpers (reduces code duplication)

    // Strict checks (catch issues early, not runtime)
    "strict": true,
    "noUnusedLocals": true,   // ✅ Remove unused locals
    "noUnusedParameters": true, // ✅ Remove unused parameters
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "allowUnusedLabels": false,
    "allowUnreachableCode": false,

    // Module resolution
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,  // ✅ Required for tree-shaking

    // Advanced
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,

    // Cloudflare Workers specific
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*"],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/*.spec.ts"
  ]
}
```

### Build Scripts

**Update `package.json`:**

```json
{
  "scripts": {
    "build": "node esbuild.config.js",
    "build:analyze": "node esbuild.config.js && npx esbuild-visualizer --metadata ./dist/meta.json --open",
    "build:profile": "wrangler deploy --dry-run --verbose",
    "dev": "wrangler dev",
    "deploy": "npm run build && wrangler deploy",
    "size-check": "npx size-limit"
  }
}
```

### wrangler.toml Optimization Flags

```toml
[build]
command = "npm run build"
# Wrangler will use esbuild internally if no build command specified

[build.upload]
format = "modules"
main = "./dist/index.js"

# ⚠️ Compatibility flags increase bundle size
# Only enable if absolutely necessary
# compatibility_flags = ["nodejs_compat"]

# Minification (if not using custom build)
# minify = true
```

**Note on Compatibility Flags**:
- `nodejs_compat` adds polyfills that can **significantly increase** bundle size
- `nodejs_compat_v2` is more optimized but still adds overhead
- Use **native Cloudflare APIs** instead of Node.js APIs when possible

---

## WASM Optimization

### WASM Size Limits

- **WASM counts toward the 3 MB limit** (after gzip compression)
- **Base64 encoding overhead**: ~33% size increase
- **Combined total**: JavaScript + WASM must be under 3 MB (compressed)

### Optimization Strategies

#### 1. wasm-opt (Binaryen)

**Install Binaryen:**
```bash
# macOS
brew install binaryen

# Linux
sudo apt-get install binaryen

# Or build from source
git clone https://github.com/WebAssembly/binaryen.git
cd binaryen
mkdir build && cd build
cmake ..
make install
```

**Optimize WASM:**
```bash
# Basic optimization (level 2)
wasm-opt input.wasm -O2 -o output.wasm

# Aggressive optimization (level 3)
wasm-opt input.wasm -O3 -o output.wasm

# Size optimization
wasm-opt input.wasm -Oz -o output.wasm

# Multiple optimization passes
wasm-opt input.wasm -O3 --optimize-level=3 -o output.wasm
```

**Expected results**: 20-40% size reduction

#### 2. LTO (Link-Time Optimization)

**If compiling from Rust/C++:**

```bash
# Rust
cargo build --release --target wasm32-unknown-unknown
wasm-opt target/wasm32-unknown-unknown/release/your_module.wasm -O3 -o output.wasm

# C++ with Emscripten
emcc input.c -O3 -flto -s WASM=1 -o output.wasm
```

#### 3. Store WASM in R2, Load Dynamically

**For large WASM files (>500KB)**, store in R2 and load at runtime:

```typescript
export interface Env {
  R2: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Check if WASM is cached
    const cachedWasm = await env.R2.get('module.wasm');

    if (cachedWasm) {
      const wasmBuffer = await cachedWasm.arrayBuffer();
      const module = await WebAssembly.instantiate(wasmBuffer);
      // Use module...
    }

    return new Response('OK');
  }
};
```

**Pros:**
- ✅ WASM doesn't count toward 3 MB limit
- ✅ Can use very large WASM modules

**Cons:**
- ❌ Runtime loading overhead
- ❌ R2 egress costs apply (if exceeding free tier)

#### 4. Use Smaller WASM Runtimes

**For specific use cases:**

| Use Case | Full Library | Minimal Alternative |
|----------|--------------|-------------------|
| **SQLite** | sql.js (~500KB) | Cloudflare D1 (0KB, native) |
| **Image processing** | ImageMagick WASM (~2MB) | Custom WASM with only needed ops |
| **Compression** | zlib WASM (~100KB) | Native CompressionStream API |
| **Regex** | regex WASM (~50KB) | Native RegExp (usually sufficient) |

**Best practice**: Use **Cloudflare D1** instead of bundling SQLite WASM.

**Resources**:
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [SQLite in Durable Objects](https://blog.cloudflare.com/sqlite-in-durable-objects/)
- [WebAssembly in Workers](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)

---

## Specific Library Recommendations

### 1. Lodash Alternatives

**Replace lodash with:**

| Function | Lodash | Alternative | Size |
|----------|--------|-------------|------|
| **General utils** | `lodash` | Native ES6+ | 0 KB |
| **Modern utils** | `lodash` | `radash` or `remeda` | ~10 KB |
| **Single functions** | `lodash` | `lodash-es` (tree-shakeable) | Variable |

**Native ES6+ replacements:**

```typescript
// ❌ lodash
import { map, filter, find } from 'lodash';

// ✅ Native
array.map(x => x * 2);
array.filter(x => x > 10);
array.find(x => x.id === 1);

// ❌ lodash.isEmpty
import { isEmpty } from 'lodash';
isEmpty(obj);

// ✅ Native
Object.keys(obj).length === 0;

// ❌ lodash.uniq
import { uniq } from 'lodash';
uniq(array);

// ✅ Native
[...new Set(array)];
```

**Recommended: `radash`** (modern, smaller, tree-shakeable)

```bash
npm install radash
```

```typescript
import { map, debounce } from 'radash';
```

### 2. Axios Alternatives

**Use native Fetch API** (built into Cloudflare Workers):

```typescript
// ❌ axios (100KB+)
import axios from 'axios';
const response = await axios.get('https://api.example.com');

// ✅ Native fetch (0 KB)
const response = await fetch('https://api.example.com');
const data = await response.json();
```

**Fetch with retries** (if needed):

```typescript
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url);
    } catch (err) {
      if (i === retries - 1) throw err;
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 3. Moment.js Alternatives

**Use native Intl.DateTimeFormat or smaller libraries:**

| Library | Size | Features |
|---------|------|----------|
| **Moment.js** | 67 KB | ❌ Legacy, not recommended |
| **date-fns** | 67 KB (total) | ✅ Modular, tree-shakeable |
| **Day.js** | 2 KB | ✅ Moment.js API compatible |
| **Luxon** | 21 KB | ✅ Modern, immutable |
| **Native Intl** | 0 KB | ✅ Built-in, sufficient for most use cases |

**Native Intl.DateTimeFormat:**

```typescript
// ❌ moment
import moment from 'moment';
moment().format('YYYY-MM-DD');

// ✅ Native Intl
new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

// ✅ Simple date formatting
new Date().toISOString().split('T')[0]; // YYYY-MM-DD
```

**Recommended: Day.js** (if Moment.js API is needed)

```bash
npm install dayjs
```

```typescript
import dayjs from 'dayjs';
dayjs().format('YYYY-MM-DD');
```

### 4. Vector Search Libraries

**For PRISM (RAG applications):**

| Approach | Size | Performance | Recommendation |
|----------|------|-------------|----------------|
| **Custom vector lib** | 50-200KB | Variable | ❌ Avoid |
| **faiss-js** | 500KB+ | Fast | ❌ Too large |
| **Cloudflare Vectorize** | 0 KB (native) | Fastest | ✅ Use this |
| **Simple cosine similarity** | <5KB | Slow for large datasets | ✅ OK for <1000 vectors |

**Cloudflare Vectorize (Recommended):**

```toml
# wrangler.toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "claudes-companion"
```

```typescript
// Zero bundle size, native performance
const results = await env.VECTORIZE.query(vector, { topK: 10 });
```

**Minimal vector search** (if Vectorize not available):

```typescript
// Simple cosine similarity (tree-shakeable)
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function findNearest(query: number[], vectors: number[][]): number[] {
  const similarities = vectors.map(v => cosineSimilarity(query, v));
  return similarities.map((s, i) => ({ index: i, score: s }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(r => r.index);
}
```

### 5. SQLite/D1

**For database needs:**

| Approach | Bundle Size | Use Case |
|----------|-------------|----------|
| **better-sqlite3** | N/A (Node.js only) | ❌ Doesn't work in Workers |
| **sql.js (WASM)** | ~500KB | ❌ Too large, use D1 instead |
| **wasi-sqlite** | ~300KB | ❌ Requires WASM, use D1 instead |
| **Cloudflare D1** | 0 KB (native) | ✅ Always use D1 |

**Cloudflare D1 (Recommended):**

```toml
# wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "claudes-friend-db"
database_id = "your-database-id"
```

```typescript
// Zero bundle size
const results = await env.DB.prepare(
  'SELECT * FROM documents WHERE id = ?'
).bind(id).first();
```

**Resources**:
- [D1: Our SQL Database](https://blog.cloudflare.com/whats-new-with-d1/)
- [Cloudflare D1 vs Other Serverless Databases](https://www.reddit.com/r/CloudFlare/comments/1jl1tgp/cloudflare_d1_vs_other_serverless_databases_has/)

### Library Size Comparison Summary

| Use Case | Large Library | Minimal Alternative | Size Savings |
|----------|---------------|---------------------|--------------|
| **Utilities** | lodash (72 KB) | radash / native | 60-72 KB |
| **HTTP** | axios (100 KB) | Native fetch | 100 KB |
| **Dates** | moment.js (67 KB) | Day.js (2 KB) / Intl | 65 KB |
| **Validation** | joi (200 KB) | zod (40 KB) | 160 KB |
| **Database** | sql.js (500 KB) | Cloudflare D1 (0 KB) | 500 KB |
| **Vectors** | faiss-js (500 KB) | Vectorize (0 KB) | 500 KB |

**Potential total savings**: Up to **1.4 MB** by replacing common libraries with native/minimal alternatives.

---

## Testing & Validation

### 1. Measure Bundle Size During Development

**Add to `package.json`:**

```json
{
  "scripts": {
    "size": "npm run build && du -h dist/index.js",
    "size-gzip": "npm run build && gzip -c dist/index.js | wc -c",
    "size-detailed": "npm run build:analyze"
  }
}
```

**Usage:**

```bash
# Check uncompressed size
npm run size

# Check compressed size (what actually counts)
npm run size-gzip

# Detailed breakdown
npm run size-detailed
```

### 2. CI/CD Checks

**GitHub Actions Example** (`.github/workflows/bundle-size.yml`):

```yaml
name: Bundle Size Check

on:
  pull_request:
    branches: [main]

jobs:
  bundle-size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Check bundle size
        run: |
          SIZE=$(gzip -c dist/index.js | wc -c)
          MAX_SIZE=3145728  # 3MB in bytes

          echo "Bundle size (gzipped): $SIZE bytes"

          if [ $SIZE -gt $MAX_SIZE ]; then
            echo "❌ Bundle exceeds 3MB limit!"
            exit 1
          else
            echo "✅ Bundle is under 3MB limit"
          fi

      - name: Comment PR with size
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const size = gzipSync(fs.readFileSync('dist/index.js')).length;
            const sizeMB = (size / 1024 / 1024).toFixed(2);

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `📦 Bundle size: ${sizeMB} MB / 3 MB`
            });
```

### 3. Using size-limit in CI

**Configuration** (`.size-limit.json`):

```json
[
  {
    "name": "Worker Bundle",
    "path": "dist/index.js",
    "limit": "3 MB",
    "gzip": true
  }
]
```

**GitHub Actions:**

```yaml
- name: Check size limit
  run: npx size-limit --github-comment
```

### 4. Monitoring Production Bundle Sizes

**Add deployment tracking:**

```typescript
// src/utils/monitoring.ts
export async function trackBundleSize() {
  const bundleResponse = await fetch(
    'https://api.cloudflare.com/client/v4/accounts/:account_id/workers/:script_name',
    {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`
      }
    }
  );

  const bundle = await bundleResponse.json();
  const size = bundle.result.size;

  // Send to monitoring (e.g., Cloudflare Analytics Engine)
  await env.ANALYTICS.writeDataPoint({
    blobs: [env.ENVIRONMENT],
    doubles: [size],
    indexes: [Date.now()]
  });
}
```

---

## Development Workflow

### Recommended Workflow

1. **Write Code** with tree-shaking in mind
   - Use named exports
   - Import only what you need
   - Prefer native APIs

2. **Build Regularly** and check size
   ```bash
   npm run build
   npm run size-gzip
   ```

3. **Analyze Bundle** weekly or before deployments
   ```bash
   npm run build:analyze
   ```

4. **Run Tests** including size checks
   ```bash
   npm run size-check
   npm test
   ```

5. **Deploy** only if size passes
   ```bash
   npm run deploy
   ```

### Pre-Deployment Checklist

```markdown
## Before Deploying

- [ ] Build completes successfully
- [ ] Bundle size under 3 MB (gzipped)
- [ ] No unused dependencies (run `depcheck`)
- [ ] Tree-shaking working correctly (verify with bundle analyzer)
- [ ] No console.log statements in production code
- [ ] Source maps disabled in production (if needed)
- [ ] All tests passing
- [ ] Manual testing completed
```

### Size Budget Strategy

**Set incremental budgets:**

| Stage | Budget | Rationale |
|-------|--------|-----------|
| **Initial commit** | 1 MB | Leave room for growth |
| **MVP** | 2 MB | Core features implemented |
| **Pre-production** | 2.5 MB | Buffer for edge cases |
| **Production** | 3 MB | Maximum limit |

**Automate budget enforcement:**

```json
{
  "size-limit": [
    {
      "name": "Initial Development",
      "path": "dist/index.js",
      "limit": "1 MB"
    },
    {
      "name": "MVP Target",
      "path": "dist/index.js",
      "limit": "2 MB"
    },
    {
      "name": "Production Maximum",
      "path": "dist/index.js",
      "limit": "3 MB"
    }
  ]
}
```

---

## Optimization Checklist

### Phase 1: Quick Wins (1-2 hours)

- [ ] **Enable minification** in build tool
- [ ] **Remove comments** (`removeComments: true` in tsconfig)
- [ ] **Remove source maps** in production build
- [ ] **Replace lodash** with native ES6+ methods or radash
- [ ] **Replace axios** with native fetch
- [ ] **Replace moment.js** with Day.js or Intl
- [ ] **Run `npm uninstall`** on unused dependencies

**Expected savings**: 200-500 KB

### Phase 2: Dependency Audit (2-4 hours)

- [ ] **Run `depcheck`** to find unused dependencies
- [ ] **Run `cost-of-modules`** to identify largest dependencies
- [ ] **Audit each large dependency** (>50 KB):
  - Is it tree-shakeable?
  - Is there a smaller alternative?
  - Can it be loaded from CDN?
- [ ] **Replace large libraries** with native/minimal alternatives
- [ ] **Use CDN imports** for dependencies >500 KB

**Expected savings**: 500 KB - 1 MB

### Phase 3: Build Optimization (2-4 hours)

- [ ] **Switch to esbuild** (if using webpack)
- [ ] **Enable tree-shaking** in build tool
- [ ] **Set `"sideEffects": false`** in package.json
- [ ] **Use ESM modules** (not CommonJS)
- [ ] **Configure `external`** for Cloudflare APIs
- [ ] **Remove polyfills** (target ES2022)

**Expected savings**: 100-300 KB

### Phase 4: WASM Optimization (4-8 hours)

- [ ] **Run `wasm-opt`** on all WASM files
- [ ] **Consider storing large WASM in R2** instead of bundling
- [ ] **Replace WASM with native Cloudflare services**:
  - SQLite WASM → Cloudflare D1
  - Vector search WASM → Cloudflare Vectorize
- [ ] **Use LTO** if compiling from C++/Rust

**Expected savings**: 300 KB - 1 MB

### Phase 5: Advanced Techniques (8+ hours)

- [ ] **Implement code splitting** with dynamic imports
- [ ] **Use Worker Loaders** for runtime module loading
- [ ] **Custom bundler configuration** for maximum optimization
- [ ] **Consider microservices architecture** (split into multiple Workers)
- [ ] **Optimize specific algorithms** for size vs speed trade-off

**Expected savings**: Variable

---

## Common Issues & Solutions

### Issue 1: "Worker exceeded size limit" Error

**Solution:**

1. Check compressed size:
   ```bash
   gzip -c dist/index.js | wc -c
   ```

2. Analyze bundle:
   ```bash
   npm run build:analyze
   ```

3. Remove unused dependencies
4. Enable all minification options
5. Replace large libraries with native alternatives

### Issue 2: Tree-shaking Not Working

**Solution:**

1. Ensure using ESM (not CommonJS):
   ```json
   {
     "type": "module"
   }
   ```

2. Set `"sideEffects": false` in package.json

3. Use named exports, not default exports

4. Verify library supports tree-shaking

### Issue 3: WASM Too Large

**Solution:**

1. Run wasm-opt:
   ```bash
   wasm-opt input.wasm -O3 -o output.wasm
   ```

2. Store in R2 and load dynamically

3. Replace with Cloudflare native services (D1, Vectorize)

### Issue 4: Slow Cold Starts

**Solution:**

1. Minimize bundle size (smaller = faster)
2. Use CDN imports for rarely-used code
3. Enable compression
4. Cache expensive operations

---

## Resources & References

### Official Cloudflare Documentation

- [Workers Platform Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Wrangler Bundling Configuration](https://developers.cloudflare.com/workers/wrangler/bundling/)
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [WebAssembly in Workers](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)
- [Cloudflare D1 Database](https://developers.cloudflare.com/d1/)
- [Vectorize Vector Database](https://developers.cloudflare.com/vectorize/)

### Build Tools

- [esbuild Documentation](https://esbuild.github.io/)
- [esbuild API Reference](https://esbuild.github.io/api/)
- [Rollup Documentation](https://rollupjs.org/)
- [Webpack Documentation](https://webpack.js.org/)

### Bundle Analysis

- [webpack-bundle-analyzer](https://www.npmjs.com/package/webpack-bundle-analyzer)
- [size-limit](https://www.npmjs.com/package/size-limit)
- [BundleMon](https://www.npmjs.com/package/bundlemon)
- [cost-of-modules](https://www.npmjs.com/package/cost-of-modules)

### Community & Articles

- [Downsize Your JavaScript: Mastering Bundler Optimizations](https://dev.to/filipsobol/downsize-your-javascript-mastering-bundler-optimizations-2485)
- [Optimizing Builds with esbuild](https://mollify.noroff.dev/content/feu2/javascript-2/module-3/esbuild/optimizing-builds-with-esbuild)
- [Minifying TypeScript Output](https://blog.bitsrc.io/minifying-typescript-output-strategies-for-reducing-bundle-size-and-improving-performance-f4616dfd35ae)
- [Tree Shaking in TypeScript](https://billyokeyo.dev/posts/tree-shaking-in-typescript/)

### Compression

- [GZIP vs Brotli Compression](https://www.ioriver.io/blog/gzip-vs-brotli-compression-performance)
- [Cloudflare Content Compression](https://developers.cloudflare.com/speed/optimization/content/compression/)

---

## Summary

**Key takeaways for staying under 3 MB:**

1. **Measure first**: Use bundle analysis tools to identify size issues
2. **Minify everything**: Enable all minification options in your build tool
3. **Use native APIs**: Cloudflare Workers provides fetch, D1, Vectorize, KV, R2 - use them!
4. **Replace large libraries**: Lodash → radash, Axios → fetch, Moment → Day.js
5. **Tree-shake aggressively**: Use ESM, named exports, import only what you need
6. **Optimize WASM**: Use wasm-opt, store in R2, or replace with native services
7. **Set size budgets**: Use size-limit or BundleMon in CI/CD
8. **Monitor continuously**: Check bundle size with every commit

**Expected savings**: By following this guide, you can typically reduce a Worker bundle by **1-2 MB**, staying well under the 3 MB limit while maintaining full functionality.

---

**Last Updated**: January 2025

**Maintained by**: PRISM Development Team

**Questions?** See the [Cloudflare Workers Community](https://community.cloudflare.com/c/workers/6) or [Cloudflare Discord](https://discord.gg/cloudflaredev).
