/**
 * Enhanced Project Detector
 * Auto-discovers project structure, dependencies, and characteristics
 */

const fs = require('fs').promises;
const path = require('path');

class ProjectDetector {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.projectInfo = {
      name: path.basename(projectRoot),
      type: 'unknown',
      language: 'unknown',
      framework: 'unknown',
      dependencies: [],
      devDependencies: [],
      scripts: {},
      configFiles: [],
      packageManagers: [],
      buildTools: [],
      testFrameworks: [],
      lintingTools: [],
      directories: {
        src: false,
        lib: false,
        tests: false,
        test: false,
        docs: false,
        examples: false
      }
    };
  }

  /**
   * Detect all project characteristics
   */
  async detectAll() {
    console.log(`[Project Detector] Analyzing project at: ${this.projectRoot}`);

    try {
      // Detect language and framework
      await this.detectLanguage();
      await this.detectFramework();

      // Detect dependencies and tools
      await this.detectDependencies();
      await this.detectBuildTools();
      await this.detectTestFrameworks();
      await this.detectLintingTools();

      // Detect directory structure
      await this.detectDirectories();

      // Detect package managers
      await this.detectPackageManagers();

      // Detect config files
      await this.detectConfigFiles();

      console.log(`[Project Detector] Detection complete: ${this.projectInfo.language}/${this.projectInfo.framework}`);

      return this.projectInfo;
    } catch (error) {
      console.error('[Project Detector] Detection failed:', error);
      return this.projectInfo;
    }
  }

  /**
   * Detect programming language
   */
  async detectLanguage() {
    const languageDetectors = [
      this.detectNodejs,
      this.detectPython,
      this.detectGo,
      this.detectRust,
      this.detectJava,
      this.detectCSharp,
      this.detectPHP,
      this.detectRuby,
      this.detectTypeScript
    ];

    for (const detector of languageDetectors) {
      try {
        const result = await detector.bind(this)();
        if (result) {
          this.projectInfo.language = result;
          return;
        }
      } catch (error) {
        // Continue to next detector
      }
    }

    // Default to generic
    this.projectInfo.language = 'generic';
  }

  /**
   * Detect Node.js projects
   */
  async detectNodejs() {
    try {
      await fs.access(path.join(this.projectRoot, 'package.json'));
      const packageJson = await fs.readFile(path.join(this.projectRoot, 'package.json'), 'utf8');
      const packageData = JSON.parse(packageJson);

      this.projectInfo.type = 'node';

      // Check for specific frameworks
      if (packageData.dependencies) {
        const deps = Object.keys(packageData.dependencies);

        if (deps.some(dep => dep.includes('react'))) {
          this.projectInfo.framework = 'react';
        } else if (deps.some(dep => dep.includes('vue'))) {
          this.projectInfo.framework = 'vue';
        } else if (deps.some(dep => dep.includes('angular'))) {
          this.projectInfo.framework = 'angular';
        } else if (deps.some(dep => dep.includes('next'))) {
          this.projectInfo.framework = 'next';
        } else if (deps.some(dep => dep.includes('nuxt'))) {
          this.projectInfo.framework = 'nuxt';
        }
      }

      return 'javascript';
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect TypeScript projects
   */
  async detectTypeScript() {
    try {
      // Check if it's a TypeScript project
      if (this.projectInfo.type === 'node') {
        const packageJson = await fs.readFile(path.join(this.projectRoot, 'package.json'), 'utf8');
        const packageData = JSON.parse(packageJson);

        if (packageData.dependencies && packageData.dependencies.typescript) {
          this.projectInfo.language = 'typescript';
          return 'typescript';
        }
      }

      // Check for tsconfig.json
      await fs.access(path.join(this.projectRoot, 'tsconfig.json'));
      this.projectInfo.language = 'typescript';
      return 'typescript';
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect Python projects
   */
  async detectPython() {
    try {
      // Check pyproject.toml first (modern Python)
      try {
        await fs.access(path.join(this.projectRoot, 'pyproject.toml'));
        this.projectInfo.type = 'python';

        // Check for specific frameworks
        const pyprojectContent = await fs.readFile(path.join(this.projectRoot, 'pyproject.toml'), 'utf8');
        if (pyprojectContent.includes('Django')) {
          this.projectInfo.framework = 'django';
        } else if (pyprojectContent.includes('Flask')) {
          this.projectInfo.framework = 'flask';
        } else if (pyprojectContent.includes('FastAPI')) {
          this.projectInfo.framework = 'fastapi';
        } else if (pyprojectContent.includes('pytest')) {
          this.projectInfo.framework = 'pytest';
        }

        return 'python';
      } catch (error) {
        // Not pyproject.toml, continue
      }

      // Check setup.py
      try {
        await fs.access(path.join(this.projectRoot, 'setup.py'));
        this.projectInfo.type = 'python';

        const setupContent = await fs.readFile(path.join(this.projectRoot, 'setup.py'), 'utf8');
        if (setupContent.includes('Django')) {
          this.projectInfo.framework = 'django';
        } else if (setupContent.includes('Flask')) {
          this.projectInfo.framework = 'flask';
        }

        return 'python';
      } catch (error) {
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect Go projects
   */
  async detectGo() {
    try {
      await fs.access(path.join(this.projectRoot, 'go.mod'));
      this.projectInfo.type = 'go';
      this.projectInfo.framework = 'go';
      return 'go';
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect Rust projects
   */
  async detectRust() {
    try {
      await fs.access(path.join(this.projectRoot, 'Cargo.toml'));
      this.projectInfo.type = 'rust';

      const cargoContent = await fs.readFile(path.join(this.projectRoot, 'Cargo.toml'), 'utf8');
      if (cargoContent.includes('actix-web')) {
        this.projectInfo.framework = 'actix-web';
      } else if (cargoContent.includes('rocket')) {
        this.projectInfo.framework = 'rocket';
      } else if (cargoContent.includes('axum')) {
        this.projectInfo.framework = 'axum';
      }

      return 'rust';
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect Java projects
   */
  async detectJava() {
    try {
      // Check for pom.xml (Maven)
      try {
        await fs.access(path.join(this.projectRoot, 'pom.xml'));
        this.projectInfo.type = 'java';

        const pomContent = await fs.readFile(path.join(this.projectRoot, 'pom.xml'), 'utf8');
        if (pomContent.includes('Spring')) {
          this.projectInfo.framework = 'spring';
        } else if (pomContent.includes('Jakarta EE')) {
          this.projectInfo.framework = 'jakarta-ee';
        }

        return 'java';
      } catch (error) {
        // Not Maven, continue
      }

      // Check for build.gradle (Gradle)
      try {
        await fs.access(path.join(this.projectRoot, 'build.gradle'));
        this.projectInfo.type = 'java';

        const gradleContent = await fs.readFile(path.join(this.projectRoot, 'build.gradle'), 'utf8');
        if (gradleContent.includes('Spring')) {
          this.projectInfo.framework = 'spring';
        }

        return 'java';
      } catch (error) {
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect C# projects
   */
  async detectCSharp() {
    try {
      await fs.access(path.join(this.projectRoot, 'project.json'));
      this.projectInfo.type = 'csharp';

      // Check for ASP.NET Core
      const projectContent = await fs.readFile(path.join(this.projectRoot, 'project.json'), 'utf8');
      if (projectContent.includes('Microsoft.NET.Sdk.Web')) {
        this.projectInfo.framework = 'aspnet-core';
      }

      return 'csharp';
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect PHP projects
   */
  async detectPHP() {
    try {
      await fs.access(path.join(this.projectRoot, 'composer.json'));
      this.projectInfo.type = 'php';

      const composerContent = await fs.readFile(path.join(this.projectRoot, 'composer.json'), 'utf8');
      if (composerContent.includes('laravel')) {
        this.projectInfo.framework = 'laravel';
      } else if (composerContent.includes('symfony')) {
        this.projectInfo.framework = 'symfony';
      } else if (composerContent.includes('wordpress')) {
        this.projectInfo.framework = 'wordpress';
      }

      return 'php';
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect Ruby projects
   */
  async detectRuby() {
    try {
      await fs.access(path.join(this.projectRoot, 'Gemfile'));
      this.projectInfo.type = 'ruby';

      const gemfileContent = await fs.readFile(path.join(this.projectRoot, 'Gemfile'), 'utf8');
      if (gemfileContent.includes('rails')) {
        this.projectInfo.framework = 'rails';
      } else if (gemfileContent.includes('sinatra')) {
        this.projectInfo.framework = 'sinatra';
      }

      return 'ruby';
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect framework based on language
   */
  async detectFramework() {
    // Framework detection is already done in language detectors
    // This is a placeholder for additional framework detection
  }

  /**
   * Detect dependencies
   */
  async detectDependencies() {
    try {
      if (this.projectInfo.type === 'node') {
        const packageJson = await fs.readFile(path.join(this.projectRoot, 'package.json'), 'utf8');
        const packageData = JSON.parse(packageJson);

        this.projectInfo.dependencies = Object.keys(packageData.dependencies || {});
        this.projectInfo.devDependencies = Object.keys(packageData.devDependencies || {});
        this.projectInfo.scripts = packageData.scripts || {};
      } else if (this.projectInfo.type === 'python') {
        // Try to detect pip dependencies
        try {
          const requirementsPath = path.join(this.projectRoot, 'requirements.txt');
          await fs.access(requirementsPath);
          const requirementsContent = await fs.readFile(requirementsPath, 'utf8');
          this.projectInfo.dependencies = requirementsContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        } catch (error) {
          // No requirements.txt, continue
        }
      }
    } catch (error) {
      console.error('[Project Detector] Failed to detect dependencies:', error);
    }
  }

  /**
   * Detect build tools
   */
  async detectBuildTools() {
    const buildTools = [];

    try {
      // Check for common build tools
      const files = await fs.readdir(this.projectRoot);

      if (files.includes('Makefile')) {
        buildTools.push('make');
      }
      if (files.includes('build.gradle') || files.includes('settings.gradle')) {
        buildTools.push('gradle');
      }
      if (files.includes('pom.xml')) {
        buildTools.push('maven');
      }
      if (files.includes('webpack.config.js') || files.includes('vite.config.js')) {
        buildTools.push('webpack');
      }
      if (files.includes('rollup.config.js')) {
        buildTools.push('rollup');
      }
      if (files.includes('npm-debug.log') || files.includes('yarn.lock') || files.includes('package-lock.json')) {
        buildTools.push('npm');
      }
      if (files.includes('pnpm-lock.yaml')) {
        buildTools.push('pnpm');
      }

      this.projectInfo.buildTools = buildTools;
    } catch (error) {
      console.error('[Project Detector] Failed to detect build tools:', error);
    }
  }

  /**
   * Detect test frameworks
   */
  async detectTestFrameworks() {
    const testFrameworks = [];

    try {
      const files = await fs.readdir(this.projectRoot);

      // Node.js/JavaScript
      if (this.projectInfo.type === 'node' || this.projectInfo.type === 'browser') {
        if (files.includes('jest.config.js') || files.includes('jest.config.ts')) {
          testFrameworks.push('jest');
        }
        if (files.includes('vitest.config.ts') || files.includes('vitest.config.js')) {
          testFrameworks.push('vitest');
        }
        if (files.includes('karma.conf.js')) {
          testFrameworks.push('karma');
        }
        if (files.includes('mocha.opts')) {
          testFrameworks.push('mocha');
        }
      }

      // Python
      if (this.projectInfo.type === 'python') {
        if (files.includes('pytest.ini') || files.includes('pyproject.toml')) {
          testFrameworks.push('pytest');
        }
        if (files.includes('tox.ini')) {
          testFrameworks.push('tox');
        }
      }

      // General test indicators
      const testDirs = ['tests', 'test', '__tests__', 'spec'];
      const hasTestDir = testDirs.some(dir => files.includes(dir));
      if (hasTestDir) {
        testFrameworks.push('unittest');
      }

      this.projectInfo.testFrameworks = testFrameworks;
    } catch (error) {
      console.error('[Project Detector] Failed to detect test frameworks:', error);
    }
  }

  /**
   * Detect linting tools
   */
  async detectLintingTools() {
    const lintingTools = [];

    try {
      const files = await fs.readdir(this.projectRoot);

      // ESLint
      if (files.includes('.eslintrc') || files.includes('.eslintrc.js') || files.includes('.eslintrc.json')) {
        lintingTools.push('eslint');
      }

      // Prettier
      if (files.includes('.prettierrc') || files.includes('.prettierrc.js') || files.includes('.prettierrc.json')) {
        lintingTools.push('prettier');
      }

      // Python linting
      if (this.projectInfo.type === 'python') {
        if (files.includes('.flake8') || files.includes('pyproject.toml')) {
          lintingTools.push('flake8');
        }
        if (files.includes('.pylintrc')) {
          lintingTools.push('pylint');
        }
      }

      // TypeScript
      if (this.projectInfo.language === 'typescript') {
        if (files.includes('tslint.json')) {
          lintingTools.push('tslint');
        }
      }

      this.projectInfo.lintingTools = lintingTools;
    } catch (error) {
      console.error('[Project Detector] Failed to detect linting tools:', error);
    }
  }

  /**
   * Detect directory structure
   */
  async detectDirectories() {
    try {
      const files = await fs.readdir(this.projectRoot);

      const dirMap = {
        'src': ['src', 'source', 'sources'],
        'lib': ['lib', 'libs'],
        'tests': ['tests', 'test'],
        'docs': ['docs', 'documentation'],
        'examples': ['examples', 'demos', 'samples']
      };

      for (const [key, variants] of Object.entries(dirMap)) {
        const exists = variants.some(variant =>
          files.includes(variant) ||
          (await fs.readdir(this.projectRoot)).includes(variant)
        );
        this.projectInfo.directories[key] = exists;
      }
    } catch (error) {
      console.error('[Project Detector] Failed to detect directories:', error);
    }
  }

  /**
   * Detect package managers
   */
  async detectPackageManagers() {
    const packageManagers = [];

    try {
      const files = await fs.readdir(this.projectRoot);

      if (files.includes('package-lock.json')) {
        packageManagers.push('npm');
      }
      if (files.includes('yarn.lock')) {
        packageManagers.push('yarn');
      }
      if (files.includes('pnpm-lock.yaml')) {
        packageManagers.push('pnpm');
      }
      if (files.includes('bun.lockb')) {
        packageManagers.push('bun');
      }

      // Python package managers
      if (files.includes('Pipfile')) {
        packageManagers.push('pipenv');
      }
      if (files.includes('poetry.lock')) {
        packageManagers.push('poetry');
      }

      this.projectInfo.packageManagers = packageManagers;
    } catch (error) {
      console.error('[Project Detector] Failed to detect package managers:', error);
    }
  }

  /**
   * Detect config files
   */
  async detectConfigFiles() {
    try {
      const files = await fs.readdir(this.projectRoot);
      const configFiles = [];

      const configPatterns = [
        '.env*', '.*rc', 'config.*', '*.config.*', '*.json', '*.yaml', '*.yml',
        'Dockerfile*', 'docker-compose.*', '.*ignore'
      ];

      for (const file of files) {
        for (const pattern of configPatterns) {
          if (file.includes(pattern)) {
            configFiles.push(file);
            break;
          }
        }
      }

      this.projectInfo.configFiles = configFiles.sort();
    } catch (error) {
      console.error('[Project Detector] Failed to detect config files:', error);
    }
  }

  /**
   * Get project summary
   */
  getSummary() {
    return {
      name: this.projectInfo.name,
      language: this.projectInfo.language,
      framework: this.projectInfo.framework,
      type: this.projectInfo.type,
      dependencies: this.projectInfo.dependencies.length,
      devDependencies: this.projectInfo.devDependencies.length,
      scripts: Object.keys(this.projectInfo.scripts).length,
      buildTools: this.projectInfo.buildTools,
      testFrameworks: this.projectInfo.testFrameworks,
      lintingTools: this.projectInfo.lintingTools,
      directories: this.projectInfo.directories,
      hasConfig: this.projectInfo.configFiles.length > 0
    };
  }
}

module.exports = ProjectDetector;