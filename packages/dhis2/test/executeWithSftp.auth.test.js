import { expect } from 'chai';

describe('executeWithSftp preserves DHIS2 configuration/auth', () => {
  let executeWithSftp, create, util;
  let seenAuth;

  before(async () => {
    util = await import('../src/util.js');
    // Override request to capture headers
    util.request.__override = async (configuration, requestData) => {
      seenAuth = { configuration, requestData };
      return { status: 200, headers: {}, data: { response: { status: 'OK' } } };
    };
    ({ executeWithSftp, create } = await import('../src/Adaptor.js'));
  });

  after(() => {
    if (util.request.__override) delete util.request.__override;
  });

  it('uses provided PAT token on inner create call', async () => {
    const op = executeWithSftp(
      create('dataValueSets', { dataValues: [] })
    );

    await op({ configuration: { hostUrl: 'http://dhis2:8080', pat: 'abc123' } });
    expect(seenAuth?.configuration?.pat).to.equal('abc123');
    expect(seenAuth?.requestData?.path).to.equal('/api/dataValueSets');
  });
});



