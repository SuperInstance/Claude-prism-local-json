#!/usr/bin/env node

/**
 * PRISM CLI - Remote Worker Interface
 *
 * Command-line interface for the PRISM code search and indexing service.
 * Wraps the remote Cloudflare Worker with easy-to-use commands.
 *
 * Usage:
 *   prism index <path>     [options]
 *   prism search <query>   [options]
 *   prism suggest [prefix]  Get query suggestions
 *   prism history          [options]
 *   prism favorites        [options]
 *   prism stats
 *   prism health
 */

import { readFileSync, readdirSync, statSync, writeFileSync, readFileSync as fsReadFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const WORKER_URL = process.env.PRISM_URL || 'https://claudes-friend.casey-digennaro.workers.dev';
const PRISM_DIR = join(homedir(), '.prism');
const HISTORY_FILE = join(PRISM_DIR, 'history.json');
const FAVORITES_FILE = join(PRISM_DIR, 'favorites.json');

// File extensions to index
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h']);

// Files to skip
const SKIP_PATTERNS = [
  '.test.',
  '.spec.',
  '.mock.',
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
];

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'cyan');
}

// ============================================================================
// HISTORY & FAVORITES
// ============================================================================

function ensurePrismDir() {
  if (!existsSync(PRISM_DIR)) {
    mkdirSync(PRISM_DIR, { recursive: true });
  }
}

function loadHistory() {
  ensurePrismDir();
  if (!existsSync(HISTORY_FILE)) {
    writeFileSync(HISTORY_FILE, '[]');
    return [];
  }
  try {
    const data = fsReadFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveHistory(history) {
  ensurePrismDir();
  writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-100), null, 2));
}

function addToHistory(query, options, resultCount) {
  const history = loadHistory();
  history.push({
    id: Date.now().toString(),
    query,
    filters: options.filters || {},
    limit: options.limit || 10,
    minScore: options.minScore || 0,
    resultCount,
    timestamp: new Date().toISOString(),
  });
  saveHistory(history);
}

function loadFavorites() {
  ensurePrismDir();
  if (!existsSync(FAVORITES_FILE)) {
    writeFileSync(FAVORITES_FILE, '[]');
    return [];
  }
  try {
    const data = fsReadFileSync(FAVORITES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveFavorites(favorites) {
  ensurePrismDir();
  writeFileSync(FAVORITES_FILE, JSON.stringify(favorites, null, 2));
}

function addFavorite(query, options) {
  const favorites = loadFavorites();
  const exists = favorites.some(f =>
    f.query === query &&
    JSON.stringify(f.filters) === JSON.stringify(options.filters || {})
  );

  if (exists) {
    logInfo('This search is already in favorites');
    return false;
  }

  favorites.push({
    id: Date.now().toString(),
    query,
    filters: options.filters || {},
    limit: options.limit || 10,
    minScore: options.minScore || 0,
    timestamp: new Date().toISOString(),
    notes: '',
  });

  saveFavorites(favorites);
  return true;
}

function removeFavorite(id) {
  const favorites = loadFavorites();
  const initialLength = favorites.length;
  const filtered = favorites.filter(f => f.id !== id);

  if (filtered.length === initialLength) {
    return false;
  }

  saveFavorites(filtered);
  return true;
}

// ============================================================================
// SUGGESTIONS
// ============================================================================

function getQueryFrequencyMap(history) {
  const freq = new Map();
  history.forEach(entry => {
    const query = entry.query.toLowerCase();
    freq.set(query, (freq.get(query) || 0) + 1);
  });
  return freq;
}

function getPopularQueries(history, limit = 10) {
  const freq = getQueryFrequencyMap(history);
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  return sorted.map(([query, count]) => ({ query, count }));
}

function getSuggestions(prefix = '', limit = 10) {
  const history = loadHistory();
  
  if (history.length === 0) {
    return {
      popular: [],
      recent: [],
      basedOnPrefix: []
    };
  }

  // Get popular queries
  const popular = getPopularQueries(history, limit);

  // Get recent unique queries
  const recentMap = new Map();
  const recent = [];
  for (let i = history.length - 1; i >= Math.max(0, history.length - 50); i--) {
    const query = history[i].query;
    if (!recentMap.has(query)) {
      recentMap.set(query, true);
      recent.push({
        query,
        timestamp: history[i].timestamp
      });
      if (recent.length >= limit) break;
    }
  }

  // Get queries matching prefix
  let basedOnPrefix = [];
  if (prefix && prefix.length > 0) {
    const prefixLower = prefix.toLowerCase();
    const prefixMap = new Map();
    
    history.forEach(entry => {
      const query = entry.query.toLowerCase();
      if (query.startsWith(prefixLower) && !prefixMap.has(query)) {
        const freq = getQueryFrequencyMap(history).get(query) || 1;
        prefixMap.set(query, true);
        basedOnPrefix.push({
          query: entry.query,
          frequency: freq
        });
      }
    });

    basedOnPrefix.sort((a, b) => b.frequency - a.frequency);
    basedOnPrefix = basedOnPrefix.slice(0, limit);
  }

  return {
    popular: popular.map(p => p.query),
    recent: recent.map(r => r.query),
    basedOnPrefix: basedOnPrefix.map(p => p.query)
  };
}

function extractTermsFromResults(results) {
  const terms = new Set();
  
  results.forEach(r => {
    // Extract from file path
    const pathParts = r.filePath.split('/');
    pathParts.forEach(part => {
      if (part.length > 2 && part !== 'src' && part !== 'lib') {
        terms.add(part);
      }
    });

    // Extract from content (simple word extraction)
    const words = r.content.match(/\b[a-zA-Z]{3,}\b/g) || [];
    words.forEach(word => {
      if (word.length > 3) {
        terms.add(word.toLowerCase());
      }
    });
  });

  return Array.from(terms).slice(0, 20);
}

function getRelatedQueries(currentQuery, history, results, limit = 5) {
  const related = new Set();
  const currentLower = currentQuery.toLowerCase();

  // Find similar queries from history
  history.forEach(entry => {
    const entryQuery = entry.query.toLowerCase();
    
    // If queries share words, consider them related
    const currentWords = new Set(currentLower.split(/\s+/));
    const entryWords = new Set(entryQuery.split(/\s+/));
    const intersection = [...currentWords].filter(w => entryWords.has(w));
    
    if (intersection.length > 0 && entryQuery !== currentLower) {
      related.add(entry.query);
    }
  });

  // Add terms from current results as potential queries
  if (results && results.length > 0) {
    const terms = extractTermsFromResults(results);
    terms.forEach(term => {
      if (term.toLowerCase() !== currentLower) {
        related.add(term);
      }
    });
  }

  return Array.from(related).slice(0, limit);
}

// ============================================================================
// FILE COLLECTION
// ============================================================================

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
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.cs': 'csharp',
  };
  return langMap[ext] || 'text';
}

function collectFiles(targetPath, baseDir = null) {
  const files = [];
  const resolvedPath = resolve(targetPath);
  const base = baseDir || resolvedPath;

  try {
    const stat = statSync(resolvedPath);

    if (stat.isFile()) {
      if (shouldSkipFile(resolvedPath)) {
        return [];
      }
      const ext = extname(resolvedPath);
      if (!EXTENSIONS.has(ext)) {
        return [];
      }
      const content = readFileSync(resolvedPath, 'utf-8');
      const relPath = relative(base, resolvedPath).replace(/\\/g, '/');

      files.push({
        path: relPath,
        content,
        language: detectLanguage(resolvedPath),
      });
    } else if (stat.isDirectory()) {
      const entries = readdirSync(resolvedPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(resolvedPath, entry.name);

        if (entry.isDirectory() && (entry.name.startsWith('.') || SKIP_PATTERNS.includes(entry.name))) {
          continue;
        }

        files.push(...collectFiles(fullPath, base));
      }
    }
  } catch (error) {
    logError(`Failed to read ${targetPath}: ${error.message}`);
  }

  return files;
}

// ============================================================================
// API CALLS
// ============================================================================

async function indexFiles(files, options = {}) {
  const payload = { files };

  if (options.incremental) {
    payload.options = { incremental: true };
  }

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

async function searchCode(query, options = {}) {
  const payload = { query };

  if (options.limit) payload.limit = options.limit;
  if (options.minScore !== undefined) payload.minScore = options.minScore;

  if (options.filters && Object.keys(options.filters).length > 0) {
    payload.filters = options.filters;
  }

  const response = await fetch(`${WORKER_URL}/api/search`, {
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

async function getStats() {
  const response = await fetch(`${WORKER_URL}/api/stats`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function getHealth() {
  const response = await fetch(`${WORKER_URL}/health`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

// ============================================================================
// COMMANDS
// ============================================================================

async function cmdIndex(args) {
  const targetPath = args[0];
  const incremental = process.argv.includes('--incremental') || process.argv.includes('-i');

  if (!targetPath) {
    logError('Please provide a file or directory path');
    log('Usage: prism index <path> [--incremental]', 'dim');
    process.exit(1);
  }

  logInfo(`Collecting files from ${targetPath}...`);
  const files = collectFiles(targetPath);

  if (files.length === 0) {
    logError('No files found to index');
    process.exit(1);
  }

  log(`Found ${colors.bright}${files.length}${colors.reset} files to index`);

  let totalIndexed = 0;
  let totalChunks = 0;
  let totalErrors = 0;
  let totalDuration = 0;
  const batchSize = 5;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, Math.min(i + batchSize, files.length));
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(files.length / batchSize);

    process.stdout.write(`\r${colors.dim}[Batch ${batchNum}/${totalBatches}]${colors.reset} Indexing ${batch.length} files...`);

    try {
      const result = await indexFiles(batch, { incremental });

      if (result.success) {
        totalIndexed += result.data.files;
        totalChunks += result.data.chunks;
        totalDuration += result.data.duration;
        totalErrors += result.data.errors;

        if (result.data.errors > 0 && result.data.failedFiles.length > 0) {
          console.log();
          result.data.failedFiles.forEach(f => logError(`  Failed: ${f}`));
        }
      } else {
        totalErrors += batch.length;
        console.log();
        logError(`Batch failed: ${result.error}`);
      }
    } catch (error) {
      totalErrors += batch.length;
      console.log();
      logError(`Error: ${error.message}`);
    }

    if (i + batchSize < files.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log();

  if (totalErrors > 0) {
    log(`\n⚠️  ${totalErrors} files failed to index`, 'yellow');
  }

  logSuccess(`Indexed ${totalIndexed} files → ${totalChunks} chunks in ${(totalDuration / 1000).toFixed(2)}s`);
  log(`   Avg: ${(totalDuration / totalIndexed).toFixed(0)}ms per file`, 'dim');
}

async function cmdSearch(args) {
  const query = args[0];
  const saveToFav = process.argv.includes('--favorite') || process.argv.includes('-f');
  const showSuggestions = process.argv.includes('--suggest') || process.argv.includes('-s');

  if (!query) {
    // Show suggestions when no query provided
    const suggestions = getSuggestions('', 5);
    
    console.log();
    log(`  ${colors.bright}Search Suggestions${colors.reset}`, 'cyan');
    console.log();

    if (suggestions.popular.length > 0) {
      log('  Popular Searches:', 'bright');
      suggestions.popular.forEach((q, i) => {
        console.log(`    ${colors.dim}${i + 1}.${colors.reset} ${colors.cyan}${q}${colors.reset}`);
      });
      console.log();
    }

    if (suggestions.recent.length > 0) {
      log('  Recent Searches:', 'bright');
      suggestions.recent.forEach((q, i) => {
        console.log(`    ${colors.dim}${i + 1}.${colors.reset} ${q}`);
      });
      console.log();
    }

    log(`  Usage: ${colors.cyan}prism search "<query>"${colors.reset}`, 'dim');
    console.log();
    return;
  }

  const options = { filters: {} };

  const limitIndex = process.argv.indexOf('--limit');
  if (limitIndex !== -1) options.limit = parseInt(process.argv[limitIndex + 1]);

  const minScoreIndex = process.argv.indexOf('--min-score');
  if (minScoreIndex !== -1) options.minScore = parseFloat(process.argv[minScoreIndex + 1]);

  const langIndex = process.argv.indexOf('--lang');
  if (langIndex !== -1) options.filters.language = process.argv[langIndex + 1];

  const pathIndex = process.argv.indexOf('--path');
  if (pathIndex !== -1) options.filters.pathPrefix = process.argv[pathIndex + 1];

  const afterIndex = process.argv.indexOf('--after');
  if (afterIndex !== -1) options.filters.createdAfter = parseInt(process.argv[afterIndex + 1]);

  const beforeIndex = process.argv.indexOf('--before');
  if (beforeIndex !== -1) options.filters.createdBefore = parseInt(process.argv[beforeIndex + 1]);

  const activeFilters = [];
  if (options.filters.language) activeFilters.push(`lang=${options.filters.language}`);
  if (options.filters.pathPrefix) activeFilters.push(`path=${options.filters.pathPrefix}`);
  const filterStr = activeFilters.length > 0 ? ` [${activeFilters.join(', ')}]` : '';

  process.stdout.write(`Searching for "${query}"${filterStr}...`);

  try {
    const result = await searchCode(query, options);

    if (!result.success) {
      console.log();
      logError(result.error);
      process.exit(1);
    }

    addToHistory(query, options, result.data.total);

    console.log(`\r${colors.dim}Found ${result.data.total} results${colors.reset}\n`);

    if (result.data.results.length === 0) {
      logInfo('No matches found');
      
      // Show related suggestions
      const history = loadHistory();
      const related = getRelatedQueries(query, history, [], 5);
      if (related.length > 0) {
        console.log();
        log('  Try these instead:', 'bright');
        related.forEach((r, i) => {
          console.log(`    ${colors.dim}${i + 1}.${colors.reset} ${colors.cyan}${r}${colors.reset}`);
        });
        console.log();
      }
      return;
    }

    result.data.results.forEach((r, i) => {
      const score = (r.score * 100).toFixed(1);
      const scoreColor = r.score > 0.8 ? 'green' : r.score > 0.6 ? 'yellow' : 'dim';

      console.log(`${colors.bright}${i + 1}.${colors.reset} ${colors[scoreColor]}${score}%${colors.reset} ${r.filePath}:${r.startLine}-${r.endLine}`);

      const preview = r.content.split('\n').slice(0, 3).join('\n');
      console.log(`${colors.dim}${preview}${colors.reset}\n`);
    });

    // Show related suggestions if requested
    if (showSuggestions) {
      const history = loadHistory();
      const related = getRelatedQueries(query, history, result.data.results, 5);
      
      if (related.length > 0) {
        console.log();
        log('  Related searches:', 'bright');
        related.forEach((r, i) => {
          console.log(`    ${colors.dim}${i + 1}.${colors.reset} ${colors.cyan}${r}${colors.reset}`);
        });
        console.log();
      }
    }

    // Save to favorites if requested
    if (saveToFav) {
      if (addFavorite(query, options)) {
        logSuccess('Added to favorites');
      }
    }
  } catch (error) {
    console.log();
    logError(error.message);
    process.exit(1);
  }
}

async function cmdSuggest(args) {
  const prefix = args[0] || '';
  const limit = parseInt(process.argv[4]) || 10;

  console.log();
  log(`  ${colors.bright}Query Suggestions${colors.reset}`, 'cyan');
  console.log();

  const suggestions = getSuggestions(prefix, limit);

  if (prefix) {
    log(`  Matching "${prefix}":`, 'bright');
  } else {
    log(`  Top searches:`, 'bright');
  }

  if (suggestions.basedOnPrefix.length > 0) {
    suggestions.basedOnPrefix.forEach((s, i) => {
      console.log(`    ${colors.dim}${i + 1}.${colors.reset} ${colors.cyan}${s}${colors.reset}`);
    });
  } else if (suggestions.popular.length > 0) {
    suggestions.popular.forEach((s, i) => {
      console.log(`    ${colors.dim}${i + 1}.${colors.reset} ${colors.cyan}${s}${colors.reset} ${colors.dim}(most frequent)${colors.reset}`);
    });
  }

  console.log();

  if (suggestions.recent.length > 0 && prefix.length === 0) {
    log('  Recent searches:', 'bright');
    suggestions.recent.forEach((s, i) => {
      console.log(`    ${colors.dim}${i + 1}.${colors.reset} ${s}`);
    });
    console.log();
  }

  if (prefix.length > 0) {
    log(`  Usage: ${colors.cyan}prism search "${suggestions.basedOnPrefix[0] || prefix + '...'}"${colors.reset}`, 'dim');
  } else {
    log(`  Usage: ${colors.cyan}prism search "${suggestions.popular[0] || 'your query'}"${colors.reset}`, 'dim');
  }
  console.log();
}

async function cmdHistory(args) {
  const action = args[0];

  if (action === 'stats') {
    const history = loadHistory();
    
    if (history.length === 0) {
      logInfo('No search history yet');
      return;
    }

    console.log();
    log(`  ${colors.bright}Search Statistics${colors.reset}`, 'blue');
    console.log();

    const freq = getQueryFrequencyMap(history);
    const totalSearches = history.length;
    const uniqueQueries = freq.size;
    const avgFreq = totalSearches / uniqueQueries;

    const mostSearched = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    log(`  Total searches: ${colors.bright}${totalSearches}${colors.reset}`);
    log(`  Unique queries: ${colors.bright}${uniqueQueries}${colors.reset}`);
    log(`  Avg frequency: ${colors.bright}${avgFreq.toFixed(1)}x${colors.reset}`);
    console.log();
    log('  Most searched:', 'bright');
    mostSearched.forEach(([query, count], i) => {
      const bar = '█'.repeat(Math.min(20, Math.floor(count / totalSearches * 100)));
      console.log(`    ${colors.dim}${i + 1}.${colors.reset} ${colors.cyan}${query}${colors.reset} ${colors.dim}${count}x${colors.reset}`);
      console.log(`       ${colors.green}${bar}${colors.reset}`);
    });
    console.log();
    return;
  }

  const limit = parseInt(args[0]) || 20;

  console.log();
  log(`  ${colors.bright}Search History${colors.reset}`, 'blue');
  console.log();

  const history = loadHistory();

  if (history.length === 0) {
    logInfo('No search history yet');
    console.log();
    return;
  }

  const recent = history.slice(-limit).reverse();

  recent.forEach((entry, i) => {
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    console.log(`${colors.dim}${history.length - recent.length + i + 1}.${colors.reset} ${colors.bright}${entry.query}${colors.reset}`);
    console.log(`   ${colors.dim}${dateStr}${colors.reset} ${colors.cyan}${entry.resultCount} results${colors.reset}`);

    const filters = [];
    if (entry.filters?.language) filters.push(`lang:${entry.filters.language}`);
    if (entry.filters?.pathPrefix) filters.push(`path:${entry.filters.pathPrefix}`);
    if (entry.minScore > 0) filters.push(`score:${entry.minScore}`);
    if (filters.length > 0) {
      console.log(`   ${colors.dim}[${filters.join(', ')}]${colors.reset}`);
    }
    console.log();
  });

  log(`Total: ${history.length} searches`, 'dim');
  console.log();
  log(`  ${colors.cyan}prism history stats${colors.reset}  - Show search statistics`, 'dim');
  log(`  ${colors.cyan}prism history run <id>${colors.reset}  - Re-run a search`, 'dim');
  console.log();
}

async function cmdHistoryRun(args) {
  const index = parseInt(args[0]);

  if (!index || index < 1) {
    logError('Please provide a valid history index (1-based)');
    process.exit(1);
  }

  const history = loadHistory();

  if (index > history.length) {
    logError(`History index out of range (1-${history.length})`);
    process.exit(1);
  }

  const entry = history[index - 1];

  logInfo(`Re-running search: ${entry.query}`);

  const searchOpts = {};

  if (entry.limit) searchOpts.limit = entry.limit;
  if (entry.minScore) searchOpts.minScore = entry.minScore;
  if (entry.filters) searchOpts.filters = entry.filters;

  await executeSearch(entry.query, searchOpts);
}

async function executeSearch(query, options) {
  const activeFilters = [];
  if (options.filters?.language) activeFilters.push(`lang=${options.filters.language}`);
  if (options.filters?.pathPrefix) activeFilters.push(`path=${options.filters.pathPrefix}`);
  const filterStr = activeFilters.length > 0 ? ` [${activeFilters.join(', ')}]` : '';

  process.stdout.write(`Searching for "${query}"${filterStr}...`);

  try {
    const result = await searchCode(query, options);

    if (!result.success) {
      console.log();
      logError(result.error);
      process.exit(1);
    }

    addToHistory(query, options, result.data.total);

    console.log(`\r${colors.dim}Found ${result.data.total} results${colors.reset}\n`);

    if (result.data.results.length === 0) {
      logInfo('No matches found');
      return;
    }

    result.data.results.forEach((r, i) => {
      const score = (r.score * 100).toFixed(1);
      const scoreColor = r.score > 0.8 ? 'green' : r.score > 0.6 ? 'yellow' : 'dim';

      console.log(`${colors.bright}${i + 1}.${colors.reset} ${colors[scoreColor]}${score}%${colors.reset} ${r.filePath}:${r.startLine}-${r.endLine}`);

      const preview = r.content.split('\n').slice(0, 3).join('\n');
      console.log(`${colors.dim}${preview}${colors.reset}\n`);
    });
  } catch (error) {
    console.log();
    logError(error.message);
    process.exit(1);
  }
}

async function cmdFavorites(args) {
  const action = args[0];

  if (!action || action === 'list') {
    const favorites = loadFavorites();

    console.log();
    log(`  ${colors.bright}Favorite Searches${colors.reset}`, 'magenta');
    console.log();

    if (favorites.length === 0) {
      logInfo('No favorites yet');
      console.log();
      log(`  Add a favorite: ${colors.cyan}prism favorites add "<query>"${colors.reset}`, 'dim');
      console.log();
      return;
    }

    favorites.forEach((entry, i) => {
      console.log(`${colors.bright}${i + 1}.${colors.reset} ${colors.bright}${entry.query}${colors.reset}`);

      const filters = [];
      if (entry.filters?.language) filters.push(`lang:${entry.filters.language}`);
      if (entry.filters?.pathPrefix) filters.push(`path:${entry.filters.pathPrefix}`);
      if (filters.length > 0) {
        console.log(`   ${colors.dim}[${filters.join(', ')}]${colors.reset}`);
      }

      if (entry.notes) {
        console.log(`   ${colors.dim}📝 ${entry.notes}${colors.reset}`);
      }
      console.log();
    });

    log(`Total: ${favorites.length} favorites`, 'dim');
    console.log();
    log(`  ${colors.cyan}prism favorites run <id>${colors.reset}  - Run a favorite`, 'dim');
    log(`  ${colors.cyan}prism favorites add <q>${colors.reset}    - Add to favorites`, 'dim');
    log(`  ${colors.cyan}prism favorites remove <id>${colors.reset} - Remove a favorite`, 'dim');
    console.log();
    return;
  }

  if (action === 'add') {
    const query = args[1];

    if (!query) {
      logError('Please provide a query to add to favorites');
      log('Usage: prism favorites add "<query>" [--lang L] [--path P]', 'dim');
      process.exit(1);
    }

    const options = { filters: {} };

    const langIndex = process.argv.indexOf('--lang');
    if (langIndex !== -1) options.filters.language = process.argv[langIndex + 1];

    const pathIndex = process.argv.indexOf('--path');
    if (pathIndex !== -1) options.filters.pathPrefix = process.argv[pathIndex + 1];

    if (addFavorite(query, options)) {
      logSuccess(`Added to favorites: ${query}`);
    }
    return;
  }

  if (action === 'remove') {
    const index = parseInt(args[1]);

    if (!index || index < 1) {
      logError('Please provide a valid favorite index (1-based)');
      process.exit(1);
    }

    const favorites = loadFavorites();

    if (index > favorites.length) {
      logError(`Favorite index out of range (1-${favorites.length})`);
      process.exit(1);
    }

    const entry = favorites[index - 1];

    if (removeFavorite(entry.id)) {
      logSuccess(`Removed from favorites: ${entry.query}`);
    } else {
      logError('Failed to remove favorite');
    }
    return;
  }

  if (action === 'run') {
    const index = parseInt(args[1]);

    if (!index || index < 1) {
      logError('Please provide a valid favorite index (1-based)');
      process.exit(1);
    }

    const favorites = loadFavorites();

    if (index > favorites.length) {
      logError(`Favorite index out of range (1-${favorites.length})`);
      process.exit(1);
    }

    const entry = favorites[index - 1];

    logInfo(`Running favorite: ${entry.query}`);

    const options = {
      filters: entry.filters || {},
      limit: entry.limit || 10,
      minScore: entry.minScore || 0,
    };

    await executeSearch(entry.query, options);
    return;
  }

  logError(`Unknown favorites action: ${action}`);
  log('Available actions: list, add, remove, run', 'dim');
}

async function cmdStats() {
  try {
    const result = await getStats();

    if (!result.success) {
      logError(result.error);
      process.exit(1);
    }

    const data = result.data;
    console.log();
    log(`  ${colors.bright}PRISM Statistics${colors.reset}`, 'blue');
    console.log();
    log(`  Files indexed    ${colors.bright}${data.files}${colors.reset}`);
    log(`  Chunks created   ${colors.bright}${data.chunks}${colors.reset}`);
    log(`  Last indexed     ${colors.dim}${new Date(data.indexedAt).toLocaleString()}${colors.reset}`);
    console.log();
  } catch (error) {
    logError(error.message);
    process.exit(1);
  }
}

async function cmdHealth() {
  try {
    const result = await getHealth();

    if (!result.success) {
      logError(result.error);
      process.exit(1);
    }

    const data = result.data;
    console.log();
    log(`  ${colors.bright}PRISM Status${colors.reset}`, 'blue');
    console.log();
    log(`  Status      ${colors.green}${data.status}${colors.reset}`);
    log(`  Version     ${colors.dim}${data.version}${colors.reset}`);
    log(`  Environment ${colors.dim}${data.environment}${colors.reset}`);
    log(`  HNSW        ${data.hnsw_initialized ? colors.green : 'red'}${data.hnsw_initialized}${colors.reset}`);
    console.log();
  } catch (error) {
    logError(error.message);
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

function showHelp() {
  console.log();
  log(`  ${colors.bright}PRISM${colors.reset} - Code Search & Indexing`, 'blue');
  console.log();
  log('  Commands:', 'bright');
  log('    search [query]     Search indexed code (shows suggestions if no query)', 'dim');
  log('    suggest [prefix]   Get query suggestions based on history', 'dim');
  log('    index <path>       Index files or directory', 'dim');
  log('    history [N]        Show search history', 'dim');
  log('    history stats      Show search statistics', 'dim');
  log('    history run <id>   Re-run search from history', 'dim');
  log('    favorites          List favorite searches', 'dim');
  log('    favorites add      Add to favorites', 'dim');
  log('    favorites remove   Remove from favorites', 'dim');
  log('    favorites run <id> Run favorite search', 'dim');
  log('    stats              Show index statistics', 'dim');
  log('    health             Check service status', 'dim');
  console.log();
  log('  Search Options:', 'bright');
  log('    --limit N          Limit results (default: 10)', 'dim');
  log('    --min-score N      Minimum similarity 0-1', 'dim');
  log('    --lang L           Filter by language', 'dim');
  log('    --path P           Filter by path prefix', 'dim');
  log('    --suggest, -s      Show related searches after results', 'dim');
  log('    --favorite, -f     Save to favorites', 'dim');
  console.log();
  log('  Examples:', 'bright');
  log('    prism search', 'dim');
  log('    prism suggest "database"', 'dim');
  log('    prism search "HNSW" --lang typescript -s', 'dim');
  log('    prism history stats', 'dim');
  log('    prism favorites run 1', 'dim');
  console.log();
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'index':
      await cmdIndex(args);
      break;
    case 'search':
      await cmdSearch(args);
      break;
    case 'suggest':
      await cmdSuggest(args);
      break;
    case 'history':
      if (args[0] === 'run') {
        await cmdHistoryRun(args.slice(1));
      } else {
        await cmdHistory(args);
      }
      break;
    case 'favorites':
      await cmdFavorites(args);
      break;
    case 'stats':
      await cmdStats();
      break;
    case 'health':
      await cmdHealth();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      if (!command) {
        showHelp();
      } else {
        logError(`Unknown command: ${command}`);
        log('Run "prism help" for usage information', 'dim');
        process.exit(1);
      }
  }
}

main().catch(error => {
  logError(error.message);
  process.exit(1);
});
