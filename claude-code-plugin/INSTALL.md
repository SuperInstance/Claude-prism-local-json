# PRISM - Project Memory for Claude Code

> **Zero-friction installation with intelligent auto-detection**

## ⚡ Quick Start

### One-Click Installation

1. **Download & Extract**
   ```bash
   wget https://github.com/SuperInstance/Claude-prism-local-json/releases/latest/download/prism.tar.gz
   tar -xzf prism.tar.gz
   cd prism
   ```

2. **Run Auto-Setup**
   ```bash
   # Linux/macOS
   chmod +x scripts/install.sh && ./scripts/install.sh

   # Windows
   powershell -ExecutionPolicy Bypass -File scripts/install.ps1
   ```

3. **Restart Claude Code**

That's it! PRISM will auto-detect your project and configure itself.

## 🎯 Features

### Zero-Configuration
- ✅ **Auto-detect** project type and framework
- ✅ **Intelligent defaults** for all settings
- ✅ **Cross-platform** support (Windows, macOS, Linux)
- ✅ **One-click** installation

### Smart Project Detection
- **Languages**: JavaScript, TypeScript, Python, Go, Rust, Java, C#, PHP, Ruby
- **Frameworks**: React, Vue, Angular, Django, Flask, Spring, Next.js, etc.
- **Tools**: Webpack, Vite, npm, yarn, pnpm, pip, etc.

### Enhanced Memory
- **Semantic search** across your entire codebase
- **Context-aware** indexing
- **Real-time** updates
- **Project-specific** optimization

## 🔧 Installation

### Automatic (Recommended)
```bash
# Run the installer
./scripts/install.sh

# Verify installation
./verify-install.sh
```

### Manual
```bash
# Clone the repository
git clone https://github.com/SuperInstance/Claude-prism-local-json.git
cd Claude-prism-local-json

# Run setup
node scripts/install-setup.js

# Configure Claude Code
cp -r .claude-plugin ~/
```

### From Source
```bash
git clone https://github.com/SuperInstance/Claude-prism-local-json.git
cd Claude-prism-local-json
npm install
npm run build
node scripts/install-setup.js
```

## 🚀 Usage

Once installed, PRISM works automatically with Claude Code:

### Commands
- `prism index` - Index your project
- `prism search "query"` - Search across your codebase
- `prism verify` - Check installation status

### Auto-Features
- **Background indexing** of file changes
- **Smart caching** for better performance
- **Cross-language** search support
- **Context-aware** results

## 🔍 Project Support

### Frontend
- React, Vue, Angular
- Next.js, Nuxt.js
- Vite, Webpack
- TypeScript, JavaScript

### Backend
- Node.js, Python (Django, Flask)
- Go, Rust, Java, C#
- PHP, Ruby

### Tools & Frameworks
- npm, yarn, pnpm
- pip, poetry, pipenv
- Maven, Gradle
- ESLint, Prettier
- Jest, PyTest

## 🐛 Troubleshooting

### Common Issues

**Node.js Version Error**
```bash
# Ensure Node.js 14+
node --version
nvm install 16 && nvm use 16
```

**Permission Issues**
```bash
# Linux/macOS
chmod +x scripts/*.sh

# Windows
Run as Administrator
```

**MCP Server Won't Start**
```bash
# Check logs
tail -f logs/prism.log

# Test server manually
node daemon/server.js
```

### Test Installation
```bash
# Run comprehensive tests
node scripts/test-installation.js

# Test compatibility
node scripts/test-compatibility.js
```

## 📊 System Requirements

- **Node.js**: 14+
- **Memory**: 50MB+ (minimal)
- **Storage**: 100MB+ (cache)
- **Platform**: Windows, macOS, Linux

## 🎉 What's Next?

1. **Restart Claude Code** to load the plugin
2. **Run `prism index`** to start indexing
3. **Use natural language** to search your code
4. **Enjoy** enhanced project memory!

## 🤝 Contributing

We welcome contributions! See our [GitHub repository](https://github.com/SuperInstance/Claude-prism-local-json) for:

- Bug reports
- Feature requests
- Pull requests
- Documentation improvements

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**PRISM - Making Claude Code smarter, one project at a time! 🎯**