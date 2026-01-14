use crate::types::{CodeChunk, FunctionInfo, ClassInfo, ImportInfo};
use tree_sitter::Node;
use uuid::Uuid;

/// Default chunk size (in tokens)
pub const DEFAULT_CHUNK_SIZE: usize = 512;
pub const DEFAULT_OVERLAP: usize = 128;
pub const MAX_CHUNK_SIZE: usize = 1000;
pub const MIN_CHUNK_SIZE: usize = 50;

/// Maximum lines for a single chunk
pub const MAX_LINES_PER_CHUNK: usize = 200;

/// Minimum lines for a chunk (unless it's the only content)
pub const MIN_LINES_PER_CHUNK: usize = 5;

/// Chunk code into semantic units at function/class level
pub fn chunk_code(root: &Node, source: &str, language: &str) -> Vec<CodeChunk> {
    let mut chunks = Vec::new();

    // Extract imports first (for context)
    let imports = crate::extractor::extract_imports(root, source);

    // Extract functions and classes
    let functions = crate::extractor::extract_functions(root, source);
    let classes = crate::extractor::extract_classes(root, source);

    // Strategy: Create chunks at function/class level
    // 1. Each top-level function becomes a chunk
    // 2. Each class becomes a chunk (with methods as sub-chunks if too large)
    // 3. Remaining top-level code becomes chunks

    let source_lines: Vec<&str> =.source.lines().collect();

    // Track which lines are already covered
    let mut covered_lines = vec![false; source_lines.len()];

    // Process classes first
    for class in &classes {
        let chunk = create_class_chunk(class, source, language, &imports);
        mark_lines_covered(&mut covered_lines, chunk.start_line, chunk.end_line);
        chunks.push(chunk);
    }

    // Process standalone functions
    for func in &functions {
        // Skip if this function is inside a class (already covered)
        if is_inside_class(func, &classes) {
            continue;
        }

        let chunk = create_function_chunk(func, source, language, &imports);
        mark_lines_covered(&mut covered_lines, chunk.start_line, chunk.end_line);
        chunks.push(chunk);
    }

    // Create chunks for uncovered top-level code
    let uncovered_chunks = create_uncovered_chunks(
        &covered_lines,
        source,
        language,
        &imports,
    );
    chunks.extend(uncovered_chunks);

    chunks
}

/// Create a chunk for a class
fn create_class_chunk(
    class: &ClassInfo,
    source: &str,
    language: &str,
    imports: &[ImportInfo],
) -> CodeChunk {
    let source_lines: Vec<&str> = source.lines().collect();

    // Extract class content with surrounding context
    let start_idx = class.start_line.saturating_sub(1);
    let end_idx = class.end_line.min(source_lines.len());

    let text = source_lines[start_idx..end_idx].join("\n");
    let token_count = estimate_tokens(&text);

    CodeChunk {
        id: Uuid::new_v4().to_string(),
        text,
        start_line: class.start_line,
        end_line: class.end_line,
        tokens: token_count,
        language: language.to_string(),
        functions: class.methods.clone(),
        classes: vec![class.clone()],
        imports: imports.to_vec(),
        dependencies: extract_dependencies(&text),
    }
}

/// Create a chunk for a function
fn create_function_chunk(
    func: &FunctionInfo,
    source: &str,
    language: &str,
    imports: &[ImportInfo],
) -> CodeChunk {
    let source_lines: Vec<&str> = source.lines().collect();

    // Extract function content with surrounding context (comments, types)
    let start_idx = func.start_line.saturating_sub(1);
    let end_idx = func.end_line.min(source_lines.len());

    // Look for preceding comments
    let context_start = find_preceding_context(&source_lines, start_idx);

    let text = source_lines[context_start..end_idx].join("\n");
    let token_count = estimate_tokens(&text);

    CodeChunk {
        id: Uuid::new_v4().to_string(),
        text,
        start_line: context_start + 1,
        end_line: func.end_line,
        tokens: token_count,
        language: language.to_string(),
        functions: vec![func.clone()],
        classes: Vec::new(),
        imports: imports.to_vec(),
        dependencies: extract_dependencies(&text),
    }
}

/// Create chunks for uncovered top-level code
fn create_uncovered_chunks(
    covered_lines: &[bool],
    source: &str,
    language: &str,
    imports: &[ImportInfo],
) -> Vec<CodeChunk> {
    let mut chunks = Vec::new();
    let source_lines: Vec<&str> = source.lines().collect();

    let mut start_idx = 0;
    while start_idx < covered_lines.len() {
        // Find next uncovered line
        while start_idx < covered_lines.len() && covered_lines[start_idx] {
            start_idx += 1;
        }

        if start_idx >= covered_lines.len() {
            break;
        }

        // Find end of this uncovered section
        let mut end_idx = start_idx;
        while end_idx < covered_lines.len() && !covered_lines[end_idx] {
            end_idx += 1;
        }

        // Create chunk for this section
        let lines_count = end_idx - start_idx;

        if lines_count >= MIN_LINES_PER_CHUNK {
            // Split large sections into smaller chunks
            let chunk_size = MAX_LINES_PER_CHUNK.min(lines_count);
            for i in (start_idx..end_idx).step_by(chunk_size) {
                let chunk_end = (i + chunk_size).min(end_idx);
                let text = source_lines[i..chunk_end].join("\n");

                if text.trim().len() >= MIN_CHUNK_SIZE {
                    chunks.push(CodeChunk {
                        id: Uuid::new_v4().to_string(),
                        text,
                        start_line: i + 1,
                        end_line: chunk_end,
                        tokens: estimate_tokens(&text),
                        language: language.to_string(),
                        functions: Vec::new(),
                        classes: Vec::new(),
                        imports: imports.to_vec(),
                        dependencies: extract_dependencies(&text),
                    });
                }
            }
        }

        start_idx = end_idx;
    }

    chunks
}

/// Find preceding context (comments, blank lines) for a chunk
fn find_preceding_context(lines: &[&str], start_idx: usize) -> usize {
    let mut context_start = start_idx;

    // Look back up to 3 lines for context
    for i in (0..3).rev() {
        if start_idx > i {
            let line = lines[start_idx - i - 1];
            if line.trim().is_empty() || line.trim().starts_with("//") || line.trim().starts_with("*") {
                context_start = start_idx - i - 1;
            } else {
                break;
            }
        }
    }

    context_start
}

/// Mark lines as covered
fn mark_lines_covered(covered_lines: &mut [bool], start_line: usize, end_line: usize) {
    let start_idx = start_line.saturating_sub(1);
    let end_idx = end_line.min(covered_lines.len());

    for i in start_idx..end_idx {
        covered_lines[i] = true;
    }
}

/// Check if a function is inside a class
fn is_inside_class(func: &FunctionInfo, classes: &[ClassInfo]) -> bool {
    for class in classes {
        if func.start_line >= class.start_line && func.end_line <= class.end_line {
            return true;
        }
    }
    false
}

/// Extract dependencies from code text
fn extract_dependencies(text: &str) -> Vec<String> {
    let mut deps = Vec::new();

    // Simple extraction of import statements
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with("import ") || line.starts_with("use ") || line.starts_with("require(") {
            deps.push(line.to_string());
        }
    }

    deps
}

/// Estimate token count from text
fn estimate_tokens(text: &str) -> usize {
    if text.is_empty() {
        return 0;
    }

    // More accurate token estimation
    // Average: ~4 characters per token for code
    let count = text.len() / 4;

    // Minimum of 1 token for non-empty text
    count.max(1)
}

/// Split large chunks into smaller pieces
pub fn split_large_chunk(chunk: &CodeChunk, target_size: usize) -> Vec<CodeChunk> {
    if chunk.tokens <= target_size {
        return vec![chunk.clone()];
    }

    let mut chunks = Vec::new();
    let lines: Vec<&str> = chunk.text.lines().collect();

    // Try to split at logical boundaries
    let mut current_start = 0;
    let mut current_size = 0;

    for (i, line) in lines.iter().enumerate() {
        let line_tokens = estimate_tokens(line);

        if current_size + line_tokens > target_size && current_start < i {
            // Create chunk up to this point
            let chunk_text = lines[current_start..i].join("\n");

            chunks.push(CodeChunk {
                id: Uuid::new_v4().to_string(),
                text: chunk_text.clone(),
                start_line: chunk.start_line + current_start,
                end_line: chunk.start_line + i,
                tokens: current_size,
                language: chunk.language.clone(),
                functions: chunk.functions.clone(),
                classes: chunk.classes.clone(),
                imports: chunk.imports.clone(),
                dependencies: chunk.dependencies.clone(),
            });

            current_start = i;
            current_size = line_tokens;
        } else {
            current_size += line_tokens;
        }
    }

    // Add final chunk
    if current_start < lines.len() {
        let chunk_text = lines[current_start..].join("\n");

        chunks.push(CodeChunk {
            id: Uuid::new_v4().to_string(),
            text: chunk_text,
            start_line: chunk.start_line + current_start,
            end_line: chunk.end_line,
            tokens: current_size,
            language: chunk.language.clone(),
            functions: chunk.functions.clone(),
            classes: chunk.classes.clone(),
            imports: chunk.imports.clone(),
            dependencies: chunk.dependencies.clone(),
        });
    }

    chunks
}
