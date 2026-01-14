# Semantic Embeddings - Quick Reference

## TL;DR

```typescript
import { SemanticEmbeddingsService } from './prism/src/mcp/semantic-embeddings.js';

// Initialize
const service = new SemanticEmbeddingsService({
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  cloudflareApiKey: process.env.CLOUDFLARE_API_KEY,
});

// Generate embedding
const result = await service.generateEmbedding('authentication logic');
console.log(`${result.generationTime}ms, ${result.provider}, cache: ${result.cacheHit}`);
```

## Environment Setup

```bash
# Required
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_KEY="your-api-key"

# Optional (Ollama fallback)
export OLLAMA_ENDPOINT="http://localhost:11434"
export OLLAMA_MODEL="nomic-embed-text"
```

## Common Operations

### Generate Single Embedding

```typescript
const result = await service.generateEmbedding('text');
// result.values: number[] (384 dimensions)
// result.generationTime: number (ms)
// result.provider: 'cloudflare' | 'ollama' | 'placeholder'
// result.cacheHit: boolean
```

### Batch Processing

```typescript
const results = await service.generateBatchEmbeddings([
  'text1', 'text2', 'text3'
]);
// results.successCount: number
// results.averageTime: number
// results.totalTime: number
```

### Similarity Calculation

```typescript
const similarity = service.calculateSimilarity(embedding1, embedding2);
// Returns 0-1 (higher = more similar)
```

### Similarity Search

```typescript
const results = service.findSimilar(
  queryEmbedding,
  [
    { embedding: emb1, metadata: { file: 'a.ts' } },
    { embedding: emb2, metadata: { file: 'b.ts' } },
  ],
  10 // limit
);
// results[0].score: number
// results[0].chunk: metadata
// results[0].metadata.rank: number
```

## Cache Management

```typescript
// Statistics
const stats = service.getCacheStats();
// stats.totalEntries, stats.hitRate, stats.cacheSize

// Clear cache
await service.clearCache();

// Export/Import
service.exportCache('./backup.db');
service.importCache('./backup.db');

// Cleanup expired
await service.cleanupExpiredEntries();
```

## Metrics

```typescript
const metrics = service.getMetrics();
// metrics.totalGenerated
// metrics.averageGenerationTime
// metrics.providerUsage
// metrics.errors

service.resetMetrics();
```

## Configuration

```typescript
const service = new SemanticEmbeddingsService({
  // Cloudflare
  cloudflareAccountId: string,
  cloudflareApiKey: string,
  model: '@cf/baai/bge-small-en-v1.5',

  // Ollama
  ollamaEndpoint: string,
  ollamaModel: string,

  // Cache
  cachePath: string,
  cacheTTL: number,
  maxCacheSize: number,

  // Performance
  batchSize: 10,
  maxConcurrency: 5,
  timeout: 30000,
  maxRetries: 3,

  // Features
  enableMetrics: true,
  fallbackToHash: true,
});
```

## MCP Server Integration

```typescript
import { PrismMCPServerV2 } from './prism/src/mcp/PrismMCPServerV2.js';

const server = new PrismMCPServerV2({
  vectorDB: new SQLiteVectorDB({ path: './prism.db' }),
  embeddingsConfig: {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiKey: process.env.CLOUDFLARE_API_KEY,
  },
  enableLogging: true,
  enableHealthMonitoring: true,
});

await server.start();
```

## Migration

```bash
# Dry run
node scripts/migrate-to-semantic-embeddings.ts --dry-run

# With backup
node scripts/migrate-to-semantic-embeddings.ts --backup

# Custom database
node scripts/migrate-to-semantic-embeddings.ts --db ./data/prism.db
```

## Performance Tips

1. **Increase cache size** for high-traffic scenarios
2. **Pre-cache common queries** during startup
3. **Use batch processing** for large datasets
4. **Monitor hit rate** and adjust TTL accordingly
5. **Enable metrics** for production monitoring

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Low hit rate | Increase `maxCacheSize` or `cacheTTL` |
| Slow generation | Check Cloudflare API, increase `timeout` |
| Many errors | Verify credentials, check rate limits |
| Memory issues | Reduce `maxCacheSize`, use file-based cache |

## File Locations

- Service: `/prism/src/mcp/semantic-embeddings.ts`
- MCP Server V2: `/prism/src/mcp/PrismMCPServerV2.ts`
- Migration: `/migrations/004_semantic_embeddings.sql`
- Tests: `/prism/tests/unit/mcp/SemanticEmbeddings.test.ts`
- Script: `/scripts/migrate-to-semantic-embeddings.ts`

## Key Metrics

- **Generation time**: 100-300ms (Cloudflare), 500-2000ms (Ollama)
- **Cache hit**: 5-10ms
- **Target hit rate**: >70%
- **Dimensions**: 384 (bge-small-en-v1.5)
- **Cache size**: ~1.5KB per embedding

## Error Handling

```typescript
try {
  const result = await service.generateEmbedding('text');
} catch (error) {
  if (error.message.includes('Cloudflare')) {
    // Handle Cloudflare API errors
  } else if (error.message.includes('Ollama')) {
    // Handle Ollama errors
  }
}
```

## Database Queries

```sql
-- Cache performance
SELECT * FROM v_cache_performance;

-- Provider usage
SELECT * FROM v_provider_stats;

-- Recent errors
SELECT * FROM v_error_stats;

-- Manual cleanup
DELETE FROM embedding_cache WHERE created_at < ?;
```

## Claude Code Config

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["/path/to/prism/dist/mcp/cli.js", "--db", "./prism.db"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "your-account-id",
        "CLOUDFLARE_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Health Check

```typescript
const health = server.getHealthStatus();
// health.status: 'healthy' | 'degraded' | 'unhealthy'
// health.embeddings.available: boolean
// health.cache.hitRate: number
```

## New MCP Tools

- `get_embeddings_health`: Get service health and metrics
- `clear_embeddings_cache`: Clear the cache (requires confirmation)

## References

- [Full Guide](./semantic-embeddings-guide.md)
- [Migration Guide](../migrations/004_semantic_embeddings.md)
- [Implementation Summary](../implementation/semantic-embeddings-summary.md)
