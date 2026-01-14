#!/bin/bash

# ============================================================================
# PRISM v0.2 - Cloudflare Resources Setup Script
# ============================================================================
#
# This script creates all necessary Cloudflare resources for PRISM:
# - D1 Database
# - KV Namespace
# - R2 Bucket
# - Vectorize Index (optional)
#
# Usage:
#   ./scripts/setup-cloudflare.sh
#
# Prerequisites:
#   - wrangler installed and authenticated (wrangler login)
#
# @see docs/guide/12-worker-deployment.md

set -e  # Exit on error
set -u  # Exit on undefined variable

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Resource names
PROJECT_NAME="claudes-friend"
D1_DATABASE_NAME="${PROJECT_NAME}-db"
KV_NAMESPACE_NAME="PRISM_INDEX"
R2_BUCKET_NAME="${PROJECT_NAME}-storage"
VECTORIZE_INDEX_NAME="claudes-companion"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# SETUP FUNCTIONS
# ============================================================================

create_d1_database() {
    log_info "Creating D1 database: ${D1_DATABASE_NAME}"

    # Check if database already exists
    if wrangler d1 list 2>/dev/null | grep -q "${D1_DATABASE_NAME}"; then
        log_warning "D1 database '${D1_DATABASE_NAME}' already exists"
        wrangler d1 list | grep "${D1_DATABASE_NAME}"
    else
        # Create database
        output=$(wrangler d1 create "${D1_DATABASE_NAME}")
        log_success "Created D1 database"

        # Extract database ID
        database_id=$(echo "$output" | grep -oP 'database_id = "\K[^"]+')
        echo "D1_DATABASE_ID=${database_id}"
    fi
}

create_kv_namespace() {
    log_info "Creating KV namespace: ${KV_NAMESPACE_NAME}"

    # Check if namespace already exists
    if wrangler kv namespace list 2>/dev/null | grep -q "${KV_NAMESPACE_NAME}"; then
        log_warning "KV namespace '${KV_NAMESPACE_NAME}' already exists"
        wrangler kv namespace list | grep "${KV_NAMESPACE_NAME}"
    else
        # Create namespace
        output=$(wrangler kv namespace create "${KV_NAMESPACE_NAME}")
        log_success "Created KV namespace"

        # Extract namespace ID
        namespace_id=$(echo "$output" | grep -oP 'id = "\K[^"]+')
        echo "KV_NAMESPACE_ID=${namespace_id}"
    fi
}

create_r2_bucket() {
    log_info "Creating R2 bucket: ${R2_BUCKET_NAME}"

    # Check if bucket already exists
    if wrangler r2 bucket list 2>/dev/null | grep -q "${R2_BUCKET_NAME}"; then
        log_warning "R2 bucket '${R2_BUCKET_NAME}' already exists"
    else
        # Create bucket
        wrangler r2 bucket create "${R2_BUCKET_NAME}"
        log_success "Created R2 bucket"
    fi
}

create_vectorize_index() {
    log_info "Creating Vectorize index: ${VECTORIZE_INDEX_NAME}"
    log_warning "Vectorize is currently in beta - skip if not available"

    # Vectorize creation may fail if not enabled for account
    # This is optional for now
}

update_wrangler_toml() {
    log_info "To update wrangler.toml with your resource IDs:"
    echo ""
    echo "1. Run the above commands and note the IDs returned"
    echo "2. Uncomment the bindings in wrangler.toml"
    echo "3. Replace the empty IDs with your actual IDs:"
    echo ""
    echo "   [[d1_databases]]"
    echo "   binding = \"DB\""
    echo "   database_name = \"${D1_DATABASE_NAME}\""
    echo "   database_id = \"<YOUR_D1_DATABASE_ID>\""
    echo ""
    echo "   [[kv_namespaces]]"
    echo "   binding = \"KV\""
    echo "   id = \"<YOUR_KV_NAMESPACE_ID>\""
    echo ""
}

# ============================================================================
# MAIN SETUP FLOW
# ============================================================================

main() {
    cd "${PROJECT_ROOT}"

    log_info "Starting Cloudflare resources setup for ${PROJECT_NAME}"
    echo ""

    # Check if wrangler is authenticated
    log_info "Checking wrangler authentication..."
    if ! wrangler whoami &>/dev/null; then
        log_error "Not authenticated. Please run: wrangler login"
        exit 1
    fi
    log_success "Authenticated"
    echo ""

    # Create resources
    create_d1_database
    echo ""

    create_kv_namespace
    echo ""

    create_r2_bucket
    echo ""

    # create_vectorize_index
    # echo ""

    # Print instructions
    update_wrangler_toml

    log_success "Setup complete!"
    echo ""
    log_info "Next steps:"
    echo "  1. Update wrangler.toml with your resource IDs"
    echo "  2. Run migrations: wrangler d1 execute ${D1_DATABASE_NAME} --local --file=./migrations/002_vector_index.sql"
    echo "  3. Start dev server: wrangler dev"
    echo "  4. Deploy: wrangler deploy"
}

# Run main
main "$@"
