#!/usr/bin/env node

/**
 * Performance benchmarking
 */

const PrismDaemon = require('../daemon/server.js');
const path = require('path');
const fs = require('fs').promises;

async function benchmarkPerformance() {
  console.log('⚡ Running Performance Benchmarks...\n');

  let daemon;
  const testRoot = path.join(__dirname, 'performance-test-project');

  try {
    // Create a larger test project
    await fs.mkdir(testRoot, { recursive: true });
    await fs.writeFile(path.join(testRoot, 'package.json'), JSON.stringify({
      name: 'performance-test-project',
      version: '1.0.0',
      dependencies: {
        express: '^4.18.0',
        react: '^18.0.0',
        lodash: '^4.17.0',
        mongoose: '^7.0.0',
        jwt: '^9.0.0',
        bcrypt: '^5.0.0'
      }
    }, null, 2));

    // Create multiple files for testing
    const fileCount = 50;
    const batchSize = 10;

    console.log(`📁 Creating ${fileCount} test files...`);

    for (let i = 0; i < fileCount; i++) {
      const filePath = path.join(testRoot, `src`, `file${i}.js`);
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Create varied content
      const content = `
// Test file ${i}
const express = require('express');
const _ = require('lodash');
const jwt = require('jwt');

const app = express();

// Function ${i} - authentication
function authenticate${i}(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send('Unauthorized');

  try {
    const decoded = jwt.verify(token, process.env.SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).send('Forbidden');
  }
}

// Function ${i} - data processing
function process${i}(data) {
  return _.chain(data)
    .filter(item => item.active)
    .map(item => ({
      id: item.id,
      name: item.name.toUpperCase(),
      processed: true
    }))
    .value();
}

// Route ${i}
app.get('/api/route${i}', authenticate${i}, (req, res) => {
  const result = process${i}(req.body);
  res.json({ success: true, data: result });
});

module.exports = { authenticate${i}, process${i} };
`;

      await fs.writeFile(filePath, content);
    }

    console.log('✅ Test files created');

    // Initialize daemon
    daemon = new PrismDaemon();
    daemon.config.projectRoot = testRoot;
    daemon.config.cacheDir = path.join(testRoot, '.cache');
    daemon.config.indexDir = path.join(testRoot, '.index');

    const startTime = process.hrtime.bigint();
    await daemon.initialize();
    const initTime = Number(process.hrtime.bigint() - startTime) / 1000000;

    console.log(`\n🔍 Initialization Performance:`);
    console.log(`   Time: ${initTime.toFixed(2)}ms`);
    console.log(`   Files: ${fileCount}`);
    console.log(`   Rate: ${(fileCount / (initTime / 1000)).toFixed(0)} files/second`);

    // Benchmark project detection
    console.log('\n🔍 Project Detection Performance:');

    const detectionStart = process.hrtime.bigint();
    const detector = new (require('../daemon/project-detector'))(testRoot);
    const projectInfo = await detector.detectAll();
    const detectionTime = Number(process.hrtime.bigint() - detectionStart) / 1000000;

    console.log(`   Time: ${detectionTime.toFixed(2)}ms`);
    console.log(`   Dependencies: ${projectInfo.dependencies.length + projectInfo.devDependencies.length}`);
    console.log(`   Config files: ${projectInfo.configFiles.length}`);

    // Benchmark search performance
    console.log('\n🔍 Search Performance:');

    const searchQueries = [
      'authentication middleware',
      'data processing function',
      'express route handler',
      'jwt token verification',
      'lodash utility function',
      'error handling middleware',
      'api endpoint',
      'user authentication'
    ];

    const searchTimes = [];
    const searchResults = [];

    for (const query of searchQueries) {
      const start = process.hrtime.bigint();
      const results = daemon.simpleSearch(query);
      const end = process.hrtime.bigint();

      const time = Number(end - start) / 1000000;
      searchTimes.push(time);
      searchResults.push(results.length);

      console.log(`   Query "${query}": ${time.toFixed(3)}ms, ${results.length} results`);
    }

    const avgSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
    const maxSearchTime = Math.max(...searchTimes);
    const minSearchTime = Math.min(...searchTimes);

    console.log(`\n   Search Performance Summary:`);
    console.log(`   Average: ${avgSearchTime.toFixed(3)}ms`);
    console.log(`   Maximum: ${maxSearchTime.toFixed(3)}ms`);
    console.log(`   Minimum: ${minSearchTime.toFixed(3)}ms`);
    console.log(`   Target: <5ms average ✅/❌ ${avgSearchTime < 5 ? '✅' : '❌'}`);

    // Benchmark HTTP endpoint performance
    console.log('\n🔍 HTTP Endpoint Performance:');

    // Create a simple HTTP server for testing
    const http = require('http');
    let testServer;

    await new Promise((resolve) => {
      testServer = http.createServer((req, res) => {
        if (req.url === '/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            project: daemon.projectInfo?.name || 'Unknown'
          }));
        } else if (req.url === '/search' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            const query = JSON.parse(body).query || '';
            const results = daemon.simpleSearch(query);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ results }));
          });
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      testServer.listen(0, () => {
        const port = testServer.address().port;
        daemon.config.port = port;
        resolve();
      });
    });

    const baseUrl = `http://localhost:${daemon.config.port}`;

    // Test HTTP performance
    const httpRequestCount = 20;
    const httpTimes = [];

    for (let i = 0; i < httpRequestCount; i++) {
      const query = `test query ${i}`;
      const payload = JSON.stringify({ query });

      const start = process.hrtime.bigint();

      await new Promise((resolve, reject) => {
        const req = http.request(`${baseUrl}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const end = process.hrtime.bigint();
            const time = Number(end - start) / 1000000;
            httpTimes.push(time);
            resolve();
          });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
      });
    }

    const avgHttpTime = httpTimes.reduce((a, b) => a + b, 0) / httpTimes.length;
    console.log(`   Average HTTP request: ${avgHttpTime.toFixed(2)}ms`);
    console.log(`   Target: <50ms average ✅/❌ ${avgHttpTime < 50 ? '✅' : '❌'}`);

    // Memory usage
    const memoryUsage = process.memoryUsage();
    console.log('\n🔍 Memory Usage:');
    console.log(`   RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   External: ${(memoryUsage.external / 1024 / 1024).toFixed(2)}MB`);

    // Performance summary
    console.log('\n📊 Performance Summary:');
    console.log('================================');

    const performanceChecks = [
      {
        name: 'Initialization Time',
        value: initTime,
        target: 1000,
        unit: 'ms'
      },
      {
        name: 'Search Response Time',
        value: avgSearchTime,
        target: 5,
        unit: 'ms'
      },
      {
        name: 'HTTP Response Time',
        value: avgHttpTime,
        target: 50,
        unit: 'ms'
      },
      {
        name: 'Memory Usage',
        value: memoryUsage.heapUsed / 1024 / 1024,
        target: 100,
        unit: 'MB'
      }
    ];

    let passedChecks = 0;
    performanceChecks.forEach(check => {
      const status = check.value <= check.target ? '✅' : '❌';
      console.log(`${status} ${check.name}: ${check.value.toFixed(2)}${check.unit} (target: ${check.target}${check.unit}) ${status === '✅' ? 'PASS' : 'FAIL'}`);
      if (status === '✅') passedChecks++;
    });

    console.log(`\nOverall Performance Score: ${passedChecks}/${performanceChecks.length} checks passed`);

    if (passedChecks === performanceChecks.length) {
      console.log('🎉 All performance targets met!');
    } else {
      console.log('⚠️  Some performance targets not met');
    }

    // Stop test server
    testServer.close();

  } catch (error) {
    console.error('\n❌ Performance test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Clean up
    try {
      if (daemon && daemon.isRunning) {
        await daemon.stop();
      }

      await fs.rm(testRoot, { recursive: true, force: true });
      console.log('\n✅ Test cleanup completed');
    } catch (error) {
      console.log('⚠️  Cleanup warning:', error.message);
    }
  }
}

// Run the benchmark
benchmarkPerformance();