import * as td from 'testdouble';
import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SFTP Excel streaming integration (mocked)', () => {
  let getExcelMetadata, getExcelChunk, connect;
  let testExcelBuffer;
  let mockXlstream;

  before(async () => {
    const testFilePath = join(__dirname, 'data', 'ART_data_long_format.xlsx');
    testExcelBuffer = readFileSync(testFilePath);

    // Mock ssh2-sftp-client
    const Client = td.func();
    const sftp = { connect: td.func(), get: td.func(), end: td.func(), sftp: { state: 'ready' } };
    td.when(new Client()).thenReturn(sftp);
    td.when(sftp.connect(td.matchers.anything())).thenResolve();
    td.when(sftp.end()).thenResolve();
    td.when(sftp.get('/data/excel-files/ART_data_long_format.xlsx')).thenResolve(testExcelBuffer);
    await td.replaceEsm('ssh2-sftp-client', { default: Client });

    // Mock xlstream
    mockXlstream = { getXlsxStream: td.func() };
    await td.replaceEsm('xlstream', mockXlstream);

    ({ getExcelMetadata, getExcelChunk, connect } = await import('../src/Adaptor.js'));
  });

  after(() => td.reset());

  it('getExcelMetadata fails when xlstream returns invalid stream', async () => {
    td.when(mockXlstream.getXlsxStream(td.matchers.anything())).thenResolve({});
    const state = { configuration: { host: 'test-host' } };
    await connect(state);
    try {
      await getExcelMetadata('/data/excel-files/ART_data_long_format.xlsx', 1000)({ ...state });
      expect.fail('expected to throw');
    } catch (e) {
      expect(e.message).to.match(/Invalid stream|processing failed|Module import failed|Cannot read/);
    }
  });

  it('getExcelChunk fails when xlstream returns invalid stream', async () => {
    td.when(mockXlstream.getXlsxStream(td.matchers.anything())).thenResolve({});
    const state = { configuration: { host: 'test-host' } };
    await connect(state);
    try {
      await getExcelChunk('/data/excel-files/ART_data_long_format.xlsx', 0, 1000)({ ...state });
      expect.fail('expected to throw');
    } catch (e) {
      expect(e.message).to.match(/Invalid stream|processing failed|Module import failed|Cannot read/);
    }
  });
});