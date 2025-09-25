import * as td from 'testdouble';
import { expect } from 'chai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SFTP CSV helpers - PEPFAR TxCURR mid-file headers', () => {
  let getCsvMetadata, getCsvChunk, connect;

  before(async () => {
    const Client = td.func();
    const sftp = { connect: td.func(), get: td.func(), end: td.func(), sftp: { state: 'ready' } };
    td.when(new Client()).thenReturn(sftp);
    td.when(sftp.connect(td.matchers.anything())).thenResolve();
    td.when(sftp.end()).thenResolve();

    const localCsvPath = join(__dirname, 'data', 'PEPFAR_TxCURR_test.csv');
    const csvBuffer = readFileSync(localCsvPath);
    const remotePath = '/data/samples/pepfar/PEPFAR_TxCURR_test.csv';
    td.when(sftp.get(remotePath)).thenResolve(csvBuffer);

    await td.replaceEsm('ssh2-sftp-client', { default: Client });

    ({ getCsvMetadata, getCsvChunk, connect } = await import('../src/Adaptor.js'));
  });

  after(() => td.reset());

  it('computes CSV metadata even with repeated headers mid-file', async function() {
    this.timeout(10000);
    const state = { configuration: { host: 'test-host' } };
    await connect(state);
    const res = await getCsvMetadata('/data/samples/pepfar/PEPFAR_TxCURR_test.csv', 2000)({ ...state });
    expect(res.data.totalRows).to.be.a('number');
    expect(res.data.totalRows).to.be.greaterThan(0);
    expect(res.data.totalChunks).to.be.greaterThan(0);
  });

  it('reads a CSV chunk without throwing inconsistent column errors', async function() {
    this.timeout(10000);
    const state = { configuration: { host: 'test-host' } };
    await connect(state);
    const res = await getCsvChunk('/data/samples/pepfar/PEPFAR_TxCURR_test.csv', 0, 2000)({ ...state });
    expect(res.chunkData).to.be.an('array');
    expect(res.chunkData.length).to.be.greaterThan(0);
  });
});


