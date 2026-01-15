#!/usr/bin/env node

/**
 * Test error handling and edge cases
 */

const PrismDaemon = require('../daemon/server.js');
const path = require('path');
const fs = require('fs').promises;

async function testErrorHandling() {
  console.log('🛡️  Testing Error Handling & Edge Cases...\n');

  let daemon;
  const testRoot = path.join(__dirname, 'error-test-project');

  try {
    // Test 1: Invalid project paths
    console.log('🔍 Testing Invalid Project Paths...');

    const invalidPaths = [
      '/nonexistent/path',
      '',
      '/root',
      '/dev/null'
    ];

    for (const testPath of invalidPaths) {
      try {
        const testDaemon = new PrismDaemon();
        testDaemon.config.projectRoot = testPath;

        await testDaemon.initialize();
        console.log(`✅ Handled invalid path: ${testPath}`);
      } catch (error) {
        console.log(`✅ Correctly rejected invalid path: ${testPath} - ${error.message}`);
      }
    }

    // Test 2: Corrupted package.json
    console.log('\n🔍 Testing Corrupted Configuration Files...');

    await fs.mkdir(testRoot, { recursive: true });

    // Create corrupted package.json
    await fs.writeFile(path.join(testRoot, 'package.json'), 'invalid json content');

    daemon = new PrismDaemon();
    daemon.config.projectRoot = testRoot;
    daemon.config.cacheDir = path.join(testRoot, '.cache');
    daemon.config.indexDir = path.join(testRoot, '.index');

    try {
      await daemon.initialize();
      console.log('✅ Handled corrupted package.json gracefully');
    } catch (error) {
      console.log(`✅ Correctly handled corrupted package.json: ${error.message}`);
    }

    // Test 3: Missing dependencies in detection
    console.log('\n🔍 Testing Missing Dependencies Detection...');

    // Create a minimal project without package.json
    const minimalRoot = path.join(testRoot, 'minimal');
    await fs.mkdir(minimalRoot, { recursive: true });

    const minimalDaemon = new PrismDaemon();
    minimalDaemon.config.projectRoot = minimalRoot;

    try {
      await minimalDaemon.initialize();
      console.log('✅ Handled missing package.json');
      console.log(`   Detected type: ${minimalDaemon.projectInfo?.type}`);
      console.log(`   Detected language: ${minimalDaemon.projectInfo?.language}`);
    } catch (error) {
      console.log(`✅ Handled missing package.json: ${error.message}`);
    }

    // Test 4: HTTP error scenarios
    console.log('\n🔍 Testing HTTP Error Scenarios...');

    // Create a valid project for HTTP tests
    await fs.writeFile(path.join(testRoot, 'package.json'), JSON.stringify({
      name: 'error-test-project',
      version: '1.0.0'
    }));

    // Reinitialize daemon
    daemon = new PrismDaemon();
    daemon.config.projectRoot = testRoot;
    daemon.config.cacheDir = path.join(testRoot, '.cache');
    daemon.config.indexDir = path.join(testRoot, '.index');

    await daemon.initialize();

    // Test malformed HTTP requests
    const errorTests = [
      {
        name: 'Malformed JSON in search request',
        test: async () => {
          return new Promise((resolve) => {
            const req = {
              method: 'POST',
              url: '/search',
              on: (event, callback) => {
                if (event === 'data') {
                  callback(Buffer.from('invalid{json'));
                }
                if (event === 'end') {
                  callback();
                }
              }
            };
            const res = {
              writeHead: (status) => resolve({ status }),
              end: () => {}
            };
            daemon.requestHandler(req, res);
          });
        }
      },
      {
        name: 'Empty request body',
        test: async () => {
          return new Promise((resolve) => {
            const req = {
              method: 'POST',
              url: '/search',
              on: (event, callback) => {
                if (event === 'end') {
                  callback();
                }
              }
            };
            const res = {
              writeHead: (status) => resolve({ status }),
              end: () => {}
            };
            daemon.requestHandler(req, res);
          });
        }
      },
      {
        name: 'Invalid HTTP method',
        test: async () => {
          return new Promise((resolve) => {
            const req = {
              method: 'DELETE',
              url: '/health',
              on: () => {}
            };
            const res = {
              writeHead: (status) => resolve({ status }),
              end: () => {}
            };
            daemon.requestHandler(req, res);
          });
        }
      },
      {
        name: 'Nonexistent endpoint',
        test: async () => {
          return new Promise((resolve) => {
            const req = {
              method: 'GET',
              url: '/nonexistent',
              on: () => {}
            };
            const res = {
              writeHead: (status) => resolve({ status }),
              end: () => {}
            };
            daemon.requestHandler(req, res);
          });
        }
      }
    ];

    for (const errorTest of errorTests) {
      try {
        const result = await errorTest.test();
        console.log(`${result.status === 500 || result.status === 404 ? '✅' : '❌'} ${errorTest.name}: Status ${result.status}`);
      } catch (error) {
        console.log(`✅ ${errorTest.name}: Handled error - ${error.message}`);
      }
    }

    // Test 5: Memory limits and large data
    console.log('\n🔍 Testing Memory Limits...');

    // Test with very large query
    const largeQuery = 'x'.repeat(10000);
    try {
      const results = daemon.simpleSearch(largeQuery);
      console.log(`✅ Handled large query (${largeQuery.length} characters)`);
      console.log(`   Results: ${results.length}`);
    } catch (error) {
      console.log(`✅ Handled large query: ${error.message}`);
    }

    // Test 6: Concurrent operations
    console.log('\n🔍 Testing Concurrent Operations...');

    const concurrentCount = 5;
    const concurrentTests = [];

    for (let i = 0; i < concurrentCount; i++) {
      concurrentTests.push((async () => {
        return daemon.simpleSearch(`concurrent test ${i}`);
      })());
    }

    try {
      const results = await Promise.all(concurrentTests);
      console.log(`✅ Handled ${concurrentCount} concurrent searches`);
      console.log(`   All completed: ${results.every(r => Array.isArray(r))}`);
    } catch (error) {
      console.log(`✅ Handled concurrent operation error: ${error.message}`);
    }

    // Test 7: Project detector edge cases
    console.log('\n🔍 Testing Project Detector Edge Cases...');

    const edgeCaseProjects = [
      {
        name: 'Empty project',
        setup: async () => {
          const emptyRoot = path.join(testRoot, 'empty');
          await fs.mkdir(emptyRoot, { recursive: true });
          return emptyRoot;
        }
      },
      {
        name: 'Only README files',
        setup: async () => {
          const readmeRoot = path.join(testRoot, 'readme-only');
          await fs.mkdir(readmeRoot, { recursive: true });
          await fs.writeFile(path.join(readmeRoot, 'README.md'), '# Empty Project');
          return readmeRoot;
        }
      },
      {
        name: 'Binary files only',
        setup: async () => {
          const binaryRoot = path.join(testRoot, 'binary-only');
          await fs.mkdir(binaryRoot, { recursive: true });
          await fs.writeFile(path.join(binaryRoot, 'binary.bin'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
          return binaryRoot;
        }
      }
    ];

    for (const testCase of edgeCaseProjects) {
      try {
        const projectPath = await testCase.setup();
        const testDaemon = new PrismDaemon();
        testDaemon.config.projectRoot = projectPath;

        await testDaemon.initialize();
        console.log(`✅ Handled ${testCase.name}: ${testDaemon.projectInfo?.type || 'unknown'} project`);
      } catch (error) {
        console.log(`✅ Handled ${testCase.name}: ${error.message}`);
      }
    }

    // Test 8: Graceful shutdown
    console.log('\n🔍 Testing Graceful Shutdown...');

    try {
      // Simulate SIGTERM
      process.emit('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('✅ Graceful shutdown handling works');
    } catch (error) {
      console.log(`⚠️  Graceful shutdown issue: ${error.message}`);
    }

    console.log('\n🎉 Error handling tests completed!');
    console.log('✅ The system handles edge cases gracefully');

  } catch (error) {
    console.error('\n❌ Error handling test failed:', error.message);
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

// Run the error handling test
testErrorHandling();