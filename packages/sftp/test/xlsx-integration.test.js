import { expect } from 'chai';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import * as td from 'testdouble';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('getXLSX Integration Tests', () => {
  let getXLSX, connect, disconnect;
  let testExcelBuffer;
  let tempFilePath;

  before(async () => {
    // Load test Excel file
    const testFilePath = join(__dirname, 'data', 'ART_data_long_format.xlsx');
    testExcelBuffer = readFileSync(testFilePath);
    console.log(`📊 Loaded test Excel file: ${testExcelBuffer.length} bytes`);

    // Create a temporary file for testing
    tempFilePath = join(tmpdir(), `test-excel-${Date.now()}.xlsx`);
    writeFileSync(tempFilePath, testExcelBuffer);

    // Create mock SFTP client
    const mockSftpClient = {
      connect: td.func(),
      get: td.func(),
      end: td.func(),
      sftp: { state: 'ready' }
    };

    // Set up the mock to return our test Excel buffer
    td.when(mockSftpClient.get('/data/excel-files/ART_data_long_format.xlsx')).thenResolve(testExcelBuffer);
    td.when(mockSftpClient.connect(td.matchers.anything())).thenResolve();
    td.when(mockSftpClient.end()).thenResolve();

    // Create a mock constructor that returns our mock client
    const MockClient = td.func();
    td.when(new MockClient()).thenReturn(mockSftpClient);

    // Mock the ssh2-sftp-client module
    await td.replaceEsm('ssh2-sftp-client', { default: MockClient });

    // Import the adaptor functions
    ({ getXLSX, connect, disconnect } = await import('../src/Adaptor.js'));
  });

  after(() => {
    td.reset();
    // Clean up temporary file
    try {
      unlinkSync(tempFilePath);
    } catch (error) {
      console.warn('Could not clean up temp file:', error.message);
    }
  });

  it('should test actual xlstream integration', async () => {
    // This test will use the real xlstream library to catch actual integration issues
    console.log('🧪 Testing actual xlstream integration...');
    
    // First connect to set up the module-level sftp variable
    const state = { configuration: { host: 'test-host' } };
    await connect(state);
    
    try {
      // This should fail if there are real integration issues
      const result = await getXLSX('/data/excel-files/ART_data_long_format.xlsx')(state);
      
      // If we get here, the integration worked
      expect(result).to.have.property('data');
      expect(result.data).to.be.an('object');
      expect(result.data.data).to.be.an('array');
      
      console.log('✅ xlstream integration test passed');
      console.log(`📊 Processed ${result.data.data.length} rows`);
      
    } catch (error) {
      console.error('❌ xlstream integration test failed:', error.message);
      console.error('❌ Error stack:', error.stack);
      
      // Log additional debugging info
      if (error.message.includes('stream.on is not a function')) {
        console.error('🔍 This is the exact error we were trying to catch!');
        console.error('🔍 The test is working - it caught the real integration issue');
      }
      
      // Re-throw the error so the test fails
      throw error;
    }
  });

  it('should test xlstream with different options', async () => {
    const state = { configuration: { host: 'test-host' } };
    await connect(state);
    
    try {
      // Test with different parsing options
      const result = await getXLSX('/data/excel-files/ART_data_long_format.xlsx', {
        withHeader: false,
        ignoreEmpty: false,
        chunkSize: 500,
        maxRows: 10
      })(state);
      
      expect(result).to.have.property('data');
      expect(result.data).to.be.an('object');
      expect(result.data.data).to.be.an('array');
      
      console.log('✅ xlstream integration test with custom options passed');
      console.log(`📊 Processed ${result.data.data.length} rows with custom options`);
      
    } catch (error) {
      console.error('❌ xlstream integration test with custom options failed:', error.message);
      throw error;
    }
  });
}); 