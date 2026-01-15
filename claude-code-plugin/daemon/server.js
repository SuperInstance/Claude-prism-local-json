#!/usr/bin/env node

/**
 * PRISM Simple Daemon
 * Provides basic project memory for Claude Code
 */

const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const ProjectDetector = require('./project-detector');

class SimplePrismDaemon {
  constructor() {
    this.config = {
      port: parseInt(process.env.PORT) || 8080,
      projectRoot: process.env.PROJECT_ROOT || process.cwd(),
      logLevel: process.env.LOG_LEVEL || 'info'
    };

    this.server = http.createServer(this.handleRequest.bind(this));
    this.projectInfo = null;
    this.isRunning = false;
  }

  /**
   * Initialize the daemon
   */
  async initialize() {
    try {
      await this.discoverProject();
      console.log(`[PRISM] Project: ${this.projectInfo?.name || 'Unknown'} (${this.projectInfo?.language || 'unknown'})`);
    } catch (error) {
      console.error('[PRISM] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Auto-discover project structure and type
   */
  async discoverProject() {
    try {
      const detector = new ProjectDetector(this.config.projectRoot);
      this.projectInfo = await detector.detectAll();
    } catch (error) {
      this.projectInfo = {
        name: path.basename(this.config.projectRoot),
        language: 'unknown',
        type: 'generic'
      };
    }
  }

  
  /**
   * Set up file system watcher for changes
   */
  setupFileWatcher() {
    // For now, log the intent to watch files
    console.log('[PRISM Daemon] File watching setup would go here');

    // In a real implementation, we would use chokidar or similar
    // to watch for file changes and trigger reindexing
  }

  /**
   * Handle HTTP requests
   */
  requestHandler(req, res) {
    const { method, url } = req;
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    // Route handling
    if (method === 'GET' && url === '/health') {
      res.writeHead(200, headers);
      res.end(JSON.stringify({
        status: 'healthy',
        project: this.projectInfo?.name || 'Unknown',
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }));
    } else if (method === 'POST' && url === '/index') {
      this.handleIndexRequest(req, res, headers);
    } else if (method === 'POST' && url === '/search') {
      this.handleSearchRequest(req, res, headers);
    } else {
      res.writeHead(404, headers);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * Handle indexing request
   */
  async handleIndexRequest(req, res, headers) {
    try {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', async () => {
        const data = JSON.parse(Buffer.concat(chunks).toString());

        // Add to indexing queue
        this.indexingQueue.push(data);

        // Start indexing if not already running
        if (!this.isIndexing) {
          setImmediate(() => this.processIndexingQueue());
        }

        res.writeHead(202, headers);
        res.end(JSON.stringify({ message: 'Indexing queued' }));
      });
    } catch (error) {
      res.writeHead(500, headers);
      res.end(JSON.stringify({ error: 'Indexing failed' }));
    }
  }

  /**
   * Handle search request
   */
  async handleSearchRequest(req, res, headers) {
    try {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', async () => {
        const data = JSON.parse(Buffer.concat(chunks).toString());

        // Perform search (placeholder implementation)
        const results = await this.performSearch(data.query);

        res.writeHead(200, headers);
        res.end(JSON.stringify({ results }));
      });
    } catch (error) {
      res.writeHead(500, headers);
      res.end(JSON.stringify({ error: 'Search failed' }));
    }
  }

  /**
   * Perform semantic search (placeholder)
   */
  async performSearch(query) {
    // Placeholder implementation
    // In a real implementation, this would:
    // 1. Query the vector database
    // 2. Perform semantic search
    // 3. Return relevant code snippets

    return {
      query,
      results: [
        {
          file: 'placeholder.js',
          content: 'Search functionality would go here',
          score: 0.85,
          context: 'This is where search results would appear'
        }
      ]
    };
  }

  /**
   * Process indexing queue
   */
  async processIndexingQueue() {
    if (this.isIndexing || this.indexingQueue.length === 0) {
      return;
    }

    this.isIndexing = true;

    try {
      while (this.indexingQueue.length > 0) {
        const item = this.indexingQueue.shift();

        // Process the item (placeholder)
        console.log(`[PRISM Daemon] Indexing: ${item.path || 'unknown'}`);

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('[PRISM Daemon] Indexing failed:', error);
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Start the daemon
   */
  async start() {
    if (this.isRunning) {
      console.log('[PRISM Daemon] Already running');
      return;
    }

    try {
      await this.initialize();

      this.server.listen(this.config.port, () => {
        console.log(`[PRISM Daemon] Server started on port ${this.config.port}`);
        console.log(`[PRISM Daemon] Health check: http://localhost:${this.config.port}/health`);
        this.isRunning = true;
        this.emit('started');
      });

    } catch (error) {
      console.error('[PRISM Daemon] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop the daemon gracefully
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('[PRISM Daemon] Server stopped');
        this.isRunning = false;
        this.emit('stopped');
        resolve();
      });
    });
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[PRISM Daemon] Received SIGTERM, shutting down gracefully...');
  if (daemon) {
    await daemon.stop();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[PRISM Daemon] Received SIGINT, shutting down gracefully...');
  if (daemon) {
    await daemon.stop();
  }
  process.exit(0);
});

// Start the daemon
const daemon = new PrismDaemon();

daemon.start().catch(error => {
  console.error('[PRISM Daemon] Failed to start:', error);
  process.exit(1);
});

// Export for testing
module.exports = PrismDaemon;