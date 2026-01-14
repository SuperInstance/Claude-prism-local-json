#!/usr/bin/env node

/**
 * Index all project source files to remote Cloudflare Worker
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKER_URL = 'https://claudes-friend.casey-digennaro.workers.dev';
const SRC_DIR = join(__dirname, '../src');
const BATCH_SIZE = 1; // Process 1 file at a time to avoid errors

// File extensions to index
const EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx']);

// Files to skip
const SKIP_PATTERNS = [
  '.test.ts',
  '.spec.ts',
  '.mock.ts',
  'node_modules',
];

function shouldSkipFile(filePath) {
  return SKIP_PATTERNS.some(pattern => filePath.includes(pattern));
}

function detectLanguage(filePath) {
  const ext = extname(filePath).toLowerCase();
  const langMap = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
  };
  return langMap[ext] || 'text';
}

function collectFiles(dir, baseDir = dir) {
  const files = [];

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      files.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (EXTENSIONS.has(ext) && !shouldSkipFile(fullPath)) {
        const relPath = relative(baseDir, fullPath);
        const content = readFileSync(fullPath, 'utf-8');

        files.push({
          path: relPath.replace(/\\/g, '/'), // Use forward slashes
          content,
          language: detectLanguage(fullPath),
        });
      }
    }
  }

  return files;
}

async function indexBatch(files) {
  const payload = { files };

  const response = await fetch(`${WORKER_URL}/api/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function main() {
  console.log('🔍 Collecting source files...');

  const allFiles = collectFiles(SRC_DIR);

  console.log(`✓ Found ${allFiles.length} files to index`);

  let totalIndexed = 0;
  let totalChunks = 0;
  let totalErrors = 0;
  let totalDuration = 0;

  // Process in batches
  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    const batch = allFiles.slice(i, Math.min(i + BATCH_SIZE, allFiles.length));
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allFiles.length / BATCH_SIZE);

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} files)...`);

    try {
      const result = await indexBatch(batch);

      if (result.success) {
        console.log(`  ✓ Indexed ${result.data.files} files → ${result.data.chunks} chunks (${result.data.duration}ms)`);
        totalIndexed += result.data.files;
        totalChunks += result.data.chunks;
        totalDuration += result.data.duration;

        if (result.data.errors > 0) {
          console.log(`  ⚠️  ${result.data.errors} errors`);
          totalErrors += result.data.errors;
          if (result.data.failedFiles.length > 0) {
            result.data.failedFiles.forEach(f => console.log(`    - ${f}`));
          }
        }
      } else {
        console.error(`  ✗ Failed: ${result.error}`);
        totalErrors += batch.length;
      }
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      totalErrors += batch.length;
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < allFiles.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Indexing Summary');
  console.log('='.repeat(60));
  console.log(`Files indexed:  ${totalIndexed}`);
  console.log(`Chunks created:  ${totalChunks}`);
  console.log(`Errors:         ${totalErrors}`);
  console.log(`Total duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
  console.log(`Avg per file:   ${(totalDuration / totalIndexed).toFixed(0)}ms`);
  console.log('='.repeat(60));

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
