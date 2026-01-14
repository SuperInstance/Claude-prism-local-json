# PRISM Documentation Index

## Quick Navigation

- [User Guides](#user-guides)
- [Quick Start](#quick-start)
- [Round Documentation](#round-documentation)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Development](#development)

---

## User Guides

### For Users

Complete documentation for using PRISM:

| Guide | Description | Location |
|-------|-------------|----------|
| **Getting Started** | Installation, first-time setup, quick start | [user/getting-started.md](./user/getting-started.md) |
| **Usage Guide** | Command reference, common workflows, advanced usage | [user/usage.md](./user/usage.md) |
| **Examples** | Real-world scenarios, token savings, benchmarks | [user/examples.md](./user/examples.md) |
| **Configuration** | Config files, environment variables, options | [user/configuration.md](./user/configuration.md) |
| **FAQ** | Common questions, troubleshooting, limitations | [user/faq.md](./user/faq.md) |

### User Guide Quick Links

**New to PRISM?** Start with [Getting Started](./user/getting-started.md)

**Need help?** Check the [FAQ](./user/faq.md)

**Want examples?** See [Examples & Use Cases](./user/examples.md)

**Need to configure?** See [Configuration Guide](./user/configuration.md)

---

## Quick Start

### New to PRISM?
Start here: 📄 [README.md](../README.md)

### Want to build the WASM indexer?
See: 📄 [BUILD_QUICKREF.md](../BUILD_QUICKREF.md)

### Need detailed build instructions?
See: 📄 [ROUND3_BUILD_GUIDE.md](./ROUND3_BUILD_GUIDE.md)

---

## Round Documentation

### Round 3: WASM Indexer MVP ✅

**Status:** Complete - Ready for Build

| Document | Description | Location |
|----------|-------------|----------|
| Completion Report | Task breakdown and verification | [ROUND3_COMPLETE.md](../ROUND3_COMPLETE.md) |
| Implementation Summary | Executive overview | [ROUND3_SUMMARY.md](../ROUND3_SUMMARY.md) |
| Build Guide | Step-by-step build instructions | [ROUND3_BUILD_GUIDE.md](./ROUND3_BUILD_GUIDE.md) |
| Architecture Diagram | System architecture and data flow | [ROUND3_ARCHITECTURE.md](./ROUND3_ARCHITECTURE.md) |

### Round 2: CLI & Services ✅

**Status:** Complete

| Document | Description | Location |
|----------|-------------|----------|
| Completion Report | Service layer implementation | [ROUND2_COMPLETE.md](../ROUND2_COMPLETE.md) |

---

## Architecture

### System Design

| Document | Description | Location |
|----------|-------------|----------|
| System Overview | High-level architecture | [architecture/01-system-overview.md](./architecture/01-system-overview.md) |
| Token Optimizer | Context compression algorithm | [architecture/02-token-optimizer.md](./architecture/02-token-optimizer.md) |
| Model Router | LLM selection strategy | [architecture/03-model-router.md](./architecture/03-model-router.md) |
| Indexer Architecture | Code parsing and chunking | [architecture/04-indexer-architecture.md](./architecture/04-indexer-architecture.md) |
| MCP Plugin Spec | Claude Code integration | [architecture/05-mcp-plugin-spec.md](./architecture/05-mcp-plugin-spec.md) |
| MCP Integration Guide | MCP server setup and usage | [../prism/docs/mcp-integration.md](../prism/docs/mcp-integration.md) |

### Round 3 Architecture

| Document | Description | Location |
|----------|-------------|----------|
| WASM Indexer Architecture | Component diagrams and interfaces | [ROUND3_ARCHITECTURE.md](./ROUND3_ARCHITECTURE.md) |

---

## API Reference

### Core Interfaces

| Module | Description | Location |
|--------|-------------|----------|
| Core Interfaces | IIndexer, IVectorDatabase, etc. | [`src/core/interfaces/index.ts`](../src/core/interfaces/index.ts) |
| Core Types | CodeChunk, PrismError, Result | [`src/core/types/index.ts`](../src/core/types/index.ts) |
| Indexer Types | ParseResult, FunctionInfo, etc. | [`src/indexer/types.ts`](../src/indexer/types.ts) |

### Services

| Module | Description | Location |
|--------|-------------|----------|
| WasmIndexer | Rust/WASM parser wrapper | [`src/indexer/WasmIndexer.ts`](../src/indexer/WasmIndexer.ts) |
| IndexerOrchestrator | Pipeline orchestration | [`src/indexer/IndexerOrchestrator.ts`](../src/indexer/IndexerOrchestrator.ts) |
| IndexStorage | Index metadata management | [`src/indexer/IndexStorage.ts`](../src/indexer/IndexStorage.ts) |
| ProgressReporter | Progress tracking | [`src/indexer/ProgressReporter.ts`](../src/indexer/ProgressReporter.ts) |

---

## Development

### Developer Guides

Complete documentation for contributors:

| Guide | Description | Location |
|-------|-------------|----------|
| **Setup Guide** | Prerequisites, installation, environment setup | [development/setup.md](./development/setup.md) |
| **Contributing Guide** | Code of conduct, PR process, style guidelines | [development/contributing.md](./development/contributing.md) |
| **Testing Guide** | Test framework, writing tests, coverage requirements | [development/testing.md](./development/testing.md) |
| **Architecture Overview** | Module organization, extension points, adding features | [development/architecture.md](./development/architecture.md) |
| **Debugging Guide** | Debugging techniques, logging, profiling | [development/debugging.md](./development/debugging.md) |

### Quick Start for Developers

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build WASM** (requires Rust)
   ```bash
   npm run build:wasm
   ```

3. **Build TypeScript**
   ```bash
   npm run build:ts
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

### Build Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build everything (WASM + TS) |
| `npm run build:wasm` | Build Rust to WASM |
| `npm run build:ts` | Build TypeScript |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Lint code |
| `npm run typecheck` | Type check TypeScript |

### Project Structure

```
prism/
├── prism/                    # Rust/WASM modules
│   └── prism-indexer/        # Code parser
├── src/                      # TypeScript source
│   ├── cli/                  # Command-line interface
│   ├── core/                 # Core interfaces & types
│   ├── indexer/              # Indexing pipeline
│   ├── token-optimizer/      # Context optimization
│   ├── model-router/         # LLM selection
│   └── vector-db/            # Vector storage
├── tests/                    # Test suites
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── wasm/                 # WASM tests
├── docs/                     # Documentation
│   ├── research/             # Research findings
│   ├── architecture/         # Architecture docs
│   ├── development/          # Developer guides
│   └── agents/               # Agent documentation
└── scripts/                  # Build & deployment scripts
```

---

## Research

### Completed Research

| Topic | Status | Document |
|-------|--------|----------|
| Tree-sitter Integration | ✅ Complete | [research/01-treesitter-integration.md](./research/01-treesitter-integration.md) |
| WASM Build Process | ✅ Complete | [research/02-wasm-build-process.md](./research/02-wasm-build-process.md) |
| Node.js WASM Loading | ✅ Complete | [research/03-nodejs-wasm-loading.md](./research/03-nodejs-wasm-loading.md) |

---

## Troubleshooting

### Common Issues

**Problem:** `wasm-pack: command not found`
**Solution:** Install wasm-pack: `cargo install wasm-pack`

**Problem:** WASM file too large
**Solution:** Check build optimizations in `prism/prism-indexer/Cargo.toml`

**Problem:** Tests fail with "Cannot find module"
**Solution:** Build WASM first: `npm run build:wasm`

**Problem:** "WASM module not initialized"
**Solution:** Call `await indexer.init()` before using

See [BUILD_QUICKREF.md](../BUILD_QUICKREF.md) for more troubleshooting.

---

## Quick Reference Cards

### Build Commands
📄 [BUILD_QUICKREF.md](../BUILD_QUICKREF.md)

### Architecture Overview
📄 [ROUND3_ARCHITECTURE.md](./ROUND3_ARCHITECTURE.md)

### API Interfaces
📄 [`src/core/interfaces/index.ts`](../src/core/interfaces/index.ts)

---

## Progress Tracking

### Completed Rounds

- ✅ **Round 1:** Project Setup & Architecture
- ✅ **Round 2:** CLI & Services Layer
- ✅ **Round 3:** WASM Indexer MVP

### In Progress

- ⏳ **Round 4:** Embedding Generation
- ⏳ **Round 5:** Vector Database Integration
- ⏳ **Round 6:** Token Optimization

### Planned

- 📋 **Round 7:** Model Router Implementation
- 📋 **Round 8:** MCP Plugin
- 📋 **Round 9:** Testing & Documentation
- 📋 **Round 10:** Launch Preparation

---

## Contributing

### Development Workflow

1. Check existing documentation
2. Create research doc for new features
3. Write architecture spec
4. Implement following architecture
5. Update tests
6. Update this index

### Documentation Standards

See: 📄 [CLAUDE.md](../CLAUDE.md)

---

## External Resources

- [Tree-sitter Documentation](https://tree-sitter.github.io/tree-sitter/)
- [wasm-pack Documentation](https://rustwasm.github.io/wasm-pack/)
- [WebAssembly in Node.js](https://nodejs.org/api/wasm.html)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/)

---

**Last Updated:** 2025-01-13
**Documentation Version:** 0.3.0
**Project Status:** Active Development
