#!/bin/bash

echo "🔧 Testing Excel chunking logic with Docker..."

# Navigate to the SFTP package directory
cd "$(dirname "$0")/.."

# Build the test image using the correct context and Dockerfile
echo "🏗️  Building test Docker image..."
docker build -f test/Dockerfile -t sftp-excel-test .

# Run the test with testdouble loader for ES module mocking
echo "🚀 Running Excel chunking tests..."
docker run --rm sftp-excel-test npm test -- --loader=testdouble

echo "✅ Excel chunking tests completed!" 