# Semantic Embeddings - Configuration and Usage Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file or set environment variables:

```bash
# Cloudflare Workers AI (Primary - Recommended)
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_KEY="your-api-key"

# Optional: Ollama (Fallback)
export OLLAMA_ENDPOINT="http://localhost:11434"
export OLLAMA_MODEL="nomic-embed-text"
```

### 3. Run Database Migration

```bash
# Create D1 database (if not exists)
wrangler d1 create claudes-friend-db

# Run semantic embeddings migration
wrangler d1 execute claudes-friend-db --file=./migrations/004_semantic_embeddings.sql
```

### 4. Update MCP Server Configuration

```typescript
import { PrismMCPServerV2 } from './prism/src/mcp/PrismMCPServerV2.js';
import { SQLiteVectorDB } from './prism/src/vector-db/SQLiteVectorDB.js';

const server = new PrismMCPServerV2({
  vectorDB: new SQLiteVectorDB({ path: './prism.db' }),
  embeddingsConfig: {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiKey: process.env.CLOUDFLARE_API_KEY,
    cachePath: './embeddings.db',
    cacheTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxCacheSize: 10000,
    enableMetrics: true,
    fallbackToHash: true,
  },
});

await server.start();
```

## Configuration Options

### Basic Configuration

```typescript
import { SemanticEmbeddingsService } from './prism/src/mcp/semantic-embeddings.js';

const service = new SemanticEmbeddingsService({
  // Cloudflare Workers AI Configuration
  cloudflareAccountId: 'your-account-id',
  cloudflareApiKey: 'your-api-key',
  cloudflareApiEndpoint: 'https://api.cloudflare.com/client/v4',
  model: '@cf/baai/bge-small-en-v1.5',

  // Ollama Configuration (Fallback)
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'nomic-embed-text',

  // Cache Configuration
  cachePath: './embeddings.db',
  cacheTTL: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  maxCacheSize: 10000, // Maximum number of cached embeddings

  // Performance Configuration
  batchSize: 10, // Batch size for parallel processing
  maxConcurrency: 5, // Maximum concurrent requests
  timeout: 30000, // Request timeout in milliseconds
  maxRetries: 3, // Maximum retry attempts

  // Feature Flags
  enableMetrics: true, // Enable metrics collection
  fallbackToHash: true, // Allow hash-based fallback
});
```

### Environment-Based Configuration

```typescript
// production.config.ts
export const productionConfig = {
  embeddingsConfig: {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiKey: process.env.CLOUDFLARE_API_KEY,
    cachePath: './data/embeddings.db',
    cacheTTL: 7 * 24 * 60 * 60 * 1000,
    maxCacheSize: 10000,
    enableMetrics: true,
    fallbackToHash: false, // Don't allow hash fallback in production
  },
};

// development.config.ts
export const developmentConfig = {
  embeddingsConfig: {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiKey: process.env.CLOUDFLARE_API_KEY,
    cachePath: ':memory:', // In-memory cache for development
    cacheTTL: 60 * 60 * 1000, // 1 hour
    maxCacheSize: 1000,
    enableMetrics: true,
    fallbackToHash: true, // Allow fallback during development
  },
};

// test.config.ts
export const testConfig = {
  embeddingsConfig: {
    cachePath: ':memory:',
    cacheTTL: 60000, // 1 minute
    maxCacheSize: 100,
    enableMetrics: false,
    fallbackToHash: true,
  },
};
```

## Usage Examples

### Basic Embedding Generation

```typescript
import { SemanticEmbeddingsService } from './prism/src/mcp/semantic-embeddings.js';

const service = new SemanticEmbeddingsService();

// Generate embedding for a single text
const result = await service.generateEmbedding('authentication logic');

console.log(`Generated in ${result.generationTime}ms`);
console.log(`Provider: ${result.provider}`);
console.log(`Cache hit: ${result.cacheHit}`);
console.log(`Dimensions: ${result.dimensions}`);
```

### Batch Processing

```typescript
// Generate embeddings for multiple texts efficiently
const texts = [
  'user authentication function',
  'database connection code',
  'error handling pattern',
  'API endpoint implementation',
];

const batchResult = await service.generateBatchEmbeddings(texts);

console.log(`Processed ${batchResult.successCount} embeddings`);
console.log(`Failed: ${batchResult.failureCount}`);
console.log(`Total time: ${batchResult.totalTime}ms`);
console.log(`Average time: ${batchResult.averageTime}ms`);
```

### Similarity Search

```typescript
// Calculate similarity between two embeddings
const embedding1 = await service.generateEmbedding('authentication logic');
const embedding2 = await service.generateEmbedding('login authentication');

const similarity = service.calculateSimilarity(embedding1, embedding2);
console.log(`Similarity: ${(similarity * 100).toFixed(1)}%`);

// Find similar embeddings among candidates
const query = 'database query optimization';
const queryEmbedding = await service.generateEmbedding(query);

const candidates = [
  {
    embedding: await service.generateEmbedding('SQL query performance'),
    metadata: { file: 'db.ts', function: 'optimizeQuery' },
  },
  {
    embedding: await service.generateEmbedding('authentication code'),
    metadata: { file: 'auth.ts', function: 'login' },
  },
];

const results = service.findSimilar(queryEmbedding, candidates, 5);

results.forEach((result) => {
  console.log(`[${(result.score * 100).toFixed(1)}%] ${result.chunk.file}`);
});
```

### Cache Management

```typescript
// Get cache statistics
const stats = service.getCacheStats();
console.log(`Cache entries: ${stats.totalEntries}`);
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Cache size: ${(stats.cacheSize / 1024 / 1024).toFixed(2)}MB`);

// Clear cache
await service.clearCache();

// Export cache for backup
service.exportCache('./backups/embeddings-2025-01-14.db');

// Import cache from backup
service.importCache('./backups/embeddings-2025-01-14.db');

// Cleanup expired entries
await service.cleanupExpiredEntries();
```

### Metrics and Monitoring

```typescript
// Get performance metrics
const metrics = service.getMetrics();
console.log('=== Embeddings Metrics ===');
console.log(`Total generated: ${metrics.totalGenerated}`);
console.log(`Average time: ${metrics.averageGenerationTime.toFixed(1)}ms`);
console.log(`Cache hits: ${metrics.totalCacheHits}`);
console.log(`Cache misses: ${metrics.totalCacheMisses}`);
console.log('Provider usage:', metrics.providerUsage);
console.log('Errors:', metrics.errors);

// Reset metrics
service.resetMetrics();
```

## MCP Server Integration

### Basic Setup

```typescript
import { PrismMCPServerV2 } from './prism/src/mcp/PrismMCPServerV2.js';
import { SQLiteVectorDB } from './prism/src/vector-db/SQLiteVectorDB.js';

const vectorDB = new SQLiteVectorDB({ path: './prism.db' });
const server = new PrismMCPServerV2({
  vectorDB,
  embeddingsConfig: {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiKey: process.env.CLOUDFLARE_API_KEY,
  },
});

await server.start();
```

### With Claude Code

Add to Claude Code's `settings.json`:

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": [
        "/path/to/prism/dist/mcp/cli.js",
        "--db", "./prism.db"
      ],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "your-account-id",
        "CLOUDFLARE_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Using MCP Tools

```typescript
// Search with semantic embeddings
const results = await server.searchRepo({
  query: 'authentication logic',
  limit: 10,
  minScore: 0.7,
});

// Get embeddings health
const health = await server.getEmbeddingsHealth();
console.log(health);

// Clear embeddings cache
await server.clearEmbeddingsCache({ confirm: true });
```

## Performance Optimization

### Cache Tuning

```typescript
// High-traffic scenario
const highTrafficConfig = {
  cachePath: './data/embeddings.db',
  cacheTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxCacheSize: 50000, // Larger cache
  batchSize: 20, // Larger batches
  maxConcurrency: 10, // More concurrency
};

// Low-latency scenario
const lowLatencyConfig = {
  cachePath: ':memory:', // In-memory for speed
  cacheTTL: 24 * 60 * 60 * 1000, // 1 day
  maxCacheSize: 5000,
  batchSize: 5,
  maxConcurrency: 3,
};
```

### Batch Processing Strategy

```typescript
// Process large datasets efficiently
async function indexLargeDataset(texts: string[]) {
  const BATCH_SIZE = 100;
  const results = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await service.generateBatchEmbeddings(batch);
    results.push(...result.results);

    // Add delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}
```

### Pre-warming Cache

```typescript
// Pre-cache common queries
const commonQueries = [
  'authentication',
  'database',
  'error handling',
  'API',
  'configuration',
];

for (const query of commonQueries) {
  await service.generateEmbedding(query);
}

console.log('Cache pre-warmed with common queries');
```

## Troubleshooting

### Common Issues

#### 1. Cloudflare API Errors

```bash
# Check credentials
echo $CLOUDFLARE_ACCOUNT_ID
echo $CLOUDFLARE_API_KEY

# Test API access
curl -X POST \
  -H "Authorization: Bearer $CLOUDFLARE_API_KEY" \
  -H "Content-Type: application/json" \
  https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/baai/bge-small-en-v1.5 \
  --data '{"text":["test"]}'
```

#### 2. Low Cache Hit Rate

```typescript
// Check cache statistics
const stats = service.getCacheStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);

// Increase cache size if needed
const newService = new SemanticEmbeddingsService({
  ...currentConfig,
  maxCacheSize: 20000, // Double the cache size
  cacheTTL: 14 * 24 * 60 * 60 * 1000, // Extend TTL to 14 days
});
```

#### 3. Slow Generation Times

```typescript
// Check metrics
const metrics = service.getMetrics();
console.log(`Average time: ${metrics.averageGenerationTime.toFixed(1)}ms`);

// If using Ollama, consider switching to Cloudflare
// Or increase timeout
const fasterService = new SemanticEmbeddingsService({
  ...currentConfig,
  timeout: 60000, // Increase timeout to 60s
  maxRetries: 5, // More retries
});
```

### Debug Mode

```typescript
// Enable logging
const server = new PrismMCPServerV2({
  vectorDB,
  embeddingsConfig: {
    // ... config
  },
  enableLogging: true, // Enable detailed logging
  enableHealthMonitoring: true, // Enable health monitoring
});

// Check health status
const health = server.getHealthStatus();
console.log('Health status:', health);
```

## Migration from Hash-based Embeddings

### Step 1: Backup Existing Data

```bash
# Backup current database
cp prism.db prism.db.backup
```

### Step 2: Update Configuration

```typescript
// Old configuration
const oldServer = new PrismMCPServer({
  vectorDB: new SQLiteVectorDB({ path: './prism.db' }),
  embeddingService: new EmbeddingService(),
});

// New configuration
const newServer = new PrismMCPServerV2({
  vectorDB: new SQLiteVectorDB({ path: './prism.db' }),
  embeddingsConfig: {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiKey: process.env.CLOUDFLARE_API_KEY,
  },
});
```

### Step 3: Progressive Migration

```typescript
// Re-embed chunks on access
async function getChunkWithMigration(chunkId: string) {
  const chunk = await vectorDB.getChunk(chunkId);

  // Check if embedding needs migration
  if (chunk.metadata?.embeddingType === 'hash') {
    console.log(`Migrating chunk ${chunkId} to semantic embeddings`);

    // Generate new semantic embedding
    const embedding = await embeddingsService.generateEmbedding(chunk.content);

    // Update database
    await vectorDB.update(chunkId, {
      metadata: {
        ...chunk.metadata,
        embeddingType: 'semantic',
        embeddingModel: embedding.model,
        migratedAt: Date.now(),
      },
    });
  }

  return chunk;
}
```

## Best Practices

### 1. Environment Variables

Always use environment variables for sensitive credentials:

```bash
# .env
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_KEY=your-api-key
```

```typescript
// config.ts
export const config = {
  embeddingsConfig: {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiKey: process.env.CLOUDFLARE_API_KEY,
  },
};
```

### 2. Error Handling

```typescript
try {
  const result = await service.generateEmbedding(text);
  console.log(`Generated in ${result.generationTime}ms`);
} catch (error) {
  if (error.message.includes('Cloudflare')) {
    console.error('Cloudflare API error:', error.message);
    // Implement retry logic or fallback
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### 3. Monitoring

```typescript
// Set up periodic monitoring
setInterval(() => {
  const metrics = service.getMetrics();
  const stats = service.getCacheStats();

  console.log('=== Embeddings Health ===');
  console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  console.log(`Avg time: ${metrics.averageGenerationTime.toFixed(1)}ms`);
  console.log(`Errors:`, metrics.errors);

  // Alert if performance degrades
  if (stats.hitRate < 0.5) {
    console.warn('Low cache hit rate detected!');
  }

  if (metrics.averageGenerationTime > 1000) {
    console.warn('High generation time detected!');
  }
}, 60000); // Every minute
```

### 4. Cache Management

```typescript
// Schedule regular cleanup
setInterval(async () => {
  await service.cleanupExpiredEntries();
  console.log('Cleaned up expired cache entries');
}, 24 * 60 * 60 * 1000); // Daily

// Regular backups
setInterval(() => {
  const date = new Date().toISOString().split('T')[0];
  service.exportCache(`./backups/embeddings-${date}.db`);
  console.log(`Backed up cache to embeddings-${date}.db`);
}, 7 * 24 * 60 * 60 * 1000); // Weekly
```

## References

- [Cloudflare Workers AI Documentation](https://developers.cloudflare.com/workers-ai)
- [BGE Small En V1.5 Model](https://huggingface.co/BAAI/bge-small-en-v1.5)
- [Ollama Embeddings](https://ollama.com/blog/embedding-models)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)

## Support

For issues and questions:
- GitHub Issues: [claude-haiku/claudes-friend](https://github.com/claude-haiku/claudes-friend)
- Documentation: [docs/](../docs/)
