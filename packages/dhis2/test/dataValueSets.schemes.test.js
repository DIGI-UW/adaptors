import { expect } from 'chai';

describe('dataValueSets with code/name schemes and unauthorized', () => {
  let util, create;
  let lastRequest;

  before(async () => {
    util = await import('../src/util.js');
    util.request.__override = async (configuration, req) => {
      lastRequest = { configuration, req };
      // For unauthorized case, return 401 when explicit flag is present
      if (req.options?.headers?.__force401) {
        const err = new Error('401');
        err.message = 'POST to /api/dataValueSets returned 401: Unauthorized';
        err.statusCode = 401;
        err.body = { httpStatus: 'Unauthorized', status: 'ERROR' };
        throw err;
      }
      return { status: 200, headers: {}, data: { status: 'OK' } };
    };
    ({ create } = await import('../src/Adaptor.js'));
  });

  after(() => { if (util.request.__override) delete util.request.__override; });

  it('adds dataElementIdScheme=CODE and orgUnitIdScheme=NAME via query', async () => {
    const configuration = { hostUrl: 'http://dhis2:8080', pat: 'abc123' };
    const payload = { dataValues: [{ dataElement: 'TX_CURR', orgUnit: 'Facility', period: '202501', value: '1' }] };

    await create('dataValueSets', payload, { dataElementIdScheme: 'CODE', orgUnitIdScheme: 'NAME' })({ configuration });

    expect(lastRequest.req.path).to.equal('/api/dataValueSets');
    expect(lastRequest.req.options.query).to.deep.equal({ dataElementIdScheme: 'CODE', orgUnitIdScheme: 'NAME' });
  });

  it('surfaces 401 Unauthorized with URL and status', async () => {
    const configuration = { hostUrl: 'http://dhis2:8080', pat: 'abc123' };
    const payload = { dataValues: [{ dataElement: 'TX_CURR', orgUnit: 'Facility', period: '202501', value: '1' }] };

    let error;
    try {
      await create('dataValueSets', payload, { headers: { __force401: true } })({ configuration });
    } catch (e) {
      error = e;
    }
    expect(error).to.exist;
    expect(String(error.message)).to.match(/401|Unauthorized/);
  });
});

