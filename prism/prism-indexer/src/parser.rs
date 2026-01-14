use crate::error::{PrismError, Result};
use crate::types::{ParseResult, CodeChunk};
use tree_sitter::Parser;
use wasm_bindgen::prelude::*;

/// Main parser struct
#[wasm_bindgen]
pub struct PrismParser {
    parser: Parser,
    language_name: String,
}

#[wasm_bindgen]
impl PrismParser {
    /// Create a new parser for the specified language
    #[wasm_bindgen(constructor)]
    pub fn new(language: &str) -> Result<PrismParser> {
        let mut parser = Parser::new();

        let language_obj = match language {
            "typescript" => tree_sitter_typescript::language_typescript(),
            "javascript" => tree_sitter_javascript::language_javascript(),
            "python" => tree_sitter_python::language_python(),
            "rust" => tree_sitter_rust::language_rust(),
            "go" => tree_sitter_go::language_go(),
            "java" => tree_sitter_java::language_java(),
            _ => return Err(PrismError::UnsupportedLanguage(language.to_string())),
        };

        parser
            .set_language(&language_obj)
            .map_err(|e| PrismError::ParseError(format!("Failed to set language: {:?}", e)))?;

        Ok(PrismParser {
            parser,
            language_name: language.to_string(),
        })
    }

    /// Parse code and return structured result
    #[wasm_bindgen]
    pub fn parse(&mut self, code: &str) -> Result<ParseResult> {
        let tree = self
            .parser
            .parse(code, None)
            .ok_or_else(|| PrismError::ParseError("Failed to parse code".to_string()))?;

        let root = tree.root_node();
        let has_errors = root.has_error();

        // Extract code chunks (now with function-level chunking)
        let chunks = crate::chunker::chunk_code(&root, code, &self.language_name);

        // Extract functions and classes for metadata
        let functions = crate::extractor::extract_functions(&root, code);
        let classes = crate::extractor::extract_classes(&root, code);

        // Find error nodes if any
        let error_nodes = if has_errors {
            crate::extractor::find_error_nodes(&root, code)
        } else {
            Vec::new()
        };

        Ok(ParseResult {
            has_errors,
            error_nodes,
            chunks,
            functions,
            classes,
        })
    }

    /// Clean up resources
    #[wasm_bindgen]
    pub fn free(&mut self) {
        // Tree-sitter Parser doesn't have explicit cleanup
        // This is a placeholder for future cleanup needs
    }
}
