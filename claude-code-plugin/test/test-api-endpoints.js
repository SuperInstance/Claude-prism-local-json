#!/usr/bin/env node

/**
 * Test HTTP API endpoints
 */

const PrismDaemon = require('../daemon/server.js');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;

async function testAPIEndpoints() {
  console.log('🌐 Testing HTTP API Endpoints...\n');

  let daemon;
  const testRoot = path.join(__dirname, 'api-test-project');
  let server;

  try {
    // Create test project
    await fs.mkdir(testRoot, { recursive: true });
    await fs.writeFile(path.join(testRoot, 'package.json'), JSON.stringify({
      name: 'api-test-project',
      version: '1.0.0'
    }));

    // Initialize daemon
    daemon = new PrismDaemon();
    daemon.config.projectRoot = testRoot;
    daemon.config.cacheDir = path.join(testRoot, '.cache');
    daemon.config.indexDir = path.join(testRoot, '.index');
    daemon.config.port = 0; // Use random port

    await daemon.initialize();
    console.log('✅ Daemon initialized');

    // Start the server
    await new Promise((resolve, reject) => {
      server = daemon.server.listen(0, () => {
        const port = server.address().port;
        daemon.config.port = port;
        console.log(`✅ Server started on port ${port}`);
        resolve();
      });
      server.on('error', reject);
    });

    const baseUrl = `http://localhost:${daemon.config.port}`;

    // Test 1: Health endpoint
    console.log('\n🔍 Testing Health Endpoint...');
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthData = await healthResponse.json();

    if (healthResponse.ok && healthData.status === 'ok') {
      console.log('✅ Health endpoint working');
      console.log(`   Project: ${healthData.project}`);
      console.log(`   Uptime: ${healthData.uptime}s`);
    } else {
      console.log('❌ Health endpoint failed');
      console.log('   Response:', healthData);
    }

    // Test 2: Search endpoint
    console.log('\n🔍 Search Endpoint...');
    const searchPayload = JSON.stringify({ query: 'test search' });
    const searchResponse = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(searchPayload)
      },
      body: searchPayload
    });

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      console.log('✅ Search endpoint working');
      console.log(`   Query: ${searchData.query}`);
      console.log(`   Results: ${searchData.results.length}`);
    } else {
      console.log('❌ Search endpoint failed');
      console.log('   Status:', searchResponse.status);
    }

    // Test 3: Project endpoint
    console.log('\n🔍 Project Endpoint...');
    const projectResponse = await fetch(`${baseUrl}/project`);
    if (projectResponse.ok) {
      const projectData = await projectResponse.json();
      console.log('✅ Project endpoint working');
      console.log(`   Name: ${projectData.name}`);
      console.log(`   Language: ${projectData.language}`);
    } else {
      console.log('❌ Project endpoint failed');
      console.log('   Status:', projectResponse.status);
    }

    // Test 4: CORS headers
    console.log('\n🔍 Testing CORS Headers...');
    const corsResponse = await fetch(`${baseUrl}/health`);
    const corsHeaders = corsResponse.headers;

    const corsChecks = [
      { name: 'Access-Control-Allow-Origin', value: corsHeaders.get('access-control-allow-origin') },
      { name: 'Access-Control-Allow-Methods', value: corsHeaders.get('access-control-allow-methods') },
      { name: 'Access-Control-Allow-Headers', value: corsHeaders.get('access-control-allow-headers') }
    ];

    corsChecks.forEach(check => {
      if (check.value === '*') {
        console.log(`✅ ${check.name}: ${check.value}`);
      } else {
        console.log(`❌ ${check.name}: ${check.value || 'missing'}`);
      }
    });

    // Test 5: Error handling
    console.log('\n🔍 Testing Error Handling...');
    const notFoundResponse = await fetch(`${baseUrl}/nonexistent`);
    if (notFoundResponse.status === 404) {
      console.log('✅ 404 handling working');
    } else {
      console.log('❌ 404 handling failed');
    }

    // Test 6: Invalid JSON handling
    console.log('\n🔍 Testing Invalid JSON Handling...');
    const invalidResponse = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json'
    });

    if (invalidResponse.status === 500) {
      console.log('✅ Invalid JSON handling working');
    } else {
      console.log('❌ Invalid JSON handling failed');
      console.log('   Status:', invalidResponse.status);
    }

    console.log('\n🎉 API endpoint tests completed!');

  } catch (error) {
    console.error('\n❌ API test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Clean up
    try {
      if (server) {
        await new Promise(resolve => server.close(resolve));
        console.log('✅ Server stopped');
      }

      await fs.rm(testRoot, { recursive: true, force: true });
      console.log('✅ Test cleanup completed');
    } catch (error) {
      console.log('⚠️  Cleanup warning:', error.message);
    }
  }
}

// Helper function to fetch (since Node.js doesn't have fetch by default)
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const headers = {};
        for (const [key, value] of Object.entries(res.headers)) {
          headers[key.toLowerCase()] = value;
        }

        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: {
            get: (name) => headers[name.toLowerCase()]
          },
          json: () => JSON.parse(data),
          text: () => data
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Run the test
testAPIEndpoints();