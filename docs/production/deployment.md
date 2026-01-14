# PRISM Production Deployment Guide

**Version:** 0.1.0
**Last Updated:** 2026-01-13
**Target Audience:** DevOps Engineers, Platform Maintainers

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Production Build](#production-build)
5. [Cloudflare Workers Deployment](#cloudflare-workers-deployment)
6. [Vectorize Configuration](#vectorize-configuration)
7. [Database Migration](#database-migration)
8. [Environment Variables](#environment-variables)
9. [Verification](#verification)
10. [Rollback Procedures](#rollback-procedures)
11. [Troubleshooting](#troubleshooting)

---

## Overview

This guide covers deploying PRISM to production on Cloudflare's free tier. PRISM is a serverless RAG system that optimizes AI token usage through vector-based retrieval and adaptive compression.

### Architecture

```
┌─────────────────┐
│   Cloudflare    │
│    CDN/Edge     │
└────────┬────────┘
         │
         ├─────────────────────────────────┐
         │                                 │
    ┌────▼────┐                      ┌────▼────┐
    │  D1 DB  │                      │Vectorize│
    │ (SQLite)│                      │ (Vectors)│
    └────┬────┘                      └────┬────┘
         │                                 │
         └─────────────┬───────────────────┘
                       │
                ┌──────▼──────┐
                │   Workers   │
                │   Runtime   │
                └──────┬──────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
    │  Index  │  │Router   │  │ Optimizer│
    │  WASM   │  │LLM      │  │ Tokens  │
    └─────────┘  └─────────┘  └─────────┘
```

---

## Prerequisites

### Required Accounts

- [Cloudflare Account](https://dash.cloudflare.com/sign-up) (Free tier)
- [GitHub Account](https://github.com/signup) (for deployment automation, optional)

### Required Tools

```bash
# Node.js 18+ and npm
node --version  # Should be v18.0.0 or higher
npm --version   # Should be 8.0.0 or higher

# Wrangler CLI
npm install -g wrangler
wrangler --version  # Should be 3.x or higher

# Rust toolchain (for WASM compilation)
rustc --version     # Should be 1.70.0 or higher
cargo --version     # Should be 1.70.0 or higher

# Git
git --version
```

### System Requirements

- **RAM:** 4GB minimum (8GB recommended)
- **Disk:** 2GB free space
- **Network:** Stable internet connection
- **OS:** Linux, macOS, or WSL2 on Windows

---

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/prism.git
cd prism
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Wrangler

```bash
# Login to Cloudflare
wrangler login

# Verify authentication
wrangler whoami
```

### 4. Create Environment File

```bash
# Copy example environment file
cp .dev.vars.example .dev.vars

# Edit with your production values
nano .dev.vars
```

**CRITICAL SECURITY NOTE:** Never commit `.dev.vars` to version control. It contains sensitive secrets.

---

## Production Build

### 1. Build Rust WASM Indexer

```bash
# Navigate to Rust project
cd prism/prism-indexer

# Build WASM module
./build.sh

# Verify build success
ls -lh target/wasm32-unknown-unknown/release/prism_indexer.wasm
# Should be ~500KB-1MB

# Return to root
cd ../..
```

**Expected Output:**
```
[INFO] Compiling prism-indexer v0.1.0
[INFO] Finished release [optimized] target(s) in 45.2s
```

### 2. Build TypeScript

```bash
# Type-check and compile
npm run build

# Verify output
ls -lh dist/
# Should contain index.js and .d.ts files
```

**Expected Output:**
```
src/token-optimizer/TokenOptimizer.ts -> dist/token-optimizer/TokenOptimizer.js
src/scoring/scores/RelevanceScorer.ts -> dist/scoring/scores/RelevanceScorer.js
...
✓ Build completed in 2.3s
```

### 3. Run Tests

```bash
# Unit tests
npm test

# Integration tests (optional)
npm run test:integration

# Coverage report
npm run test:coverage
```

**Success Criteria:**
- All unit tests pass (127/127)
- Coverage >90%
- No TypeScript errors

---

## Cloudflare Workers Deployment

### 1. Create D1 Database

```bash
# Create production database
wrangler d1 create claudes-friend-db

# Copy the database_id from output
# Example: database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Update `wrangler.toml`:**

```toml
[[d1_databases]]
binding = "DB"
database_name = "claudes-friend-db"
database_id = "YOUR_DATABASE_ID_HERE"  # Paste from above
```

### 2. Create Vectorize Index

```bash
# Create vector index (384 dimensions for BGE-small)
wrangler vectorize create claudes-companion \
  --dimensions=384 \
  --metric=cosine

# Copy the index_id from output
```

### 3. Create KV Namespace

```bash
# Create KV namespace for caching
wrangler kv:namespace create "CACHE"

# Copy the namespace_id from output
```

**Update `wrangler.toml`:**

```toml
[[kv_namespaces]]
binding = "KV"
id = "YOUR_KV_NAMESPACE_ID_HERE"  # Paste from above
```

### 4. Deploy Worker

```bash
# Deploy to production
npm run deploy

# Or with verbose output
wrangler deploy --env production --loglevel debug
```

**Expected Output:**
```
✨ Built successfully
Uploaded claudes-friend (2.34 MB)
Published claudes-friend (0.12 sec)
  https://claudes-friend.YOUR_SUBDOMAIN.workers.dev
```

### 5. Configure Custom Domain (Optional)

```bash
# Add custom domain
wrangler domains add api.yourdomain.com

# Update DNS records
# A record: api.yourdomain.com -> YOUR_WORKERS_SUBDOMAIN.workers.dev
```

---

## Vectorize Configuration

### 1. Initialize Vector Index

```bash
# Run initial index setup
wrangler d1 execute claudes-friend-db --command="
  INSERT INTO metadata (key, value)
  VALUES ('vectorize_index_id', 'YOUR_INDEX_ID'),
         ('vector_dimensions', '384'),
         ('vector_metric', 'cosine')
"
```

### 2. Configure Indexing Strategy

Edit `wrangler.toml`:

```toml
[vars]
EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5"
VECTOR_DIMENSIONS = "384"
DEFAULT_TOP_K = "10"
ENABLE_RERANKING = "false"
```

### 3. Test Vector Query

```bash
# Test vector search
curl -X POST https://claudes-friend.YOUR_SUBDOMAIN.workers.dev/api/search \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test search query",
    "top_k": 5
  }'
```

---

## Database Migration

### 1. Run Initial Migration

```bash
# Apply schema to D1 database
npm run db:migrate

# Or manually:
wrangler d1 execute claudes-friend-db \
  --file=./migrations/001_initial.sql
```

**Expected Output:**
```
🌀 Executing on database claudes-friend-db (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx):
✅ Successfully executed 23 commands
```

### 2. Verify Schema

```bash
# List all tables
wrangler d1 execute claudes-friend-db --command="
  SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
"

# Expected tables:
# - api_keys
# - cache_metadata
# - conversations
# - document_chunks
# - document_relationships
# - documents
# - usage_log
# - users
```

### 3. Seed Initial Data (Optional)

```bash
# Create default admin user
wrangler d1 execute claudes-friend-db --command="
  INSERT INTO users (id, api_key_hash, email, preferences)
  VALUES (
    'admin',
    'HASH_OF_YOUR_API_KEY',
    'admin@yourdomain.com',
    '{\"role\": \"admin\", \"quota\": 1000000}'
  );
"
```

**SECURITY NOTE:** Hash API keys using bcrypt before inserting.

---

## Environment Variables

### Production Variables

Set these in Cloudflare Workers dashboard or `wrangler.toml`:

```toml
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"

# AI Models
DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast"
CODE_MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct"
QUICK_MODEL = "@cf/meta/llama-3.2-1b-instruct"
EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5"

# Performance
MAX_TOKENS = "2048"
TEMPERATURE = "0.7"
DEFAULT_TOP_K = "10"

# Free Tier Limits
MAX_NEURONS_PER_DAY = "10000"
MAX_REQUESTS_PER_DAY = "100000"
MAX_KV_READS_PER_DAY = "100000"
MAX_KV_WRITES_PER_DAY = "1000"
MAX_D1_READS_PER_DAY = "5000000"
MAX_D1_WRITES_PER_DAY = "100000"

# Feature Flags
ENABLE_STREAMING = "true"
ENABLE_ANALYTICS = "true"
ENABLE_MODERATION = "true"
```

### Secrets Management

**NEVER commit secrets to git.** Use Cloudflare Secrets:

```bash
# API Authentication
wrangler secret put API_SECRET
# Enter: Your strong random string (32+ chars)

wrangler secret put JWT_SECRET
# Enter: Your JWT signing secret (32+ chars)

# CORS Configuration
wrangler secret put CORS_ORIGINS
# Enter: https://yourdomain.com,https://app.yourdomain.com
```

### Generate Secure Secrets

```bash
# Generate API_SECRET
openssl rand -base64 32

# Generate JWT_SECRET
openssl rand -base64 32
```

---

## Verification

### 1. Health Check Endpoint

```bash
curl https://claudes-friend.YOUR_SUBDOMAIN.workers.dev/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2026-01-13T10:30:00Z",
  "services": {
    "database": "connected",
    "vectorize": "connected",
    "kv": "connected",
    "ai": "available"
  }
}
```

### 2. API Authentication Test

```bash
curl -X POST https://claudes-friend.YOUR_SUBDOMAIN.workers.dev/api/v1/chat \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, PRISM!",
    "model": "quick"
  }'
```

### 3. Database Connection Test

```bash
wrangler d1 execute claudes-friend-db --command="
  SELECT COUNT(*) as table_count
  FROM sqlite_master
  WHERE type='table'
"
```

### 4. Vector Index Test

```bash
wrangler vectorize list
# Should show "claudes-companion" index
```

### 5. Monitoring Dashboard

Visit Cloudflare Dashboard:
- **Workers:** https://dash.cloudflare.com/→Workers→claudes-friend
- **D1:** https://dash.cloudflare.com/→D1→claudes-friend-db
- **Vectorize:** https://dash.cloudflare.com/→Vectorize→claudes-companion
- **KV:** https://dash.cloudflare.com/→Workers KV→CACHE

---

## Rollback Procedures

### Scenario 1: Broken Deployment

```bash
# List recent deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback --env production

# Or deploy specific version
wrangler deploy --env production --version=42
```

### Scenario 2: Database Migration Failure

```bash
# Backup current database
npm run db:backup

# Rollback migration manually
wrangler d1 execute claudes-friend-db --file=./migrations/rollback/001_undo.sql

# Verify data integrity
wrangler d1 execute claudes-friend-db --command="
  SELECT COUNT(*) FROM documents
"
```

### Scenario 3: Vector Index Corruption

```bash
# Export current vectors (if possible)
wrangler vectorize export claudes-companion > vectors.json

# Recreate index
wrangler vectorize delete claudes-companion
wrangler vectorize create claudes-companion \
  --dimensions=384 \
  --metric=cosine

# Reindex vectors
npm run reindex
```

### Scenario 4: Configuration Issues

```bash
# Deploy with environment override
wrangler deploy --env production --var LOG_LEVEL=debug

# Check logs
wrangler tail --env production

# Reset to last known good config
git checkout HEAD~1 wrangler.toml
wrangler deploy --env production
```

### Emergency Rollback Script

```bash
#!/bin/bash
# rollback.sh - Emergency rollback procedure

echo "🔄 Starting emergency rollback..."

# 1. Get last stable commit
LAST_STABLE=$(git log --grep="stable" -n 1 --format=%H)
echo "📍 Rolling back to: $LAST_STABLE"

# 2. Checkout stable version
git checkout $LAST_STABLE

# 3. Rebuild
npm run build

# 4. Deploy
wrangler deploy --env production

# 5. Verify
curl -f https://claudes-friend.YOUR_SUBDOMAIN.workers.dev/health || exit 1

echo "✅ Rollback complete"
```

---

## Troubleshooting

### Issue: Deployment Fails with "Module Not Found"

**Symptom:**
```
Error: Cannot find module '@cloudflare/workers-types'
```

**Solution:**
```bash
# Clean install dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
wrangler deploy
```

### Issue: D1 Database Connection Timeout

**Symptom:**
```
Error: D1_ERROR: Database connection timeout
```

**Solution:**
```bash
# Check database status
wrangler d1 info claudes-friend-db

# Test connection
wrangler d1 execute claudes-friend-db --command="SELECT 1"

# If failed, recreate database
wrangler d1 delete claudes-friend-db
wrangler d1 create claudes-friend-db
# Update wrangler.toml with new database_id
```

### Issue: Vector Index Returns No Results

**Symptom:**
```json
{
  "results": [],
  "count": 0
}
```

**Solution:**
```bash
# Check index configuration
wrangler vectorize describe claudes-companion

# Verify vector dimensions match
# (384 for BGE-small, 768 for BGE-base)

# Reindex if needed
npm run reindex
```

### Issue: High Memory Usage

**Symptom:**
```
Error: Worker exceeded memory limit of 128MB
```

**Solution:**
```bash
# Reduce batch size in wrangler.toml
[vars]
EMBEDDING_BATCH_SIZE = "16"  # Reduce from 32

# Reduce cache TTL
[vars]
DEFAULT_CACHE_TTL = "1800"  # Reduce from 3600

# Monitor usage
wrangler tail --format pretty --status
```

### Issue: Rate Limiting Errors

**Symptom:**
```
Error: Rate limit exceeded: free tier quota
```

**Solution:**
```bash
# Check current usage
wrangler d1 execute claudes-friend-db --command="
  SELECT metric, SUM(value) as total
  FROM usage_log
  WHERE date >= date('now', '-1 day')
  GROUP BY metric
"

# Implement caching
# (See Caching Guide)

# Consider upgrading to paid plan if consistently hitting limits
```

### Issue: Authentication Failures

**Symptom:**
```
Error: Invalid API credentials
```

**Solution:**
```bash
# Verify secrets are set
wrangler secret list

# Reset API_SECRET if needed
wrangler secret put API_SECRET

# Update client applications with new secret
```

---

## Performance Optimization

### Pre-Deployment Checklist

- [ ] All unit tests pass (127/127)
- [ ] Database migration applied successfully
- [ ] Vector index configured and tested
- [ ] Environment variables set correctly
- [ ] Secrets configured (never in git)
- [ ] Health check endpoint responding
- [ ] Custom domain configured (if applicable)
- [ ] Monitoring/alerting configured
- [ ] Backup procedures tested
- [ ] Rollback procedure documented

### Post-Deployment Verification

```bash
# Run smoke tests
npm run test:smoke

# Monitor logs for 5 minutes
wrangler tail --format pretty --duration 5m

# Check analytics dashboard
# https://dash.cloudflare.com/→Workers→claudes-friend→Analytics
```

---

## Next Steps

After successful deployment:

1. **Set up monitoring:** See [Operations Guide](operations.md)
2. **Configure scaling:** See [Scaling Guide](scaling.md)
3. **Secure deployment:** See [Security Guide](security.md)
4. **Schedule maintenance:** See [Maintenance Guide](maintenance.md)

---

## Support

- **Documentation:** https://github.com/your-org/claudes-friend/docs
- **Issues:** https://github.com/your-org/claudes-friend/issues
- **Discussions:** https://github.com/your-org/claudes-friend/discussions

---

**Last Updated:** 2026-01-13
**Version:** 0.1.0
**Maintainer:** DevOps Team
