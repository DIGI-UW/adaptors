import { expect } from 'chai';
import * as td from 'testdouble';

describe('SFTP Excel operations (unit)', () => {
  let getExcelMetadata, getExcelChunk, connect, disconnect;

  before(async () => {
    // Mock ssh2-sftp-client
    const mockClient = td.func();
    const instance = { connect: td.func(), get: td.func(), end: td.func(), sftp: { state: 'ready' } };
    td.when(new mockClient()).thenReturn(instance);
    td.when(instance.connect(td.matchers.anything())).thenResolve();
    td.when(instance.end()).thenResolve();
    await td.replaceEsm('ssh2-sftp-client', { default: mockClient });

    ({ getExcelMetadata, getExcelChunk, connect, disconnect } = await import('../src/Adaptor.js'));
  });

  after(() => td.reset());

  it('exports getExcelMetadata/getExcelChunk/connect/disconnect', () => {
    expect(getExcelMetadata).to.be.a('function');
    expect(getExcelChunk).to.be.a('function');
    expect(connect).to.be.a('function');
    expect(disconnect).to.be.a('function');
  });

  it('returns operations (curried) for Excel helpers', () => {
    expect(getExcelMetadata('/file.xlsx', 1000)).to.be.a('function');
    expect(getExcelChunk('/file.xlsx', 0, 1000)).to.be.a('function');
  });
}); 