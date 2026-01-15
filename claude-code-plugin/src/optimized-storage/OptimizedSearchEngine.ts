import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../src/utils.js';

export interface SearchResult {
  filePath: string;
  score: number;
  positions: number[];
  context: {
    before: string[];
    after: string[];
    line: number;
  };
  metadata: {
    language: string;
    size: number;
    lastModified: string;
  };
}

export interface SearchQuery {
  text: string;
  language?: string;
  minScore?: number;
  limit?: number;
  fuzzy?: boolean;
  exact?: boolean;
  caseSensitive?: boolean;
}

export interface SearchStats {
  totalFiles: number;
  totalResults: number;
  searchTime: number;
  indexSize: number;
  cacheHits: number;
  cacheMisses: number;
}

export class OptimizedSearchEngine {
  private logger: Logger;
  private textIndex: Map<string, Map<string, number[]>> = new Map();
  private fileMetadata: Map<string, any> = new Map();
  private searchCache = new Map<string, SearchResult[]>();
  private cacheSize = 1000;
  private ngramSize = 3;
  private stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

  constructor() {
    this.logger = new Logger("OptimizedSearchEngine");
  }

  async initialize(indexPath: string): Promise<void> {
    try {
      await this.loadTextIndex(indexPath);
      this.logger.info(`Search engine initialized with ${this.textIndex.size} indexed terms`);
    } catch (error) {
      this.logger.error("Failed to initialize search engine:", error);
      throw error;
    }
  }

  async indexFile(filePath: string, content: string, metadata: any): Promise<void> {
    try {
      // Store metadata
      this.fileMetadata.set(filePath, metadata);

      // Extract terms and index them
      const terms = this.extractTerms(content);
      const positions = this.getTextPositions(content, terms);

      // Update text index
      for (const [term, termPositions] of positions) {
        if (!this.textIndex.has(term)) {
          this.textIndex.set(term, new Map());
        }
        this.textIndex.get(term)!.set(filePath, termPositions);
      }

      this.logger.debug(`Indexed file ${filePath} with ${terms.length} terms`);
    } catch (error) {
      this.logger.error(`Failed to index file ${filePath}:`, error);
      throw error;
    }
  }

  async search(query: SearchQuery): Promise<{
    results: SearchResult[];
    stats: SearchStats;
  }> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = this.generateCacheKey(query);
    if (this.searchCache.has(cacheKey)) {
      return {
        results: this.searchCache.get(cacheKey)!,
        stats: {
          totalFiles: this.fileMetadata.size,
          totalResults: this.searchCache.get(cacheKey)!.length,
          searchTime: 0,
          indexSize: this.textIndex.size,
          cacheHits: 1,
          cacheMisses: 0,
        },
      };
    }

    const results: SearchResult[] = [];

    // Process search query
    const queryTerms = this.processQuery(query.text, query);

    // Find matching files
    const matchingFiles = this.findMatchingFiles(queryTerms, query);

    // Score and rank results
    for (const filePath of matchingFiles) {
      const fileContent = await this.getFileContent(filePath);
      const fileResults = this.scoreResults(filePath, fileContent, queryTerms, query);

      results.push(...fileResults);
    }

    // Apply filters and sort
    const filteredResults = this.applyFilters(results, query);
    const sortedResults = this.sortResults(filteredResults);

    // Update cache
    if (this.searchCache.size >= this.cacheSize) {
      const firstKey = this.searchCache.keys().next().value;
      this.searchCache.delete(firstKey);
    }
    this.searchCache.set(cacheKey, sortedResults);

    const searchTime = Date.now() - startTime;

    return {
      results: sortedResults,
      stats: {
        totalFiles: this.fileMetadata.size,
        totalResults: sortedResults.length,
        searchTime,
        indexSize: this.textIndex.size,
        cacheHits: 0,
        cacheMisses: 1,
      },
    };
  }

  async fuzzySearch(query: SearchQuery): Promise<SearchResult[]> {
    const fuzzyResults: SearchResult[] = [];
    const queryTerms = this.processQuery(query.text, { ...query, fuzzy: true });

    for (const [term, files] of this.textIndex) {
      for (const queryTerm of queryTerms) {
        const distance = this.calculateLevenshteinDistance(queryTerm, term);
        const threshold = Math.max(2, queryTerm.length * 0.3);

        if (distance <= threshold) {
          for (const [filePath, positions] of files) {
            fuzzyResults.push({
              filePath,
              score: this.calculateFuzzyScore(queryTerm, term, distance),
              positions,
              context: await this.extractContext(filePath, positions),
              metadata: this.fileMetadata.get(filePath),
            });
          }
        }
      }
    }

    return fuzzyResults.sort((a, b) => b.score - a.score).slice(0, query.limit || 10);
  }

  async semanticSearch(query: SearchQuery, embeddings: Map<string, number[]>): Promise<SearchResult[]> {
    // This is a simplified implementation
    // In a real implementation, you would use proper embeddings and similarity calculations
    const semanticResults: SearchResult[] = [];

    for (const [filePath, metadata] of this.fileMetadata) {
      // Simple keyword overlap as a proxy for semantic similarity
      const fileContent = await this.getFileContent(filePath);
      const score = this.calculateSemanticScore(query.text, fileContent);

      if (score > (query.minScore || 0.1)) {
        // Find positions of query terms
        const positions = this.findQueryPositions(query.text, fileContent);

        semanticResults.push({
          filePath,
          score,
          positions,
          context: await this.extractContext(filePath, positions),
          metadata,
        });
      }
    }

    return semanticResults.sort((a, b) => b.score - a.score).slice(0, query.limit || 10);
  }

  async updateIndex(indexPath: string, additions: Array<{ filePath: string; content: string; metadata: any }>, removals: string[]): Promise<void> {
    try {
      // Remove files from index
      for (const filePath of removals) {
        this.removeFromIndex(filePath);
      }

      // Add new files to index
      for (const addition of additions) {
        await this.indexFile(addition.filePath, addition.content, addition.metadata);
      }

      // Save updated index
      await this.saveTextIndex(indexPath);

      this.logger.info(`Updated index: added ${additions.length}, removed ${removals.length} files`);
    } catch (error) {
      this.logger.error("Failed to update index:", error);
      throw error;
    }
  }

  getIndexStats(): {
    totalTerms: number;
    totalFiles: number;
    averageTermsPerFile: number;
    largestFile: string;
    smallestFile: string;
    indexSizeBytes: number;
  } {
    let totalTermCount = 0;
    let maxSize = 0;
    let maxSizeFile = '';
    let minSize = Infinity;
    let minSizeFile = '';

    for (const [filePath, metadata] of this.fileMetadata) {
      const size = metadata.size || 0;
      if (size > maxSize) {
        maxSize = size;
        maxSizeFile = filePath;
      }
      if (size < minSize && size > 0) {
        minSize = size;
        minSizeFile = filePath;
      }
    }

    for (const files of this.textIndex.values()) {
      totalTermCount += files.size;
    }

    return {
      totalTerms: this.textIndex.size,
      totalFiles: this.fileMetadata.size,
      averageTermsPerFile: this.fileMetadata.size > 0 ? totalTermCount / this.fileMetadata.size : 0,
      largestFile: maxSizeFile,
      smallestFile: minSizeFile,
      indexSizeBytes: JSON.stringify({
        textIndex: this.textIndex,
        fileMetadata: this.fileMetadata,
      }).length,
    };
  }

  private async loadTextIndex(indexPath: string): Promise<void> {
    try {
      const indexPath = path.join(indexPath, 'text-index.json');
      const content = await fs.readFile(indexPath, 'utf-8');
      const data = JSON.parse(content);

      // Reconstruct text index
      this.textIndex.clear();
      for (const [term, files] of Object.entries(data)) {
        const fileMap = new Map<string, number[]>();
        for (const [filePath, positions] of Object.entries(files as any)) {
          fileMap.set(filePath, positions as number[]);
        }
        this.textIndex.set(term, fileMap);
      }

      // Load file metadata
      const metadataPath = path.join(indexPath, '..', 'file-metadata.json');
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        this.fileMetadata = new Map(Object.entries(JSON.parse(metadataContent)));
      } catch {
        // Metadata file might not exist
      }
    } catch (error) {
      this.logger.debug("No existing text index found");
      // Index doesn't exist, that's fine
    }
  }

  private async saveTextIndex(indexPath: string): Promise<void> {
    try {
      // Create directories
      const indexDir = path.join(indexPath, 'search-index');
      await fs.mkdir(indexDir, { recursive: true });

      // Convert text index to plain object
      const textIndexObj: Record<string, Record<string, number[]>> = {};
      for (const [term, files] of this.textIndex) {
        const fileObj: Record<string, number[]> = {};
        for (const [filePath, positions] of files) {
          fileObj[filePath] = positions;
        }
        textIndexObj[term] = fileObj;
      }

      // Save text index
      const textIndexPath = path.join(indexDir, 'text-index.json');
      await fs.writeFile(textIndexPath, JSON.stringify(textIndexObj, null, 2));

      // Save file metadata
      const metadataPath = path.join(indexDir, 'file-metadata.json');
      const metadataObj = Object.fromEntries(this.fileMetadata);
      await fs.writeFile(metadataPath, JSON.stringify(metadataObj, null, 2));
    } catch (error) {
      this.logger.error("Failed to save text index:", error);
      throw error;
    }
  }

  private extractTerms(content: string): string[] {
    // Extract words, filtering out stop words and short terms
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.stopWords.has(word));

    // Generate n-grams for better matching
    const terms = [...new Set(words)];

    // Add bigrams and trigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (bigram.length > 4) terms.push(bigram);
    }

    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      if (trigram.length > 6) terms.push(trigram);
    }

    return terms;
  }

  private getTextPositions(content: string, terms: string[]): Map<string, number[]> {
    const positions = new Map<string, number[]>();
    const contentLower = content.toLowerCase();

    for (const term of terms) {
      const termPositions: number[] = [];
      let index = 0;

      while ((index = contentLower.indexOf(term, index)) !== -1) {
        termPositions.push(index);
        index += term.length;
      }

      if (termPositions.length > 0) {
        positions.set(term, termPositions);
      }
    }

    return positions;
  }

  private processQuery(text: string, query: SearchQuery): string[] {
    const processed = query.caseSensitive ? text : text.toLowerCase();
    let terms = processed.split(/\s+/).filter(term => term.length > 2);

    if (query.exact) {
      // For exact search, keep the original text as a single term
      terms = [processed];
    }

    return terms;
  }

  private findMatchingFiles(queryTerms: string[], query: SearchQuery): Set<string> {
    const matchingFiles = new Set<string>();

    for (const term of queryTerms) {
      const files = this.textIndex.get(term);
      if (files) {
        for (const filePath of files.keys()) {
          matchingFiles.add(filePath);
        }
      }
    }

    return matchingFiles;
  }

  private async getFileContent(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private async extractContext(filePath: string, positions: number[], contextSize: number = 5): Promise<{ before: string[]; after: string[]; line: number }> {
    try {
      const content = await this.getFileContent(filePath);
      const lines = content.split('\n');
      const positionsInLines = positions.map(pos => {
        let lineNum = 1;
        let charCount = 0;

        for (let i = 0; i < lines.length; i++) {
          if (charCount + lines[i].length >= pos) {
            lineNum = i + 1;
            break;
          }
          charCount += lines[i].length + 1; // +1 for newline
        }

        return lineNum;
      });

      const firstPos = positionsInLines[0] || 1;
      const startLine = Math.max(0, firstPos - contextSize - 1);
      const endLine = Math.min(lines.length, firstPos + contextSize);

      return {
        before: lines.slice(startLine, firstPos - 1),
        after: lines.slice(firstPos, endLine),
        line: firstPos,
      };
    } catch {
      return { before: [], after: [], line: 1 };
    }
  }

  private scoreResults(filePath: string, content: string, queryTerms: string[], query: SearchQuery): SearchResult[] {
    const results: SearchResult[] = [];
    const metadata = this.fileMetadata.get(filePath);

    for (const term of queryTerms) {
      const positions = this.textIndex.get(term)?.get(filePath) || [];

      if (positions.length === 0) continue;

      // Calculate score based on multiple factors
      const frequencyScore = positions.length / content.length;
      const recentScore = this.calculateRecencyScore(metadata?.lastModified);
      const languageScore = query.language && metadata?.language === query.language ? 1.2 : 1.0;
      const sizeScore = Math.min(1, metadata?.size / 10000); // Prefer smaller files

      const score = frequencyScore * recentScore * languageScore * sizeScore;

      results.push({
        filePath,
        score,
        positions,
        context: this.extractContextSync(content, positions),
        metadata: metadata || {},
      });
    }

    return results;
  }

  private extractContextSync(content: string, positions: number[], contextSize: number = 3): { before: string[]; after: string[]; line: number } {
    const lines = content.split('\n');
    const positionsInLines = positions.map(pos => {
      let lineNum = 1;
      let charCount = 0;

      for (let i = 0; i < lines.length; i++) {
        if (charCount + lines[i].length >= pos) {
          lineNum = i + 1;
          break;
        }
        charCount += lines[i].length + 1;
      }

      return lineNum;
    });

    const firstPos = positionsInLines[0] || 1;
    const startLine = Math.max(0, firstPos - contextSize - 1);
    const endLine = Math.min(lines.length, firstPos + contextSize);

    return {
      before: lines.slice(startLine, firstPos - 1),
      after: lines.slice(firstPos, endLine),
      line: firstPos,
    };
  }

  private applyFilters(results: SearchResult[], query: SearchQuery): SearchResult[] {
    return results.filter(result => {
      if (query.minScore && result.score < query.minScore) return false;
      if (query.language && result.metadata.language !== query.language) return false;
      return true;
    });
  }

  private sortResults(results: SearchResult[]): SearchResult[] {
    return results.sort((a, b) => b.score - a.score);
  }

  private calculateLevenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,      // deletion
          matrix[j - 1][i] + 1,      // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[b.length][a.length];
  }

  private calculateFuzzyScore(query: string, term: string, distance: number): number {
    const length = Math.max(query.length, term.length);
    return 1 - (distance / length);
  }

  private calculateSemanticScore(query: string, content: string): number {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const contentWords = content.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    let matches = 0;
    for (const word of queryWords) {
      if (contentWords.includes(word)) matches++;
    }

    return matches / queryWords.length;
  }

  private findQueryPositions(query: string, content: string): number[] {
    const positions: number[] = [];
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();

    let index = 0;
    while ((index = contentLower.indexOf(queryLower, index)) !== -1) {
      positions.push(index);
      index += queryLower.length;
    }

    return positions;
  }

  private calculateRecencyScore(lastModified?: string): number {
    if (!lastModified) return 0.5;

    const modified = new Date(lastModified);
    const now = new Date();
    const daysDiff = (now.getTime() - modified.getTime()) / (1000 * 60 * 60 * 24);

    // More recent files get higher scores
    return Math.max(0.1, 1 - (daysDiff / 365));
  }

  private generateCacheKey(query: SearchQuery): string {
    return JSON.stringify({
      text: query.text,
      language: query.language,
      minScore: query.minScore,
      fuzzy: query.fuzzy,
      exact: query.exact,
    });
  }

  private removeFromIndex(filePath: string): void {
    for (const files of this.textIndex.values()) {
      files.delete(filePath);
    }

    this.fileMetadata.delete(filePath);
  }
}