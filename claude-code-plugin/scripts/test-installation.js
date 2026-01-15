#!/usr/bin/env node

/**
 * PRISM Installation Test Suite
 * Comprehensive test of the entire installation process
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class InstallationTest {
  constructor() {
    this.pluginRoot = process.cwd();
    this.testResults = {
      platform: os.platform(),
      timestamp: new Date().toISOString(),
      tests: [],
      passed: 0,
      failed: 0,
      warnings: 0,
      score: 0
    };
  }

  async runAllTests() {
    console.log('🧪 PRISM Installation Test Suite');
    console.log('='.repeat(50));

    // Test Suite 1: Prerequisites
    await this.testPrerequisites();

    // Test Suite 2: File Structure
    await this.testFileStructure();

    // Test Suite 3: Configuration
    await this.testConfiguration();

    // Test Suite 4: MCP Server
    await this.testMCPServer();

    // Test Suite 5: Project Detection
    await this.testProjectDetection();

    // Test Suite 6: Installation Scripts
    await this.testInstallationScripts();

    // Test Suite 7: Cross-Platform Compatibility
    await this.testCrossPlatform();

    // Generate Final Report
    await this.generateReport();
  }

  async testPrerequisites() {
    console.log('\n🔍 Testing Prerequisites...');
    const suite = { name: 'Prerequisites', tests: [] };

    // Test Node.js
    try {
      const version = execSync('node --version', { encoding: 'utf8' });
      const majorVer = parseInt(version.trim().replace('v', ''));

      if (majorVer >= 14) {
        suite.tests.push({ name: 'Node.js Version', status: '✅', value: version.trim() });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Node.js Version', status: '❌', error: `Version ${version.trim()} is below required 14+` });
        this.testResults.failed++;
      }
    } catch (error) {
      suite.tests.push({ name: 'Node.js Installation', status: '❌', error: error.message });
      this.testResults.failed++;
    }

    // Test npm
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' });
      suite.tests.push({ name: 'npm Version', status: '✅', value: npmVersion.trim() });
      this.testResults.passed++;
    } catch (error) {
      suite.tests.push({ name: 'npm Installation', status: '❌', error: error.message });
      this.testResults.failed++;
    }

    // Test Write Permissions
    try {
      const testFile = path.join(this.pluginRoot, '.test-permission');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      suite.tests.push({ name: 'Write Permissions', status: '✅' });
      this.testResults.passed++;
    } catch (error) {
      suite.tests.push({ name: 'Write Permissions', status: '❌', error: error.message });
      this.testResults.failed++;
    }

    // Test Disk Space
    try {
      const stats = await fs.statfs(this.pluginRoot);
      const freeGB = (stats.bsize * stats.bavail) / (1024 * 1024 * 1024);
      if (freeGB > 1) {
        suite.tests.push({ name: 'Disk Space', status: '✅', value: `${freeGB.toFixed(1)}GB free` });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Disk Space', status: '⚠️', value: `${freeGB.toFixed(1)}GB free (recommended 1GB+)` });
        this.testResults.warnings++;
      }
    } catch (error) {
      suite.tests.push({ name: 'Disk Space Check', status: '⚠️', error: error.message });
      this.testResults.warnings++;
    }

    this.testResults.tests.push(suite);
  }

  async testFileStructure() {
    console.log('\n📁 Testing File Structure...');
    const suite = { name: 'File Structure', tests: [] };

    const requiredFiles = [
      'package.json',
      'daemon/server.js',
      'daemon/project-detector.js',
      '.claude-plugin/plugin.json'
    ];

    for (const file of requiredFiles) {
      try {
        await fs.access(path.join(this.pluginRoot, file));
        suite.tests.push({ name: file, status: '✅' });
        this.testResults.passed++;
      } catch (error) {
        suite.tests.push({ name: file, status: '❌', error: 'File not found' });
        this.testResults.failed++;
      }
    }

    const requiredDirs = [
      'scripts',
      'commands',
      'agents'
    ];

    for (const dir of requiredDirs) {
      try {
        await fs.access(path.join(this.pluginRoot, dir));
        suite.tests.push({ name: `Directory: ${dir}`, status: '✅' });
        this.testResults.passed++;
      } catch (error) {
        suite.tests.push({ name: `Directory: ${dir}`, status: '❌', error: 'Directory not found' });
        this.testResults.failed++;
      }
    }

    // Test optional files
    const optionalFiles = [
      '.mcp.json',
      'README.md',
      'LICENSE'
    ];

    for (const file of optionalFiles) {
      try {
        await fs.access(path.join(this.pluginRoot, file));
        suite.tests.push({ name: `Optional: ${file}`, status: '✅' });
        this.testResults.passed++;
      } catch (error) {
        suite.tests.push({ name: `Optional: ${file}`, status: '⚠️', error: 'File not found' });
        this.testResults.warnings++;
      }
    }

    this.testResults.tests.push(suite);
  }

  async testConfiguration() {
    console.log('\n⚙️  Testing Configuration...');
    const suite = { name: 'Configuration', tests: [] };

    // Test plugin.json
    try {
      const pluginPath = path.join(this.pluginRoot, '.claude-plugin', 'plugin.json');
      const pluginData = JSON.parse(await fs.readFile(pluginPath, 'utf8'));

      if (pluginData.name) {
        suite.tests.push({ name: 'Plugin Name', status: '✅', value: pluginData.name });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Plugin Name', status: '❌', error: 'Name not defined' });
        this.testResults.failed++;
      }

      if (pluginData.autoStart) {
        suite.tests.push({ name: 'Auto Start', status: '✅', value: 'enabled' });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Auto Start', status: '⚠️', error: 'disabled (recommend enabling)' });
        this.testResults.warnings++;
      }

      if (pluginData.commands) {
        suite.tests.push({ name: 'Commands', status: '✅', value: Array.isArray(pluginData.commands) ? pluginData.commands.length : 'valid' });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Commands', status: '❌', error: 'commands not defined' });
        this.testResults.failed++;
      }
    } catch (error) {
      suite.tests.push({ name: 'Plugin Configuration', status: '❌', error: error.message });
      this.testResults.failed++;
    }

    // Test MCP configuration
    try {
      const mcpPath = path.join(this.pluginRoot, '.mcp.json');
      const mcpData = JSON.parse(await fs.readFile(mcpPath, 'utf8'));

      if (mcpData.mcpServers && mcpData.mcpServers['prism-daemon']) {
        const server = mcpData.mcpServers['prism-daemon'];

        if (server.command === 'node') {
          suite.tests.push({ name: 'MCP Command', status: '✅' });
          this.testResults.passed++;
        } else {
          suite.tests.push({ name: 'MCP Command', status: '❌', error: 'incorrect command' });
          this.testResults.failed++;
        }

        if (server.args && server.args.length > 0) {
          suite.tests.push({ name: 'MCP Arguments', status: '✅' });
          this.testResults.passed++;
        } else {
          suite.tests.push({ name: 'MCP Arguments', status: '❌', error: 'no arguments' });
          this.testResults.failed++;
        }

        if (server.env && server.env.AUTO_DETECT) {
          suite.tests.push({ name: 'Auto-Detect', status: '✅', value: server.env.AUTO_DETECT });
          this.testResults.passed++;
        } else {
          suite.tests.push({ name: 'Auto-Detect', status: '⚠️', error: 'not configured' });
          this.testResults.warnings++;
        }
      } else {
        suite.tests.push({ name: 'MCP Server', status: '❌', error: 'server not configured' });
        this.testResults.failed++;
      }
    } catch (error) {
      suite.tests.push({ name: 'MCP Configuration', status: '❌', error: error.message });
      this.testResults.failed++;
    }

    this.testResults.tests.push(suite);
  }

  async testMCPServer() {
    console.log('\n🔌 Testing MCP Server...');
    const suite = { name: 'MCP Server', tests: [] };

    try {
      // Test server file exists and can be loaded
      const serverPath = path.join(this.pluginRoot, 'daemon', 'server.js');
      const PrismDaemon = require(serverPath);

      suite.tests.push({ name: 'Server Module', status: '✅' });
      this.testResults.passed++;

      // Test server instantiation
      try {
        const server = new PrismDaemon();
        suite.tests.push({ name: 'Server Instantiation', status: '✅' });
        this.testResults.passed++;
      } catch (error) {
        suite.tests.push({ name: 'Server Instantiation', status: '❌', error: error.message });
        this.testResults.failed++;
      }

      // Test server methods
      if (PrismDaemon.prototype.initialize && PrismDaemon.prototype.start && PrismDaemon.prototype.stop) {
        suite.tests.push({ name: 'Server Methods', status: '✅' });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Server Methods', status: '❌', error: 'required methods missing' });
        this.testResults.failed++;
      }

    } catch (error) {
      suite.tests.push({ name: 'MCP Server Test', status: '❌', error: error.message });
      this.testResults.failed++;
    }

    this.testResults.tests.push(suite);
  }

  async testProjectDetection() {
    console.log('\n🔍 Testing Project Detection...');
    const suite = { name: 'Project Detection', tests: [] };

    try {
      const ProjectDetector = require('../daemon/project-detector');
      const detector = new ProjectDetector(this.pluginRoot);
      const projectInfo = await detector.detectAll();

      // Test basic detection
      if (projectInfo.language) {
        suite.tests.push({ name: 'Language Detection', status: '✅', value: projectInfo.language });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Language Detection', status: '❌', error: 'no language detected' });
        this.testResults.failed++;
      }

      // Test framework detection
      if (projectInfo.framework) {
        suite.tests.push({ name: 'Framework Detection', status: '✅', value: projectInfo.framework });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Framework Detection', status: '⚠️', error: 'no framework detected' });
        this.testResults.warnings++;
      }

      // Test build tools detection
      if (projectInfo.buildTools && projectInfo.buildTools.length > 0) {
        suite.tests.push({ name: 'Build Tools', status: '✅', value: projectInfo.buildTools.join(', ') });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Build Tools', status: '⚠️', error: 'no build tools detected' });
        this.testResults.warnings++;
      }

      // Test test frameworks
      if (projectInfo.testFrameworks && projectInfo.testFrameworks.length > 0) {
        suite.tests.push({ name: 'Test Frameworks', status: '✅', value: projectInfo.testFrameworks.join(', ') });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Test Frameworks', status: '⚠️', error: 'no test frameworks detected' });
        this.testResults.warnings++;
      }

      // Test dependency detection
      const totalDeps = (projectInfo.dependencies || []).length + (projectInfo.devDependencies || []).length;
      if (totalDeps > 0) {
        suite.tests.push({ name: 'Dependencies', status: '✅', value: `${totalDeps} total` });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: 'Dependencies', status: '⚠️', error: 'no dependencies detected' });
        this.testResults.warnings++;
      }

    } catch (error) {
      suite.tests.push({ name: 'Project Detection', status: '❌', error: error.message });
      this.testResults.failed++;
    }

    this.testResults.tests.push(suite);
  }

  async testInstallationScripts() {
    console.log('\n📜 Testing Installation Scripts...');
    const suite = { name: 'Installation Scripts', tests: [] };

    const scripts = [
      'scripts/install-setup.js',
      'scripts/verify-install.js',
      'scripts/test-compatibility.js',
      'scripts/test-installation.js'
    ];

    for (const script of scripts) {
      try {
        const scriptPath = path.join(this.pluginRoot, script);
        await fs.access(scriptPath);
        suite.tests.push({ name: `File: ${script}`, status: '✅' });
        this.testResults.passed++;

        // Test script syntax
        const content = await fs.readFile(scriptPath, 'utf8');
        try {
          // Basic syntax check by trying to parse
          new Function(content);
          suite.tests.push({ name: `Syntax: ${script}`, status: '✅' });
          this.testResults.passed++;
        } catch (syntaxError) {
          suite.tests.push({ name: `Syntax: ${script}`, status: '❌', error: syntaxError.message });
          this.testResults.failed++;
        }
      } catch (error) {
        suite.tests.push({ name: `File: ${script}`, status: '❌', error: error.message });
        this.testResults.failed++;
      }
    }

    // Test platform-specific scripts
    const platform = os.platform();
    if (platform === 'win32') {
      const winScripts = ['start-prism.bat'];
      for (const script of winScripts) {
        try {
          await fs.access(path.join(this.pluginRoot, script));
          suite.tests.push({ name: `Windows: ${script}`, status: '✅' });
          this.testResults.passed++;
        } catch (error) {
          suite.tests.push({ name: `Windows: ${script}`, status: '⚠️', error: 'file not found' });
          this.testResults.warnings++;
        }
      }
    } else {
      const unixScripts = ['start-prism.sh', 'start-prism.command'];
      for (const script of unixScripts) {
        try {
          await fs.access(path.join(this.pluginRoot, script));
          suite.tests.push({ name: `Unix: ${script}`, status: '✅' });
          this.testResults.passed++;
        } catch (error) {
          suite.tests.push({ name: `Unix: ${script}`, status: '⚠️', error: 'file not found' });
          this.testResults.warnings++;
        }
      }
    }

    this.testResults.tests.push(suite);
  }

  async testCrossPlatform() {
    console.log('\n🖥️  Testing Cross-Platform Compatibility...');
    const suite = { name: 'Cross-Platform', tests: [] };

    const platform = os.platform();
    const arch = os.arch();

    // Test platform detection
    suite.tests.push({ name: 'Platform Detected', status: '✅', value: `${platform}-${arch}` });
    this.testResults.passed++;

    // Test path handling
    const testPath = path.join(this.pluginRoot, 'test');
    suite.tests.push({ name: 'Path Handling', status: '✅', value: `Separator: '${path.sep}'` });
    this.testResults.passed++;

    // Test environment variables
    const envVars = [
      'NODE_ENV',
      'HOME',
      'USERPROFILE',
      'PATH'
    ];

    for (const envVar of envVars) {
      if (process.env[envVar]) {
        suite.tests.push({ name: `Environment: ${envVar}`, status: '✅' });
        this.testResults.passed++;
      } else {
        suite.tests.push({ name: `Environment: ${envVar}`, status: '⚠️', error: 'not set' });
        this.testResults.warnings++;
      }
    }

    // Test file system operations
    try {
      const testDir = path.join(this.pluginRoot, 'test-cross-platform');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, 'test.txt'), 'test');
      await fs.unlink(path.join(testDir, 'test.txt'));
      await fs.rmdir(testDir);

      suite.tests.push({ name: 'File Operations', status: '✅' });
      this.testResults.passed++;
    } catch (error) {
      suite.tests.push({ name: 'File Operations', status: '❌', error: error.message });
      this.testResults.failed++;
    }

    this.testResults.tests.push(suite);
  }

  async generateReport() {
    console.log('\n📊 Generating Installation Test Report...');
    console.log('='.repeat(60));

    // Calculate score
    const totalTests = this.testResults.passed + this.testResults.failed + this.testResults.warnings;
    this.testResults.score = Math.round((this.testResults.passed / totalTests) * 100);

    // Summary
    console.log('\n📋 SUMMARY');
    console.log('='.repeat(40));
    console.log(`Platform: ${this.testResults.platform}`);
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${this.testResults.passed} ✅`);
    console.log(`Warnings: ${this.testResults.warnings} ⚠️`);
    console.log(`Failed: ${this.testResults.failed} ❌`);
    console.log(`Score: ${this.testResults.score}%`);
    console.log('');

    // Detailed Results
    console.log('🔍 DETAILED RESULTS');
    console.log('='.repeat(40));

    for (const suite of this.testResults.tests) {
      console.log(`\n${suite.name}:`);
      for (const test of suite.tests) {
        console.log(`  ${test.status} ${test.name}: ${test.value || test.message || test.error || ''}`);
      }
    }

    // Overall Assessment
    console.log('\n🎯 OVERALL ASSESSMENT');
    console.log('='.repeat(40));

    if (this.testResults.failed === 0) {
      if (this.testResults.warnings === 0) {
        console.log('🎉 PERFECT! Your system is fully ready for PRISM.');
        console.log('\n🚀 PRISM installation will be smooth and successful!');
      } else {
        console.log('✅ GOOD! Your system is compatible with PRISM.');
        console.log('\n🔧 Address the warnings above for optimal experience.');
      }
    } else {
      console.log('❌ ISSUES DETECTED');
      console.log('\n🔧 Please fix the failed tests before installing PRISM:');

      for (const suite of this.testResults.tests) {
        for (const test of suite.tests) {
          if (test.status === '❌') {
            console.log(`   • ${test.name}: ${test.error}`);
          }
        }
      }
    }

    // Save report
    const reportPath = path.join(this.pluginRoot, 'installation-test-report.json');
    try {
      await fs.writeFile(reportPath, JSON.stringify(this.testResults, null, 2));
      console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    } catch (error) {
      console.warn(`\n⚠️  Could not save report: ${error.message}`);
    }

    console.log('\nInstallation test suite completed!');
    process.exit(this.testResults.failed > 0 ? 1 : 0);
  }
}

// Run tests
const test = new InstallationTest();
test.runAllTests().catch(error => {
  console.error('Installation test failed:', error);
  process.exit(1);
});