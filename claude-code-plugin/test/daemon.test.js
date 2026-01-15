#!/usr/bin/env node

/**
 * Basic tests for the PRISM daemon
 */

const PrismDaemon = require('../daemon/server.js');
const path = require('path');
const fs = require('fs').promises;

describe('PRISM Daemon', () => {
  let daemon;
  const testRoot = path.join(__dirname, '..', 'test-project');

  beforeAll(async () => {
    // Create a test project
    await fs.mkdir(testRoot, { recursive: true });
    await fs.writeFile(path.join(testRoot, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        express: '^4.18.0'
      }
    }));
  });

  afterAll(async () => {
    // Clean up test project
    await fs.rm(testRoot, { recursive: true, force: true });
    if (daemon) {
      await daemon.stop();
    }
  });

  beforeEach(() => {
    daemon = new PrismDaemon();
    daemon.config.projectRoot = testRoot;
    daemon.config.cacheDir = path.join(testRoot, '.cache');
    daemon.config.indexDir = path.join(testRoot, '.index');
  });

  test('should initialize daemon', async () => {
    await expect(daemon.initialize()).resolves.not.toThrow();
    expect(daemon.projectInfo).toBeDefined();
    expect(daemon.projectInfo.name).toBe('test-project');
  });

  test('should detect Node.js project', async () => {
    await daemon.initialize();
    expect(daemon.projectInfo.type).toBe('node');
    expect(daemon.projectInfo.language).toBe('javascript');
    expect(daemon.projectInfo.dependencies).toContain('express');
  });

  test('should handle HTTP requests', async () => {
    await daemon.initialize();

    // Mock HTTP request
    const req = {
      method: 'GET',
      url: '/health',
      on: jest.fn()
    };
    const res = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    daemon.requestHandler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('healthy'));
  });

  test('should process search request', async () => {
    await daemon.initialize();

    const req = {
      method: 'POST',
      url: '/search',
      on: jest.fn((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from(JSON.stringify({ query: 'test' })));
        }
        if (event === 'end') {
          callback();
        }
      })
    };
    const res = {
      writeHead: jest.fn(),
      end: jest.fn()
    };

    await new Promise((resolve) => {
      daemon.requestHandler(req, res);
      setTimeout(resolve, 100);
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const response = JSON.parse(res.end.mock.calls[0][0]);
    expect(response.results).toBeDefined();
    expect(response.results[0].query).toBe('test');
  });

  test('should provide project summary', async () => {
    await daemon.initialize();

    const summary = daemon.projectInfo;
    expect(summary).toHaveProperty('name');
    expect(summary).toHaveProperty('type');
    expect(summary).toHaveProperty('language');
    expect(summary).toHaveProperty('dependencies');
    expect(summary).toHaveProperty('scripts');
  });
});

module.exports = {};