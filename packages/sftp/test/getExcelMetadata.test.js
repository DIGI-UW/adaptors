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
    this.timeout(300000); // 30 second timeout for large file processing
    
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
    
    // Verify basic metadata results
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
    expect(uniqueValues).to.have.property('regions').that.is.an('array').with.length.greaterThan(0);
    expect(uniqueValues).to.have.property('zones').that.is.an('array').with.length.greaterThan(0);
    expect(uniqueValues).to.have.property('districts').that.is.an('array').with.length.greaterThan(0);
    
    // Verify orgUnitParentMap was collected (new functionality)
    expect(result.data).to.have.property('orgUnitParentMap');
    const { orgUnitParentMap } = result.data;
    expect(orgUnitParentMap).to.be.an('object');
    
    if (Object.keys(orgUnitParentMap).length > 0) {
      console.log('✅ Organizational unit parent mappings found:');
      console.log(`   - Total mappings: ${Object.keys(orgUnitParentMap).length}`);
      
      // Test that zones map to regions
      const zones = uniqueValues.zones;
      const regions = uniqueValues.regions;
      let zoneParentCount = 0;
      zones.forEach(zone => {
        if (orgUnitParentMap[zone]) {
          expect(regions).to.include(orgUnitParentMap[zone], `Zone "${zone}" should map to a valid region`);
          zoneParentCount++;
        }
      });
      console.log(`   - Zones with parent regions: ${zoneParentCount}/${zones.length}`);
      
      // Test that districts map to zones  
      const districts = uniqueValues.districts;
      let districtParentCount = 0;
      districts.forEach(district => {
        if (orgUnitParentMap[district]) {
          expect(zones).to.include(orgUnitParentMap[district], `District "${district}" should map to a valid zone`);
          districtParentCount++;
        }
      });
      console.log(`   - Districts with parent zones: ${districtParentCount}/${districts.length}`);
      
      // Test that sites map to districts
      const sites = uniqueValues.sites;
      let siteParentCount = 0;
      sites.forEach(site => {
        if (orgUnitParentMap[site]) {
          expect(districts).to.include(orgUnitParentMap[site], `Site "${site}" should map to a valid district`);
          siteParentCount++;
        }
      });
      console.log(`   - Sites with parent districts: ${siteParentCount}/${sites.length}`);
      
      // Verify the mapping structure is flat and simple
      Object.entries(orgUnitParentMap).forEach(([child, parent]) => {
        expect(child).to.be.a('string');
        expect(parent).to.be.a('string');
        expect(child).to.not.be.empty;
        expect(parent).to.not.be.empty;
      });
      
      console.log('✅ All parent-child relationships are valid');
    } else {
      console.log('⚠️  No organizational unit parent mappings found - this may indicate incomplete test data');
    }
    
    console.log(`✅ Successfully processed ${result.data.totalRows} rows in ${result.data.totalChunks} chunks`);
  });
}); 