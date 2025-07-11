import * as td from 'testdouble';
import { expect } from 'chai';

describe('The execute() function', () => {
  let execute, connect, disconnect;
  let mockSftpClient;

  before(async () => {
    // Create a mock SFTP client
    mockSftpClient = {
      connect: td.func(),
      end: td.func(),
      sftp: { state: 'ready' }
    };

    // Set up stubs for the mock client
    td.when(mockSftpClient.connect(td.matchers.anything())).thenResolve();
    td.when(mockSftpClient.end()).thenResolve();

    // Create a mock constructor that returns our mock client
    const MockClient = td.func();
    td.when(new MockClient()).thenReturn(mockSftpClient);

    // Mock the ssh2-sftp-client module
    await td.replaceEsm('ssh2-sftp-client', { default: MockClient });

    // Import the adaptor functions
    ({ execute, connect, disconnect } = await import('../src/Adaptor.js'));
  });

  after(() => {
    td.reset();
  });

  it('should connect to SFTP server', async () => {
    const state = { configuration: { host: 'test-host' } };
    const result = await connect(state);
    
    // The connect function should return the state unchanged
    expect(result).to.deep.equal(state);
    
    // Verify that the mock client's connect method was called
    td.verify(mockSftpClient.connect(td.matchers.anything()));
  });

  it('should disconnect from SFTP server', async () => {
    const state = { configuration: { host: 'test-host' } };
    const result = await disconnect(state);
    
    // The disconnect function should return the state unchanged
    expect(result).to.deep.equal(state);
    
    // Verify that the mock client's end method was called
    td.verify(mockSftpClient.end());
  });
});
