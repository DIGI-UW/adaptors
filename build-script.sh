#!/bin/bash
set -e

# Source asdf to ensure tools are available
source ~/.asdf/asdf.sh

echo "🏗️  Building and deploying OpenFn adaptors using pnpm deploy..."

# Install dependencies
echo "📦 Installing workspace dependencies..."
pnpm install --force

# Build the specific packages we need
echo "🔨 Building @openfn/language-common..."
pnpm --filter '@openfn/language-common' build

echo "🔨 Building @openfn/language-sftp..."
pnpm --filter '@openfn/language-sftp' build

echo "🔨 Building @openfn/language-dhis2..."
pnpm --filter '@openfn/language-dhis2' build

echo "🔨 Building @openfn/language-http..."
pnpm --filter '@openfn/language-http' build

# Create a clean "published" adaptors repository structure using pnpm deploy
echo "📦 Deploying packages using pnpm deploy..."
rm -rf /workspace/published-adaptors
mkdir -p /workspace/published-adaptors/packages

# Deploy common package (creates self-contained package with all dependencies)
echo "📦 Deploying common package..."
pnpm --filter '@openfn/language-common' --prod deploy /workspace/published-adaptors/packages/common

# Deploy sftp package (creates self-contained package with all dependencies)  
echo "📦 Deploying sftp package..."
pnpm --filter '@openfn/language-sftp' --prod deploy /workspace/published-adaptors/packages/sftp

# Deploy dhis2 package (creates self-contained package with all dependencies)
echo "📦 Deploying dhis2 package..."
pnpm --filter '@openfn/language-dhis2' --prod deploy /workspace/published-adaptors/packages/dhis2

# Deploy http package (creates self-contained package with all dependencies)
echo "📦 Deploying http package..."
pnpm --filter '@openfn/language-http' --prod deploy /workspace/published-adaptors/packages/http

echo "✅ Build and deploy completed successfully!"
echo "📁 Published adaptors repository at: /workspace/published-adaptors/"
echo "   - packages/common/ (self-contained npm-style package with dependencies)"
echo "   - packages/sftp/ (self-contained npm-style package with dependencies)"
echo "   - packages/dhis2/ (self-contained npm-style package with dependencies)"
echo "   - packages/http/ (self-contained npm-style package with dependencies)"

