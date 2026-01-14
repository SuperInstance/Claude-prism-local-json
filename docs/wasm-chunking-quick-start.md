# WASM Chunking Quick Start Guide

## Installation

```bash
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install wasm-pack
cargo install wasm-pack

# Build the WASM module
cd prism/prism-indexer
./build.sh
```

## Usage Examples

### 1. Basic Chunking

```typescript
import { WasmIndexer } from './indexer/WasmIndexer.js';

const indexer = new WasmIndexer();
await indexer.init();

const chunks = await indexer.index('src/myFile.ts');
console.log(`Found ${chunks.length} chunks`);
```

### 2. With Fallback

```typescript
import { intelligentChunk } from './shared/utils.js';

const chunks = await intelligentChunk(
    'src/myFile.ts',
    fileContent,
    'typescript',
    { strategy: 'hybrid' }
);
```

### 3. In Worker

```typescript
import { getIndexer } from './indexer/WasmIndexer.js';

export default {
  async fetch(request) {
    const indexer = await getIndexer();
    const chunks = await indexer.index('src/file.ts');
    return Response.json(chunks);
  }
};
```

## API Reference

### `WasmIndexer`

```typescript
class WasmIndexer {
  // Initialize WASM module
  async init(): Promise<void>;

  // Index a single file
  async index(filePath: string): Promise<CodeChunk[]>;

  // Index directory recursively
  async indexDirectory(dirPath: string): Promise<CodeChunk[]>;

  // Parse file content
  async parseFile(content: string, language: string): Promise<ParseResult>;

  // Get supported languages
  getSupportedLanguages(): string[];

  // Get WASM version
  getVersion(): string;
}
```

### `intelligentChunk`

```typescript
async function intelligentChunk(
  filePath: string,
  content: string,
  language: string,
  options?: ChunkingOptions
): Promise<Chunk[]>;
```

### `ChunkingOptions`

```typescript
interface ChunkingOptions {
  maxLines?: number;           // Default: 200
  strategy?: 'tree-sitter' | 'line-based' | 'hybrid';
  includeImports?: boolean;    // Default: true
  includeDocs?: boolean;       // Default: true
}
```

## Supported Languages

- **TypeScript** (.ts, .tsx) - Full support
- **JavaScript** (.js, .jsx) - Full support
- **Python** (.py) - Full support
- **Rust** (.rs) - Good support
- **Go** (.go) - Good support
- **Java** (.java) - Basic support

## Testing

```bash
# Rust tests
cd prism/prism-indexer
cargo test

# TypeScript tests
npm test -- tests/unit/chunking/

# Integration tests
npm run test:integration
```

## Troubleshooting

**WASM not loading?**
```bash
# Rebuild WASM
cd prism/prism-indexer
./build.sh
```

**Falling back to line-based?**
- Check browser console for errors
- Verify WASM files in `dist/wasm/`
- Check language support

**Performance issues?**
- Enable caching: `enableCache: true`
- Use `hybrid` strategy for best performance
- Limit file size: `maxFileSize: 1000000`

## Best Practices

1. **Always initialize WASM before use**
   ```typescript
   await indexer.init();
   ```

2. **Use hybrid strategy for production**
   ```typescript
   { strategy: 'hybrid' }
   ```

3. **Handle errors gracefully**
   ```typescript
   try {
     const chunks = await indexer.index(file);
   } catch (error) {
     console.error('Chunking failed:', error);
   }
   ```

4. **Reuse indexer instances**
   ```typescript
   // Good: Single instance
   const indexer = await getIndexer();

   // Bad: Multiple instances
   const indexer1 = new WasmIndexer();
   const indexer2 = new WasmIndexer();
   ```

## Performance Tips

1. **Enable caching** for repeated chunking
2. **Use hybrid strategy** for automatic fallback
3. **Limit file size** to <1MB for best performance
4. **Batch operations** for multiple files

## See Also

- [Full Documentation](./wasm-chunking-implementation.md)
- [Architecture](./architecture/04-indexer-architecture.md)
- [API Reference](../api/indexer.md)
