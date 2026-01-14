use crate::types::{FunctionInfo, ClassInfo, ImportInfo, ErrorNode, SourceLocation};
use tree_sitter::Node;

/// Extract all imports from the AST
pub fn extract_imports(root: &Node, source: &str) -> Vec<ImportInfo> {
    let mut imports = Vec::new();

    // Walk the tree and find import statements
    let mut cursor = root.walk();
    for child in root.children(&mut cursor) {
        match child.kind() {
            "import_statement" | "import_declaration" | "import_alias" |
            "export_statement" | "export_declaration" | "use_declaration" |
            "use_list" | "call_expression" => {
                if let Some(imp) = extract_import_info(&child, source) {
                    imports.push(imp);
                }
            }
            _ => {
                // Recurse into child nodes
                imports.extend(extract_imports(&child, source));
            }
        }
    }

    imports
}

/// Extract all functions from the AST
pub fn extract_functions(root: &Node, source: &str) -> Vec<FunctionInfo> {
    let mut functions = Vec::new();

    // Walk the tree and find function definitions
    let mut cursor = root.walk();
    for child in root.children(&mut cursor) {
        match child.kind() {
            "function_declaration" | "function_definition" | "method_definition" |
            "arrow_function" | "function_expression" => {
                if let Some(func) = extract_function_info(&child, source) {
                    functions.push(func);
                }
            }
            _ => {
                // Recurse into child nodes
                functions.extend(extract_functions(&child, source));
            }
        }
    }

    functions
}

/// Extract all classes from the AST
pub fn extract_classes(root: &Node, source: &str) -> Vec<ClassInfo> {
    let mut classes = Vec::new();

    let mut cursor = root.walk();
    for child in root.children(&mut cursor) {
        if child.kind() == "class_declaration" || child.kind() == "class_definition" ||
           child.kind() == "interface_declaration" || child.kind() == "type_declaration" {
            if let Some(class) = extract_class_info(&child, source) {
                classes.push(class);
            }
        } else {
            classes.extend(extract_classes(&child, source));
        }
    }

    classes
}

/// Extract information from a function node
fn extract_function_info(node: &Node, source: &str) -> Option<FunctionInfo> {
    let name_node = node.child_by_field_name("name")?;
    let name = name_node.utf8_text(source.as_bytes()).ok()?.to_string();

    let start_line = node.start_position().row + 1;
    let end_line = node.end_position().row + 1;

    // Extract signature
    let signature = source
        [node.start_byte()..node.child_by_field_name("body")?.start_byte()]
        .to_string();

    Some(FunctionInfo {
        name,
        signature,
        start_line,
        end_line,
        parameters: Vec::new(),
        return_type: None,
        is_async: node.child_by_field_name("async").is_some(),
        is_exported: false,
    })
}

/// Extract information from a class node
fn extract_class_info(node: &Node, source: &str) -> Option<ClassInfo> {
    let name_node = node.child_by_field_name("name")?;
    let name = name_node.utf8_text(source.as_bytes()).ok()?.to_string();

    let start_line = node.start_position().row + 1;
    let end_line = node.end_position().row + 1;

    // Extract methods
    let body_node = node.child_by_field_name("body")?;
    let mut methods = Vec::new();

    let mut cursor = body_node.walk();
    for child in body_node.children(&mut cursor) {
        if child.kind() == "method_definition" {
            if let Some(method) = extract_function_info(&child, source) {
                methods.push(method);
            }
        }
    }

    Some(ClassInfo {
        name,
        extends: None,
        implements: Vec::new(),
        methods,
        start_line,
        end_line,
    })
}

/// Find all error nodes in the tree
pub fn find_error_nodes(node: &Node, source: &str) -> Vec<ErrorNode> {
    let mut errors = Vec::new();

    if node.is_error() || node.is_missing() {
        errors.push(ErrorNode {
            message: "Syntax error".to_string(),
            location: SourceLocation {
                start_row: node.start_position().row,
                start_column: node.start_position().column,
                end_row: node.end_position().row,
                end_column: node.end_position().column,
            },
            text: source[node.byte_range()].to_string(),
        });
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        errors.extend(find_error_nodes(&child, source));
    }

    errors
}

/// Extract information from an import node
fn extract_import_info(node: &Node, source: &str) -> Option<ImportInfo> {
    let kind = node.kind();

    // Handle different import statement types
    let (source_text, imported_names) = match kind {
        "import_statement" | "import_declaration" => {
            // JavaScript/TypeScript imports
            let source_node = node.children(&mut node.walk()).find(|n| n.kind() == "string")?;
            let source_text = source_node.utf8_text(source.as_bytes()).ok()?
                .trim_matches('"').trim_matches('\'').to_string();

            let imported_names: Vec<String> = node.children(&mut node.walk())
                .filter(|n| n.kind() == "identifier" || n.kind() == "property_identifier")
                .filter_map(|n| n.utf8_text(source.as_bytes()).ok().map(|s| s.to_string()))
                .collect();

            (source_text, imported_names)
        }
        "use_declaration" => {
            // Rust use statements
            let argument = node.child_by_field_name("argument")?;
            let source_text = argument.utf8_text(source.as_bytes()).ok()?.to_string();

            let imported_names: Vec<String> = argument.children(&mut argument.walk())
                .filter(|n| n.kind() == "identifier")
                .filter_map(|n| n.utf8_text(source.as_bytes()).ok().map(|s| s.to_string()))
                .collect();

            (source_text, imported_names)
        }
        _ => return None,
    };

    let location = SourceLocation {
        start_row: node.start_position().row,
        start_column: node.start_position().column,
        end_row: node.end_position().row,
        end_column: node.end_position().column,
    };

    Some(ImportInfo {
        source: source_text,
        imported_names,
        is_type_only: kind.contains("type"),
        location,
    })
}
