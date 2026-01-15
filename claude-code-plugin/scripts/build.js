#!/usr/bin/env node

/**
 * PRISM Plugin Build Script
 * Packages the plugin for distribution to marketplace
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PluginBuilder {
  constructor() {
    this.pluginRoot = path.join(__dirname, '..');
    this.buildDir = path.join(this.pluginRoot, 'build');
    this.packageJson = require(path.join(this.pluginRoot, 'package.json'));
  }

  /**
   * Build the plugin for distribution
   */
  async build() {
    console.log('[Plugin Builder] Starting build process...');

    try {
      // Clean build directory
      await this.cleanBuildDir();

      // Validate plugin structure
      await this.validatePluginStructure();

      // Copy plugin files
      await this.copyPluginFiles();

      // Build TypeScript if needed
      await this.buildTypeScript();

      // Generate marketplace metadata
      await this.generateMarketplaceMetadata();

      // Create package
      await this.createPackage();

      console.log('[Plugin Builder] Build completed successfully!');
      console.log(`[Plugin Builder] Package created: ${this.getPackagePath()}`);

    } catch (error) {
      console.error('[Plugin Builder] Build failed:', error);
      throw error;
    }
  }

  /**
   * Clean build directory
   */
  async cleanBuildDir() {
    console.log('[Plugin Builder] Cleaning build directory...');

    if (fs.existsSync(this.buildDir)) {
      fs.rmSync(this.buildDir, { recursive: true, force: true });
    }

    fs.mkdirSync(this.buildDir, { recursive: true });
  }

  /**
   * Validate plugin structure
   */
  async validatePluginStructure() {
    console.log('[Plugin Builder] Validating plugin structure...');

    const requiredFiles = [
      '.claude-plugin/plugin.json',
      '.mcp.json',
      'daemon/server.js'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(this.pluginRoot, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file missing: ${file}`);
      }
    }

    // Validate plugin.json
    const pluginJson = require(path.join(this.pluginRoot, '.claude-plugin/plugin.json'));
    const requiredFields = ['name', 'version', 'description'];

    for (const field of requiredFields) {
      if (!pluginJson[field]) {
        throw new Error(`Required field missing in plugin.json: ${field}`);
      }
    }

    console.log('[Plugin Builder] Plugin structure validated');
  }

  /**
   * Copy plugin files to build directory
   */
  async copyPluginFiles() {
    console.log('[Plugin Builder] Copying plugin files...');

    const filesToCopy = [
      '.claude-plugin',
      '.mcp.json',
      'daemon',
      'commands',
      'agents',
      'README.md',
      'package.json',
      'LICENSE'
    ];

    for (const item of filesToCopy) {
      const srcPath = path.join(this.pluginRoot, item);
      const destPath = path.join(this.buildDir, item);

      if (fs.existsSync(srcPath)) {
        if (fs.statSync(srcPath).isDirectory()) {
          this.copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
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
   * Build TypeScript if needed
   */
  async buildTypeScript() {
    console.log('[Plugin Builder] Checking for TypeScript files...');

    const tsFiles = this.findFiles(this.buildDir, ['.ts']);

    if (tsFiles.length > 0) {
      console.log('[Plugin Builder] Found TypeScript files, building...');

      try {
        // Check if TypeScript is installed
        execSync('tsc --version', { stdio: 'ignore' });

        // Build TypeScript files
        execSync('tsc', {
          cwd: this.buildDir,
          stdio: 'inherit'
        });

        // Remove .ts files after build
        for (const file of tsFiles) {
          fs.unlinkSync(file);
        }

      } catch (error) {
        console.warn('[Plugin Builder] TypeScript build failed or not installed, skipping...');
      }
    }
  }

  /**
   * Find files with extensions
   */
  findFiles(dir, extensions) {
    const results = [];

    function find(currentDir) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          find(fullPath);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    }

    find(dir);
    return results;
  }

  /**
   * Generate marketplace metadata
   */
  async generateMarketplaceMetadata() {
    console.log('[Plugin Builder] Generating marketplace metadata...');

    const pluginJson = require(path.join(this.pluginRoot, '.claude-plugin/plugin.json'));

    // Create marketplace.json
    const marketplaceData = {
      name: pluginJson.name,
      version: pluginJson.version,
      description: pluginJson.description,
      author: pluginJson.author,
      tags: this.generateTags(),
      category: 'development',
      screenshots: [],
      installation: {
        method: 'plugin-install',
        command: `/plugin install ${pluginJson.name}@claude-plugins-official`
      },
      documentation: {
        readme: 'README.md',
        api: this.generateApiDocs()
      },
      permissions: [
        'file-read',
        'file-write',
        'network-access'
      ],
      limitations: {
        memory: '100MB',
        cpu: 'low',
        storage: '1GB'
      },
      platforms: ['macos', 'windows', 'linux'],
      minimumVersion: '1.0.0'
    };

    const marketplacePath = path.join(this.buildDir, 'marketplace.json');
    fs.writeFileSync(marketplacePath, JSON.stringify(marketplaceData, null, 2));
  }

  /**
   * Generate tags for marketplace
   */
  generateTags() {
    const tags = ['code', 'search', 'development', 'memory', 'context'];

    // Add language-specific tags
    const pluginJson = require(path.join(this.pluginRoot, '.claude-plugin/plugin.json'));
    if (pluginJson.description) {
      const lowerDesc = pluginJson.description.toLowerCase();
      if (lowerDesc.includes('javascript')) tags.push('javascript');
      if (lowerDesc.includes('typescript')) tags.push('typescript');
      if (lowerDesc.includes('python')) tags.push('python');
      if (lowerDesc.includes('go')) tags.push('go');
      if (lowerDesc.includes('rust')) tags.push('rust');
    }

    return [...new Set(tags)];
  }

  /**
   * Generate API documentation
   */
  generateApiDocs() {
    return {
      overview: 'PRISM Project Memory Plugin',
      endpoints: [
        {
          name: 'search_code',
          description: 'Search code files with semantic understanding',
          parameters: {
            query: 'string - Search query',
            language: 'string - Programming language (optional)',
            framework: 'string - Framework (optional)'
          }
        },
        {
          name: 'get_context',
          description: 'Get project context and dependencies',
          parameters: {
            scope: 'string - Scope (file, module, project)',
            depth: 'number - Depth of analysis (optional)'
          }
        },
        {
          name: 'find_usages',
          description: 'Find usages of code symbols',
          parameters: {
            symbol: 'string - Symbol to find',
            type: 'string - Symbol type (function, class, variable)'
          }
        }
      ]
    };
  }

  /**
   * Create package
   */
  async createPackage() {
    console.log('[Plugin Builder] Creating package...');

    // Create package.json for distribution
    const packageJson = {
      name: this.packageJson.name,
      version: this.packageJson.version,
      description: this.packageJson.description,
      main: 'daemon/server.js',
      scripts: {
        start: 'node daemon/server.js',
        test: 'node test/run-all.js'
      },
      dependencies: {
        'express': '^4.18.0'
      },
      keywords: [
        'claude',
        'plugin',
        'code-search',
        'memory',
        'context',
        'semantic-search'
      ],
      author: this.packageJson.author,
      license: 'MIT',
      repository: {
        type: 'git',
        url: 'https://github.com/SuperInstance/Claude-prism-local-json'
      },
      bugs: {
        url: 'https://github.com/SuperInstance/Claude-prism-local-json/issues'
      },
      homepage: 'https://github.com/SuperInstance/Claude-prism-local-json#readme'
    };

    const packagePath = path.join(this.buildDir, 'package.json');
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

    // Create archive
    const archivePath = path.join(this.pluginRoot, `${this.packageJson.name}-${this.packageJson.version}.tar.gz`);

    execSync(`tar -czf ${archivePath} -C ${this.buildDir} .`, {
      stdio: 'inherit'
    });

    // Create zip for Windows
    const zipPath = path.join(this.pluginRoot, `${this.packageJson.name}-${this.packageJson.version}.zip`);
    execSync(`cd ${this.buildDir} && zip -r ${zipPath} .`, {
      stdio: 'inherit'
    });

    this.packagePath = archivePath;
    this.zipPath = zipPath;
  }

  /**
   * Get package path
   */
  getPackagePath() {
    return this.packagePath;
  }

  /**
   * Get zip package path
   */
  getZipPath() {
    return this.zipPath;
  }
}

// Run build if called directly
if (require.main === module) {
  const builder = new PluginBuilder();
  builder.build().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}

module.exports = PluginBuilder;