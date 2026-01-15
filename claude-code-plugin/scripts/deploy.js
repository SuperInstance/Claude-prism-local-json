#!/usr/bin/env node

/**
 * PRISM Plugin Deployment Script
 * Deploys the plugin to Claude Code marketplace
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PluginBuilder = require('./build');

class PluginDeployer {
  constructor() {
    this.pluginRoot = path.join(__dirname, '..');
    this.packageJson = require(path.join(this.pluginRoot, 'package.json'));
    this.marketplaceUrl = 'https://github.com/SuperInstance/claude-plugins-official';
    this.gitHubToken = process.env.GITHUB_TOKEN;
  }

  /**
   * Deploy plugin to marketplace
   */
  async deploy() {
    console.log('[Plugin Deployer] Starting deployment process...');

    try {
      // Build the plugin
      const builder = new PluginBuilder();
      await builder.build();

      // Prepare deployment
      await this.prepareDeployment();

      // Deploy to GitHub
      await this.deployToGitHub();

      // Create marketplace entry
      await this.createMarketplaceEntry();

      // Verify deployment
      await this.verifyDeployment();

      console.log('[Plugin Deployer] Deployment completed successfully!');
      console.log('[Plugin Deployer] Plugin is now available for installation:');
      console.log(`[Plugin Deployer] /plugin install ${this.packageJson.name}@claude-plugins-official`);

    } catch (error) {
      console.error('[Plugin Deployer] Deployment failed:', error);
      throw error;
    }
  }

  /**
   * Prepare deployment
   */
  async prepareDeployment() {
    console.log('[Plugin Deployer] Preparing deployment...');

    // Check if GitHub token is set
    if (!this.gitHubToken) {
      throw new Error('GITHUB_TOKEN environment variable is required for deployment');
    }

    // Check if git is available
    try {
      execSync('git --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error('Git is required for deployment');
    }

    // Check if we're in a git repository
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    } catch (error) {
      throw new Error('Not in a git repository');
    }
  }

  /**
   * Deploy to GitHub
   */
  async deployToGitHub() {
    console.log('[Plugin Deployer] Deploying to GitHub...');

    // Create or update marketplace repository
    try {
      // Clone marketplace repository
      const marketplaceDir = path.join(this.pluginRoot, 'marketplace-temp');

      if (fs.existsSync(marketplaceDir)) {
        fs.rmSync(marketplaceDir, { recursive: true, force: true });
      }

      execSync(`git clone https://x-access-token:${this.gitHubToken}@${this.marketplaceUrl}.git ${marketplaceDir}`, {
        stdio: 'inherit'
      });

      // Copy build files
      const buildDir = path.join(this.pluginRoot, 'build');
      const pluginDir = path.join(marketplaceDir, 'plugins', this.packageJson.name);

      fs.mkdirSync(pluginDir, { recursive: true });
      this.copyDir(buildDir, pluginDir);

      // Create or update marketplace entry
      this.updateMarketplaceJson(marketplaceDir);

      // Commit and push changes
      process.chdir(marketplaceDir);
      execSync('git add .', { stdio: 'inherit' });
      execSync(`git commit -m "Add ${this.packageJson.name} plugin v${this.packageJson.version}"`, { stdio: 'inherit' });
      execSync('git push origin main', { stdio: 'inherit' });

      // Cleanup
      process.chdir(this.pluginRoot);
      fs.rmSync(marketplaceDir, { recursive: true, force: true });

      console.log('[Plugin Deployer] GitHub deployment completed');

    } catch (error) {
      console.error('[Plugin Deployer] GitHub deployment failed:', error);
      throw error;
    }
  }

  /**
   * Update marketplace.json
   */
  updateMarketplaceJson(marketplaceDir) {
    const marketplaceFile = path.join(marketplaceDir, 'marketplace.json');
    let marketplaceData = {};

    // Load existing marketplace data
    if (fs.existsSync(marketplaceFile)) {
      marketplaceData = JSON.parse(fs.readFileSync(marketplaceFile, 'utf8'));
    }

    // Add or update plugin entry
    marketplaceData.plugins = marketplaceData.plugins || [];

    const existingIndex = marketplaceData.plugins.findIndex(p => p.name === this.packageJson.name);

    const pluginEntry = {
      name: this.packageJson.name,
      version: this.packageJson.version,
      description: this.packageJson.description,
      author: this.packageJson.author,
      source: `plugins/${this.packageJson.name}`,
      tags: ['development', 'code-search', 'memory'],
      category: 'development',
      mcpServers: {
        'prism-daemon': {
          command: 'node',
          args: ['${CLAUDE_PLUGIN_ROOT}/daemon/server.js'],
          env: {
            'PLUGIN_ROOT': '${CLAUDE_PLUGIN_ROOT}',
            'PROJECT_ROOT': '${PROJECT_ROOT:-${CLAUDE_PLUGIN_ROOT}}',
            'CACHE_DIR': '${CLAUDE_PLUGIN_ROOT}/cache',
            'INDEX_DIR': '${CLAUDE_PLUGIN_ROOT}/index',
            'LOG_LEVEL': '${LOG_LEVEL:-info}'
          }
        }
      },
      dependencies: [],
      installation: {
        method: 'git',
        repository: this.marketplaceUrl,
        path: `plugins/${this.packageJson.name}`
      }
    };

    if (existingIndex >= 0) {
      marketplaceData.plugins[existingIndex] = pluginEntry;
    } else {
      marketplaceData.plugins.push(pluginEntry);
    }

    // Save updated marketplace data
    fs.writeFileSync(marketplaceFile, JSON.stringify(marketplaceData, null, 2));
  }

  /**
   * Copy directory recursively
   */
  copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Create marketplace entry
   */
  async createMarketplaceEntry() {
    console.log('[Plugin Deployer] Creating marketplace entry...');

    // Create README for the plugin
    const readmeContent = `# ${this.packageJson.name}

${this.packageJson.description}

## Installation

\`\`\`
/plugin install ${this.packageJson.name}@claude-plugins-official
\`\`\`

## Features

- Enhanced project memory for Claude Code
- Semantic code search with context awareness
- Background indexing and caching
- Auto-detection of project structure
- Zero-configuration setup

## Usage

Once installed, the plugin will automatically:

1. Detect your project structure and language
2. Start background indexing of your codebase
3. Provide enhanced search capabilities through Claude Code
4. Maintain project context for better assistance

## Configuration

The plugin works out of the box with sensible defaults. You can customize behavior through environment variables:

- \`LOG_LEVEL\`: Set logging level (debug, info, warn, error)
- \`CACHE_DIR\: Override cache directory location
- \`INDEX_DIR\`: Override index directory location

## License

${this.packageJson.license || 'MIT'}
`;

    const readmePath = path.join(this.pluginRoot, 'build', 'README.md');
    fs.writeFileSync(readmePath, readmeContent);
  }

  /**
   * Verify deployment
   */
  async verifyDeployment() {
    console.log('[Plugin Deployer] Verifying deployment...');

    try {
      // Check if the plugin is accessible
      const packagePath = path.join(this.pluginRoot, 'build', 'package.json');
      const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

      if (packageData.name !== this.packageJson.name) {
        throw new Error('Package name mismatch');
      }

      if (packageData.version !== this.packageJson.version) {
        throw new Error('Package version mismatch');
      }

      // Check if all required files exist
      const requiredFiles = [
        'daemon/server.js',
        '.claude-plugin/plugin.json',
        '.mcp.json'
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(this.pluginRoot, 'build', file);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Required file missing: ${file}`);
        }
      }

      console.log('[Plugin Deployer] Deployment verification passed');

    } catch (error) {
      console.error('[Plugin Deployer] Deployment verification failed:', error);
      throw error;
    }
  }

  /**
   * Get installation command
   */
  getInstallationCommand() {
    return `/plugin install ${this.packageJson.name}@claude-plugins-official`;
  }

  /**
   * Get marketplace URL
   */
  getMarketplaceUrl() {
    return `${this.marketplaceUrl}/tree/main/plugins/${this.packageJson.name}`;
  }
}

// Run deployment if called directly
if (require.main === module) {
  const deployer = new PluginDeployer();
  deployer.deploy().catch(error => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });
}

module.exports = PluginDeployer;