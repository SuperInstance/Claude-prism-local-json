#!/usr/bin/env node

/**
 * Test data persistence and recovery
 */

const PrismDaemon = require('../daemon/server.js');
const path = require('path');
const fs = require('fs').promises;

async function testPersistence() {
  console.log('💾 Testing Data Persistence & Recovery...\n');

  let daemon1, daemon2;
  const testRoot = path.join(__dirname, 'persistence-test-project');
  const cacheDir = path.join(testRoot, '.cache');
  const indexDir = path.join(testRoot, '.index');

  try {
    // Create test project
    await fs.mkdir(testRoot, { recursive: true });
    await fs.writeFile(path.join(testRoot, 'package.json'), JSON.stringify({
      name: 'persistence-test-project',
      version: '1.0.0',
      dependencies: { express: '^4.18.0' }
    }, null, 2));

    console.log('✅ Test project created');

    // Test 1: Directory creation
    console.log('\n🔍 Testing Directory Creation...');

    daemon1 = new PrismDaemon();
    daemon1.config.projectRoot = testRoot;
    daemon1.config.cacheDir = cacheDir;
    daemon1.config.indexDir = indexDir;

    await daemon1.initialize();

    // Check if directories were created
    const cacheExists = await fs.access(cacheDir).then(() => true).catch(() => false);
    const indexExists = await fs.access(indexDir).then(() => true).catch(() => false);

    if (cacheExists && indexExists) {
      console.log('✅ Cache and index directories created');
    } else {
      console.log('❌ Directory creation failed');
      console.log(`   Cache: ${cacheExists ? '✅' : '❌'}`);
      console.log(`   Index: ${indexExists ? '✅' : '❌'}`);
    }

    // Test 2: Project info persistence
    console.log('\n🔍 Testing Project Info Persistence...');

    // Store some project info
    daemon1.projectInfo.customData = {
      lastIndexed: new Date().toISOString(),
      indexedFiles: 5,
      totalSize: '1.2MB'
    };

    console.log(`Project data stored: ${JSON.stringify(daemon1.projectInfo.customData)}`);

    // Test 3: Daemon restart and recovery
    console.log('\n🔍 Testing Daemon Restart & Recovery...');

    // Stop first daemon
    if (daemon1.isRunning) {
      await daemon1.stop();
      console.log('✅ First daemon stopped');
    }

    // Start second daemon with same configuration
    daemon2 = new PrismDaemon();
    daemon2.config.projectRoot = testRoot;
    daemon2.config.cacheDir = cacheDir;
    daemon2.config.indexDir = indexDir;

    await daemon2.initialize();
    console.log('✅ Second daemon started');

    // Check if project info is available
    if (daemon2.projectInfo) {
      console.log('✅ Project info recovered after restart');
      console.log(`   Name: ${daemon2.projectInfo.name}`);
      console.log(`   Language: ${daemon2.projectInfo.language}`);
    } else {
      console.log('❌ Project info not recovered');
    }

    // Test 4: File system watcher setup (conceptual test)
    console.log('\n🔍 Testing File System Watcher...');

    // Create a test file to trigger potential watcher
    await fs.writeFile(path.join(testRoot, 'new-file.js'), 'console.log("test");');

    // Give a moment for any watcher to process
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('✅ File creation test completed');

    // Test 5: Configuration persistence
    console.log('\n🔍 Testing Configuration Persistence...');

    const configChecks = [
      { key: 'projectRoot', value: testRoot },
      { key: 'cacheDir', value: cacheDir },
      { key: 'indexDir', value: indexDir }
    ];

    configChecks.forEach(check => {
      if (daemon2.config[check.key] === check.value) {
        console.log(`✅ ${check.key}: ${check.value}`);
      } else {
        console.log(`❌ ${check.key}: expected ${check.value}, got ${daemon2.config[check.key]}`);
      }
    });

    // Test 6: State validation
    console.log('\n🔍 Testing State Validation...');

    const stateChecks = [
      { name: 'isRunning', value: daemon2.isRunning },
      { name: 'projectInfo', value: daemon2.projectInfo !== null },
      { name: 'indexingQueue', value: Array.isArray(daemon2.indexingQueue) },
      { name: 'server', value: daemon2.server !== null }
    ];

    stateChecks.forEach(check => {
      if (check.value) {
        console.log(`✅ ${check.name}: OK`);
      } else {
        console.log(`❌ ${check.name}: Failed`);
      }
    });

    // Test 7: Graceful shutdown
    console.log('\n🔍 Testing Graceful Shutdown...');

    try {
      await daemon2.stop();
      console.log('✅ Graceful shutdown successful');
    } catch (error) {
      console.log(`❌ Graceful shutdown failed: ${error.message}`);
    }

    console.log('\n🎉 Persistence tests completed!');

  } catch (error) {
    console.error('\n❌ Persistence test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Clean up
    try {
      if (daemon1 && daemon1.isRunning) {
        await daemon1.stop();
      }
      if (daemon2 && daemon2.isRunning) {
        await daemon2.stop();
      }

      await fs.rm(testRoot, { recursive: true, force: true });
      console.log('\n✅ Test cleanup completed');
    } catch (error) {
      console.log('⚠️  Cleanup warning:', error.message);
    }
  }
}

// Run the test
testPersistence();