#!/usr/bin/env node

/**
 * Test integration with Claude Code
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

async function testClaudeIntegration() {
  console.log('🤖 Testing Claude Code Integration...\n');

  const pluginRoot = __dirname;
  const mcpConfigPath = path.join(pluginRoot, '..', '.mcp.json');
  const pluginManifestPath = path.join(pluginRoot, '..', '.claude-plugin', 'plugin.json');

  try {
    // Test 1: Validate MCP configuration
    console.log('🔍 Testing MCP Configuration...');

    try {
      const mcpConfig = JSON.parse(await fs.readFile(mcpConfigPath, 'utf8'));

      if (mcpConfig.mcpServers && mcpConfig.mcpServers['prism-daemon']) {
        const serverConfig = mcpConfig.mcpServers['prism-daemon'];
        console.log('✅ MCP server configuration found');
        console.log(`   Command: ${serverConfig.command}`);
        console.log(`   Args: ${serverConfig.args.join(' ')}`);
        console.log(`   Environment variables: ${Object.keys(serverConfig.env || {}).length} defined`);
      } else {
        console.log('❌ MCP server configuration not found');
      }
    } catch (error) {
      console.log(`❌ Failed to read MCP config: ${error.message}`);
    }

    // Test 2: Validate plugin manifest
    console.log('\n🔍 Testing Plugin Manifest...');

    try {
      const manifest = JSON.parse(await fs.readFile(pluginManifestPath, 'utf8'));
      console.log('✅ Plugin manifest found');
      console.log(`   Name: ${manifest.name}`);
      console.log(`   Version: ${manifest.version}`);
      console.log(`   Commands: ${manifest.commands ? manifest.commands.length : 0} defined`);
      console.log(`   Agents: ${manifest.agents ? manifest.agents.length : 0} defined`);

      if (manifest.commands && manifest.commands.length > 0) {
        console.log('   Command paths:');
        manifest.commands.forEach(cmd => console.log(`     - ${cmd}`));
      }
    } catch (error) {
      console.log(`❌ Failed to read plugin manifest: ${error.message}`);
    }

    // Test 3: Test daemon process spawning (simulated)
    console.log('\n🔍 Testing Process Spawning...');

    try {
      // Test if the daemon can be spawned (without actually starting it)
      const testDaemon = spawn('node', ['--version'], {
        stdio: 'pipe',
        timeout: 5000
      });

      testDaemon.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Node.js environment available for daemon');
        } else {
          console.log('❌ Node.js environment test failed');
        }
      });

      testDaemon.on('error', (error) => {
        console.log(`❌ Process spawning failed: ${error.message}`);
      });
    } catch (error) {
      console.log(`❌ Process spawning test error: ${error.message}`);
    }

    // Test 4: Environment variable validation
    console.log('\n🔍 Testing Environment Variables...');

    const envVars = [
      'CLAUDE_PLUGIN_ROOT',
      'PROJECT_ROOT',
      'CACHE_DIR',
      'INDEX_DIR',
      'LOG_LEVEL'
    ];

    const missingVars = envVars.filter(varName => !process.env[varName]);

    if (missingVars.length === 0) {
      console.log('✅ All expected environment variables are defined');
      envVars.forEach(varName =>
        console.log(`   ${varName}: ${process.env[varName]}`)
      );
    } else {
      console.log(`⚠️  Missing environment variables: ${missingVars.join(', ')}`);
      console.log('   Note: This is expected in test environment');
    }

    // Test 5: Directory structure validation
    console.log('\n🔍 Testing Directory Structure...');

    const requiredDirs = [
      '.claude-plugin',
      'daemon',
      'commands',
      'agents',
      'scripts'
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(pluginRoot, '..', dir);
      const exists = await fs.access(dirPath).then(() => true).catch(() => false);
      console.log(`${exists ? '✅' : '❌'} ${dir}: ${exists ? 'found' : 'missing'}`);
    }

    // Test 6: Command file validation
    console.log('\n🔍 Testing Command Files...');

    try {
      const commandsDir = path.join(pluginRoot, '..', 'commands');
      const commandFiles = await fs.readdir(commandsDir);

      if (commandFiles.length > 0) {
        console.log('✅ Command files found:');
        commandFiles.forEach(file => console.log(`   - ${file}`));
      } else {
        console.log('❌ No command files found');
      }
    } catch (error) {
      console.log(`❌ Failed to read commands directory: ${error.message}`);
    }

    // Test 7: Agent file validation
    console.log('\n🔍 Testing Agent Files...');

    try {
      const agentsDir = path.join(pluginRoot, '..', 'agents');
      const agentFiles = await fs.readdir(agentsDir);

      if (agentFiles.length > 0) {
        console.log('✅ Agent files found:');
        agentFiles.forEach(file => console.log(`   - ${file}`));
      } else {
        console.log('❌ No agent files found');
      }
    } catch (error) {
      console.log(`❌ Failed to read agents directory: ${error.message}`);
    }

    // Test 8: Plugin validation summary
    console.log('\n📊 Integration Validation Summary:');
    console.log('================================');

    const integrationChecks = [
      { name: 'MCP Configuration', check: fs.access(mcpConfigPath) },
      { name: 'Plugin Manifest', check: fs.access(pluginManifestPath) },
      { name: 'Daemon Directory', check: fs.access(path.join(pluginRoot, '..', 'daemon')) },
      { name: 'Commands Directory', check: fs.access(path.join(pluginRoot, '..', 'commands')) },
      { name: 'Agents Directory', check: fs.access(path.join(pluginRoot, '..', 'agents')) }
    ];

    let passedChecks = 0;

    for (const check of integrationChecks) {
      try {
        await check.check;
        console.log(`✅ ${check.name}: OK`);
        passedChecks++;
      } catch (error) {
        console.log(`❌ ${check.name}: Failed - ${error.message}`);
      }
    }

    console.log(`\nIntegration Score: ${passedChecks}/${integrationChecks.length} checks passed`);

    if (passedChecks === integrationChecks.length) {
      console.log('🎉 Claude Code integration is properly configured!');
    } else {
      console.log('⚠️  Some integration issues detected');
    }

    console.log('\n💡 Integration Notes:');
    console.log('- The MCP server will automatically start when Claude Code loads this plugin');
    console.log('- The daemon provides background indexing and search capabilities');
    console.log('- Commands and agents enhance Claude Code with project-specific functionality');
    console.log('- The plugin follows Claude Code plugin structure standards');

  } catch (error) {
    console.error('\n❌ Integration test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the integration test
testClaudeIntegration();