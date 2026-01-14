/// Language-specific chunking strategies
///
/// Different languages have different semantic boundaries and conventions.
/// This module provides language-aware chunking strategies.

use tree_sitter::Node;

/// Language-specific configuration for chunking
#[derive(Debug, Clone)]
pub struct LanguageConfig {
    /// Preferred chunk size for this language
    pub preferred_chunk_size: usize,

    /// Maximum lines per chunk
    pub max_lines: usize,

    /// Whether to include docstrings/comments
    pub include_docs: bool,

    /// Whether to keep imports with each chunk
    pub include_imports: bool,

    /// Node types that represent function definitions
    pub function_nodes: Vec<&'static str>,

    /// Node types that represent class definitions
    pub class_nodes: Vec<&'static str>,

    /// Node types that represent interface/type definitions
    pub interface_nodes: Vec<&'static str>,

    /// Node types that represent import statements
    pub import_nodes: Vec<&'static str>,
}

impl LanguageConfig {
    /// Get configuration for TypeScript/JavaScript
    pub fn typescript() -> Self {
        LanguageConfig {
            preferred_chunk_size: 512,
            max_lines: 200,
            include_docs: true,
            include_imports: true,
            function_nodes: vec![
                "function_declaration",
                "function_expression",
                "arrow_function",
                "method_definition",
                "generator_function_declaration",
            ],
            class_nodes: vec![
                "class_declaration",
                "class_expression",
            ],
            interface_nodes: vec![
                "interface_declaration",
                "type_alias_declaration",
                "enum_declaration",
            ],
            import_nodes: vec![
                "import_statement",
                "import_declaration",
                "export_statement",
            ],
        }
    }

    /// Get configuration for Python
    pub fn python() -> Self {
        LanguageConfig {
            preferred_chunk_size: 512,
            max_lines: 200,
            include_docs: true,
            include_imports: true,
            function_nodes: vec![
                "function_definition",
                "lambda",
            ],
            class_nodes: vec![
                "class_definition",
            ],
            interface_nodes: vec![
                // Python doesn't have formal interfaces, but we can include decorators
            ],
            import_nodes: vec![
                "import_statement",
                "import_from_statement",
                "future_import_statement",
            ],
        }
    }

    /// Get configuration for Rust
    pub fn rust() -> Self {
        LanguageConfig {
            preferred_chunk_size: 512,
            max_lines: 200,
            include_docs: true,
            include_imports: true,
            function_nodes: vec![
                "function_item",
                "function_signature_item",
                "closure_expression",
            ],
            class_nodes: vec![
                "struct_item",
                "enum_item",
                "impl_item",
            ],
            interface_nodes: vec![
                "trait_item",
                "type_alias_item",
            ],
            import_nodes: vec![
                "use_declaration",
                "mod_item",
                "use_wildcard",
            ],
        }
    }

    /// Get configuration for Go
    pub fn go() -> Self {
        LanguageConfig {
            preferred_chunk_size: 512,
            max_lines: 200,
            include_docs: true,
            include_imports: true,
            function_nodes: vec![
                "function_declaration",
                "method_declaration",
            ],
            class_nodes: vec![
                "type_declaration",
                "type_spec",
            ],
            interface_nodes: vec![
                "interface_declaration",
                "interface_type",
            ],
            import_nodes: vec![
                "import_declaration",
                "import_spec",
            ],
        }
    }

    /// Get configuration for Java
    pub fn java() -> Self {
        LanguageConfig {
            preferred_chunk_size: 512,
            max_lines: 200,
            include_docs: true,
            include_imports: true,
            function_nodes: vec![
                "method_declaration",
                "constructor_declaration",
                "lambda_expression",
            ],
            class_nodes: vec![
                "class_declaration",
                "enum_declaration",
                "record_declaration",
            ],
            interface_nodes: vec![
                "interface_declaration",
                "annotation_declaration",
            ],
            import_nodes: vec![
                "import_declaration",
            ],
        }
    }

    /// Get configuration for C++
    pub fn cpp() -> Self {
        LanguageConfig {
            preferred_chunk_size: 512,
            max_lines: 200,
            include_docs: true,
            include_imports: true,
            function_nodes: vec![
                "function_definition",
                "function_declarator",
                "lambda_expression",
            ],
            class_nodes: vec![
                "class_specifier",
                "struct_specifier",
                "union_specifier",
            ],
            interface_nodes: vec![
                // C++ doesn't have formal interfaces
            ],
            import_nodes: vec![
                "include_declaration",
                "using_declaration",
            ],
        }
    }

    /// Check if a node is a function definition
    pub fn is_function_node(&self, node: &Node) -> bool {
        self.function_nodes.contains(&node.kind())
    }

    /// Check if a node is a class definition
    pub fn is_class_node(&self, node: &Node) -> bool {
        self.class_nodes.contains(&node.kind())
    }

    /// Check if a node is an interface/type definition
    pub fn is_interface_node(&self, node: &Node) -> bool {
        self.interface_nodes.contains(&node.kind())
    }

    /// Check if a node is an import statement
    pub fn is_import_node(&self, node: &Node) -> bool {
        self.import_nodes.contains(&node.kind())
    }
}

/// Get language configuration for a given language
pub fn get_language_config(language: &str) -> LanguageConfig {
    match language {
        "typescript" | "javascript" => LanguageConfig::typescript(),
        "python" => LanguageConfig::python(),
        "rust" => LanguageConfig::rust(),
        "go" => LanguageConfig::go(),
        "java" => LanguageConfig::java(),
        "cpp" | "c++" => LanguageConfig::cpp(),
        _ => LanguageConfig::typescript(), // Default to TypeScript
    }
}

/// Check if a language is supported
pub fn is_supported_language(language: &str) -> bool {
    matches!(
        language,
        "typescript" | "javascript" | "python" | "rust" | "go" | "java" | "cpp"
    )
}

/// Get list of supported languages
pub fn supported_languages() -> Vec<&'static str> {
    vec!["typescript", "javascript", "python", "rust", "go", "java", "cpp"]
}
