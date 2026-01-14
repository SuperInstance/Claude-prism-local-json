#!/bin/bash

# ============================================================================
# PRISM v0.2 - Cloudflare Workers Deployment Script
# ============================================================================
#
# This script automates the deployment of PRISM to Cloudflare Workers,
# including D1 database setup, KV namespace creation, and Worker deployment.
#
# Prerequisites:
# - Wrangler CLI installed (npm install -g wrangler)
# - Cloudflare account with API token
# - Authenticated with Wrangler (wrangler login)
#
# Usage:
#   ./scripts/deploy.sh            # Deploy to development
#   ./scripts/deploy.sh production # Deploy to production
#
# @see docs/guide/12-worker-deployment.md

set -e  # Exit on error
set -u  # Exit on undefined variable

# ============================================================================
# CONFIGURATION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Cloudflare resource names
PROJECT_NAME="claudes-friend"
WORKER_NAME="prism-worker"
D1_DATABASE_NAME="${PROJECT_NAME}-db"
KV_NAMESPACE_NAME="PRISM_INDEX"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed"
        exit 1
    fi
}

confirm() {
    read -p "$1 (y/N): " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# ============================================================================
# PRE-FLIGHT CHECKS
# ============================================================================

preflight_checks() {
    log_info "Running pre-flight checks..."

    # Check required commands
    check_command "wrangler"
    check_command "node"
    check_command "npm"

    # Check if logged in to Wrangler
    if ! wrangler whoami &> /dev/null; then
        log_error "Not logged in to Cloudflare. Run 'wrangler login' first."
        exit 1
    fi

    # Check if wrangler.toml exists
    if [ ! -f "${PROJECT_ROOT}/wrangler.toml" ]; then
        log_error "wrangler.toml not found at ${PROJECT_ROOT}"
        exit 1
    fi

    # Change to project directory
    cd "${PROJECT_ROOT}"

    log_success "Pre-flight checks passed"
}

# ============================================================================
# BUILD
# ============================================================================

build_project() {
    log_info "Building project..."

    # Install dependencies
    log_info "Installing dependencies..."
    npm install

    # Run TypeScript compiler
    log_info "Compiling TypeScript..."
    npm run build

    log_success "Build completed"
}

# ============================================================================
# D1 DATABASE SETUP
# ============================================================================

setup_d1_database() {
    log_info "Setting up D1 database..."

    # Check if database already exists
    if wrangler d1 list --json 2>/dev/null | grep -q "${D1_DATABASE_NAME}"; then
        log_warning "D1 database '${D1_DATABASE_NAME}' already exists"
        if confirm "Do you want to recreate it? This will delete all data."; then
            log_info "Deleting existing database..."
            wrangler d1 delete "${D1_DATABASE_NAME}" --force || true
        else
            log_info "Using existing database"
            return
        fi
    fi

    # Create D1 database
    log_info "Creating D1 database '${D1_DATABASE_NAME}'..."
    DB_OUTPUT=$(wrangler d1 create "${D1_DATABASE_NAME}")
    log_success "D1 database created"

    # Extract database ID
    DATABASE_ID=$(echo "$DB_OUTPUT" | grep -oP '(?<=database_id = ")[^"]*')
    if [ -z "$DATABASE_ID" ]; then
        log_error "Failed to extract database ID"
        exit 1
    fi

    # Update wrangler.toml with database ID
    log_info "Updating wrangler.toml with database ID..."
    if grep -q "\[\[d1_databases\]\]" "${PROJECT_ROOT}/wrangler.toml"; then
        # Update existing configuration
        sed -i "s/database_name = \"${D1_DATABASE_NAME}\"/database_name = \"${D1_DATABASE_NAME}\"/" "${PROJECT_ROOT}/wrangler.toml"
        sed -i "/database_name = \"${D1_DATABASE_NAME}\"/,+1 s/database_id = \".*\"/database_id = \"${DATABASE_ID}\"/" "${PROJECT_ROOT}/wrangler.toml"
    else
        # Add new configuration
        cat >> "${PROJECT_ROOT}/wrangler.toml" << EOF

[[d1_databases]]
binding = "DB"
database_name = "${D1_DATABASE_NAME}"
database_id = "${DATABASE_ID}"
EOF
    fi

    # Run migrations
    log_info "Running database migrations..."
    wrangler d1 execute "${D1_DATABASE_NAME}" --file="${PROJECT_ROOT}/migrations/001_initial.sql" --local
    wrangler d1 execute "${D1_DATABASE_NAME}" --file="${PROJECT_ROOT}/migrations/002_vector_index.sql" --local

    log_success "D1 database setup completed"
}

# ============================================================================
# KV NAMESPACE SETUP
# ============================================================================

setup_kv_namespace() {
    log_info "Setting up KV namespace..."

    # Check if namespace already exists
    if wrangler kv:namespace list --json 2>/dev/null | grep -q "${KV_NAMESPACE_NAME}"; then
        log_warning "KV namespace '${KV_NAMESPACE_NAME}' already exists"
        log_info "Using existing namespace"
        return
    fi

    # Create KV namespace
    log_info "Creating KV namespace '${KV_NAMESPACE_NAME}'..."
    KV_OUTPUT=$(wrangler kv:namespace create "${KV_NAMESPACE_NAME}")
    log_success "KV namespace created"

    # Extract namespace ID
    NAMESPACE_ID=$(echo "$KV_OUTPUT" | grep -oP '(?<=id = ")[^"]*')
    if [ -z "$NAMESPACE_ID" ]; then
        log_warning "Failed to extract namespace ID, using title instead"
    fi

    # Update wrangler.toml with namespace ID
    log_info "Updating wrangler.toml with namespace ID..."
    if grep -q "\[\[kv_namespaces\]\]" "${PROJECT_ROOT}/wrangler.toml"; then
        # Update existing configuration
        sed -i "/binding = \"KV\"/,+1 s/id = \".*\"/id = \"${NAMESPACE_ID}\"/" "${PROJECT_ROOT}/wrangler.toml" 2>/dev/null || true
    else
        # Add new configuration
        cat >> "${PROJECT_ROOT}/wrangler.toml" << EOF

[[kv_namespaces]]
binding = "KV"
id = "${NAMESPACE_ID}"
EOF
    fi

    log_success "KV namespace setup completed"
}

# ============================================================================
# DEPLOY WORKER
# ============================================================================

deploy_worker() {
    local environment=${1:-development}

    log_info "Deploying Worker to ${environment}..."

    if [ "$environment" = "production" ]; then
        wrangler deploy --env production
    else
        wrangler deploy
    fi

    log_success "Worker deployed successfully"
}

# ============================================================================
# POST-DEPLOYMENT VERIFICATION
# ============================================================================

verify_deployment() {
    local environment=${1:-development}
    local worker_url

    if [ "$environment" = "production" ]; then
        worker_url="https://${WORKER_NAME}.${PROJECT_NAME}.workers.dev"
    else
        worker_url="https://${WORKER_NAME}.${PROJECT_NAME}.workers.dev"
    fi

    log_info "Verifying deployment at ${worker_url}..."

    # Test health endpoint
    if command -v curl &> /dev/null; then
        RESPONSE=$(curl -s "${worker_url}/health")
        if echo "$RESPONSE" | grep -q "healthy"; then
            log_success "Health check passed"
        else
            log_warning "Health check failed or unexpected response"
            log_info "Response: $RESPONSE"
        fi
    else
        log_warning "curl not available, skipping health check"
    fi

    log_info "You can test your Worker at: ${worker_url}"
}

# ============================================================================
# CLEANUP (OPTIONAL)
# ============================================================================

cleanup_resources() {
    if confirm "Do you want to delete all Cloudflare resources?"; then
        log_warning "This will delete the Worker, D1 database, and KV namespace"
        if confirm "Are you really sure?"; then
            log_info "Deleting Worker..."
            wrangler delete || true

            log_info "Deleting D1 database..."
            wrangler d1 delete "${D1_DATABASE_NAME}" --force || true

            log_info "Deleting KV namespace..."
            wrangler kv:namespace delete "${KV_NAMESPACE_NAME}" --force || true

            log_success "Cleanup completed"
        fi
    fi
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    local environment=${1:-development}
    local skip_build=false
    local skip_d1=false
    local skip_kv=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                skip_build=true
                shift
                ;;
            --skip-d1)
                skip_d1=true
                shift
                ;;
            --skip-kv)
                skip_kv=true
                shift
                ;;
            --cleanup)
                cleanup_resources
                exit 0
                ;;
            -h|--help)
                echo "Usage: $0 [environment] [options]"
                echo ""
                echo "Arguments:"
                echo "  environment    Deployment environment (default: development)"
                echo ""
                echo "Options:"
                echo "  --skip-build   Skip build step"
                echo "  --skip-d1      Skip D1 database setup"
                echo "  --skip-kv      Skip KV namespace setup"
                echo "  --cleanup      Delete all resources"
                echo "  -h, --help     Show this help message"
                exit 0
                ;;
            *)
                if [[ ! $1 =~ ^-- ]]; then
                    environment=$1
                fi
                shift
                ;;
        esac
    done

    echo "================================================"
    echo "  PRISM v0.2 - Cloudflare Workers Deployment"
    echo "  Environment: ${environment}"
    echo "================================================"
    echo ""

    # Run deployment steps
    preflight_checks

    if [ "$skip_build" = false ]; then
        build_project
    fi

    if [ "$skip_d1" = false ]; then
        setup_d1_database
    fi

    if [ "$skip_kv" = false ]; then
        setup_kv_namespace
    fi

    deploy_worker "$environment"
    verify_deployment "$environment"

    echo ""
    echo "================================================"
    log_success "Deployment completed successfully!"
    echo "================================================"
    echo ""
    echo "Next steps:"
    echo "  1. Test your Worker: https://${WORKER_NAME}.${PROJECT_NAME}.workers.dev"
    echo "  2. View logs: wrangler tail"
    echo "  3. Run tests: npm test"
    echo ""
}

# Run main function with all arguments
main "$@"
