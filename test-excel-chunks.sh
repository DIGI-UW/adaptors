#!/bin/bash

# Enhanced test script for Excel chunking functionality
# Builds from within the projects/openfn-custom-adaptors directory

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🧪 OpenFn Custom Adaptors Test Suite${NC}"
echo -e "${GREEN}====================================${NC}"

# Function to print usage
usage() {
    echo "Usage: $0 [test_type]"
    echo "Test types:"
    echo "  all      - Run all tests (default)"
    echo "  build    - Build the project and verify output"
    echo "  unit     - Run unit tests only"
    echo "  xlsx     - Test Excel processing specifically"
    echo "  quick    - Run quick validation tests"
    echo "  shell    - Enter interactive shell in container"
    echo "  clean    - Clean up Docker containers and images"
    echo "  logs     - Show detailed build logs"
    exit 1
}

# Parse command line arguments
TEST_TYPE=${1:-all}

# Build the Docker image from current directory
build_image() {
    echo -e "${YELLOW}📦 Building Docker image from current directory...${NC}"
    
    # Build from the current directory (projects/openfn-custom-adaptors)
    docker build -t openfn-adaptors-test . || {
        echo -e "${RED}❌ Failed to build Docker image${NC}"
        return 1
    }
    
    echo -e "${GREEN}✅ Docker image built successfully${NC}"
    return 0
}

# Run tests in the proper workspace context
run_tests() {
    local test_cmd="$1"
    
    echo -e "${YELLOW}🧪 Running tests in workspace context...${NC}"
    
    docker run --rm -it \
        -v $(pwd):/workspace \
        openfn-adaptors-test \
        sh -c "$test_cmd" || {
        echo -e "${RED}❌ Tests failed${NC}"
        return 1
    }
    
    echo -e "${GREEN}✅ Tests completed successfully${NC}"
    return 0
}

# Clean up Docker resources
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up Docker resources...${NC}"
    
    # Stop and remove containers
    docker ps -a | grep openfn-adaptors-test | awk '{print $1}' | xargs -r docker stop
    docker ps -a | grep openfn-adaptors-test | awk '{print $1}' | xargs -r docker rm
    
    # Remove image
    docker images | grep openfn-adaptors-test | awk '{print $3}' | xargs -r docker rmi
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Main test execution
case "$TEST_TYPE" in
    "all")
        echo -e "${YELLOW}🚀 Running all tests...${NC}"
        build_image || exit 1
        run_tests "./test-built-adaptors.sh"
        ;;
    
    "build")
        echo -e "${YELLOW}🔨 Building and verifying project...${NC}"
        build_image || exit 1
        run_tests "echo '🔍 Build verification:' && ls -la published-adaptors/packages/ && echo '✅ Build completed'"
        ;;
    
    "unit")
        echo -e "${YELLOW}⚡ Running unit tests...${NC}"
        build_image || exit 1
        run_tests "npm test"
        ;;
    
    "xlsx")
        echo -e "${YELLOW}📊 Testing Excel processing...${NC}"
        build_image || exit 1
        run_tests "node test/getXLSX-unit.test.js"
        ;;
    
    "quick")
        echo -e "${YELLOW}⚡ Running quick validation tests...${NC}"
        build_image || exit 1
        run_tests "node test/quick-test.js"
        ;;
    
    "shell")
        echo -e "${YELLOW}💻 Entering interactive shell...${NC}"
        build_image || exit 1
        docker run --rm -it \
            -v $(pwd):/workspace \
            openfn-adaptors-test \
            sh
        ;;
    
    "clean")
        cleanup
        ;;
    
    "logs")
        echo -e "${YELLOW}📝 Building with detailed logs...${NC}"
        docker build --no-cache --progress=plain -t openfn-adaptors-test .
        ;;
    
    "help"|"-h"|"--help")
        usage
        ;;
    
    *)
        echo -e "${RED}❌ Unknown test type: $TEST_TYPE${NC}"
        usage
        ;;
esac

echo -e "${GREEN}🎉 Test execution completed!${NC}" 