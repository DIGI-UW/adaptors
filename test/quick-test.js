#!/usr/bin/env node

/**
 * Quick test script for built adaptors
 * This tests the adaptors in the context they were built in
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Quick Test: Built Adaptors Validation');
console.log('========================================');

// Test 1: Check if build output exists
console.log('📁 Test 1: Checking build output...');
const publishedPath = path.join(__dirname, '../published-adaptors/packages');
if (fs.existsSync(publishedPath)) {
    console.log('✅ Published adaptors directory exists');
    
    // List packages
    const packages = fs.readdirSync(publishedPath);
    console.log('📦 Available packages:', packages.join(', '));
    
    // Check SFTP package specifically
    const sftpPath = path.join(publishedPath, 'sftp');
    if (fs.existsSync(sftpPath)) {
        console.log('✅ SFTP package exists');
        
        // Check for key files
        const sftpFiles = fs.readdirSync(sftpPath);
        console.log('📄 SFTP package files:', sftpFiles.slice(0, 5).join(', ') + (sftpFiles.length > 5 ? '...' : ''));
        
        // Check for getXLSX function
        const indexFile = path.join(sftpPath, 'index.js');
        if (fs.existsSync(indexFile)) {
            const indexContent = fs.readFileSync(indexFile, 'utf8');
            if (indexContent.includes('getXLSX')) {
                console.log('✅ getXLSX function found in SFTP package');
            } else {
                console.log('⚠️  getXLSX function not found in index.js');
            }
        } else {
            console.log('⚠️  index.js not found in SFTP package');
        }
    } else {
        console.log('❌ SFTP package not found');
    }
} else {
    console.log('❌ Published adaptors directory not found');
}

// Test 2: Check package.json structure
console.log('\n📋 Test 2: Checking package.json structure...');
const sftpPackageJson = path.join(publishedPath, 'sftp', 'package.json');
if (fs.existsSync(sftpPackageJson)) {
    try {
        const packageInfo = JSON.parse(fs.readFileSync(sftpPackageJson, 'utf8'));
        console.log('✅ SFTP package.json is valid JSON');
        console.log('📝 Package name:', packageInfo.name);
        console.log('📝 Package version:', packageInfo.version);
        
        // Check dependencies
        if (packageInfo.dependencies) {
            const depCount = Object.keys(packageInfo.dependencies).length;
            console.log(`📦 Dependencies: ${depCount} packages`);
            
            // Check for workspace dependencies
            const workspaceDeps = Object.values(packageInfo.dependencies)
                .filter(dep => typeof dep === 'string' && dep.includes('workspace:'));
            
            if (workspaceDeps.length > 0) {
                console.log('⚠️  Workspace dependencies found:', workspaceDeps.length);
                console.log('   This is expected in the build context');
            } else {
                console.log('✅ No workspace dependencies (all resolved)');
            }
        }
    } catch (error) {
        console.log('❌ Error reading package.json:', error.message);
    }
} else {
    console.log('❌ SFTP package.json not found');
}

// Test 3: Check if we can require the built adaptor
console.log('\n🔌 Test 3: Testing adaptor import...');
try {
    // Try to require the SFTP adaptor
    const sftpAdaptor = require(path.join(publishedPath, 'sftp'));
    console.log('✅ SFTP adaptor imported successfully');
    
    // Check if getXLSX is available
    if (sftpAdaptor.getXLSX) {
        console.log('✅ getXLSX function is available');
        console.log('📝 getXLSX type:', typeof sftpAdaptor.getXLSX);
    } else {
        console.log('❌ getXLSX function not found in adaptor exports');
    }
    
    // List available exports
    const exports = Object.keys(sftpAdaptor);
    console.log('📋 Available exports:', exports.slice(0, 10).join(', ') + (exports.length > 10 ? '...' : ''));
    
} catch (error) {
    console.log('❌ Error importing SFTP adaptor:', error.message);
    console.log('   This might be expected if workspace dependencies are not resolved');
}

// Test 4: Memory and performance baseline
console.log('\n💾 Test 4: Memory baseline...');
const memUsage = process.memoryUsage();
console.log('📊 Memory usage:');
console.log(`   Heap used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
console.log(`   Heap total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
console.log(`   External: ${(memUsage.external / 1024 / 1024).toFixed(2)} MB`);
console.log(`   RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);

// Test 5: Build environment check
console.log('\n🏗️  Test 5: Build environment check...');
console.log('📍 Current working directory:', process.cwd());
console.log('🔧 Node.js version:', process.version);
console.log('📦 npm version:', process.env.npm_version || 'unknown');

// Check if we're in a workspace
if (fs.existsSync(path.join(process.cwd(), 'package.json'))) {
    const rootPackage = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    if (rootPackage.workspaces) {
        console.log('✅ Running in workspace context');
        console.log('📦 Workspace packages:', rootPackage.workspaces);
    } else {
        console.log('⚠️  Not in workspace context');
    }
} else {
    console.log('❌ No package.json found in current directory');
}

console.log('\n🎉 Quick test completed!');
console.log('💡 This test validates that the build process worked correctly');
console.log('💡 For full functionality testing, run the unit tests'); 