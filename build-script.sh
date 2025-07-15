#!/bin/bash
set -e

# Source asdf to ensure tools are available
source ~/.asdf/asdf.sh

echo "🏗️  Building OpenFn adaptors with targeted approach..."

# Strategy 1: Try to use pnpm deploy for minimal installation
echo "📦 Attempting targeted build using pnpm deploy..."

# First, try to install only the specific packages we need
if pnpm --filter '@openfn/language-common' --filter '@openfn/language-sftp' install; then
    echo "✅ Successfully installed dependencies for target packages only"
else
    echo "⚠️  Targeted install failed, falling back to full workspace install..."
    pnpm install
fi

# Build the specific packages we need
echo "🔨 Building @openfn/language-common..."
pnpm --filter '@openfn/language-common' build

echo "🔨 Building @openfn/language-sftp..."
pnpm --filter '@openfn/language-sftp' build

echo "✅ Build completed successfully!"
echo "📁 Built packages:"
echo "   - packages/common/dist/"
echo "   - packages/sftp/dist/"

# List the built files for verification
if [ -d "packages/common/dist" ]; then
    echo "📋 Common package build output:"
    ls -la packages/common/dist/
fi

if [ -d "packages/sftp/dist" ]; then
    echo "📋 SFTP package build output:"
    ls -la packages/sftp/dist/
fi 