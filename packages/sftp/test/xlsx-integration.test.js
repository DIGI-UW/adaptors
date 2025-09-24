import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as td from 'testdouble';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SFTP Excel helper integration (mocked)', () => {
  let getExcelMetadata, connect;

  before(async () => {
    const testFilePath = join(__dirname, 'data', 'ART_data_long_format.xlsx');
    const buffer = readFileSync(testFilePath);

    const Client = td.func();
    const sftp = { connect: td.func(), get: td.func(), end: td.func(), sftp: { state: 'ready' } };
    td.when(new Client()).thenReturn(sftp);
    td.when(sftp.connect(td.matchers.anything())).thenResolve();
    td.when(sftp.end()).thenResolve();
    td.when(sftp.get('/data/excel-files/ART_data_long_format.xlsx')).thenResolve(buffer);
    await td.replaceEsm('ssh2-sftp-client', { default: Client });

    const mockStream = { on: td.func(), destroy: td.func() };
    td.when(mockStream.on('data', td.matchers.anything())).thenDo((event, cb) => {
      cb({ formatted: { obj: { Region: 'R1', Zone: 'Z1', District: 'D1', Site: 'S1' } } });
      cb({ formatted: { obj: { Region: 'R2', Zone: 'Z2', District: 'D2', Site: 'S2' } } });
      return mockStream;
    });
    td.when(mockStream.on('end', td.matchers.anything())).thenDo((event, cb) => { cb(); return mockStream; });
    td.when(mockStream.on('error', td.matchers.anything())).thenReturn(mockStream);

    const mockXlstream = { getXlsxStream: td.func() };
    td.when(mockXlstream.getXlsxStream(td.matchers.anything())).thenResolve(mockStream);
    await td.replaceEsm('xlstream', mockXlstream);

    ({ getExcelMetadata, connect } = await import('../src/Adaptor.js'));
  });

  after(() => td.reset());

  it('returns metadata including unique values', async () => {
    const state = { configuration: { host: 'test-host' } };
    await connect(state);
    const result = await getExcelMetadata('/data/excel-files/ART_data_long_format.xlsx', 1000, {
      columnMapping: {
        regions: ['Region'],
        zones: ['Zone'],
        districts: ['District'],
        sites: ['Site']
      }
    })(state);
    expect(result.data.totalRows).to.equal(2);
    expect(result.data.totalChunks).to.equal(1);
    expect(result.data.uniqueValues.regions).to.include('R1');
    expect(result.data.uniqueValues.regions).to.include('R2');
  });
}); 