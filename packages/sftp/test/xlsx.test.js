import * as td from 'testdouble';
import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('getXLSX function', () => {
  let getXLSX, connect, disconnect;
  let testExcelBuffer;
  let mockSftpClient;
  let mockStream;
  let mockDataCallback;
  let mockEndCallback;

  before(async () => {
    // Load test Excel file
    const testFilePath = join(__dirname, 'data', 'ART_data_long_format.xlsx');
    testExcelBuffer = readFileSync(testFilePath);
    console.log(`📊 Loaded test Excel file: ${testExcelBuffer.length} bytes`);

    // Create mock SFTP client
    mockSftpClient = {
      connect: td.func(),
      get: td.func(),
      end: td.func(),
      sftp: { state: 'ready' }
    };

    // Create mock stream for xlstream
    mockStream = {
      on: td.func(),
      destroy: td.func()
    };

    // Set up the mock to return our test Excel buffer
    td.when(mockSftpClient.get('/data/excel-files/ART_data_long_format.xlsx')).thenResolve(testExcelBuffer);
    td.when(mockSftpClient.connect(td.matchers.anything())).thenResolve();
    td.when(mockSftpClient.end()).thenResolve();

    // Mock the stream events - capture callbacks so we can call them
    td.when(mockStream.on('data', td.matchers.anything())).thenDo((event, callback) => {
      mockDataCallback = callback;
      return mockStream;
    });
    td.when(mockStream.on('end', td.matchers.anything())).thenDo((event, callback) => {
      mockEndCallback = callback;
      return mockStream;
    });
    td.when(mockStream.on('error', td.matchers.anything())).thenReturn(mockStream);

    // Create a mock constructor that returns our mock client
    const MockClient = td.func();
    td.when(new MockClient()).thenReturn(mockSftpClient);

    // Mock the ssh2-sftp-client module
    await td.replaceEsm('ssh2-sftp-client', { default: MockClient });

    // Mock the xlstream module - test with invalid stream to catch the real issue
    const mockXlstream = {
      getXlsxStream: td.func()
    };
    // This is the key test - return an object that doesn't have .on method
    // This should trigger the error we're seeing in production
    td.when(mockXlstream.getXlsxStream(td.matchers.anything())).thenResolve({ 
      someProperty: 'value',
      // Intentionally missing .on method to simulate the real issue
    });
    await td.replaceEsm('xlstream', mockXlstream);
    
    // Store the mock for later use in tests
    global.mockXlstream = mockXlstream;

    // Mock the fs module for temporary file operations
    const mockFs = {
      writeFileSync: td.func(),
      unlinkSync: td.func()
    };
    await td.replaceEsm('fs', mockFs);

    // Mock the path module
    const mockPath = {
      join: td.func()
    };
    td.when(mockPath.join(td.matchers.anything(), td.matchers.anything())).thenReturn('/tmp/test-file.xlsx');
    await td.replaceEsm('path', mockPath);

    // Mock the os module
    const mockOs = {
      tmpdir: td.func()
    };
    td.when(mockOs.tmpdir()).thenReturn('/tmp');
    await td.replaceEsm('os', mockOs);

    // Mock the stream module
    const mockStreamModule = {
      Readable: {
        from: td.func()
      },
      Transform: td.func(),
      Writable: td.func(),
      Duplex: td.func(),
      PassThrough: td.func()
    };
    const mockReadable = {
      pipe: td.func()
    };
    td.when(mockStreamModule.Readable.from(td.matchers.anything())).thenReturn(mockReadable);
    td.when(mockReadable.pipe(td.matchers.anything())).thenDo((stream) => {
      // Simulate the stream processing by emitting data events
      setTimeout(() => {
        // Emit some mock Excel data
        if (mockDataCallback) {
          mockDataCallback({ formatted: { id: 1, name: 'Test Row 1', value: 100 } });
          mockDataCallback({ formatted: { id: 2, name: 'Test Row 2', value: 200 } });
          mockDataCallback({ formatted: { id: 3, name: 'Test Row 3', value: 300 } });
        }
        // End the stream
        if (mockEndCallback) {
          mockEndCallback();
        }
      }, 10);
      return stream;
    });
    await td.replaceEsm('stream', mockStreamModule);

    // Import the adaptor functions
    ({ getXLSX, connect, disconnect } = await import('../src/Adaptor.js'));
  });

  after(() => {
    td.reset();
  });

  it('should handle xlstream returning invalid stream object', async () => {
    // First connect to set up the module-level sftp variable
    const state = { configuration: { host: 'test-host' } };
    await connect(state);
    
    // This should now fail because we're mocking xlstream to return an invalid stream
    try {
      await getXLSX('/data/excel-files/ART_data_long_format.xlsx')(state);
      expect.fail('Should have thrown an error for invalid stream object');
    } catch (error) {
      expect(error.message).to.include('Invalid stream object returned from getXlsxStream');
      expect(error.message).to.include('Type: object');
      console.log('✅ Correctly caught invalid stream error:', error.message);
    }
  });

  it('should work with the chunking pattern', async () => {
    // First connect to set up the module-level sftp variable
    const state = { configuration: { host: 'test-host' } };
    await connect(state);
    
    // This should also fail with the same invalid stream error
    try {
      await getXLSX('/data/excel-files/ART_data_long_format.xlsx')(state).then(state => {
        const chunkSize = 100;
        const data = state.data.data;
        let processedCount = 0;
        
        console.log(`📊 Starting chunked processing of ${data.length} records`);
        
        while (data.length > 0) {
          const chunk = data.splice(0, chunkSize);
          processedCount += chunk.length;
          
          console.log(`🔄 Processing chunk: ${chunk.length} records`);
          console.log('📋 Chunk sample:', JSON.stringify(chunk.slice(0, 2), null, 2));
        }
        
        return { ...state, processedRecords: processedCount, data: [] };
      });
      expect.fail('Should have thrown an error for invalid stream object');
    } catch (error) {
      expect(error.message).to.include('Invalid stream object returned from getXlsxStream');
      expect(error.message).to.include('Type: object');
      console.log('✅ Correctly caught invalid stream error in chunking test:', error.message);
    }
  });

  it('should work with valid stream from xlstream', async () => {
    // Temporarily change the mock to return a valid stream
    const validMockStream = {
      on: td.func(),
      destroy: td.func()
    };
    
    // Set up the valid stream mock
    td.when(validMockStream.on('data', td.matchers.anything())).thenDo((event, callback) => {
      // Simulate data events
      setTimeout(() => {
        callback({ formatted: { id: 1, name: 'Test Row 1', value: 100 } });
        callback({ formatted: { id: 2, name: 'Test Row 2', value: 200 } });
        callback({ formatted: { id: 3, name: 'Test Row 3', value: 300 } });
      }, 10);
      return validMockStream;
    });
    
    td.when(validMockStream.on('end', td.matchers.anything())).thenDo((event, callback) => {
      // Simulate end event
      setTimeout(() => callback(), 50);
      return validMockStream;
    });
    
    td.when(validMockStream.on('error', td.matchers.anything())).thenReturn(validMockStream);
    
    // Change the mock to return valid stream
    td.when(global.mockXlstream.getXlsxStream(td.matchers.anything())).thenResolve(validMockStream);
    
    // First connect to set up the module-level sftp variable
    const state = { configuration: { host: 'test-host' } };
    await connect(state);
    
    // Now test getXLSX with valid stream
    const result = await getXLSX('/data/excel-files/ART_data_long_format.xlsx')(state);
    
    // Should work correctly
    expect(result).to.have.property('data');
    expect(result.data).to.be.an('object');
    expect(result.data.data).to.be.an('array');
    expect(result.data.data.length).to.be.greaterThan(0);
    
    console.log(`✅ Successfully processed ${result.data.data.length} rows with valid stream`);
  });
});