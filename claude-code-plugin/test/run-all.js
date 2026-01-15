#!/usr/bin/env node

/**
 * Test runner for PRISM plugin
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Running PRISM Plugin Tests...\n');

// Run daemon tests
const daemonTest = spawn('node', ['test/daemon.test.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});

daemonTest.on('close', (code) => {
  if (code !== 0) {
    console.error('\n❌ Daemon tests failed');
    process.exit(code);
  }

  console.log('\n✅ All tests passed!');
  console.log('\n🚀 PRISM Plugin is ready for deployment!');
});

daemonTest.on('error', (error) => {
  console.error('Error running tests:', error);
  process.exit(1);
});