# API Key Security Guide

## Overview

PRISM provides secure storage and management of API keys using AES-256-GCM encryption. This guide explains the security model, best practices, and how to use the key management features.

## Table of Contents

- [Security Model](#security-model)
- [Quick Start](#quick-start)
- [Best Practices](#best-practices)
- [Key Management Commands](#key-management-commands)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

---

## Security Model

### Encryption

PRISM uses **AES-256-GCM** (Galois/Counter Mode) for encryption:

- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 with SHA-256 (100,000 iterations)
- **Key Source**: Machine-specific secret (hostname + platform + user ID)
- **Authentication**: GCM authentication tag prevents tampering
- **Nonce**: Unique per encryption (never reused)

### Security Layers

PRISM provides multiple layers of security, from most to least secure:

1. **Environment Variables** (Most Secure)
   - Keys never stored in files
   - Recommended for production
   - Survives config file leaks

2. **Encrypted Storage** (Good Practice)
   - Keys encrypted with AES-256-GCM
   - Machine-specific encryption
   - Safe for development/testing

3. **Plaintext** (Legacy - Not Recommended)
   - Keys stored in plain text
   - Auto-migrates to encrypted on load
   - Warns user to upgrade

### Threat Model

**Protects Against:**
- ✓ Config file theft (git commits, shared screenshots)
- ✓ Unauthorized access to config files
- ✓ Accidental key exposure in logs
- ✓ Shoulder surfing (keys are sanitized in output)

**Does NOT Protect Against:**
- ✗ Compromised machine (malware, keyloggers)
- ✗ Memory dumps (keys are decrypted in memory)
- ✗ Debuggers with memory access
- ✗ Physical access to unlocked machine

---

## Quick Start

### Option 1: Environment Variables (Recommended for Production)

```bash
# Set environment variables
export PRISM_CLOUDFLARE_API_KEY="your-cloudflare-api-key"
export PRISM_ANTHROPIC_API_KEY="sk-ant-api03-..."

# PRISM will automatically use these keys
prism index ./src
```

### Option 2: Encrypted Storage

```bash
# Store a key interactively (will prompt for input)
prism config:set-key cloudflare

# Store a key via command line
prism config:set-key anthropic sk-ant-api03-... --label "Production key"

# List all stored keys
prism config:list-keys

# Use PRISM (keys are automatically decrypted)
prism index ./src
```

---

## Best Practices

### 1. Use Environment Variables for Production

**Why**: Most secure - keys never stored in files.

```bash
# .env file (add to .gitignore!)
PRISM_CLOUDFLARE_API_KEY="your-key"
PRISM_ANTHROPIC_API_KEY="sk-ant-api03-..."

# Load in shell
source .env

# Or use dotenv in Node.js
npm install dotenv
echo 'PRISM_CLOUDFLARE_API_KEY="your-key"' > .env
```

### 2. Use Different Keys for Dev/Prod

**Why**: Limit blast radius if one key is compromised.

```bash
# Development
export PRISM_ANTHROPIC_API_KEY="sk-ant-api03-dev-key"

# Production
export PRISM_ANTHROPIC_API_KEY="sk-ant-api03-prod-key"
```

### 3. Rotate Keys Regularly

**Why**: Limit exposure if keys are leaked.

```bash
# Generate new key from service provider
# Then update stored key
prism config:set-key cloudflare NEW_KEY_HERE

# Or use environment variable
export PRISM_CLOUDFLARE_API_KEY="NEW_KEY_HERE"
```

### 4. Never Commit Keys to Git

**Why**: Git history is permanent and often public.

```bash
# Add to .gitignore
echo ".prism/" >> .gitignore
echo ".env" >> .gitignore

# Remove if already committed
git rm --cached ~/.prism/config.yaml
git commit -m "Remove sensitive config"
```

### 5. Use Minimal Scope Keys

**Why**: Principle of least privilege.

```bash
# Bad: Full account access
# Good: Minimal required permissions
- Cloudflare: Only Workers AI + Vectorize access
- GitHub: Only repo read access
- Anthropic: Only Claude API access
```

---

## Key Management Commands

### Store an API Key

**Interactive (Secure):**
```bash
prism config:set-key cloudflare
# Prompts for key (hidden input)
# Prompts for label (optional)
```

**Command Line:**
```bash
prism config:set-key anthropic sk-ant-api03-...
prism config:set-key cloudflare cf-api-key-... --label "Production"
```

**Supported Services:**
- `cloudflare` - Cloudflare API Token
- `anthropic` - Anthropic Claude API Key
- `openai` - OpenAI API Key
- `github` - GitHub Personal Access Token
- `huggingface` - Hugging Face API Token
- `cohere` - Cohere API Key

### List Stored Keys

```bash
prism config:list-keys
```

**Output:**
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

### Remove a Stored Key

```bash
prism config:remove-key github
# Confirms before removal
```

**Note:** This only removes the stored key, not environment variables.

### Validate a Key

```bash
prism config:validate-key cloudflare
```

**Output:**
```
API Key Validation: cloudflare
──────────────────────────────────────────────────────────────────
  ✓ Valid
  Service: cloudflare
  Type: Cloudflare API Token
──────────────────────────────────────────────────────────────────
```

---

## Configuration

### Encrypted Key Format

Keys are stored in `~/.prism/keys/api-keys.json`:

```json
{
  "cloudflare": {
    "service": "cloudflare",
    "keyData": {
      "encrypted": "base64-ciphertext",
      "salt": "base64-salt",
      "nonce": "base64-nonce",
      "authTag": "base64-authtag"
    },
    "createdAt": "2025-01-14T10:30:00.000Z",
    "updatedAt": "2025-01-14T10:30:00.000Z",
    "label": "Production token",
    "metadata": {
      "keyType": "Cloudflare API Token",
      "service": "cloudflare"
    }
  }
}
```

### Environment Variable Format

```bash
# Standard format
PRISM_<SERVICE>_API_KEY="your-key"

# Alternative formats (also checked)
PRISM_<SERVICE>_KEY="your-key"
PRISM_<SERVICE>_TOKEN="your-token"

# Service-specific alternatives
PRISM_CLOUDFLARE_TOKEN="your-token"
PRISM_ANTHROPIC_KEY="your-key"
PRISM_GITHUB_PAT="your-pat"
```

### Config File Format (Legacy)

In `~/.prism/config.yaml`:

```yaml
vectorDB:
  type: cloudflare
  apiKey: '{"encrypted":"...","salt":"...","nonce":"...","authTag":"..."}'
  accountId: '{"encrypted":"...","salt":"...","nonce":"...","authTag":"..."}'

# Or use environment variable references
vectorDB:
  type: cloudflare
  apiKey: ${CLOUDFLARE_API_KEY}
  accountId: ${CLOUDFLARE_ACCOUNT_ID}
```

---

## Troubleshooting

### "Failed to decrypt encrypted key"

**Cause:** Key was encrypted on a different machine.

**Solutions:**
1. Re-encrypt the key on current machine:
   ```bash
   prism config:set-key cloudflare YOUR_KEY_HERE
   ```

2. Use environment variable instead:
   ```bash
   export PRISM_CLOUDFLARE_API_KEY="YOUR_KEY_HERE"
   ```

3. Use same machine-specific secret (not recommended):
   ```bash
   export PRISM_ENCRYPTION_KEY="same-secret-as-other-machine"
   ```

### "No API key found for <service>"

**Cause:** Key not stored or environment variable not set.

**Solutions:**
1. Store the key:
   ```bash
   prism config:set-key <service> YOUR_KEY_HERE
   ```

2. Set environment variable:
   ```bash
   export PRISM_<SERVICE>_API_KEY="YOUR_KEY_HERE"
   ```

3. List available keys:
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

---

## Security Considerations

### Machine-Specific Encryption

PRISM derives encryption keys from machine-specific data:
- Hostname
- Platform (OS type)
- User ID
- CPU info
- Machine ID (Linux)

**Implications:**
- ✓ Keys encrypted on Machine A can only be decrypted on Machine A
- ✓ Config file theft is useless (can't decrypt on different machine)
- ✗ Cannot share encrypted config between machines
- ✗ Reinstalling OS may break decryption

**Workarounds:**
1. Use environment variables instead (recommended)
2. Re-encrypt keys on each machine
3. Use `PRISM_ENCRYPTION_KEY` environment variable for custom secret

### Key Rotation

**When to Rotate:**
- After security incident
- On regular schedule (e.g., quarterly)
- When team member leaves
- If key may have been compromised

**How to Rotate:**
```bash
# 1. Generate new key from service provider
# 2. Update stored key
prism config:set-key cloudflare NEW_KEY_HERE

# 3. Verify new key works
prism config:validate-key cloudflare
```

### Backup and Restore

**Backup Encrypted Keys:**
```bash
# Create timestamped backup
prism config:backup

# List available backups
prism config:list-backups

# Clean up old backups (keep 5 most recent)
prism config:cleanup

# Keep specific number of backups
prism config:cleanup --keep 3
```

**Restore Keys:**
```bash
# Interactive restore (prompts for backup)
prism config:restore

# Restore specific backup
prism config:restore ~/.prism/keys/.backups/api-keys-2025-01-14T10-30-00-000Z.json

# Merge with existing keys
prism config:restore --merge

# Restore without validation
prism config:restore --no-validate
```

**Warning:** Backups only work on same machine!

### Audit and Compliance

**Check What Keys Are Stored:**
```bash
prism config:list-keys
```

**Remove Unused Keys:**
```bash
prism config:remove-key unused-service
```

**Verify Key Access:**
```bash
# Check who can read keys
ls -la ~/.prism/keys/api-keys.json

# Should be readable only by you
# -rw------- 1 user group ... api-keys.json
```

---

## Migration Between Machines

**Export Keys (Plaintext - Handle with Care!):**
```bash
# Export keys to JSON file
prism config:export > keys-export.json

# Warning: Export contains plaintext keys!
# Handle the file securely (encrypt, password protect, etc.)
```

**Import Keys on New Machine:**
```bash
# Import from export file
prism config:import keys-export.json

# Import with merge
prism config:import keys-export.json --merge

# Import and overwrite existing keys
prism config:import keys-export.json --overwrite
```

**Migration Workflow:**
1. Export keys from old machine
2. Transfer export file securely (encrypted USB, secure file transfer, etc.)
3. Delete export from old machine after transfer
4. Import on new machine (keys will be re-encrypted for new machine)
5. Verify import: `prism config:list-keys`
6. Delete export file from new machine

**Security Notes:**
- Export contains **plaintext** keys - treat as highly sensitive
- Delete export files immediately after successful migration
- Never send exports via email or chat
- Use encrypted storage (USB drive, encrypted file, etc.) for transfer
- Consider using environment variables instead for production

---

## Advanced Usage

### Custom Encryption Key

For testing or custom setups:

```bash
export PRISM_ENCRYPTION_KEY="your-custom-secret-32-bytes-minimum"
```

**Warning:** Not recommended for production!

### Disable Encryption (Not Recommended)

```bash
export PRISM_NO_ENCRYPTION="true"
```

**Warning:** Keys will be stored in plaintext!

### Programmatic Usage

```typescript
import { KeyStorage, createKeyStorage } from '@prism/config';

// Create storage
const storage = new KeyStorage();
await storage.initialize();

// Store a key
await storage.set('cloudflare', 'your-api-key', 'Production token');

// Retrieve a key
const apiKey = await storage.get('cloudflare');

// List all keys
const keys = await storage.list();

// Remove a key
await storage.remove('cloudflare');

// Validate a key
const validation = await storage.validate('cloudflare');
console.log(validation.valid, validation.service);
```

---

## Summary

### Recommended Setup

**Development:**
```bash
# Use encrypted storage for convenience
prism config:set-key cloudflare
prism config:set-key anthropic
```

**Production:**
```bash
# Use environment variables for security
export PRISM_CLOUDFLARE_API_KEY="prod-key"
export PRISM_ANTHROPIC_API_KEY="prod-key"
```

**CI/CD:**
```bash
# Use secret management (GitHub Secrets, etc.)
# Inject as environment variables at runtime
export PRISM_CLOUDFLARE_API_KEY="${{ secrets.CLOUDFLARE_API_KEY }}"
```

### Security Checklist

- [ ] Using environment variables in production
- [ ] Different keys for dev/prod
- [ ] Keys never committed to git
- [ ] .prism/ in .gitignore
- [ ] Keys rotated regularly
- [ ] Minimal scope permissions
- [ ] Key access audited periodically
- [ ] Backup strategy in place

---

## Additional Resources

- [CLI Command Reference](../cli/01-command-reference.md)
- [Configuration Guide](../user/configuration.md)
- [Production Deployment](../production/deployment.md)
- [Security Best Practices](../production/security.md)
