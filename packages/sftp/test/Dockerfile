FROM node:18-alpine

# Install git (needed for some npm dependencies)
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy the published adaptors to a temp location
COPY published-adaptors/packages/common ./temp-packages/common
COPY published-adaptors/packages/http ./temp-packages/http
COPY published-adaptors/packages/sftp ./temp-packages/sftp

# Copy test files
COPY packages/sftp/test ./test

# Create a package.json that installs the published adaptors as proper npm packages
RUN echo '{ \
  "name": "sftp-test", \
  "version": "1.0.0", \
  "type": "module", \
  "scripts": { \
    "test": "mocha --experimental-specifier-resolution=node --no-warnings test/**/*.test.js", \
    "test:quick": "node test/quick-test.js", \
    "test:unit": "mocha --experimental-specifier-resolution=node --no-warnings test/getXLSX-unit.test.js", \
    "test:xlsx": "mocha --experimental-specifier-resolution=node --no-warnings test/xlsx*.test.js" \
  }, \
  "dependencies": { \
    "@openfn/language-common": "file:./temp-packages/common", \
    "@openfn/language-http": "file:./temp-packages/http", \
    "@openfn/language-sftp": "file:./temp-packages/sftp" \
  }, \
  "devDependencies": { \
    "chai": "^4.3.6", \
    "mocha": "^10.0.0" \
  } \
}' > package.json

# Install all dependencies (this will properly install the published adaptors)
RUN npm install

# Clean up temp packages
RUN rm -rf temp-packages

# Set environment variables for testing
ENV NODE_ENV=test
ENV NODE_OPTIONS="--experimental-specifier-resolution=node --no-warnings"

# Default command runs all tests
CMD ["npm", "test"] 