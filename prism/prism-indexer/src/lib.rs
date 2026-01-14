mod parser;
mod error;
mod types;
mod chunker;
mod extractor;
mod language;

use wasm_bindgen::prelude::*;

// Re-export the main parser and types
pub use parser::PrismParser;
pub use error::PrismError;
pub use types::*;

// Re-export chunker utilities for testing
pub use chunker::{
    DEFAULT_CHUNK_SIZE,
    DEFAULT_OVERLAP,
    MAX_CHUNK_SIZE,
    MIN_CHUNK_SIZE,
    MAX_LINES_PER_CHUNK,
    MIN_LINES_PER_CHUNK,
    chunk_code,
    split_large_chunk,
};

// Re-export language configuration
pub use language::{
    get_language_config,
    is_supported_language,
    supported_languages,
    LanguageConfig,
};

/// Initialize the WASM module
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

/// Create a new parser instance
#[wasm_bindgen]
pub fn create_parser(language: &str) -> Result<PrismParser, JsValue> {
    PrismParser::new(language).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Parse code and extract chunks (convenience function)
#[wasm_bindgen]
pub fn parse_code(code: &str, language: &str) -> Result<JsValue, JsValue> {
    let mut parser = PrismParser::new(language)?;
    let result = parser.parse(code)?;
    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Get supported languages
#[wasm_bindgen]
pub fn get_supported_languages() -> JsValue {
    let languages = language::supported_languages();
    serde_wasm_bindgen::to_value(&languages).unwrap_or_else(|_| JsValue::NULL)
}

/// Get version information
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
