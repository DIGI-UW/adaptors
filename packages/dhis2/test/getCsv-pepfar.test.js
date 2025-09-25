import * as td from 'testdouble';
import { expect } from 'chai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('DHIS2 CSV helpers - PEPFAR TxCURR mid-file headers', () => {
  let getCsvMetadata, getCsvChunk, executeWithSftp, __setSftpClientForTests;

  before(async () => {
    const dhis2 = await import('../src/Adaptor.js');
    ({ getCsvMetadata, getCsvChunk, executeWithSftp, __setSftpClientForTests } = dhis2);

    // Minimal mock SFTP client with get() returning the real CSV buffer
    const localCsvPath = join(__dirname, 'data', 'PEPFAR_TxCURR_test.csv');
    const csvBuffer = readFileSync(localCsvPath);
    const mockClient = {
      sftp: { state: 'ready' },
      async get(path) {
        // Always return the same buffer regardless of path for this test
        return csvBuffer;
      },
      end() {}
    };
    __setSftpClientForTests(mockClient);
  });

  after(() => td.reset());

  it('computes CSV metadata even with repeated headers mid-file', async function() {
    this.timeout(10000);
    const state = { configuration: { sftpConfiguration: { host: 'ignored' } } };
    const res = await executeWithSftp(
      getCsvMetadata('/data/samples/pepfar/PEPFAR_TxCURR_test.csv', 2000)
    )(state);
    expect(res.data.totalRows).to.be.a('number');
    expect(res.data.totalRows).to.be.greaterThan(0);
    expect(res.data.totalChunks).to.be.greaterThan(0);
  });

  it('reads a CSV chunk without throwing inconsistent column errors', async function() {
    this.timeout(10000);
    const state = { configuration: { sftpConfiguration: { host: 'ignored' } } };
    const res = await executeWithSftp(
      getCsvChunk('/data/samples/pepfar/PEPFAR_TxCURR_test.csv', 0, 2000)
    )(state);
    expect(res.chunkData).to.be.an('array');
    expect(res.chunkData.length).to.be.greaterThan(0);
  });
});


