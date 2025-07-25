import { expect } from 'chai';
import { create, get, upsert } from '../src/Adaptor.js';

// =============================================================================
// Integration Test for language-dhis2
//
// This test is designed to be run against a REAL DHIS2 instance to diagnose
// connection, authentication, and permission issues.
//
// HOW TO RUN:
// 1. Fill in your DHIS2 credentials and URL below.
// 2. From the language-dhis2 package root, run:
//    pnpm test:single test/integration.test.js
// =============================================================================

// TODO: Replace with your DHIS2 instance details.
const configuration = {
  username: 'admin',
  password: 'district',
  hostUrl: 'https://dhis2.mwdhis2.info', // e.g., 'https://your.dhis2.instance.org'
};

// A unique code for the test org unit to avoid conflicts.
const testOrgUnitCode = `TEST_${new Date().getTime()}`;

// =============================================================================

describe('DHIS2 Integration Tests', () => {
  // Increase timeout for real network requests.
  const timeout = 30000;

  const state = {
    configuration,
    data: {},
    references: [],
  };

  it('should connect to DHIS2 and successfully create an organization unit', async function () {
    this.timeout(timeout);

    console.log(`🧪 Attempting to create org unit on: ${configuration.hostUrl}`);
    console.log(`   Org Unit Name: 'Test Org Unit'`);
    console.log(`   Org Unit Code: '${testOrgUnitCode}'`);

    const creationPayload = {
      name: 'Test Org Unit',
      shortName: 'Test OU',
      code: testOrgUnitCode,
      openingDate: '2024-01-01',
    };

    const createOperation = create('organisationUnits', creationPayload);

    try {
      await createOperation(state);
    } catch (error) {
      console.error('❌ Test Failed: The create operation threw an error.');
      console.error('   This is likely due to a connection, authentication, or permission issue.');
      console.error('   Underlying Error:', error.message);
      // Re-throw to make the test fail clearly.
      throw error;
    }

    console.log('✅ Create operation completed without throwing an error.');
    console.log('📄 Full API Response stored in state:', JSON.stringify(state.data, null, 2));
    

    // Assertions to verify a successful response from DHIS2.
    expect(state.data).to.exist;
    expect(state.data.httpStatus).to.equal('Created');
    expect(state.data.status).to.equal('OK');
    expect(state.data.response).to.exist;
    expect(state.data.response.uid).to.be.a('string');

    console.log(`✅ Successfully created org unit with UID: ${state.data.response.uid}`);
  }).timeout(timeout);
  
  it('should connect to DHIS2 and successfully upsert an organization unit', async function () {
    this.timeout(timeout);

    console.log(`🧪 Attempting to upsert org unit on: ${configuration.hostUrl}`);
    console.log(`   Org Unit Name: 'Test Org Unit'`);
    console.log(`   Org Unit Code: '${testOrgUnitCode}'`);

    const upsertPayload = {
      name: 'Test Org Unit',
      shortName: 'Test OU',
      code: testOrgUnitCode,
      openingDate: '2024-01-01',
    };

    const upsertOperation = upsert(
      'organisationUnits',
      { filter: `code:eq:${testOrgUnitCode}` },
      upsertPayload
    );

    try {
      await upsertOperation(state);
    } catch (error) {
      console.error('❌ Test Failed: The upsert operation threw an error.');
      console.error('   This is likely due to a connection, authentication, or permission issue.');

      throw error;
    }

    console.log('✅ Upsert operation completed without throwing an error.');
    console.log('📄 Full API Response stored in state:', JSON.stringify(state.data, null, 2));

    // Assertions for a successful update response.
    expect(state.data).to.exist;
    expect(state.data.httpStatus).to.equal('OK');
    expect(state.data.status).to.equal('OK');
    expect(state.data.response).to.exist;
    expect(state.data.status).to.equal('OK');
    expect(state.data.response.uid).to.be.a('string');
    expect(state.data.httpStatus).to.equal('OK');
    expect(state.data.httpStatusCode).to.equal(200);

  }).timeout(timeout);

  after(async function() {
    this.timeout(timeout);
    console.log('ℹ️  Skipping cleanup. You may want to manually delete the test org unit.');
  });
}); 