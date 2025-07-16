#!/bin/bash

# Docker-based testing script for SFTP Excel processing
# This script allows running all tests using Docker without requiring local npm installation

set -e  # Exit on any error

echo "🐳 Docker-based SFTP Excel Testing Suite"
echo "========================================"
echo "📍 Using published adaptors from: projects/openfn-custom-adaptors/published-adaptors/"

# Navigate to the SFTP package directory
cd "$(dirname "$0")/.."

# Configuration
IMAGE_NAME="sftp-excel-test"
CONTAINER_NAME="sftp-test-container"

# Parse command line arguments
TEST_TYPE="${1:-all}"
VERBOSE="${2:-false}"

# Function to build test image
build_test_image() {
    echo "🏗️  Building test Docker image..."
    echo "   Image: $IMAGE_NAME"
    echo "   Context: $(pwd)/../.."
    echo "   Using published adaptors: ../../published-adaptors/packages/"
    
    # Change to the parent directory for Docker build context
    cd ../..
    
    if [ "$VERBOSE" = "true" ]; then
        docker build -f packages/sftp/test/Dockerfile -t "$IMAGE_NAME" . --progress=plain
    else
        docker build -f packages/sftp/test/Dockerfile -t "$IMAGE_NAME" . -q
    fi
    
    # Return to original directory
    cd packages/sftp
    
    if [ $? -eq 0 ]; then
        echo "✅ Docker image built successfully"
    else
        echo "❌ Docker image build failed"
        exit 1
    fi
}

# Function to run tests in container
run_test_container() {
    local test_command="$1"
    local description="$2"
    
    echo "🚀 Running: $description"
    echo "   Command: $test_command"
    
    if [ "$VERBOSE" = "true" ]; then
        docker run --rm --name "$CONTAINER_NAME" "$IMAGE_NAME" $test_command
    else
        docker run --rm --name "$CONTAINER_NAME" "$IMAGE_NAME" $test_command
    fi
    
    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo "✅ $description completed successfully"
    else
        echo "❌ $description failed with exit code $exit_code"
        return $exit_code
    fi
}

# Function to cleanup Docker resources
cleanup() {
    echo "🧹 Cleaning up Docker resources..."
    
    # Stop and remove container if it exists
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "   Stopping container: $CONTAINER_NAME"
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
    fi
    
    # Remove image if it exists
    if docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:latest$"; then
        echo "   Removing image: $IMAGE_NAME"
        docker rmi "$IMAGE_NAME" 2>/dev/null || true
    fi
    
    echo "✅ Cleanup completed"
}

# Function to run interactive shell for debugging
run_debug_shell() {
    echo "🐚 Starting interactive shell for debugging..."
    echo "   Container: $CONTAINER_NAME"
    echo "   Available commands:"
    echo "     npm test        - Run all tests"
    echo "     npm run test:quick - Run quick test"
    echo "     npm run test:unit  - Run unit tests"
    echo "     npm run test:xlsx  - Run Excel tests"
    echo "     ls -la test/   - List test files"
    echo "     exit           - Exit container"
    
    docker run --rm -it --name "$CONTAINER_NAME" "$IMAGE_NAME" /bin/sh
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [TEST_TYPE] [VERBOSE]"
    echo ""
    echo "TEST_TYPE options:"
    echo "  all     - Run all tests (default)"
    echo "  unit    - Run unit tests only"
    echo "  xlsx    - Run Excel-related tests only"
    echo "  quick   - Run quick test script"
    echo "  shell   - Start interactive shell for debugging"
    echo "  clean   - Clean up Docker resources"
    echo ""
    echo "VERBOSE options:"
    echo "  true    - Show detailed output"
    echo "  false   - Show minimal output (default)"
    echo ""
    echo "Examples:"
    echo "  $0                  # Run all tests"
    echo "  $0 unit true        # Run unit tests with verbose output"
    echo "  $0 quick            # Run quick test"
    echo "  $0 shell            # Start debug shell"
    echo "  $0 clean            # Clean up Docker resources"
}

# Function to check if published adaptors exist
check_published_adaptors() {
    echo "🔍 Checking published adaptors..."
    
    local published_dir="../../published-adaptors/packages"
    
    if [ ! -d "$published_dir" ]; then
        echo "❌ Published adaptors not found at: $published_dir"
        echo "   Please run the build process first to generate published adaptors"
        echo "   Expected structure:"
        echo "     projects/openfn-custom-adaptors/published-adaptors/packages/common/"
        echo "     projects/openfn-custom-adaptors/published-adaptors/packages/sftp/"
        echo "     projects/openfn-custom-adaptors/published-adaptors/packages/http/"
        exit 1
    fi
    
    local required_packages=("common" "sftp" "http")
    for package in "${required_packages[@]}"; do
        if [ ! -d "$published_dir/$package" ]; then
            echo "❌ Required package not found: $published_dir/$package"
            exit 1
        fi
    done
    
    echo "✅ Published adaptors found and ready"
}

# Main execution
main() {
    case "$TEST_TYPE" in
        "help"|"-h"|"--help")
            show_usage
            exit 0
            ;;
        "clean")
            cleanup
            exit 0
            ;;
        "shell")
            check_published_adaptors
            build_test_image
            run_debug_shell
            exit 0
            ;;
        "all"|"unit"|"xlsx"|"quick")
            check_published_adaptors
            build_test_image
            
            case "$TEST_TYPE" in
                "all")
                    run_test_container "npm test" "All tests"
                    ;;
                "unit")
                    run_test_container "npm run test:unit" "Unit tests"
                    ;;
                "xlsx")
                    run_test_container "npm run test:xlsx" "Excel tests"
                    ;;
                "quick")
                    run_test_container "npm run test:quick" "Quick test"
                    ;;
            esac
            
            # Optional cleanup
            if [ "$VERBOSE" != "true" ]; then
                cleanup
            fi
            ;;
        *)
            echo "❌ Unknown test type: $TEST_TYPE"
            show_usage
            exit 1
            ;;
    esac
}

# Set up trap for cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"

echo "🎉 Testing completed!" 