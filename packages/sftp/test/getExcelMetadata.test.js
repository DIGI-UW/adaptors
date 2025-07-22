import * as td from 'testdouble';
import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('getExcelMetadata Tests', () => {
  let getExcelMetadata, connect, disconnect;
  let testExcelBuffer;
  let mockSftpClient;

  before(async () => {
    console.log('📄 Loading ART_data_tst.xlsx...');
    const testFilePath = join(__dirname, 'data', 'ART_data_tst.xlsx');
    testExcelBuffer = readFileSync(testFilePath);
    console.log(`📊 File loaded: ${testExcelBuffer.length} bytes`);

    // Create mock SFTP client with testdouble (like existing tests)
    mockSftpClient = {
      connect: td.func(),
      get: td.func(),
      end: td.func(),
      sftp: { state: 'ready' }
    };

    // Set up the mock to return our test Excel buffer
    td.when(mockSftpClient.get('/data/ART_data_tst.xlsx')).thenResolve(testExcelBuffer);
    td.when(mockSftpClient.connect(td.matchers.anything())).thenResolve();
    td.when(mockSftpClient.end()).thenResolve();

    // Create a mock constructor that returns our mock client
    const MockClient = td.func();
    td.when(new MockClient()).thenReturn(mockSftpClient);

    // Mock the ssh2-sftp-client module
    await td.replaceEsm('ssh2-sftp-client', { default: MockClient });

    console.log('📦 Loading SFTP adaptor...');
    // const sftpAdaptor = await import('@openfn/language-sftp');
    const sftpAdaptor = await import('../src/Adaptor.js');
    getExcelMetadata = sftpAdaptor.getExcelMetadata;
    connect = sftpAdaptor.connect;
    disconnect = sftpAdaptor.disconnect;
    
    console.log('✅ Setup complete');
  });

  after(() => {
    td.reset();
  });

  it('should process Excel metadata for ART_data_tst.xlsx', async function() {
    this.timeout(30000); // 30 second timeout for large file processing
    
    console.log('🧪 Testing getExcelMetadata...');
    
    // Mock state
    const state = {
      configuration: {
        host: 'test-host',
        username: 'test-user'
      },
      data: {},
      references: []
    };

    // Connect first (required for SFTP operations)
    await connect(state);
    
    // Test getExcelMetadata with ART file
    const options = {
      columnMapping: {
        indicators: ['Indicator_name'],
        quarters: ['Quarter'],
        sites: ['Site'],
        regions: ['Region'],
        zones: ['Zone'],
        districts: ['District'],
        hsectors: ['hsector'],
        reportingPeriods: ['Reporting period'],
      }
    };
    const result = await getExcelMetadata('/data/ART_data_tst.xlsx', 1000, options)(state);
    
    console.log('📊 Metadata result:', JSON.stringify(result.data, null, 2));
    
    // Verify results
    expect(result).to.have.property('data');
    expect(result.data).to.have.property('totalRows');
    expect(result.data).to.have.property('totalChunks');
    expect(result.data).to.have.property('chunkSize', 1000);
    expect(result.data).to.have.property('fileName', '/data/ART_data_tst.xlsx');
    expect(result.data.totalRows).to.be.a('number');
    expect(result.data.totalRows).to.be.greaterThan(0);
    
    // Verify uniqueValues were collected
    expect(result.data).to.have.property('uniqueValues');
    const { uniqueValues } = result.data;
    expect(uniqueValues).to.not.be.empty;
    expect(uniqueValues).to.have.property('indicators').that.is.an('array').with.length.greaterThan(0);
    expect(uniqueValues).to.have.property('sites').that.is.an('array').with.length.greaterThan(0);
    
    console.log(`✅ Successfully processed ${result.data.totalRows} rows in ${result.data.totalChunks} chunks`);
  });
}); 