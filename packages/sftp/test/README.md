# SFTP Excel Testing Suite

This directory contains a comprehensive Docker-based testing suite for the SFTP Excel processing functionality. The tests are designed to run entirely in Docker containers using the published adaptors, so you don't need to install npm or Node.js dependencies locally.

## 🚀 Quick Start

```bash
# Navigate to the SFTP package directory
cd projects/openfn-custom-adaptors/packages/sftp

# Make the test script executable
chmod +x test/test-excel-chunks.sh

# Run all tests
./test/test-excel-chunks.sh
```

## 📦 Published Adaptors

The testing system now uses the published adaptors from the new build system:

```
projects/openfn-custom-adaptors/published-adaptors/packages/
├── common/          # @openfn/language-common
├── http/            # @openfn/language-http
├── sftp/            # @openfn/language-sftp
└── dhis2/           # @openfn/language-dhis2
```

**Important**: Make sure the published adaptors are built before running tests:

```bash
# Build the published adaptors first (if not already done)
cd projects/openfn-custom-adaptors
npm run build  # Or whatever build command generates the published adaptors
```

## 🧪 Test Script Options

The `test-excel-chunks.sh` script supports various options:

### Test Types

- **`all`** (default): Run all tests in sequence
- **`unit`**: Run only unit tests for getXLSX function
- **`xlsx`**: Run Excel-related tests
- **`quick`**: Run quick test script to verify basic functionality
- **`shell`**: Start interactive shell for debugging
- **`clean`**: Clean up Docker resources

### Verbosity

- **`false`** (default): Minimal output
- **`true`**: Detailed output including build logs

### Usage Examples

```bash
# Run all tests (default)
./test/test-excel-chunks.sh

# Run unit tests with verbose output
./test/test-excel-chunks.sh unit true

# Run quick test to verify setup
./test/test-excel-chunks.sh quick

# Start interactive shell for debugging
./test/test-excel-chunks.sh shell

# Clean up Docker resources
./test/test-excel-chunks.sh clean
```

## 🐳 Docker Architecture

The testing system uses a multi-layer Docker approach:

### Published Adaptors Layer
- Copies pre-built packages from `published-adaptors/packages/`
- Sets up proper `node_modules` structure
- Installs testing dependencies

### Test Layer
- Copies test files from `test/` directory
- Configures test environment
- Sets up test runners

### Container Structure
```
/app/
├── node_modules/
│   └── @openfn/
│       ├── language-common/     # From published-adaptors/packages/common/
│       ├── language-http/       # From published-adaptors/packages/http/
│       └── language-sftp/       # From published-adaptors/packages/sftp/
├── test/
│   ├── getXLSX-unit.test.js
│   ├── quick-test.js
│   └── *.test.js
└── package.json                 # Generated with test scripts
```

## 🧪 Test Files

### Core Test Files

#### `getXLSX-unit.test.js`
- **Purpose**: Unit tests for the getXLSX function
- **Coverage**: Function signatures, OpenFn patterns, options validation
- **Dependencies**: Uses published `@openfn/language-sftp` adaptor
- **Mocking**: Creates mock SFTP client for testing

#### `quick-test.js`
- **Purpose**: Quick verification of published adaptors
- **Coverage**: Module imports, Excel processing, basic functionality
- **Usage**: `npm run test:quick` or `./test/test-excel-chunks.sh quick`

#### `xlsx.test.js` (if exists)
- **Purpose**: Excel-specific integration tests
- **Coverage**: Excel file processing, streaming, memory management

#### `xlsx-integration.test.js` (if exists)
- **Purpose**: End-to-end Excel processing tests
- **Coverage**: Full workflow testing with real Excel files

### Test Data

The tests look for test data in the `test/data/` directory:

```bash
test/data/
└── ART_data_long_format.xlsx  # Test Excel file (optional)
```

**Note**: If the test Excel file is not present, the tests will create minimal mock Excel buffers for testing basic functionality.

## 🔧 Development and Debugging

### Interactive Shell

Start an interactive shell in the test container:

```bash
./test/test-excel-chunks.sh shell
```

Inside the container, you can:

```bash
# Run specific tests
npm test
npm run test:unit
npm run test:quick
npm run test:xlsx

# Explore the environment
ls -la test/
ls -la node_modules/@openfn/
node -e "console.log(require('@openfn/language-sftp'))"

# Debug test failures
node test/quick-test.js
```

### Manual Testing

You can also run individual test files:

```bash
# In the container shell
mocha test/getXLSX-unit.test.js
node test/quick-test.js
```

## 📊 Test Configuration

### Environment Variables

The Docker container sets these environment variables:

```bash
NODE_ENV=test
NODE_OPTIONS="--experimental-specifier-resolution=node --no-warnings"
```

### Test Scripts

The generated `package.json` includes these test scripts:

```json
{
  "scripts": {
    "test": "mocha --experimental-specifier-resolution=node --no-warnings test/**/*.test.js",
    "test:quick": "node test/quick-test.js",
    "test:unit": "mocha --experimental-specifier-resolution=node --no-warnings test/getXLSX-unit.test.js",
    "test:xlsx": "mocha --experimental-specifier-resolution=node --no-warnings test/xlsx*.test.js"
  }
}
```

## 🐛 Troubleshooting

### Common Issues

#### "Published adaptors not found"
```bash
❌ Published adaptors not found at: ../../../published-adaptors/packages
```

**Solution**: Build the published adaptors first:
```bash
cd projects/openfn-custom-adaptors
npm run build  # Or appropriate build command
```

#### "Docker build failed"
```bash
❌ Docker image build failed
```

**Solution**: Run with verbose output to see the error:
```bash
./test/test-excel-chunks.sh quick true
```

#### "Module import failures"
```bash
❌ Module import test failed: Cannot find module '@openfn/language-sftp'
```

**Solution**: Check that the published adaptors are properly structured:
```bash
ls -la projects/openfn-custom-adaptors/published-adaptors/packages/sftp/
```

### Debug Steps

1. **Verify published adaptors exist**:
   ```bash
   ls -la projects/openfn-custom-adaptors/published-adaptors/packages/
   ```

2. **Check Docker image**:
   ```bash
   docker images | grep sftp-excel-test
   ```

3. **Start interactive shell**:
   ```bash
   ./test/test-excel-chunks.sh shell
   ```

4. **Run tests step-by-step**:
   ```bash
   npm run test:quick
   npm run test:unit
   npm test
   ```

## 📝 Test Output

### Success Example

```
🐳 Docker-based SFTP Excel Testing Suite
========================================
📍 Using published adaptors from: projects/openfn-custom-adaptors/published-adaptors/

🔍 Checking published adaptors...
✅ Published adaptors found and ready

🏗️  Building test Docker image...
✅ Docker image built successfully

🚀 Running: Quick test
✅ Quick test completed successfully

🎉 Testing completed!
```

### Failure Example

```
❌ Published adaptors not found at: ../../../published-adaptors/packages
   Please run the build process first to generate published adaptors
```

## 🎯 Best Practices

1. **Always build first**: Make sure published adaptors are built before testing
2. **Use quick test**: Run `./test/test-excel-chunks.sh quick` for fast verification
3. **Debug interactively**: Use `./test/test-excel-chunks.sh shell` for troubleshooting
4. **Clean up**: The script automatically cleans up Docker resources
5. **Check logs**: Use verbose mode (`true`) to see detailed output

## 🔗 Integration with OpenFn Workflows

The tests verify that the published adaptors work correctly with OpenFn workflow patterns:

```javascript
// Typical OpenFn usage pattern
const xlsxFunction = getXLSX('/data/excel-files/ART_data_long_format.xlsx', {
  withHeader: true,
  ignoreEmpty: true,
  chunkSize: 1000
});

// OpenFn state structure
const state = {
  configuration: { host: 'sftp-server', username: 'user' },
  data: {},
  references: []
};

// Execute with state
const result = await xlsxFunction(state);
```

## 📚 Next Steps

After successful testing, you can:

1. **Deploy to OpenFn**: The published adaptors are ready for OpenFn deployment
2. **Use in workflows**: Import and use the functions in OpenFn job files
3. **Monitor performance**: The tests include memory and performance validations
4. **Scale up**: The chunked processing supports large Excel files

For more information about OpenFn workflows, see the main project documentation. 