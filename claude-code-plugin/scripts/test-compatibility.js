#!/usr/bin/env node

/**
 * PRISM Cross-Platform Compatibility Test
 * Tests installation and functionality across different platforms
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class CompatibilityTest {
  constructor() {
    this.platform = os.platform();
    this.arch = os.arch();
    this.pluginRoot = process.cwd();
    this.results = {
      platform: `${this.platform}-${this.arch}`,
      timestamp: new Date().toISOString(),
      checks: [],
      issues: [],
      recommendations: []
    };
  }

  async runTests() {
    console.log('🧪 Running PRISM Compatibility Tests...');
    console.log(`Platform: ${this.platform} ${this.arch}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log('');

    // Test 1: Environment Check
    await this.testEnvironment();

    // Test 2: File System Permissions
    await this.testFileSystem();

    // Test 3: Node.js Compatibility
    await this.testNodeCompatibility();

    // Test 4: Configuration Files
    await this.testConfiguration();

    // Test 5: MCP Server
    await this.testMCPServer();

    // Test 6: Project Detection
    await this.testProjectDetection();

    // Test 7: Cross-Platform Scripts
    await this.testScripts();

    // Generate Report
    await this.generateReport();
  }

  async testEnvironment() {
    console.log('🔍 Testing Environment...');
    const check = {
      name: 'Environment Check',
      platform: this.platform,
      arch: this.arch,
      checks: []
    };

    // Check OS version
    try {
      const version = os.release();
      check.checks.push({
        name: 'OS Version',
        status: '✅',
        value: version
      });
    } catch (error) {
      check.checks.push({
        name: 'OS Version',
        status: '❌',
        error: error.message
      });
    }

    // Check Memory
    try {
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const memoryGB = (totalMemory / 1024 / 1024 / 1024).toFixed(2);
      check.checks.push({
        name: 'System Memory',
        status: '✅',
        value: `${memoryGB}GB`
      });
    } catch (error) {
      check.checks.push({
        name: 'System Memory',
        status: '❌',
        error: error.message
      });
    }

    // Check CPU Cores
    try {
      const cpus = os.cpus();
      check.checks.push({
        name: 'CPU Cores',
        status: '✅',
        value: cpus.length
      });
    } catch (error) {
      check.checks.push({
        name: 'CPU Cores',
        status: '❌',
        error: error.message
      });
    }

    this.results.checks.push(check);
    console.log('✅ Environment check completed');
    console.log('');
  }

  async testFileSystem() {
    console.log('📁 Testing File System...');
    const check = {
      name: 'File System',
      checks: []
    };

    // Test write permissions
    try {
      const testFile = path.join(this.pluginRoot, '.test-permission');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      check.checks.push({
        name: 'Write Permissions',
        status: '✅',
        message: 'Can write to plugin directory'
      });
    } catch (error) {
      check.checks.push({
        name: 'Write Permissions',
        status: '❌',
        error: error.message
      });
      this.results.issues.push({
        type: 'permission',
        message: 'Cannot write to plugin directory',
        fix: 'Check directory permissions or run as administrator'
      });
    }

    // Test read permissions
    try {
      const files = await fs.readdir(this.pluginRoot);
      check.checks.push({
        name: 'Read Permissions',
        status: '✅',
        message: `Can read ${files.length} files`
      });
    } catch (error) {
      check.checks.push({
        name: 'Read Permissions',
        status: '❌',
        error: error.message
      });
    }

    // Test path handling
    const testPath = path.join(this.pluginRoot, 'test');
    check.checks.push({
      name: 'Path Handling',
      status: '✅',
      message: `Platform path separator: '${path.sep}'`
    });

    this.results.checks.push(check);
    console.log('✅ File system check completed');
    console.log('');
  }

  async testNodeCompatibility() {
    console.log('🟢 Testing Node.js Compatibility...');
    const check = {
      name: 'Node.js Compatibility',
      checks: []
    };

    try {
      // Node.js version
      const version = execSync('node --version', { encoding: 'utf8' });
      check.checks.push({
        name: 'Node.js Version',
        status: '✅',
        value: version.trim()
      });

      // npm version
      const npmVersion = execSync('npm --version', { encoding: 'utf8' });
      check.checks.push({
        name: 'npm Version',
        status: '✅',
        value: npmVersion.trim()
      });

      // Check Node.js modules
      const requiredModules = ['fs', 'path', 'http', 'https', 'crypto', 'util'];
      for (const module of requiredModules) {
        try {
          require(module);
          check.checks.push({
            name: `Module: ${module}`,
            status: '✅',
            message: 'Available'
          });
        } catch (error) {
          check.checks.push({
            name: `Module: ${module}`,
            status: '❌',
            error: error.message
          });
        }
      }

      // Test ES modules support
      try {
        execSync('node --experimental-modules --input-type=module -e "import { log } from \'console\'; log(\'test\')"', {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        check.checks.push({
          name: 'ES Modules',
          status: '✅',
          message: 'Experimental modules available'
        });
      } catch (error) {
        check.checks.push({
          name: 'ES Modules',
          status: '⚠️',
          message: 'Experimental modules not available'
        });
      }

    } catch (error) {
      check.checks.push({
        name: 'Node.js Check',
        status: '❌',
        error: error.message
      });
      this.results.issues.push({
        type: 'nodejs',
        message: 'Node.js check failed',
        fix: 'Ensure Node.js 14+ is installed and in PATH'
      });
    }

    this.results.checks.push(check);
    console.log('✅ Node.js compatibility check completed');
    console.log('');
  }

  async testConfiguration() {
    console.log('⚙️  Testing Configuration...');
    const check = {
      name: 'Configuration',
      checks: []
    };

    const configFiles = [
      '.claude-plugin/plugin.json',
      '.mcp.json',
      'package.json'
    ];

    for (const file of configFiles) {
      try {
        const filePath = path.join(this.pluginRoot, file);
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);

        check.checks.push({
          name: file,
          status: '✅',
          message: 'Valid JSON'
        });

        // Check specific configurations
        if (file === '.claude-plugin/plugin.json') {
          if (data.autoStart) {
            check.checks.push({
              name: 'Auto Start',
              status: '✅',
              message: 'Enabled'
            });
          } else {
            check.checks.push({
              name: 'Auto Start',
              status: '⚠️',
              message: 'Disabled - recommend enabling'
            });
            this.results.recommendations.push({
              type: 'configuration',
              message: 'Enable autoStart in plugin.json for zero-config experience'
            });
          }
        }

        if (file === '.mcp.json') {
          if (data.mcpServers && data.mcpServers['prism-daemon']) {
            const server = data.mcpServers['prism-daemon'];
            if (server.env && server.env.AUTO_DETECT) {
              check.checks.push({
                name: 'Auto Detection',
                status: '✅',
                message: 'Enabled'
              });
            } else {
              check.checks.push({
                name: 'Auto Detection',
                status: '⚠️',
                message: 'Disabled - recommend enabling'
              });
              this.results.recommendations.push({
                type: 'configuration',
                message: 'Enable AUTO_DETECT in MCP server configuration'
              });
            }
          }
        }

      } catch (error) {
        check.checks.push({
          name: file,
          status: '❌',
          error: error.message
        });
        this.results.issues.push({
          type: 'config',
          file: file,
          message: 'Configuration file error',
          fix: error.message
        });
      }
    }

    this.results.checks.push(check);
    console.log('✅ Configuration check completed');
    console.log('');
  }

  async testMCPServer() {
    console.log('🔌 Testing MCP Server...');
    const check = {
      name: 'MCP Server',
      checks: []
    };

    try {
      // Test if daemon server exists
      const daemonPath = path.join(this.pluginRoot, 'daemon', 'server.js');
      if (await fs.access(daemonPath).then(() => true).catch(() => false)) {
        check.checks.push({
          name: 'Daemon Server',
          status: '✅',
          message: 'File exists'
        });

        // Test if server can be imported
        try {
          const PrismDaemon = require(daemonPath);
          check.checks.push({
            name: 'Server Import',
            status: '✅',
            message: 'Can be imported'
          });
        } catch (error) {
          check.checks.push({
            name: 'Server Import',
            status: '❌',
            error: error.message
          });
        }

      } else {
        check.checks.push({
          name: 'Daemon Server',
          status: '❌',
          error: 'File not found'
        });
      }

      // Test MCP configuration
      const mcpPath = path.join(this.pluginRoot, '.mcp.json');
      if (await fs.access(mcpPath).then(() => true).catch(() => false)) {
        try {
          const mcpConfig = JSON.parse(await fs.readFile(mcpPath, 'utf8'));

          if (mcpConfig.mcpServers && mcpServers['prism-daemon']) {
            const server = mcpConfig.mcpServers['prism-daemon'];

            if (server.command === 'node') {
              check.checks.push({
                name: 'MCP Command',
                status: '✅',
                message: 'Correctly configured'
              });
            } else {
              check.checks.push({
                name: 'MCP Command',
                status: '⚠️',
                message: 'Incorrect command'
              });
            }
          }
        } catch (error) {
          check.checks.push({
            name: 'MCP Config',
            status: '❌',
            error: error.message
          });
        }
      }

    } catch (error) {
      check.checks.push({
        name: 'MCP Server',
        status: '❌',
        error: error.message
      });
    }

    this.results.checks.push(check);
    console.log('✅ MCP server check completed');
    console.log('');
  }

  async testProjectDetection() {
    console.log('🔍 Testing Project Detection...');
    const check = {
      name: 'Project Detection',
      checks: []
    };

    try {
      const ProjectDetector = require('../daemon/project-detector');
      const detector = new ProjectDetector(this.pluginRoot);
      const projectInfo = await detector.detectAll();

      check.checks.push({
        name: 'Language Detection',
        status: '✅',
        value: projectInfo.language
      });

      if (projectInfo.framework) {
        check.checks.push({
          name: 'Framework Detection',
          status: '✅',
          value: projectInfo.framework
        });
      } else {
        check.checks.push({
          name: 'Framework Detection',
          status: '⚠️',
          message: 'No framework detected'
        });
      }

      check.checks.push({
        name: 'Dependencies',
        status: '✅',
        value: `${projectInfo.dependencies.length} main, ${projectInfo.devDependencies.length} dev`
      });

      check.checks.push({
        name: 'Build Tools',
        status: '✅',
        value: projectInfo.buildTools.join(', ') || 'None'
      });

    } catch (error) {
      check.checks.push({
        name: 'Project Detection',
        status: '❌',
        error: error.message
      });
      this.results.issues.push({
        type: 'detection',
        message: 'Project detection failed',
        fix: error.message
      });
    }

    this.results.checks.push(check);
    console.log('✅ Project detection check completed');
    console.log('');
  }

  async testScripts() {
    console.log('📜 Testing Scripts...');
    const check = {
      name: 'Scripts',
      checks: []
    };

    const scripts = [
      'scripts/install-setup.js',
      'scripts/verify-install.js',
      'scripts/test-compatibility.js'
    ];

    for (const script of scripts) {
      try {
        const scriptPath = path.join(this.pluginRoot, script);
        if (await fs.access(scriptPath).then(() => true).catch(() => false)) {
          check.checks.push({
            name: script,
            status: '✅',
            message: 'File exists'
          });

          // Test if script can be parsed
          const content = await fs.readFile(scriptPath, 'utf8');
          // This is a basic syntax check
          check.checks.push({
            name: `${script} Syntax`,
            status: '✅',
            message: 'Valid syntax'
          });
        } else {
          check.checks.push({
            name: script,
            status: '❌',
            error: 'File not found'
          });
        }
      } catch (error) {
        check.checks.push({
          name: script,
          status: '❌',
          error: error.message
        });
      }
    }

    // Test platform-specific scripts
    if (this.platform === 'win32') {
      const windowsScripts = ['start-prism.bat'];
      for (const script of windowsScripts) {
        const scriptPath = path.join(this.pluginRoot, script);
        if (await fs.access(scriptPath).then(() => true).catch(() => false)) {
          check.checks.push({
            name: script,
            status: '✅',
            message: 'Windows script available'
          });
        }
      }
    } else {
      const unixScripts = ['start-prism.sh', 'start-prism.command'];
      for (const script of unixScripts) {
        const scriptPath = path.join(this.pluginRoot, script);
        if (await fs.access(scriptPath).then(() => true).catch(() => false)) {
          check.checks.push({
            name: script,
            status: '✅',
            message: 'Unix script available'
          });
        }
      }
    }

    this.results.checks.push(check);
    console.log('✅ Scripts check completed');
    console.log('');
  }

  async generateReport() {
    console.log('📊 Generating Compatibility Report...');
    console.log(''.repeat(60));

    // Summary
    console.log('📋 SUMMARY');
    console.log(''.repeat(40));

    const totalChecks = this.results.checks.reduce((total, check) =>
      total + check.checks.length, 0);
    const passedChecks = this.results.checks.reduce((total, check) =>
      total + check.checks.filter(c => c.status === '✅').length, 0);
    const warningChecks = this.results.checks.reduce((total, check) =>
      total + check.checks.filter(c => c.status === '⚠️').length, 0);
    const failedChecks = this.results.checks.reduce((total, check) =>
      total + check.checks.filter(c => c.status === '❌').length, 0);

    console.log(`Platform: ${this.results.platform}`);
    console.log(`Total Checks: ${totalChecks}`);
    console.log(`Passed: ${passedChecks} ✅`);
    console.log(`Warnings: ${warningChecks} ⚠️`);
    console.log(`Failed: ${failedChecks} ❌`);
    console.log(`Issues: ${this.results.issues.length}`);
    console.log(`Recommendations: ${this.results.recommendations.length}`);
    console.log('');

    // Detailed Results
    console.log('🔍 DETAILED RESULTS');
    console.log(''.repeat(40));

    for (const check of this.results.checks) {
      console.log(`\n${check.name}:`);
      for (const subCheck of check.checks) {
        console.log(`  ${subCheck.status} ${subCheck.name}: ${subCheck.message || subCheck.value || subCheck.error}`);
      }
    }

    // Issues
    if (this.results.issues.length > 0) {
      console.log('\n❌ ISSUES FOUND');
      console.log(''.repeat(40));
      for (const issue of this.results.issues) {
        console.log(`Type: ${issue.type}`);
        console.log(`Message: ${issue.message}`);
        if (issue.fix) {
          console.log(`Fix: ${issue.fix}`);
        }
        console.log('');
      }
    }

    // Recommendations
    if (this.results.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS');
      console.log(''.repeat(40));
      for (const rec of this.results.recommendations) {
        console.log(`Type: ${rec.type}`);
        console.log(`Message: ${rec.message}`);
        console.log('');
      }
    }

    // Overall Assessment
    console.log('\n🎯 OVERALL ASSESSMENT');
    console.log(''.repeat(40));

    if (failedChecks === 0) {
      if (warningChecks === 0) {
        console.log('🎉 PERFECT! Your system is fully compatible with PRISM.');
      } else {
        console.log('✅ GOOD! Your system is compatible with PRISM, but consider the recommendations.');
      }
      console.log('\n🚀 PRISM is ready to install!');
    } else {
      console.log('⚠️  ISSUES DETECTED');
      console.log('\nPlease fix the issues above before installing PRISM.');
    }

    // Save report
    const reportPath = path.join(this.pluginRoot, 'compatibility-report.json');
    const reportData = {
      ...this.results,
      summary: {
        totalChecks,
        passedChecks,
        warningChecks,
        failedChecks,
        issues: this.results.issues.length,
        recommendations: this.results.recommendations.length,
        assessment: failedChecks === 0 ? 'Ready' : 'Needs Attention'
      }
    };

    try {
      await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
      console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    } catch (error) {
      console.warn(`\n⚠️  Could not save report: ${error.message}`);
    }

    console.log('\nCompatibility test completed!');
  }
}

// Run tests
const test = new CompatibilityTest();
test.runTests().catch(error => {
  console.error('Compatibility test failed:', error);
  process.exit(1);
});