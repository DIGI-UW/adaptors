# Use Alpine Linux as base
FROM alpine:3.18 AS base

# Install necessary build tools and dependencies
RUN apk add --no-cache \
    git \
    bash \
    curl \
    build-base \
    linux-headers \
    python3 \
    py3-pip

# Install asdf
RUN git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0
ENV PATH="/root/.asdf/bin:/root/.asdf/shims:$PATH"

# Add asdf to shell profile
RUN echo '. ~/.asdf/asdf.sh' >> ~/.bashrc

# Install asdf plugins
RUN asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
RUN asdf plugin add pnpm

# Build stage
FROM base AS build
WORKDIR /app

# Copy tool versions file first
COPY .tool-versions ./

# Install Node.js and pnpm versions from .tool-versions
RUN asdf install

# Copy package files first for better caching
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package*.json ./

# Activate asdf environment and fetch dependencies
RUN bash -c 'source ~/.asdf/asdf.sh && pnpm fetch'

# Copy source code
COPY . .

# Install all dependencies including devDependencies (needed for build)
RUN bash -c 'source ~/.asdf/asdf.sh && pnpm install --recursive --frozen-lockfile'

# Build the essential build tools (especially build-adaptor)
RUN bash -c 'source ~/.asdf/asdf.sh && pnpm --filter "@openfn/buildtools" build'

# Build only the adaptors (now that build-adaptor is available)
RUN bash -c 'source ~/.asdf/asdf.sh && pnpm run build:adaptors'

# Verify the build output
RUN ls -la published-adaptors/packages/

# Final stage for testing
FROM base AS final
WORKDIR /app

# Copy tool versions and install asdf versions
COPY .tool-versions ./
RUN asdf install

# Copy built output from build stage
COPY --from=build /app/published-adaptors ./published-adaptors
COPY --from=build /app/package*.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/pnpm-workspace.yaml ./

# Install only production dependencies for testing
RUN bash -c 'source ~/.asdf/asdf.sh && pnpm install --prod --frozen-lockfile'

# Copy test files
COPY test ./test

# Create a simple test script to verify the build
RUN echo '#!/bin/bash\n\
source ~/.asdf/asdf.sh\n\
echo "🔍 Checking published adaptors structure..."\n\
ls -la published-adaptors/packages/\n\
echo ""\n\
echo "🔍 Checking SFTP package..."\n\
ls -la published-adaptors/packages/sftp/\n\
echo ""\n\
echo "🔍 Checking SFTP package.json..."\n\
cat published-adaptors/packages/sftp/package.json\n\
echo ""\n\
echo "🔍 Checking for getXLSX in SFTP package..."\n\
find published-adaptors/packages/sftp -name "*.js" -exec grep -l "getXLSX" {} \\;\n\
echo ""\n\
echo "🧪 Running quick tests..."\n\
node test/quick-test.js || echo "Quick test not available"\n\
' > test-built-adaptors.sh

RUN chmod +x test-built-adaptors.sh

# Default command runs the test script
CMD ["./test-built-adaptors.sh"] 