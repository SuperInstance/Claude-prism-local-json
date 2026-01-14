#[cfg(test)]
mod tests {
    use prism_indexer::{chunk_code, split_large_chunk, CodeChunk};
    use tree_sitter::Parser;

    /// Helper function to create a parser for a language
    fn create_parser(language: &str) -> Parser {
        let mut parser = Parser::new();
        let language_obj = match language {
            "typescript" => tree_sitter_typescript::language_typescript(),
            "javascript" => tree_sitter_javascript::language_javascript(),
            "python" => tree_sitter_python::language_python(),
            "rust" => tree_sitter_rust::language_rust(),
            "go" => tree_sitter_go::language_go(),
            "java" => tree_sitter_java::language_java(),
            _ => panic!("Unsupported language: {}", language),
        };
        parser.set_language(&language_obj).unwrap();
        parser
    }

    #[test]
    fn test_simple_function_chunking() {
        let code = r#"
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
"#;

        let mut parser = create_parser("typescript");
        let tree = parser.parse(code, None).unwrap();
        let chunks = chunk_code(&tree.root_node(), code, "typescript");

        // Should have at least one chunk
        assert!(!chunks.is_empty());

        // First chunk should contain the function
        let first_chunk = &chunks[0];
        assert!(first_chunk.text.contains("function greet"));
        assert_eq!(first_chunk.start_line, 2);
        assert_eq!(first_chunk.end_line, 4);
    }

    #[test]
    fn test_multiple_functions() {
        let code = r#"
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
"#;

        let mut parser = create_parser("typescript");
        let tree = parser.parse(code, None).unwrap();
        let chunks = chunk_code(&tree.root_node(), code, "typescript");

        // Should have multiple chunks (one per function)
        assert!(chunks.len() >= 3, "Expected at least 3 chunks, got {}", chunks.len());

        // Verify each function is in a chunk
        for chunk in &chunks {
            if chunk.text.contains("function") {
                assert!(chunk.functions.len() >= 1);
            }
        }
    }

    #[test]
    fn test_class_chunking() {
        let code = r#"
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
"#;

        let mut parser = create_parser("typescript");
        let tree = parser.parse(code, None).unwrap();
        let chunks = chunk_code(&tree.root_node(), code, "typescript");

        // Should have at least one chunk
        assert!(!chunks.is_empty());

        // Find the class chunk
        let class_chunk = chunks.iter().find(|c| c.text.contains("class Calculator"));
        assert!(class_chunk.is_some(), "Class chunk not found");

        let class_chunk = class_chunk.unwrap();
        assert!(class_chunk.classes.len() >= 1);
        assert_eq!(class_chunk.classes[0].name, "Calculator");
    }

    #[test]
    fn test_chunk_size_limits() {
        // Create a large function
        let mut code = String::from("export function largeFunction() {\n");
        for i in 0..300 {
            code.push_str(&format!("  console.log('{}');\n", i));
        }
        code.push_str("}\n");

        let mut parser = create_parser("typescript");
        let tree = parser.parse(&code, None).unwrap();
        let chunks = chunk_code(&tree.root_node(), &code, "typescript");

        // Should have at least one chunk
        assert!(!chunks.is_empty());

        // If chunk is too large, verify it can be split
        let large_chunk = chunks.iter().find(|c| c.tokens > 512);
        if let Some(chunk) = large_chunk {
            let split_chunks = split_large_chunk(chunk, 512);
            assert!(split_chunks.len() > 1, "Large chunk should be split");
        }
    }

    #[test]
    fn test_context_preservation() {
        let code = r#"
/**
 * Calculate the factorial of a number
 * @param n - The number to calculate factorial for
 * @returns The factorial result
 */
export function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
"#;

        let mut parser = create_parser("typescript");
        let tree = parser.parse(code, None).unwrap();
        let chunks = chunk_code(&tree.root_node(), code, "typescript");

        // Chunk should include the JSDoc comment
        let chunk = &chunks[0];
        assert!(chunk.text.contains("/**"));
        assert!(chunk.text.contains("@param"));
        assert!(chunk.text.contains("@returns"));
    }

    #[test]
    fn test_python_chunking() {
        let code = r#"
def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"

class User:
    def __init__(self, name: str):
        self.name = name

    def get_name(self) -> str:
        return self.name
"#;

        let mut parser = create_parser("python");
        let tree = parser.parse(code, None).unwrap();
        let chunks = chunk_code(&tree.root_node(), code, "python");

        // Should have chunks
        assert!(!chunks.is_empty());

        // Should find the function
        let func_chunk = chunks.iter().find(|c| c.text.contains("def greet"));
        assert!(func_chunk.is_some());

        // Should find the class
        let class_chunk = chunks.iter().find(|c| c.text.contains("class User"));
        assert!(class_chunk.is_some());
    }

    #[test]
    fn test_rust_chunking() {
        let code = r#"
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
"#;

        let mut parser = create_parser("rust");
        let tree = parser.parse(code, None).unwrap();
        let chunks = chunk_code(&tree.root_node(), code, "rust");

        // Should have chunks
        assert!(!chunks.is_empty());

        // Should find the function
        let func_chunk = chunks.iter().find(|c| c.text.contains("pub fn add"));
        assert!(func_chunk.is_some());

        // Should find the struct
        let struct_chunk = chunks.iter().find(|c| c.text.contains("pub struct User"));
        assert!(struct_chunk.is_some());
    }

    #[test]
    fn test_chunk_token_estimation() {
        let code = "export function test() { return 'hello world'; }";
        let tokens = code.len() / 4;

        // Verify token estimation is reasonable
        assert!(tokens > 0);
        assert!(tokens < 100);
    }

    #[test]
    fn test_import_extraction() {
        let code = r#"
import { useState, useEffect } from 'react';
import type { User } from './types';
import { Helper } from '../helper';

export function myComponent() {
  return <div>Hello</div>;
}
"#;

        let mut parser = create_parser("typescript");
        let tree = parser.parse(code, None).unwrap();
        let chunks = chunk_code(&tree.root_node(), code, "typescript");

        // Should have chunks with imports
        let chunk_with_imports = chunks.iter().find(|c| !c.imports.is_empty());
        assert!(chunk_with_imports.is_some());

        let chunk = chunk_with_imports.unwrap();
        assert!(chunk.imports.len() >= 3);
    }

    #[test]
    fn test_empty_file() {
        let code = "";
        let mut parser = create_parser("typescript");
        let tree = parser.parse(code, None).unwrap();
        let chunks = chunk_code(&tree.root_node(), code, "typescript");

        // Should handle empty files gracefully
        assert!(chunks.is_empty());
    }

    #[test]
    fn test_syntax_error_handling() {
        let code = r#"
export function broken(
  // Missing closing parenthesis
  return 42;
}
"#;

        let mut parser = create_parser("typescript");
        let tree = parser.parse(code, None).unwrap();
        let has_errors = tree.root_node().has_error();

        // Should detect syntax errors
        assert!(has_errors);

        // Should still produce chunks
        let chunks = chunk_code(&tree.root_node(), code, "typescript");
        assert!(!chunks.is_empty());
    }

    #[test]
    fn test_large_class_splitting() {
        let mut code = String::from("export class LargeClass {\n");

        // Add many methods
        for i in 0..50 {
            code.push_str(&format!(
                r#"
  public method{}(): void {{
    console.log("Method {}");
  }}
"#,
                i, i
            ));
        }

        code.push_str("}\n");

        let mut parser = create_parser("typescript");
        let tree = parser.parse(&code, None).unwrap();
        let chunks = chunk_code(&tree.root_node(), &code, "typescript");

        // Should have at least one chunk for the class
        assert!(!chunks.is_empty());

        // Find the class chunk
        let class_chunk = chunks.iter().find(|c| c.text.contains("class LargeClass"));
        assert!(class_chunk.is_some());

        // If the class is too large, it should be split
        let class_chunk = class_chunk.unwrap();
        if class_chunk.tokens > 512 {
            let split_chunks = split_large_chunk(class_chunk, 512);
            assert!(split_chunks.len() > 1, "Large class should be split");
        }
    }
}
