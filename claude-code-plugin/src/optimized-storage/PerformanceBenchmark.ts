import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { performance } from 'perf_hooks';
import { Logger } from '../src/utils.js';

import { OptimizedJSONStorage } from './OptimizedJSONStorage.js';
import { OptimizedSearchEngine } from './OptimizedSearchEngine.js';
import { JSONStreamingHandler } from './JSONStreamingHandler.js';
import { StorageManager } from './StorageManager.js';

export interface BenchmarkResult {
  operation: string;
  duration: number;
  throughput: number;
  memoryUsed: number;
  success: boolean;
  error?: string;
  details?: any;
}

export interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  summary: {
    totalOperations: number;
    totalTime: number;
    averageTime: number;
    fastestOperation: string;
    slowestOperation: string;
    throughputPerSecond: number;
  };
}

export class PerformanceBenchmark {
  private logger: Logger;
  private testIndexPath: string;
  private testFiles: string[] = [];
  private testContent: string;
  private originalWorkingDir: string;

  constructor() {
    this.logger = new Logger("PerformanceBenchmark");
    this.testIndexPath = path.join(os.tmpdir(), 'prism-benchmark-test');
    this.originalWorkingDir = process.cwd();
    this.testContent = this.generateTestContent();
  }

  async runFullBenchmark(): Promise<{
    storage: BenchmarkSuite;
    search: BenchmarkSuite;
    streaming: BenchmarkSuite;
    manager: BenchmarkSuite;
    overall: {
      totalDuration: number;
      totalThroughput: number;
      recommendations: string[];
    };
  }> {
    this.logger.info("Starting full performance benchmark suite");

    // Change to temp directory to avoid affecting current project
    process.chdir(os.tmpdir());

    const suites = {
      storage: await this.benchmarkStorage(),
      search: await this.benchmarkSearch(),
      streaming: await this.benchmarkStreaming(),
      manager: await this.benchmarkManager(),
    };

    const totalDuration = Object.values(suites).reduce((sum, suite) => sum + suite.summary.totalTime, 0);
    const totalThroughput = Object.values(suites).reduce((sum, suite) => sum + suite.summary.throughputPerSecond, 0);

    const recommendations = this.generateRecommendations(suites);

    this.logger.info("Benchmark suite completed", {
      totalDuration: `${totalDuration}ms`,
      totalThroughput: `${totalThroughput} ops/sec`,
    });

    return {
      ...suites,
      overall: {
        totalDuration,
        totalThroughput,
        recommendations,
      },
    };
  }

  private async benchmarkStorage(): Promise<BenchmarkSuite> {
    this.logger.info("Starting storage benchmark");
    const suite: BenchmarkSuite = {
      name: "Storage Performance",
      results: [],
      summary: {
        totalOperations: 0,
        totalTime: 0,
        averageTime: 0,
        fastestOperation: '',
        slowestOperation: '',
        throughputPerSecond: 0,
      },
    };

    try {
      // Setup test environment
      await this.setupTestEnvironment();

      // Test 1: Initialize storage
      suite.results.push(await this.measure('Initialize Storage', async () => {
        const storage = new OptimizedJSONStorage({ indexPath: this.testIndexPath });
        await storage.initialize();
        return { initialized: true };
      }));

      // Test 2: Add files (small files)
      for (let i = 0; i < 10; i++) {
        suite.results.push(await this.measure(`Add Small File ${i + 1}`, async () => {
          const storage = new OptimizedJSONStorage({ indexPath: this.testIndexPath });
          await storage.initialize();
          const filePath = path.join(this.testIndexPath, `small-${i}.js`);
          await fs.writeFile(filePath, this.generateSmallContent());
          await storage.addFile(filePath, this.generateSmallContent(), 'javascript');
          return { fileSize: this.generateSmallContent().length };
        }));
      }

      // Test 3: Add files (large files)
      for (let i = 0; i < 5; i++) {
        suite.results.push(await this.measure(`Add Large File ${i + 1}`, async () => {
          const storage = new OptimizedJSONStorage({ indexPath: this.testIndexPath });
          await storage.initialize();
          const filePath = path.join(this.testIndexPath, `large-${i}.js`);
          await fs.writeFile(filePath, this.testContent);
          await storage.addFile(filePath, this.testContent, 'javascript');
          return { fileSize: this.testContent.length };
        }));
      }

      // Test 4: Save index
      suite.results.push(await this.measure('Save Index', async () => {
        const storage = new OptimizedJSONStorage({ indexPath: this.testIndexPath });
        await storage.initialize();
        for (let i = 0; i < 5; i++) {
          const filePath = path.join(this.testIndexPath, `test-${i}.js`);
          await fs.writeFile(filePath, this.generateSmallContent());
          await storage.addFile(filePath, this.generateSmallContent(), 'javascript');
        }
        const start = performance.now();
        await storage.saveIndex();
        return { indexSize: JSON.stringify(storage['currentIndex']).length };
      }));

      // Test 5: Load index
      suite.results.push(await this.measure('Load Index', async () => {
        const storage = new OptimizedJSONStorage({ indexPath: this.testIndexPath });
        const start = performance.now();
        await storage.initialize();
        return { loaded: true };
      }));

      // Test 6: Search performance with different query types
      const searchQueries = [
        'function',
        'const',
        'class',
        'async',
        'export',
      ];

      for (const query of searchQueries) {
        suite.results.push(await this.measure(`Search: "${query}"`, async () => {
          const storage = new OptimizedJSONStorage({ indexPath: this.testIndexPath });
          await storage.initialize();
          const results = await storage.searchFiles(query, { limit: 10 });
          return { matches: results.length };
        }));
      }

      this.calculateSuiteSummary(suite);
      return suite;

    } catch (error) {
      this.logger.error("Storage benchmark failed:", error);
      suite.results.push({
        operation: 'Error',
        duration: 0,
        throughput: 0,
        memoryUsed: 0,
        success: false,
        error: error.message,
      });
      this.calculateSuiteSummary(suite);
      return suite;
    } finally {
      await this.cleanup();
    }
  }

  private async benchmarkSearch(): Promise<BenchmarkSuite> {
    this.logger.info("Starting search benchmark");
    const suite: BenchmarkSuite = {
      name: "Search Performance",
      results: [],
      summary: {
        totalOperations: 0,
        totalTime: 0,
        averageTime: 0,
        fastestOperation: '',
        slowestOperation: '',
        throughputPerSecond: 0,
      },
    };

    try {
      // Setup test environment with many files
      await this.setupTestEnvironment();

      // Create test files
      for (let i = 0; i < 100; i++) {
        const filePath = path.join(this.testIndexPath, `search-test-${i}.js`);
        await fs.writeFile(filePath, this.generateSearchTestContent(i));
        const storage = new OptimizedJSONStorage({ indexPath: this.testIndexPath });
        await storage.initialize();
        await storage.addFile(filePath, this.generateSearchTestContent(i), 'javascript');
        await storage.saveIndex();
      }

      // Test 1: Basic search
      suite.results.push(await this.measure('Basic Search', async () => {
        const searchEngine = new OptimizedSearchEngine();
        await searchEngine.initialize(this.testIndexPath);
        const results = await searchEngine.search({
          text: 'function',
          language: 'javascript',
          limit: 10,
        });
        return { matches: results.results.length };
      }));

      // Test 2: Fuzzy search
      suite.results.push(await this.measure('Fuzzy Search', async () => {
        const searchEngine = new OptimizedSearchEngine();
        await searchEngine.initialize(this.testIndexPath);
        const results = await searchEngine.fuzzySearch({
          text: 'funciton', // Intentional misspelling
          limit: 10,
        });
        return { matches: results.length };
      }));

      // Test 3: Multi-term search
      suite.results.push(await this.measure('Multi-term Search', async () => {
        const searchEngine = new OptimizedSearchEngine();
        await searchEngine.initialize(this.testIndexPath);
        const results = await searchEngine.search({
          text: 'async function',
          limit: 10,
        });
        return { matches: results.results.length };
      }));

      // Test 4: Language-specific search
      suite.results.push(await this.measure('Language-specific Search', async () => {
        const searchEngine = new OptimizedSearchEngine();
        await searchEngine.initialize(this.testIndexPath);
        const results = await searchEngine.search({
          text: 'class',
          language: 'javascript',
          limit: 10,
        });
        return { matches: results.results.length };
      }));

      // Test 5: Search with filters
      suite.results.push(await this.measure('Search with Filters', async () => {
        const searchEngine = new OptimizedSearchEngine();
        await searchEngine.initialize(this.testIndexPath);
        const results = await searchEngine.search({
          text: 'function',
          language: 'javascript',
          minScore: 0.5,
          limit: 5,
        });
        return { matches: results.results.length };
      }));

      // Test 6: Performance under load
      const loadQueries = Array(20).fill(null).map((_, i) => `query-${i}`);
      suite.results.push(await this.measure('Search Load Test', async () => {
        const searchEngine = new OptimizedSearchEngine();
        await searchEngine.initialize(this.testIndexPath);

        const start = performance.now();
        const results = await Promise.all(loadQueries.map(query =>
          searchEngine.search({ text: query, limit: 5 })
        ));
        const duration = performance.now() - start;

        return {
          queries: loadQueries.length,
          duration,
          averagePerQuery: duration / loadQueries.length,
        };
      }));

      this.calculateSuiteSummary(suite);
      return suite;

    } catch (error) {
      this.logger.error("Search benchmark failed:", error);
      suite.results.push({
        operation: 'Error',
        duration: 0,
        throughput: 0,
        memoryUsed: 0,
        success: false,
        error: error.message,
      });
      this.calculateSuiteSummary(suite);
      return suite;
    } finally {
      await this.cleanup();
    }
  }

  private async benchmarkStreaming(): Promise<BenchmarkSuite> {
    this.logger.info("Starting streaming benchmark");
    const suite: BenchmarkSuite = {
      name: "Streaming Performance",
      results: [],
      summary: {
        totalOperations: 0,
        totalTime: 0,
        averageTime: 0,
        fastestOperation: '',
        slowestOperation: '',
        throughputPerSecond: 0,
      },
    };

    try {
      // Setup test environment
      await this.setupTestEnvironment();

      // Create large JSON file for streaming tests
      const largeJSON = this.generateLargeJSON(10000); // 10,000 objects
      const largeJSONPath = path.join(this.testIndexPath, 'large-test.json');
      await fs.writeFile(largeJSONPath, largeJSON);

      // Test 1: Streaming parse
      suite.results.push(await this.measure('Streaming Parse', async () => {
        const streamingHandler = new JSONStreamingHandler();
        let count = 0;

        for await (const obj of streamingHandler.streamParseJSON(largeJSONPath)) {
          count++;
        }

        return { parsedObjects: count };
      }));

      // Test 2: Streaming write
      const outputPath = path.join(this.testIndexPath, 'streamed-output.json');
      suite.results.push(await this.measure('Streaming Write', async () => {
        const streamingHandler = new JSONStreamingHandler();
        const testArray = Array(5000).fill(null).map((_, i) => ({ id: i, data: `test-${i}` }));

        await streamingHandler.streamStringifyJSON(testArray, outputPath);

        const stats = await fs.stat(outputPath);
        return {
          writtenObjects: testArray.length,
          outputFileSize: stats.size
        };
      }));

      // Test 3: Process large JSON
      const transformPath = path.join(this.testIndexPath, 'transformed.json');
      suite.results.push(await this.measure('Process Large JSON', async () => {
        const streamingHandler = new JSONStreamingHandler();

        const result = await streamingHandler.processLargeJSON(
          largeJSONPath,
          transformPath,
          (obj) => ({ ...obj, processed: true }),
          { bufferSize: 65536 }
        );

        return {
          processed: result.processed,
          outputSize: result.outputSize,
        };
      }));

      // Test 4: Merge JSON files
      const filesToMerge = [];
      for (let i = 0; i < 5; i++) {
        const filePath = path.join(this.testIndexPath, `merge-${i}.json`);
        const content = JSON.stringify([{ id: i, data: `file-${i}` }]);
        await fs.writeFile(filePath, content);
        filesToMerge.push(filePath);
      }

      const mergePath = path.join(this.testIndexPath, 'merged.json');
      suite.results.push(await this.measure('Merge JSON Files', async () => {
        const streamingHandler = new JSONStreamingHandler();
        const result = await streamingHandler.mergeJSONFiles(filesToMerge, mergePath);
        return { merged: result.merged, conflicts: result.conflicts };
      }));

      this.calculateSuiteSummary(suite);
      return suite;

    } catch (error) {
      this.logger.error("Streaming benchmark failed:", error);
      suite.results.push({
        operation: 'Error',
        duration: 0,
        throughput: 0,
        memoryUsed: 0,
        success: false,
        error: error.message,
      });
      this.calculateSuiteSummary(suite);
      return suite;
    } finally {
      await this.cleanup();
    }
  }

  private async benchmarkManager(): Promise<BenchmarkSuite> {
    this.logger.info("Starting storage manager benchmark");
    const suite: BenchmarkSuite = {
      name: "Storage Manager Performance",
      results: [],
      summary: {
        totalOperations: 0,
        totalTime: 0,
        averageTime: 0,
        fastestOperation: '',
        slowestOperation: '',
        throughputPerSecond: 0,
      },
    };

    try {
      // Setup test environment
      await this.setupTestEnvironment();

      // Create test files
      const files = [];
      for (let i = 0; i < 50; i++) {
        const filePath = path.join(this.testIndexPath, `manager-test-${i}.js`);
        const content = this.generateSmallContent();
        await fs.writeFile(filePath, content);
        files.push({ path: filePath, content });
      }

      // Test 1: Initialize manager
      suite.results.push(await this.measure('Initialize Manager', async () => {
        const manager = new StorageManager(this.testIndexPath);
        await manager.initialize();
        return { initialized: true };
      }));

      // Test 2: Batch file operations
      suite.results.push(await this.measure('Batch File Operations', async () => {
        const manager = new StorageManager(this.testIndexPath);
        await manager.initialize();

        const start = performance.now();
        for (const file of files) {
          await manager.addFile(file.path, file.content, 'javascript');
        }
        const duration = performance.now() - start;

        return {
          filesAdded: files.length,
          duration,
          averagePerFile: duration / files.length,
        };
      }));

      // Test 3: Search with manager
      suite.results.push(await this.measure('Manager Search', async () => {
        const manager = new StorageManager(this.testIndexPath);
        await manager.initialize();

        const start = performance.now();
        const results = await manager.searchFiles('function', { limit: 10 });
        const duration = performance.now() - start;

        return {
          matches: results.length,
          duration,
        };
      }));

      // Test 4: Get metrics
      suite.results.push(await this.measure('Get Metrics', async () => {
        const manager = new StorageManager(this.testIndexPath);
        await manager.initialize();
        const metrics = await manager.getMetrics();
        return {
          totalFiles: metrics.totalFiles,
          totalSize: metrics.totalSize,
        };
      }));

      // Test 5: Cleanup operation
      suite.results.push(await this.measure('Cleanup', async () => {
        const manager = new StorageManager(this.testIndexPath);
        await manager.initialize();
        const report = await manager.cleanup({
          maxBackups: 3,
          removeOrphanedFiles: false,
        });
        return {
          removedFiles: report.removedFiles,
          freedSpace: report.freedSpace,
        };
      }));

      this.calculateSuiteSummary(suite);
      return suite;

    } catch (error) {
      this.logger.error("Storage manager benchmark failed:", error);
      suite.results.push({
        operation: 'Error',
        duration: 0,
        throughput: 0,
        memoryUsed: 0,
        success: false,
        error: error.message,
      });
      this.calculateSuiteSummary(suite);
      return suite;
    } finally {
      await this.cleanup();
    }
  }

  private async measure<T>(operation: string, fn: () => Promise<T>): Promise<BenchmarkResult> {
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    try {
      const result = await fn();
      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsed = endMemory - startMemory;
      const duration = endTime - startTime;

      return {
        operation,
        duration,
        throughput: duration > 0 ? 1000 / duration : 0, // operations per second
        memoryUsed,
        success: true,
        details: result,
      };
    } catch (error) {
      const endTime = performance.now();
      const memoryUsed = process.memoryUsage().heapUsed - startMemory;

      return {
        operation,
        duration: endTime - startTime,
        throughput: 0,
        memoryUsed,
        success: false,
        error: error.message,
      };
    }
  }

  private calculateSuiteSummary(suite: BenchmarkSuite): void {
    const successful = suite.results.filter(r => r.success);
    const failed = suite.results.filter(r => !r.success);

    suite.summary.totalOperations = suite.results.length;
    suite.summary.totalTime = suite.results.reduce((sum, r) => sum + r.duration, 0);
    suite.summary.averageTime = successful.length > 0
      ? suite.summary.totalTime / successful.length
      : 0;

    if (successful.length > 0) {
      const fastest = successful.reduce((min, current) =>
        current.duration < min.duration ? current : min
      );
      const slowest = successful.reduce((max, current) =>
        current.duration > max.duration ? current : max
      );

      suite.summary.fastestOperation = fastest.operation;
      suite.summary.slowestOperation = slowest.operation;
      suite.summary.throughputPerSecond =
        1000 / (suite.summary.totalTime / successful.length);
    }

    suite.results.sort((a, b) => a.duration - b.duration);
  }

  private generateTestContent(): string {
    const functions = Array(100).fill(null).map((_, i) => `
function testFunction${i}() {
  // This is a test function ${i}
  const local${i} = "value${i}";
  return local${i};
}

class TestClass${i} {
  constructor() {
    this.property${i} = "test";
  }

  async method${i}() {
    await new Promise(resolve => setTimeout(resolve, 1));
    return this.property${i};
  }
}
`).join('');

    return `
// Generated test content for benchmark
const testConstants = Array(100).fill(null).map((_, i) => \`constant-\${i}\`);

${functions}

export default {
  testFunctions: Array(100).fill(null).map((_, i) => testFunction${i}),
  testClasses: Array(100).fill(null).map((_, i) => new TestClass${i}()),
  constants: testConstants,
  data: {
    largeArray: Array(1000).fill(null).map((_, i) => ({
      id: i,
      name: \`item-\${i}\`,
      value: Math.random(),
      timestamp: new Date().toISOString(),
    })),
    nestedObject: {
      level1: {
        level2: {
          level3: {
            data: "deeply nested value"
          }
        }
      }
    }
  }
};
`;
  }

  private generateSmallContent(): string {
    return `
function testFunction() {
  const local = "value";
  return local;
}

export default testFunction;
`;
  }

  private generateSearchTestContent(index: number): string {
    const types = ['function', 'class', 'const', 'let', 'async'];
    const type = types[index % types.length];

    if (type === 'function') {
      return `
function searchTestFunction${index}(param1, param2) {
  // Function implementation ${index}
  const result = param1 + param2;
  return result;
}

export default searchTestFunction${index};
`;
    } else if (type === 'class') {
      return `
class SearchTestClass${index} {
  constructor() {
    this.property = "test";
  }

  method() {
    return this.property;
  }
}

export default SearchTestClass${index};
`;
    } else {
      return `
const searchTest${index} = {
  data: "test data ${index}",
  value: ${index * 10},
  timestamp: new Date().toISOString(),
};

export default searchTest${index};
`;
    }
  }

  private generateLargeJSON(count: number): string {
    const objects = Array(count).fill(null).map((_, i) => ({
      id: i,
      name: `object-${i}`,
      value: Math.random(),
      data: {
        nested: {
          value: `nested-value-${i}`,
          array: Array(10).fill(null).map((_, j) => `item-${j}`),
        },
      },
      timestamp: new Date().toISOString(),
    }));

    return JSON.stringify(objects);
  }

  private async setupTestEnvironment(): Promise<void> {
    await fs.rm(this.testIndexPath, { recursive: true, force: true });
    await fs.mkdir(this.testIndexPath, { recursive: true });
  }

  private async cleanup(): Promise<void> {
    try {
      await fs.rm(this.testIndexPath, { recursive: true, force: true });
      process.chdir(this.originalWorkingDir);
    } catch (error) {
      this.logger.warn(`Cleanup failed: ${error.message}`);
      process.chdir(this.originalWorkingDir);
    }
  }

  private generateRecommendations(suites: any): string[] {
    const recommendations: string[] = [];

    // Analyze storage performance
    const storageSuite = suites.storage;
    const avgStorageTime = storageSuite.summary.averageTime;
    if (avgStorageTime > 1000) {
      recommendations.push("Storage initialization is slow - consider using compression");
    }

    // Analyze search performance
    const searchSuite = suites.search;
    const avgSearchTime = searchSuite.results
      .filter(r => r.success && r.operation.includes('Search'))
      .reduce((sum, r, _, arr) => sum + r.duration / arr.length, 0);

    if (avgSearchTime > 50) {
      recommendations.push("Search performance is slow - consider optimizing text index");
    }

    // Analyze streaming performance
    const streamingSuite = suites.streaming;
    const avgStreamingTime = streamingSuite.results
      .filter(r => r.success && r.operation.includes('Streaming'))
      .reduce((sum, r, _, arr) => sum + r.duration / arr.length, 0);

    if (avgStreamingTime > 100) {
      recommendations.push("Streaming performance needs improvement - adjust buffer sizes");
    }

    // Analyze manager performance
    const managerSuite = suites.manager;
    const managerEfficiency = managerSuite.results
      .filter(r => r.success && r.operation === 'Batch File Operations')
      .map(r => r.details.averagePerFile);

    if (managerEfficiency.length > 0 && managerEfficiency[0] > 10) {
      recommendations.push("Batch file operations are slow - consider parallel processing");
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push("Performance is good - no immediate optimizations needed");
    }

    return recommendations;
  }

  async generateReport(benchmarkResult: any): Promise<string> {
    let report = `# PRISM JSON Storage Performance Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;

    // Overall summary
    report += `## Overall Performance Summary\n\n`;
    report += `- Total Duration: ${benchmarkResult.overall.totalDuration}ms\n`;
    report += `- Average Throughput: ${benchmarkResult.overall.totalThroughput.toFixed(2)} ops/sec\n\n`;

    // Recommendations
    report += `## Recommendations\n\n`;
    for (const recommendation of benchmarkResult.overall.recommendations) {
      report += `- ${recommendation}\n`;
    }
    report += `\n`;

    // Individual suite results
    for (const [suiteName, suite] of Object.entries(benchmarkResult)) {
      if (suiteName === 'overall') continue;

      report += `## ${suite.name}\n\n`;
      report += `### Summary\n\n`;
      report += `- Total Operations: ${suite.summary.totalOperations}\n`;
      report += `- Total Time: ${suite.summary.totalTime}ms\n`;
      report += `- Average Time: ${suite.summary.averageTime.toFixed(2)}ms\n`;
      report += `- Fastest Operation: ${suite.summary.fastestOperation} (${suite.summary.fastestOperation ? suite.results.find(r => r.operation === suite.summary.fastestOperation)?.duration.toFixed(2) : 0}ms)\n`;
      report += `- Slowest Operation: ${suite.summary.slowestOperation} (${suite.summary.slowestOperation ? suite.results.find(r => r.operation === suite.summary.slowestOperation)?.duration.toFixed(2) : 0}ms)\n`;
      report += `- Throughput: ${suite.summary.throughputPerSecond.toFixed(2)} ops/sec\n\n`;

      report += `### Detailed Results\n\n`;
      report += `| Operation | Duration (ms) | Throughput (ops/sec) | Memory (MB) | Status |\n`;
      report += `|-----------|---------------|---------------------|-------------|--------|\n`;

      for (const result of suite.results) {
        const memoryMB = (result.memoryUsed / 1024 / 1024).toFixed(2);
        const status = result.success ? '✅' : '❌';
        report += `| ${result.operation} | ${result.duration.toFixed(2)} | ${result.throughput.toFixed(2)} | ${memoryMB} | ${status} |\n`;
      }

      report += `\n`;
    }

    return report;
  }
}