#!/bin/bash

set -e

TEST_FILE="${1}"
DEBUG="${2}"

if [[ -z "$TEST_FILE" ]]; then
    echo "Usage: $0 <test-file> [debug]"
    echo "Examples:"
    echo "  $0 getXLSX-unit.test.js"
    echo "  $0 getXLSX-unit.test.js debug"
    exit 1
fi

# Navigate to monorepo root
cd "$(dirname "$0")/../../.."

IMAGE_NAME="openfn-sftp"
CONTAINER_NAME="sftp-test-$$"

# Build image
echo "Building..."
docker build -f packages/sftp/test/Dockerfile -t "$IMAGE_NAME" --target test .

if [[ "$DEBUG" == "debug" ]]; then
    echo "Debug mode - connect debugger to localhost:9229"
    docker run --rm -it \
        --name "$CONTAINER_NAME" \
        -p 9229:9229 \
        "$IMAGE_NAME" \
        bash -c "source ~/.asdf/asdf.sh && node --inspect-brk=0.0.0.0:9229 --experimental-specifier-resolution=node --no-warnings ./node_modules/.bin/mocha test/$TEST_FILE"
else
    echo "Running test..."
    docker run --rm \
        --name "$CONTAINER_NAME" \
        "$IMAGE_NAME" \
        bash -c "source ~/.asdf/asdf.sh && pnpm exec mocha --experimental-specifier-resolution=node --no-warnings test/$TEST_FILE"
fi

echo "Done." 