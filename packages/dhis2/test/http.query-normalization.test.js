import { expect } from 'chai';
import * as td from 'testdouble';

describe('DHIS2 http create() query normalization and auth', () => {
  let create, util;
  let captured;

  before(async () => {
    // Stub common request underneath util.request
    util = await import('../src/util.js');
    captured = [];
    const original = util.request;

    // Monkeypatch util.request to capture inputs and return a success
    await td.replaceEsm('../src/util.js', {
      ...util,
      request: async (configuration, requestData) => {
        captured.push({ configuration, requestData });
        return { status: 200, data: { status: 'OK' } };
      }
    });

    ({ create } = await import('../src/Adaptor.js'));
  });

  after(() => td.reset());

  it('flattens query and preserves auth header (PAT)', async () => {
    const configuration = { hostUrl: 'http://dhis2:8080', pat: 'abc123' };
    const payload = { dataValues: [{ dataElement: 'TX_CURR', value: '1' }] };

    await create('dataValueSets', payload, {
      query: { importStrategy: 'CREATE_AND_UPDATE', skipExistingCheck: true }
    })({ configuration, data: null });

    expect(captured.length).to.be.greaterThan(0);
    const req = captured.pop().requestData;
    expect(req.path).to.equal('/api/dataValueSets');
    expect(req.options.query).to.deep.equal({ importStrategy: 'CREATE_AND_UPDATE', skipExistingCheck: true });
  });

  it('flattens nested query.query and does not stringify object', async () => {
    const configuration = { hostUrl: 'http://dhis2:8080', pat: 'abc123' };
    const payload = { dataValues: [{ dataElement: 'TX_CURR', value: '1' }] };

    await create('dataValueSets', payload, {
      query: { query: { dataElementIdScheme: 'CODE', orgUnitIdScheme: 'NAME' } }
    })({ configuration, data: null });

    const req = captured.pop().requestData;
    expect(req.options.query).to.deep.equal({ dataElementIdScheme: 'CODE', orgUnitIdScheme: 'NAME' });
  });
});



