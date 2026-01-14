# API Key Encryption Quick Start Guide

## Overview

PRISM provides secure, encrypted storage for API keys using AES-256-GCM encryption. This guide will help you get started with secure key management in under 5 minutes.

## Table of Contents

- [Option 1: Environment Variables (Recommended)](#option-1-environment-variables-recommended)
- [Option 2: Encrypted Storage](#option-2-encrypted-storage)
- [Option 3: Migration from Existing Keys](#option-3-migration-from-existing-keys)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

---

## Option 1: Environment Variables (Recommended)

**Best for:** Production, CI/CD, Docker containers

**Security:** Most secure (keys never stored in files)

### Quick Setup

```bash
# Set your API keys as environment variables
export PRISM_CLOUDFLARE_API_KEY="your-cloudflare-api-key"
export PRISM_ANTHROPIC_API_KEY="sk-ant-api03-..."

# Use PRISM - keys are automatically available
prism index ./src
prism search "database query"
```

### Permanent Setup

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
# API Keys for PRISM
export PRISM_CLOUDFLARE_API_KEY="your-cloudflare-api-key"
export PRISM_ANTHROPIC_API_KEY="sk-ant-api03-..."
```

### Using .env Files

```bash
# Create .env file (add to .gitignore!)
cat > .env << EOF
PRISM_CLOUDFLARE_API_KEY="your-cloudflare-api-key"
PRISM_ANTHROPIC_API_KEY="sk-ant-api03-..."
EOF

# Add to .gitignore
echo ".env" >> .gitignore

# Load in shell
source .env

# Or use with dotenv in Node.js
npm install dotenv
echo 'require("dotenv").config()' >> index.js
```

---

## Option 2: Encrypted Storage

**Best for:** Development, local testing

**Security:** Good (keys encrypted with machine-specific secret)

### Quick Setup

```bash
# Store your first API key (interactive - will prompt for input)
prism config:set-key cloudflare

# Or provide key directly (less secure - appears in shell history)
prism config:set-key anthropic sk-ant-api03-...

# List stored keys
prism config:list-keys

# Use PRISM - keys are automatically decrypted
prism index ./src
```

### Interactive Key Storage

```bash
# Store a key with label (prompts for input)
prism config:set-key cloudflare
# Prompts:
# Enter cloudflare API key: [hidden input]
# Enter cloudflare label (optional): Production token
```

### Supported Services

```bash
# Cloudflare (Workers AI, Vectorize, D1)
prism config:set-key cloudflare

# Anthropic (Claude API)
prism config:set-key anthropic

# OpenAI (GPT models)
prism config:set-key openai

# GitHub (Integration)
prism config:set-key github

# Hugging Face (ML models)
prism config:set-key huggingface

# Cohere (Language models)
prism config:set-key cohere
```

---

## Option 3: Migration from Existing Keys

**Best for:** Migrating from plaintext config files

### Automatic Migration

PRISM automatically detects and migrates plaintext API keys:

```bash
# Run any PRISM command - migration happens automatically
prism index ./src

# Check your keys
prism config:list-keys
```

### Manual Migration Script

```bash
# Dry run - see what would be migrated
node prism/scripts/migrate-api-keys-to-encrypted.ts --dry-run

# Interactive migration
node prism/scripts/migrate-api-keys-to-encrypted.ts

# Force migration without prompts
node prism/scripts/migrate-api-keys-to-encrypted.ts --force

# Rollback if needed
node prism/scripts/migrate-api-keys-to-encrypted.ts --rollback <backup-path>
```

---

## Common Tasks

### List All Keys

```bash
prism config:list-keys
```

Output:
```
Stored API Keys
──────────────────────────────────────────────────────────────────
  anthropic
    Key: sk-ant-a...cdef
    Label: Production key
    Source: Encrypted Storage
    Created: 2025-01-14T10:30:00.000Z
    Updated: 2025-01-14T10:30:00.000Z

  cloudflare
    Key: cf-api-...1234
    Source: Environment Variable
──────────────────────────────────────────────────────────────────
```

### Validate Keys

```bash
prism config:validate-key cloudflare
```

Output:
```
API Key Validation: cloudflare
──────────────────────────────────────────────────────────────────
  ✓ Valid
  Service: cloudflare
  Type: Cloudflare API Token
──────────────────────────────────────────────────────────────────
```

### Remove Keys

```bash
# Remove stored key
prism config:remove-key github

# Note: Environment variables are not affected
# To remove env var, use: unset PRISM_GITHUB_TOKEN
```

### Backup Keys

```bash
# Create timestamped backup
prism config:backup

# List available backups
prism config:list-backups

# Restore from backup
prism config:restore ~/.prism/keys/.backups/api-keys-2025-01-14.json

# Clean up old backups (keep 5 most recent)
prism config:cleanup

# Keep specific number of backups
prism config:cleanup --keep 3
```

### Migrate Between Machines

```bash
# On old machine: Export keys
prism config:export > keys-export.json

# Transfer export file securely (encrypted USB, etc.)

# On new machine: Import keys
prism config:import keys-export.json

# Verify import
prism config:list-keys

# Delete export file
rm keys-export.json
```

---

## Troubleshooting

### "Failed to decrypt encrypted key"

**Cause:** Key was encrypted on a different machine.

**Solutions:**

1. **Re-encrypt on current machine:**
   ```bash
   prism config:set-key cloudflare YOUR_KEY_HERE
   ```

2. **Use environment variable instead:**
   ```bash
   export PRISM_CLOUDFLARE_API_KEY="YOUR_KEY_HERE"
   ```

3. **Use custom encryption key (not recommended):**
   ```bash
   export PRISM_ENCRYPTION_KEY="same-secret-as-other-machine"
   ```

### "No API key found for <service>"

**Cause:** Key not stored or environment variable not set.

**Solutions:**

1. **Store the key:**
   ```bash
   prism config:set-key <service> YOUR_KEY_HERE
   ```

2. **Set environment variable:**
   ```bash
   export PRISM_<SERVICE>_API_KEY="YOUR_KEY_HERE"
   ```

3. **List available keys:**
   ```bash
   prism config:list-keys
   ```

### "Invalid API key format"

**Cause:** Key doesn't match expected format for service.

**Solutions:**

1. Verify you're using correct key type
2. Check for typos or extra spaces
3. Generate new key from service provider

### Key shows as "<decryption failed>"

**Cause:** Key was encrypted on different machine.

**Solution:** Same as "Failed to decrypt encrypted key" above.

### Migration script fails

**Solutions:**

1. **Check backup:**
   ```bash
   # List backups
   prism config:list-backups

   # Restore from backup
   prism config:restore <backup-path>
   ```

2. **Rollback migration:**
   ```bash
   node prism/scripts/migrate-api-keys-to-encrypted.ts --rollback <backup-path>
   ```

3. **Run migration with --force:**
   ```bash
   node prism/scripts/migrate-api-keys-to-encrypted.ts --force
   ```

---

## Best Practices

### 1. Use Environment Variables for Production

```bash
# Production
export PRISM_CLOUDFLARE_API_KEY="prod-key"
export PRISM_ANTHROPIC_API_KEY="prod-key"

# Development
export PRISM_CLOUDFLARE_API_KEY="dev-key"
export PRISM_ANTHROPIC_API_KEY="dev-key"
```

### 2. Use Different Keys for Dev/Prod

```bash
# Limit blast radius if one key is compromised
# Dev key: Limited scope, lower limits
# Prod key: Full scope, higher limits
```

### 3. Never Commit Keys to Git

```bash
# Add to .gitignore
echo ".prism/" >> .gitignore
echo ".env" >> .gitignore

# Remove if already committed
git rm --cached ~/.prism/config.yaml
git commit -m "Remove sensitive config"
```

### 4. Rotate Keys Regularly

```bash
# Generate new key from service provider
# Then update stored key
prism config:set-key cloudflare NEW_KEY_HERE

# Or use environment variable
export PRISM_CLOUDFLARE_API_KEY="NEW_KEY_HERE"
```

### 5. Use Minimal Scope Keys

```bash
# Bad: Full account access
# Good: Minimal required permissions
- Cloudflare: Only Workers AI + Vectorize access
- GitHub: Only repo read access
- Anthropic: Only Claude API access
```

### 6. Backup Keys Before Major Changes

```bash
# Backup before migration
prism config:backup

# Backup before major upgrade
prism config:backup

# Clean up old backups regularly
prism config:cleanup --keep 5
```

### 7. Audit Keys Periodically

```bash
# Check what keys are stored
prism config:list-keys

# Remove unused keys
prism config:remove-key unused-service

# Verify file permissions
ls -la ~/.prism/keys/api-keys.json
# Should be: -rw------- (read/write for owner only)
```

---

## Security Checklist

- [ ] Using environment variables in production
- [ ] Different keys for dev/prod
- [ ] Keys never committed to git
- [ ] .prism/ in .gitignore
- [ ] Keys rotated regularly
- [ ] Minimal scope permissions
- [ ] Key access audited periodically
- [ ] Backup strategy in place
- [ ] Old backups cleaned up
- [ ] Migration files deleted after use

---

## Next Steps

1. **Choose your storage method:**
   - Environment variables for production
   - Encrypted storage for development

2. **Set up your keys:**
   ```bash
   prism config:set-key cloudflare
   prism config:set-key anthropic
   ```

3. **Verify setup:**
   ```bash
   prism config:list-keys
   prism config:validate-key cloudflare
   ```

4. **Create backup:**
   ```bash
   prism config:backup
   ```

5. **Start using PRISM:**
   ```bash
   prism index ./src
   prism search "database query"
   ```

---

## Additional Resources

- [API Key Security Guide](./api-key-security.md) - Comprehensive security documentation
- [CLI Command Reference](../cli/01-command-reference.md) - All CLI commands
- [Configuration Guide](../user/configuration.md) - Configuration options
- [Production Deployment](../production/deployment.md) - Production setup

---

## Summary

**Quick Start (30 seconds):**
```bash
# Option 1: Environment variables (recommended)
export PRISM_CLOUDFLARE_API_KEY="your-key"

# Option 2: Encrypted storage
prism config:set-key cloudflare

# Verify
prism config:list-keys

# Use PRISM
prism index ./src
```

**For Production:**
- Use environment variables
- Different keys for dev/prod
- Rotate keys regularly
- Never commit to git

**For Development:**
- Use encrypted storage for convenience
- Backup keys before major changes
- Clean up old backups
- Audit keys periodically
