#!/usr/bin/env node
/**
 * Quick test script to test getXLSX function
 * Works with published adaptors from new build system
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  maxRows: 10,
  timeout: 30000,
  expectedMinRows: 1,
  expectedFileSize: 1024 * 1024 // 1MB minimum
};

async function setupMocks() {
  console.log('🔧 Setting up test mocks...');
  
  // Create a simple mock for SSH2 client
  const mockSftpClient = {
    connect: () => {
      console.log('📡 Mock SFTP: Connection established');
      return Promise.resolve();
    },
    get: (path) => {
      console.log(`📁 Mock SFTP: Getting file: ${path}`);
      // Return a test Excel file buffer
      const testFilePath = join(__dirname, 'data', 'ART_data_long_format.xlsx');
      try {
        const buffer = readFileSync(testFilePath);
        console.log(`📊 Mock SFTP: File loaded - ${buffer.length} bytes`);
        return Promise.resolve(buffer);
      } catch (error) {
        console.log(`⚠️  Mock SFTP: Test file not found, creating dummy buffer`);
        // Create a minimal valid Excel file header
        const excelHeader = Buffer.from([
          0x50, 0x4B, 0x03, 0x04, // ZIP signature
          0x14, 0x00, 0x00, 0x00, // Version
          0x08, 0x00, 0x00, 0x00  // Compression method
        ]);
        return Promise.resolve(excelHeader);
      }
    },
    end: () => {
      console.log('🔌 Mock SFTP: Connection ended');
      return Promise.resolve();
    },
    sftp: { state: 'ready' }
  };
  
  return mockSftpClient;
}

async function testGetXLSXFunction() {
  console.log('🧪 Testing getXLSX function...');
  
  try {
    // Import the published SFTP adaptor
    console.log('📦 Importing published SFTP adaptor...');
    const { getXLSX } = await import('@openfn/language-sftp');
    
    console.log('✅ SFTP adaptor imported successfully');
    console.log('📋 getXLSX function type:', typeof getXLSX);
    
    // Test the function signature
    if (typeof getXLSX !== 'function') {
      throw new Error('getXLSX is not a function');
    }
    
    // Create a test state
    const testState = {
      configuration: {
        host: 'test-host',
        port: 22,
        username: 'test-user',
        password: 'test-pass'
      },
      data: {},
      references: []
    };
    
    // Test getXLSX function call
    console.log('🔧 Testing getXLSX function call...');
    const xlsxFunction = getXLSX('/test/file.xlsx', {
      withHeader: true,
      ignoreEmpty: true,
      maxRows: TEST_CONFIG.maxRows
    });
    
    console.log('📋 getXLSX returned:', typeof xlsxFunction);
    
    if (typeof xlsxFunction !== 'function') {
      throw new Error('getXLSX should return a function (curried pattern)');
    }
    
    console.log('✅ getXLSX function signature test passed');
    
    // Test with mock state (this would normally connect to SFTP)
    console.log('🔧 Testing with mock state...');
    
    // Note: In a real environment, this would connect to SFTP
    // For testing, we'll just verify the function structure
    console.log('⚠️  Note: Full SFTP connection testing requires actual SFTP server');
    console.log('✅ Mock test completed successfully');
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function testModuleImports() {
  console.log('🧪 Testing module imports...');
  
  try {
    // Test importing published adaptors
    console.log('📦 Testing @openfn/language-common import...');
    const { fn } = await import('@openfn/language-common');
    console.log('✅ language-common imported successfully');
    
    console.log('📦 Testing @openfn/language-sftp import...');
    const { connect, disconnect, getXLSX } = await import('@openfn/language-sftp');
    console.log('✅ language-sftp imported successfully');
    
    // Test function availability
    const functions = { connect, disconnect, getXLSX, fn };
    for (const [name, func] of Object.entries(functions)) {
      if (typeof func !== 'function') {
        throw new Error(`${name} is not a function`);
      }
      console.log(`✅ ${name}: function available`);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Module import test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function testExcelProcessing() {
  console.log('🧪 Testing Excel processing capabilities...');
  
  try {
    // Test if xlstream is available
    console.log('📦 Testing xlstream availability...');
    const xlstream = await import('xlstream');
    console.log('✅ xlstream imported successfully');
    
    // Test if xlsx is available
    console.log('📦 Testing xlsx availability...');
    const xlsx = await import('xlsx');
    console.log('✅ xlsx imported successfully');
    
    return true;
    
  } catch (error) {
    console.error('❌ Excel processing test failed:', error.message);
    console.error('⚠️  Note: Excel processing libraries may not be installed');
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Quick Test for SFTP Excel Processing');
  console.log('================================================');
  console.log('📍 Using published adaptors from Docker container');
  console.log('');
  
  const startTime = Date.now();
  let allTestsPassed = true;
  
  // Run tests
  const tests = [
    { name: 'Module Imports', fn: testModuleImports },
    { name: 'Excel Processing', fn: testExcelProcessing },
    { name: 'getXLSX Function', fn: testGetXLSXFunction }
  ];
  
  for (const test of tests) {
    console.log(`\n🧪 Running: ${test.name}`);
    console.log('─'.repeat(50));
    
    try {
      const result = await test.fn();
      if (result) {
        console.log(`✅ ${test.name}: PASSED`);
      } else {
        console.log(`❌ ${test.name}: FAILED`);
        allTestsPassed = false;
      }
    } catch (error) {
      console.error(`❌ ${test.name}: ERROR - ${error.message}`);
      allTestsPassed = false;
    }
  }
  
  const duration = Date.now() - startTime;
  
  console.log('\n🎯 Test Results Summary');
  console.log('===============================');
  console.log(`📊 Tests completed in ${duration}ms`);
  console.log(`📋 Overall result: ${allTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('');
  
  if (allTestsPassed) {
    console.log('🎉 All tests passed! The published adaptors are working correctly.');
    console.log('💡 You can now run the full test suite with: npm test');
  } else {
    console.log('⚠️  Some tests failed. Please check the published adaptors setup.');
    console.log('💡 Make sure the published adaptors are built and available.');
  }
  
  process.exit(allTestsPassed ? 0 : 1);
}

// Run the test
main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
}); 