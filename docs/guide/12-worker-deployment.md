# Cloudflare Workers Deployment Guide

**Version**: v0.2.0
**Last Updated**: 2025-01-13

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Manual Deployment](#manual-deployment)
5. [Configuration](#configuration)
6. [Environment Variables](#environment-variables)
7. [Migrations](#migrations)
8. [Monitoring & Logging](#monitoring--logging)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

---

## Overview

PRISM v0.2 can be deployed as a Cloudflare Worker, providing:

- **Serverless execution** - No servers to manage
- **Global edge network** - Low latency worldwide
- **Free tier compatible** - Stay within Cloudflare's free limits
- **D1 database** - Persistent SQLite storage
- **KV storage** - Fast key-value cache
- **Workers AI** - On-demand embeddings generation

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Cloudflare Worker                      │
│                                                         │
│  ┌──────────────┐         ┌──────────────┐            │
│  │  HTTP API    │────────▶│  Services    │            │
│  │  (itty-      │         │  (Indexer,   │            │
│  │   router)    │         │   Search)    │            │
│  └──────────────┘         └──────────────┘            │
│         │                         │                    │
│         ▼                         ▼                    │
│  ┌──────────────┐         ┌──────────────┐            │
│  │  Middleware  │         │  Embeddings  │            │
│  │  (Auth, CORS)│         │  (Workers AI)│            │
│  └──────────────┘         └──────────────┘            │
│                                         │                │
│         ┌───────────────┬───────────────┴────────┐     │
│         ▼               ▼               ▼          │     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐  │     │
│  │    D1    │    │    KV    │    │Vectorize │  │     │
│  │ Database │    │  Cache   │    │ (Optional)│  │     │
│  └──────────┘    └──────────┘    └──────────┘  │     │
│                                              │     │
└──────────────────────────────────────────────┼─────┘
                                               │
                                          Internet
```

---

## Prerequisites

### Required Tools

1. **Node.js** (v18+)
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

2. **npm** (comes with Node.js)
   ```bash
   npm --version
   ```

3. **Wrangler CLI** (Cloudflare's CLI tool)
   ```bash
   npm install -g wrangler
   wrangler --version  # Should be v3.0.0 or higher
   ```

### Cloudflare Account

1. Sign up at [Cloudflare](https://dash.cloudflare.com/sign-up)
2. Get your **Account ID** from the dashboard
3. Create an **API Token** with permissions:
   - Account - Cloudflare Workers:Edit
   - Account - Workers KV Storage:Edit
   - Account - D1:Edit

### Authentication

Login to Cloudflare:
```bash
wrangler login
```

This will open a browser window to authenticate.

---

## Quick Start

### 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/SuperInstance/PRISM.git
cd PRISM

# Install dependencies
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Deploy

```bash
# Run the deployment script
./scripts/deploy.sh
```

The script will:
- ✓ Create D1 database
- ✓ Run database migrations
- ✓ Create KV namespace
- ✓ Deploy Worker
- ✓ Verify deployment

### 4. Test

```bash
# Test health endpoint
curl https://prism-worker.claudes-friend.workers.dev/health
```

Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": 1705154400000,
  "version": "0.2.0"
}
```

---

## Manual Deployment

If you prefer manual deployment or need more control:

### Step 1: Create D1 Database

```bash
# Create database
wrangler d1 create claudes-friend-db

# Note the database_id from output
```

Update `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "claudes-friend-db"
database_id = "your-database-id-here"
```

### Step 2: Run Migrations

```bash
# Run initial schema
wrangler d1 execute claudes-friend-db --file=./migrations/001_initial.sql

# Run vector index schema
wrangler d1 execute claudes-friend-db --file=./migrations/002_vector_index.sql
```

### Step 3: Create KV Namespace

```bash
# Create namespace
wrangler kv:namespace create PRISM_INDEX

# Note the namespace id from output
```

Update `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "KV"
id = "your-namespace-id-here"
```

### Step 4: Deploy Worker

```bash
# Deploy to development
wrangler deploy

# Or deploy to production
wrangler deploy --env production
```

---

## Configuration

### wrangler.toml

The main configuration file for your Worker:

```toml
name = "prism-worker"
main = "src/worker.ts"
compatibility_date = "2024-01-01"
node_compat = true

# Environment variables
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "claudes-friend-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# KV Namespace binding
[[kv_namespaces]]
binding = "KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Production environment (optional)
[env.production]
name = "prism-worker-prod"

[env.production.vars]
ENVIRONMENT = "production"
LOG_LEVEL = "warn"

# Routes for production (optional)
[env.production.routes]
pattern = "api.yourdomain.com/*"
zone_name = "yourdomain.com"
```

### Build Configuration

Ensure your `package.json` has the correct build script:

```json
{
  "scripts": {
    "build": "npm run build:wasm && npm run build:ts",
    "build:wasm": "cd prism/prism-indexer && ./build.sh",
    "build:ts": "tsc",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
```

### TypeScript Configuration

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ES2022",
    "moduleResolution": "node",
    "lib": ["ES2021"],
    "types": ["@cloudflare/workers-types"],
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ENVIRONMENT` | Deployment environment | `production`, `development` |
| `LOG_LEVEL` | Logging verbosity | `debug`, `info`, `warn`, `error` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_SECRET` | API authentication secret | None (no auth) |
| `JWT_SECRET` | JWT signing secret | None (no JWT) |
| `RATE_LIMIT_MAX` | Max requests per minute | 100 |
| `RATE_LIMIT_WINDOW` | Time window in seconds | 60 |

### Setting Secrets

```bash
# Set secrets via wrangler
wrangler secret put API_SECRET
wrangler secret put JWT_SECRET

# List secrets
wrangler secret list

# Delete secrets
wrangler secret delete API_SECRET
```

---

## Migrations

### Creating Migrations

1. Create migration file in `migrations/`:
   ```bash
   touch migrations/003_new_feature.sql
   ```

2. Write your SQL:
   ```sql
   -- Create new table
   CREATE TABLE IF NOT EXISTS my_table (
     id TEXT PRIMARY KEY,
     data TEXT
   );
   ```

3. Run migration:
   ```bash
   wrangler d1 execute claudes-friend-db --file=./migrations/003_new_feature.sql
   ```

### Migration Rollback

**Warning**: D1 doesn't support transaction rollbacks. Manual rollback required:

```bash
# Create rollback migration
# migrations/003_rollback.sql
DROP TABLE IF EXISTS my_table;

# Execute rollback
wrangler d1 execute claudes-friend-db --file=./migrations/003_rollback.sql
```

---

## Monitoring & Logging

### View Logs

```bash
# Tail logs in real-time
wrangler tail

# Tail logs for production
wrangler tail --env production

# Filter logs by status
wrangler tail --format pretty | grep ERROR
```

### Metrics

Cloudflare provides built-in metrics:

1. **Workers Analytics**
   - Request count
   - Error rate
   - Response time
   - CPU usage

2. **D1 Analytics**
   - Query count
   - Query duration
   - Row count

3. **KV Analytics**
   - Read count
   - Write count
   - Cache hit rate

Access at: [Cloudflare Dashboard](https://dash.cloudflare.com)

### Custom Metrics

You can implement custom metrics in your Worker:

```typescript
export default {
  async fetch(request: Request, env: Env) {
    const start = Date.now();

    // Your logic here

    const duration = Date.now() - start;

    // Log custom metric
    console.log(JSON.stringify({
      metric: 'request_duration',
      value: duration,
      endpoint: new URL(request.url).pathname
    }));

    return response;
  }
};
```

---

## Troubleshooting

### Common Issues

#### 1. "Module not found" errors

**Problem**: TypeScript can't find modules.

**Solution**:
```bash
# Ensure dependencies are installed
npm install

# Rebuild
npm run build

# Clear cache
wrangler delete
wrangler deploy
```

#### 2. "D1 binding not found"

**Problem**: Worker can't access D1 database.

**Solution**:
- Check `wrangler.toml` for correct `database_name` and `database_id`
- Ensure D1 database exists: `wrangler d1 list`
- Verify binding name matches usage in code: `env.DB`

#### 3. "KV binding not found"

**Problem**: Worker can't access KV namespace.

**Solution**:
- Check `wrangler.toml` for correct `id`
- Ensure KV namespace exists: `wrangler kv:namespace list`
- Verify binding name matches usage in code: `env.KV`

#### 4. "CORS errors"

**Problem**: Browser blocks requests due to CORS.

**Solution**:
Ensure your Worker returns proper CORS headers:
```typescript
return new Response(JSON.stringify(data), {
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }
});
```

#### 5. "CPU limit exceeded"

**Problem**: Worker takes too long to process.

**Solution**:
- Use streaming responses for large data
- Implement pagination for search results
- Optimize database queries
- Cache frequently accessed data in KV

### Debug Mode

Enable debug logging:

```bash
# Set log level
wrangler secret put LOG_LEVEL
# Enter: debug

# View logs
wrangler tail
```

### Local Development

Test locally before deploying:

```bash
# Start local development server
wrangler dev

# Test endpoints
curl http://localhost:8787/health
curl http://localhost:8787/api/stats
```

---

## Best Practices

### 1. Free Tier Optimization

Stay within Cloudflare's free limits:

| Resource | Free Limit | Target Usage |
|----------|-----------|--------------|
| Worker Requests | 100,000/day | 50,000/day |
| D1 Reads | 5,000,000/day | 2,500,000/day |
| D1 Writes | 100,000/day | 50,000/day |
| KV Reads | 100,000/day | 50,000/day |
| KV Writes | 1,000/day | 500/day |
| AI Neurons | 10,000/day | 5,000/day |

### 2. Security

- **Always use secrets** for sensitive data
- **Validate input** from API requests
- **Implement rate limiting** to prevent abuse
- **Use HTTPS** only (Cloudflare default)
- **Set proper CORS** headers
- **Rotate API tokens** regularly

### 3. Performance

- **Cache aggressively** in KV
- **Use D1 prepared statements** to prevent SQL injection
- **Batch operations** when possible
- **Compress responses** for large payloads
- **Implement pagination** for search results
- **Use connection pooling** for D1

### 4. Monitoring

- **Set up alerts** for error rates
- **Monitor CPU usage** to avoid limits
- **Track business metrics** (searches, indexes)
- **Log important events** (errors, warnings)
- **Review logs** regularly

### 5. Deployment

- **Test locally** before deploying
- **Use separate environments** (dev, staging, prod)
- **Tag releases** in git
- **Keep migrations** reversible
- **Document changes** in CHANGELOG
- **Backup data** before major changes

---

## Advanced Topics

### Custom Domains

1. Add your domain to Cloudflare
2. Update `wrangler.toml`:
   ```toml
   routes = [
     { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
   ]
   ```
3. Deploy:
   ```bash
   wrangler deploy
   ```

### Webhook Integration

Configure webhooks for events:

```typescript
// POST /api/webhook
async function handleWebhook(request: Request) {
  const payload = await request.json();

  // Process webhook
  await processEvent(payload);

  return Response.json({ received: true });
}
```

### Scheduled Tasks

Use Cloudflare Workers Cron:

```toml
[triggers]
crons = ["0 * * * *"]  # Every hour
```

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // Run cleanup tasks
    await cleanupOldLogs(env);
  }
};
```

---

## Support

- **Documentation**: [docs/](../)
- **Issues**: [GitHub Issues](https://github.com/SuperInstance/PRISM/issues)
- **Discussions**: [GitHub Discussions](https://github.com/SuperInstance/PRISM/discussions)
- **Cloudflare Docs**: [developers.cloudflare.com](https://developers.cloudflare.com)

---

**Last Updated**: 2025-01-13
**Version**: v0.2.0
