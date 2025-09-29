import { expect } from 'chai';
import * as td from 'testdouble';

describe('Data element/dataset conflict resolution', () => {
  let util, create, get;
  let calls;

  before(async () => {
    util = await import('../src/util.js');
    calls = [];
    util.request.__override = async (configuration, req) => {
      calls.push(req);
      // Simulate: POST returns 409, then GET by code returns list with id
      if (req.method === 'POST' && req.path.endsWith('/api/dataElements')) {
        const err = new Error('409');
        err.message = 'POST to /api/dataElements returned 409: Conflict';
        err.statusCode = 409;
        err.body = { httpStatus: 'Conflict', status: 'ERROR' };
        throw err;
      }
      if (req.method === 'GET' && req.path.endsWith('/api/dataElements') && req.options?.query?.filter?.startsWith('code:eq:')) {
        return { status: 200, headers: {}, data: { dataElements: [{ id: 'abc123' }] } };
      }
      if (req.method === 'POST' && req.path.endsWith('/api/dataSets')) {
        const err = new Error('409');
        err.message = 'POST to /api/dataSets returned 409: Conflict';
        err.statusCode = 409;
        err.body = { httpStatus: 'Conflict', status: 'ERROR' };
        throw err;
      }
      if (req.method === 'GET' && req.path.endsWith('/api/dataSets') && req.options?.query?.filter?.startsWith('code:eq:')) {
        return { status: 200, headers: {}, data: { dataSets: [{ id: 'ds123' }] } };
      }
      return { status: 200, headers: {}, data: {} };
    };
    ({ create, get } = await import('../src/Adaptor.js'));
  });

  after(() => { if (util.request.__override) delete util.request.__override; });

  it('GET-by-code is used after 409 on POST dataElements and dataSets', async () => {
    // Create dataElement (will 409) then GET by code
    try { await create('dataElements', { code: 'TX_CURR', name: 'TX_CURR' })({ configuration: { hostUrl: 'x', pat: 'y' } }); } catch (_) {}
    // Create dataSet (will 409) then GET by code
    try { await create('dataSets', { code: 'MALAWI_ART_DATASET', name: 'Malawi ART Data Set' })({ configuration: { hostUrl: 'x', pat: 'y' } }); } catch (_) {}

    const hasDEGet = calls.some(c => c.method === 'GET' && c.path.endsWith('/api/dataElements') && c.options?.query?.filter === 'code:eq:TX_CURR');
    const hasDSGet = calls.some(c => c.method === 'GET' && c.path.endsWith('/api/dataSets') && c.options?.query?.filter === 'code:eq:MALAWI_ART_DATASET');
    expect(hasDEGet).to.equal(true);
    expect(hasDSGet).to.equal(true);
  });

  it('upsertOrganisationUnitHierarchy resolves UID via Location header or GET fallback', async () => {
    const { upsertOrganisationUnitHierarchy } = await import('../../src/Adaptor.js');
    const state = { configuration: { hostUrl: 'http://dhis2:8080', pat: 'x' }, data: {} };

    // Override request to simulate create without uid and validate fallback
    util.request.__override = async (configuration, req) => {
      // For GET by code fallback
      if (req.method === 'GET' && req.path.endsWith('/api/organisationUnits') && req.options?.query?.filter?.startsWith('code:eq:')) {
        return { status: 200, headers: {}, data: { organisationUnits: [{ id: 'ou123456789' }] } };
      }
      if (req.method === 'GET' && req.path.endsWith('/api/organisationUnits')) {
        return { status: 200, headers: {}, data: { organisationUnits: [] } };
      }
      if (req.method === 'POST' && req.path.endsWith('/api/organisationUnits')) {
        return { status: 201, headers: { location: '/api/organisationUnits/ou123456789' }, data: { httpStatus: 'Created', response: {} } };
      }
      return { status: 200, headers: {}, data: {} };
    };

    const op = upsertOrganisationUnitHierarchy([
      { name: 'Test Facility', shortName: 'Test Facility', code: 'TEST_FACILITY', level: 1 }
    ], { maxLevels: 1 });

    await op(state);
    expect(state.data?.mappings?.['Test Facility']).to.equal('ou123456789');

    // Clean override
    delete util.request.__override;
  });
});


