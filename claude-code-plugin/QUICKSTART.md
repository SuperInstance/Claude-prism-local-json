# PRISM Quick Start Guide

## Setup (Under 2 Minutes)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Verify it's working:**
   ```bash
   curl http://localhost:8080/health
   ```

## Usage

### Command Line
- `npm start` - Start the PRISM server
- `npm run debug` - Run diagnostics and troubleshoot
- `npx prism` - Run the server directly (after npm install)

### API Endpoints
- `GET /health` - Check server status
- `GET /project` - Get project information
- `POST /search` - Search project files (basic implementation)

### Environment Variables
- `PORT` - Server port (default: 8080)
- `PROJECT_ROOT` - Project directory (default: current directory)

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Change the port
PORT=3000 npm start
```

**Project not detected:**
```bash
# Run diagnostics
npm run debug
```

**Permission errors:**
```bash
# Ensure you have file system access
ls -la daemon/
```

### Debug Mode

Run the built-in debugger to check everything is working:
```bash
npm run debug
```

This will check:
- Node.js version
- Environment variables
- File system access
- Network ports
- Project detection

## Project Detection

PRISM automatically detects:
- **JavaScript/TypeScript** (package.json)
- **Python** (pyproject.toml, setup.py)
- **Go** (go.mod)
- **Rust** (Cargo.toml)
- **Java** (pom.xml)
- **C#** (project.json)
- **PHP** (composer.json)
- **Ruby** (Gemfile)

## Development

The code is intentionally simple:
- No external dependencies
- Built-in Node.js modules only
- Easy to understand and modify

Key files:
- `daemon/server.js` - Main server
- `daemon/simple-project-detector.js` - Project detection
- `daemon/debug.js` - Debug utilities

## Support

If you encounter issues:
1. Run `npm run debug`
2. Check the console output
3. Verify your Node.js version (v14+ recommended)