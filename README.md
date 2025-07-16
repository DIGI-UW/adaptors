# OpenFn Custom Adaptors

This project contains custom adaptors for OpenFn with enhanced functionality, particularly for Excel file processing and SFTP operations.

## Architecture

The project is structured as a monorepo with workspace-based dependencies:

- **Source packages**: Located in `packages/` directory
- **Published packages**: Built to `published-adaptors/packages/` directory
- **Workspace context**: Uses npm workspaces for dependency resolution

## Key Features

### Enhanced SFTP Adaptor

- **getXLSX Function**: Streaming Excel file processing with memory optimization
- **Chunked Processing**: Handles large files without memory overflow
- **OpenFn Compliance**: Respects OpenFn's 500MB per-job memory limit
- **Error Handling**: Comprehensive error handling and logging

### Memory Optimization

- Streaming-based processing instead of loading entire files
- Configurable chunk sizes for batch processing
- Memory usage monitoring and compliance checking
- Optimized for large Excel files (1M+ rows)

## Testing

The testing approach builds the full project in workspace context to ensure proper dependency resolution.

### Quick Start

```bash
# Run all tests
./test-excel-chunks.sh

# Run specific test types
./test-excel-chunks.sh build    # Build and verify
./test-excel-chunks.sh unit     # Unit tests only
./test-excel-chunks.sh xlsx     # Excel processing tests
./test-excel-chunks.sh quick    # Quick validation
./test-excel-chunks.sh shell    # Interactive shell
```

### Test Architecture

The testing system uses Docker to create a consistent environment:

1. **Full Project Build**: Builds the entire monorepo in workspace context
2. **Dependency Resolution**: Properly resolves `workspace:*` dependencies
3. **Published Package Testing**: Tests the built packages in their proper context
4. **Memory Testing**: Validates memory usage and compliance

### Test Types

- **build**: Verifies the build process and output structure
- **unit**: Runs unit tests for individual functions
- **xlsx**: Tests Excel processing functionality specifically
- **quick**: Fast validation of build output and basic functionality
- **shell**: Interactive shell for debugging and exploration

## Why This Approach Works

### The Problem with Testing Published Packages

The published packages contain `workspace:*` dependencies that can only be resolved in the original workspace context. Testing them in isolation fails because:

- No workspace resolver available
- Dependencies can't be resolved to actual packages
- They're designed for OpenFn's runtime, not standalone Node.js

### The Solution: Full Project Build

By building the entire project in Docker:

1. **Workspace Context**: Maintains the monorepo workspace structure
2. **Dependency Resolution**: `workspace:*` dependencies are properly resolved
3. **Build Process**: Follows the same process as production builds
4. **Consistent Environment**: Same environment as the actual build system

### Benefits

- **Accurate Testing**: Tests the actual build output, not isolated packages
- **Proper Dependencies**: All dependencies are resolved correctly
- **Memory Testing**: Can test memory usage in realistic conditions
- **CI/CD Ready**: Reproducible in any environment

## Development Workflow

1. **Make Changes**: Edit source code in `packages/` directory
2. **Build**: Run `npm run build` to create published packages
3. **Test**: Use `./test-excel-chunks.sh` to test in proper context
4. **Deploy**: Published packages work correctly in OpenFn environment

## Key Differences from Previous Approach

### Before: In-Place Testing
- Built packages within the source tree
- Tested in the same workspace context
- Simple but mixed source and build artifacts

### Now: Workspace-Aware Testing
- Builds entire project in clean environment
- Tests published packages in proper context
- Separates source and build artifacts
- More accurate representation of production

## Memory Compliance

The adaptors are designed to comply with OpenFn's memory limits:

- **Memory Limit**: 400MB (80% of 500MB OpenFn limit)
- **Chunk Size**: 1000 rows per chunk
- **Monitoring**: Real-time memory usage monitoring
- **Error Handling**: Graceful handling of memory limit violations

## Docker Environment

The Docker setup:
- Uses Node.js 18 (matches OpenFn environment)
- Builds full project with proper workspace context
- Runs tests in consistent environment
- Provides interactive shell for debugging

## Troubleshooting

### Common Issues

1. **Docker Build Failures**: Ensure you're running from the correct directory
2. **Memory Errors**: Check that chunk sizes are appropriate for your data
3. **Import Errors**: Verify that the build process completed successfully

### Debug Mode

Use the shell test type for interactive debugging:

```bash
./test-excel-chunks.sh shell
```

This provides an interactive shell within the Docker container where you can:
- Explore the built packages
- Run individual tests
- Debug import issues
- Check memory usage

## Contributing

1. Make changes to source packages in `packages/`
2. Test changes using the Docker-based test suite
3. Ensure memory compliance and proper error handling
4. Update documentation as needed

## Integration with OpenFn

The published packages are designed to work seamlessly with OpenFn:

- **Runtime Compatibility**: Built for OpenFn's Node.js runtime
- **Memory Compliance**: Respects OpenFn's memory limits
- **Error Handling**: Provides OpenFn-compatible error reporting
- **Dependency Resolution**: Uses OpenFn's dependency resolution system
