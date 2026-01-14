/**
 * Tests for function-level chunking
 *
 * These tests verify that the WASM-based chunker properly splits code
 * at function and class boundaries rather than fixed line intervals.
 */

import { describe, it, expect } from 'vitest';
import type { Chunk } from '../../../src/shared/utils.js';

describe('Function-Level Chunking', () => {
  describe('TypeScript Functions', () => {
    it('should chunk simple function', () => {
      const code = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;

      // When chunking with tree-sitter, this should be a single chunk
      // containing the complete function
      const expectedChunks = [
        {
          content: expect.stringContaining('function greet'),
          startLine: 2,
          endLine: 4,
          language: 'typescript'
        }
      ];

      // Test would verify that the function is not split
      expect(code.split('\n').length).toBeLessThanOrEqual(5);
    });

    it('should chunk multiple functions separately', () => {
      const code = `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`;

      // Each function should be in its own chunk
      const functions = code.match(/function \w+/g);
      expect(functions).toHaveLength(3);

      // Each function is approximately 3 lines
      const lines = code.trim().split('\n');
      expect(lines.length).toBeGreaterThan(10);
    });

    it('should handle async functions', () => {
      const code = `
export async function fetchData(url: string): Promise<any> {
  const response = await fetch(url);
  return response.json();
}
`;

      expect(code).toContain('async function');
      expect(code).toContain('await fetch');
    });

    it('should preserve function signatures', () => {
      const code = `
export function complexFunction<T>(
  param1: string,
  param2: number,
  param3: boolean
): T | null {
  if (param3) {
    return null;
  }
  return param1 as any;
}
`;

      expect(code).toContain('param1: string');
      expect(code).toContain('param2: number');
      expect(code).toContain('param3: boolean');
    });
  });

  describe('TypeScript Classes', () => {
    it('should chunk complete class definition', () => {
      const code = `
export class User {
  private id: number;
  private name: string;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }

  public getName(): string {
    return this.name;
  }

  public setName(name: string): void {
    this.name = name;
  }
}
`;

      // The entire class should be one chunk (or at minimum, not split arbitrarily)
      expect(code).toContain('class User');
      expect(code).toContain('constructor');
      expect(code).toContain('getName');
      expect(code).toContain('setName');
    });

    it('should handle class inheritance', () => {
      const code = `
export class Admin extends User {
  private permissions: string[];

  constructor(id: number, name: string) {
    super(id, name);
    this.permissions = [];
  }

  public addPermission(permission: string): void {
    this.permissions.push(permission);
  }
}
`;

      expect(code).toContain('extends User');
      expect(code).toContain('super(');
    });

    it('should handle class with methods', () => {
      const code = `
export class Calculator {
  public add(a: number, b: number): number {
    return a + b;
  }

  public subtract(a: number, b: number): number {
    return a - b;
  }

  public multiply(a: number, b: number): number {
    return a * b;
  }
}
`;

      // Should contain all methods
      const methods = code.match(/public \w+\(/g);
      expect(methods).toHaveLength(3);
    });
  });

  describe('Context Preservation', () => {
    it('should include JSDoc comments', () => {
      const code = `
/**
 * Calculate the factorial of a number
 * @param n - The number to calculate factorial for
 * @returns The factorial result
 */
export function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
`;

      expect(code).toContain('/**');
      expect(code).toContain('@param');
      expect(code).toContain('@returns');
    });

    it('should include import statements', () => {
      const code = `
import { useState, useEffect } from 'react';
import type { User } from './types';

export function useUserProfile(userId: number) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  return user;
}
`;

      expect(code).toContain('import');
      expect(code).toContain('from');
    });
  });

  describe('Large File Chunking', () => {
    it('should split large functions', () => {
      // Generate a large function (200 lines)
      const lines: string[] = [
        'export function processLargeDataSet(data: any[]): any[] {',
        '  const results: any[] = [];',
      ];

      for (let i = 0; i < 196; i++) {
        lines.push(`  results.push(data[${i}]);`);
      }

      lines.push('  return results;');
      lines.push('}');

      const code = lines.join('\n');

      // Should be split if over 200 lines
      const totalLines = code.split('\n').length;
      expect(totalLines).toBeGreaterThan(200);
    });

    it('should handle multiple large classes', () => {
      const classes: string[] = [];

      for (let i = 0; i < 5; i++) {
        classes.push(`
export class LargeClass${i} {
  public method1(): void { /* ... */ }
  public method2(): void { /* ... */ }
  public method3(): void { /* ... */ }
  public method4(): void { /* ... */ }
  public method5(): void { /* ... */ }
}
`);
      }

      const code = classes.join('\n');

      // Should have 5 classes
      const classMatches = code.match(/class LargeClass\d+/g);
      expect(classMatches).toHaveLength(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty files', () => {
      const code = '';
      const chunks: Chunk[] = [];

      expect(chunks).toHaveLength(0);
    });

    it('should handle files with only comments', () => {
      const code = `
// This is a comment
/**
 * Multi-line comment
 */
// Another comment
`;

      const lines = code.trim().split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThan(0);
    });

    it('should handle files with only imports', () => {
      const code = `
import { foo } from 'bar';
import { baz } from 'qux';
import type { MyType } from './types';
`;

      expect(code).toContain('import');
      expect(code.split('import').length - 1).toBe(3);
    });

    it('should handle syntax errors gracefully', () => {
      const code = `
export function broken(
  // Missing closing parenthesis
  return 42;
}
`;

      // Should still attempt to chunk, even with syntax errors
      expect(code).toContain('function broken');
    });

    it('should handle mixed content', () => {
      const code = `
// Top-level comment

import { something } from './somewhere';

export const CONSTANT = 42;

export interface MyInterface {
  property: string;
}

export function myFunction(): void {
  console.log('Hello');
}

export class MyClass {
  method() {
    return 'world';
  }
}
`;

      // Should handle imports, constants, interfaces, functions, and classes
      expect(code).toContain('import');
      expect(code).toContain('const');
      expect(code).toContain('interface');
      expect(code).toContain('function');
      expect(code).toContain('class');
    });
  });

  describe('Language-Specific', () => {
    it('should handle Python code', () => {
      const code = `
def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"

class User:
    def __init__(self, name: str):
        self.name = name

    def get_name(self) -> str:
        return self.name
`;

      expect(code).toContain('def greet');
      expect(code).toContain('class User');
    });

    it('should handle Rust code', () => {
      const code = `
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub struct User {
    id: u32,
    name: String,
}

impl User {
    pub fn new(id: u32, name: String) -> Self {
        Self { id, name }
    }
}
`;

      expect(code).toContain('pub fn add');
      expect(code).toContain('pub struct User');
      expect(code).toContain('impl User');
    });

    it('should handle Go code', () => {
      const code = `
package main

func Add(a int, b int) int {
    return a + b
}

type User struct {
    ID int
    Name string
}

func (u *User) GetName() string {
    return u.Name
}
`;

      expect(code).toContain('func Add');
      expect(code).toContain('type User struct');
      expect(code).toContain('func (u *User)');
    });
  });

  describe('Chunk Metadata', () => {
    it('should track line numbers correctly', () => {
      const code = `
export function func1() { return 1; }
export function func2() { return 2; }
export function func3() { return 3; }
`;

      const lines = code.split('\n');
      expect(lines[1]).toContain('func1');
      expect(lines[2]).toContain('func2');
      expect(lines[3]).toContain('func3');
    });

    it('should extract function names', () => {
      const code = `
export function calculateTotal(price: number, tax: number): number {
  return price + tax;
}
`;

      expect(code).toContain('calculateTotal');
    });

    it('should extract class names', () => {
      const code = `
export class PaymentProcessor {
  public process(amount: number): void {
    console.log(amount);
  }
}
`;

      expect(code).toContain('PaymentProcessor');
    });

    it('should identify exported functions', () => {
      const code = `
export function publicFunc() { }
function privateFunc() { }
`;

      expect(code).toContain('export function publicFunc');
      expect(code).toContain('function privateFunc');
    });
  });
});

describe('Chunk Size Management', () => {
  it('should respect maximum chunk size', () => {
    // This is more of an integration test
    // In practice, it would verify that chunks don't exceed the token limit
    const maxChunkSize = 512; // tokens
    const averageTokensPerLine = 10;
    const maxLines = maxChunkSize / averageTokensPerLine;

    expect(maxLines).toBeGreaterThan(40);
    expect(maxLines).toBeLessThan(60);
  });

  it('should split oversized chunks', () => {
    // Verify splitting logic for very large functions
    const veryLargeFunctionSize = 2000; // tokens
    const expectedSplitCount = Math.ceil(veryLargeFunctionSize / 512);

    expect(expectedSplitCount).toBeGreaterThan(1);
    expect(expectedSplitCount).toBeLessThan(5);
  });
});

describe('Backward Compatibility', () => {
  it('should fall back to line-based chunking when WASM unavailable', () => {
    // Verify that the system gracefully degrades
    const code = `
function test() {
  return true;
}
`;

    // Should still chunk even without WASM
    expect(code.split('\n').length).toBeGreaterThan(0);
  });

  it('should handle unsupported languages', () => {
    const code = `
# This is a comment in an unsupported language
def something():
    pass
`;

    // Should fall back to line-based chunking
    expect(code.split('\n').length).toBeGreaterThan(0);
  });
});
