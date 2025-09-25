#!/usr/bin/env node
/**
 * Quick smoke test for SFTP adaptor helpers
 */

async function loadAdaptor() {
  return import('../src/Adaptor.js');
}

async function loadCommon() {
  return import('@openfn/language-common');
}

async function testModuleImports() {
  console.log('🧪 Testing module imports...');
  try {
    const common = await loadCommon();
    const sftp = await loadAdaptor();
    const required = {
      fn: common.fn,
      connect: sftp.connect,
      disconnect: sftp.disconnect,
      getExcelMetadata: sftp.getExcelMetadata,
      getExcelChunk: sftp.getExcelChunk,
      getCsvMetadata: sftp.getCsvMetadata,
      getCsvChunk: sftp.getCsvChunk,
    };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== 'function') {
        throw new Error(`${name} is not a function`);
      }
      console.log(`✅ ${name}: function available`);
    }
    return true;
  } catch (error) {
    console.error('❌ Module import test failed:', error.message);
    return false;
  }
}

async function testHelperSignatures() {
  console.log('🧪 Testing helper signatures...');
  try {
    const { getExcelMetadata, getExcelChunk, getCsvMetadata, getCsvChunk } = await loadAdaptor();
    const operations = [
      getExcelMetadata('/file.xlsx', 1000),
      getExcelChunk('/file.xlsx', 0, 1000),
      getCsvMetadata('/file.csv', 1000),
      getCsvChunk('/file.csv', 0, 1000),
    ];
    operations.forEach((op, idx) => {
      if (typeof op !== 'function') {
        throw new Error(`helper ${idx + 1} did not return an operation`);
      }
    });
    console.log('✅ Helper signatures validated (operations returned)');
    return true;
  } catch (error) {
    console.error('❌ Helper signature test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Quick Test for SFTP helpers');
  console.log('======================================');
  const tests = [
    { name: 'Module Imports', fn: testModuleImports },
    { name: 'Helper Signatures', fn: testHelperSignatures },
  ];
  let success = true;
  for (const test of tests) {
    console.log(`\n🧪 Running: ${test.name}`);
    console.log('─'.repeat(40));
    const result = await test.fn();
    console.log(result ? `✅ ${test.name}: PASSED` : `❌ ${test.name}: FAILED`);
    success = success && result;
  }
  console.log('\n🎯 Summary:', success ? '✅ PASSED' : '❌ FAILED');
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
}); 