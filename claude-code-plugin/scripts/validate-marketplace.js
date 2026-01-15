#!/usr/bin/env node

/**
 * Marketplace Validation Script
 * Validates that the repository meets Claude Marketplaces auto-discovery requirements
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Check if all required files exist
const requiredFiles = [
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'package.json',
  'README.md'
];

console.log('🔍 Validating Claude Marketplaces Requirements...\n');

// Check file existence
console.log('📁 Checking required files...');
let allFilesExist = true;
for (const file of requiredFiles) {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log('\n❌ Missing required files. Please ensure all files exist.');
  process.exit(1);
}

// Validate plugin.json
console.log('\n🔧 Validating plugin.json...');
try {
  const pluginJson = JSON.parse(fs.readFileSync('.claude-plugin/plugin.json', 'utf8'));

  const requiredFields = ['name', 'version', 'description', 'author', 'mcpServers', 'autoStart'];
  for (const field of requiredFields) {
    if (!pluginJson[field]) {
      console.log(`❌ Missing required field: ${field}`);
      process.exit(1);
    } else {
      console.log(`✅ ${field}: ${field === 'description' ? pluginJson[field].substring(0, 50) + '...' : pluginJson[field]}`);
    }
  }

  // Check MCP server configuration
  try {
    const mcpConfig = JSON.parse(fs.readFileSync(pluginJson.mcpServers, 'utf8'));
    if (mcpConfig.mcpServers && Object.keys(mcpConfig.mcpServers).length > 0) {
      console.log('✅ MCP servers configured');
    } else {
      console.log('❌ No MCP servers configured');
      process.exit(1);
    }
  } catch (e) {
    console.log('❌ Invalid MCP server configuration');
    process.exit(1);
  }

} catch (e) {
  console.log(`❌ Invalid plugin.json: ${e.message}`);
  process.exit(1);
}

// Validate marketplace.json
console.log('\n🏪 Validating marketplace.json...');
try {
  const marketplaceJson = JSON.parse(fs.readFileSync('.claude-plugin/marketplace.json', 'utf8'));

  const requiredFields = ['name', 'description', 'author', 'version', 'website'];
  for (const field of requiredFields) {
    if (!marketplaceJson[field]) {
      console.log(`❌ Missing required field: ${field}`);
      process.exit(1);
    } else {
      console.log(`✅ ${field}: ${field === 'description' ? marketplaceJson[field].substring(0, 50) + '...' : marketplaceJson[field]}`);
    }
  }

  // Check categories
  if (marketplaceJson.categories && marketplaceJson.categories.length > 0) {
    console.log(`✅ Categories: ${marketplaceJson.categories.join(', ')}`);
  } else {
    console.log('❌ No categories specified');
    process.exit(1);
  }

  // Check tags
  if (marketplaceJson.tags && marketplaceJson.tags.length > 0) {
    console.log(`✅ Tags: ${marketplaceJson.tags.length} tags`);
  } else {
    console.log('❌ No tags specified');
    process.exit(1);
  }

  // Validate URLs
  const urlFields = ['website', 'repository', 'documentation'];
  for (const field of urlFields) {
    if (marketplaceJson[field]) {
      try {
        new URL(marketplaceJson[field]);
        console.log(`✅ ${field}: Valid URL`);
      } catch (e) {
        console.log(`❌ ${field}: Invalid URL - ${e.message}`);
        process.exit(1);
      }
    }
  }

} catch (e) {
  console.log(`❌ Invalid marketplace.json: ${e.message}`);
  process.exit(1);
}

// Validate package.json
console.log('\n📦 Validating package.json...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  if (!packageJson.name) {
    console.log('❌ Missing name in package.json');
    process.exit(1);
  }
  console.log(`✅ Package name: ${packageJson.name}`);

  if (!packageJson.main) {
    console.log('❌ Missing main entry point in package.json');
    process.exit(1);
  }
  console.log(`✅ Main entry: ${packageJson.main}`);

  if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
    console.log(`⚠️  Dependencies found: ${Object.keys(packageJson.dependencies).length} packages`);
    console.log('   For marketplace discovery, consider minimizing external dependencies');
  } else {
    console.log('✅ No external dependencies - marketplace-friendly');
  }

} catch (e) {
  console.log(`❌ Invalid package.json: ${e.message}`);
  process.exit(1);
}

// Check GitHub repository requirements
console.log('\n🌐 Checking repository requirements...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (packageJson.repository && packageJson.repository.url) {
  console.log(`✅ Repository URL: ${packageJson.repository.url}`);
} else {
  console.log('❌ No repository URL in package.json');
  process.exit(1);
}

// Check for installation scripts
console.log('\n📋 Checking installation support...');
if (fs.existsSync('scripts')) {
  const scriptsDir = fs.readdirSync('scripts');
  const installScripts = scriptsDir.filter(file =>
    file.includes('install') || file.includes('setup')
  );

  if (installScripts.length > 0) {
    console.log(`✅ Installation scripts: ${installScripts.join(', ')}`);
  } else {
    console.log('⚠️  No dedicated installation scripts found');
  }
} else {
  console.log('⚠️  No scripts directory found');
}

// Final validation
console.log('\n🎯 Final Validation Summary...');
console.log('='.repeat(50));

const validationResults = {
  filesExist: allFilesExist,
  pluginValid: true,
  marketplaceValid: true,
  packageValid: true,
  repositoryValid: true
};

const totalChecks = Object.keys(validationResults).length;
const passedChecks = Object.values(validationResults).filter(Boolean).length;
const score = (passedChecks / totalChecks) * 100;

console.log(`✅ Passed ${passedChecks}/${totalChecks} validation checks (${score.toFixed(0)}%)`);

if (score === 100) {
  console.log('\n🎉 SUCCESS: Your repository meets Claude Marketplaces auto-discovery requirements!');
  console.log('\n📝 Next steps:');
  console.log('1. Push these changes to your GitHub repository');
  console.log('2. Wait for daily marketplace discovery (usually 24 hours)');
  console.log('3. Check https://claudemarketplaces.com for your listing');
  console.log('4. Ensure your repository has at least 5 GitHub stars for inclusion');

  console.log('\n🚀 Auto-discovery will happen automatically when:');
  console.log('- Repository has a valid .claude-plugin/marketplace.json');
  console.log('- Repository has at least 5 stars');
  console.log('- Repository passes all validation checks');

  process.exit(0);
} else {
  console.log('\n❌ FAILED: Some validation checks failed. Please fix the issues above.');
  process.exit(1);
}