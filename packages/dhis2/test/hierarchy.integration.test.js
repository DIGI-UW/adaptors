import { expect } from 'chai';
import { get, destroy, upsertOrganisationUnitHierarchy } from '../src/Adaptor.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Integration Test for DHIS2 Organisation Unit Hierarchy
//
// HOW TO RUN:
// 1. Fill in your DHIS2 credentials and URL below.
// 2. From the language-dhis2 package root, run:
//    pnpm test:single test/hierarchy.integration.test.js
// =============================================================================

// TODO: Replace with your DHIS2 instance details.
const configuration = {
  username: 'admin',
  password: 'district',
  hostUrl: 'https://dhis2.mwdhis2.info', // e.g., 'https://your.dhis2.instance.org'
};

// =============================================================================

describe('DHIS2 Hierarchy Integration Tests', () => {
  // Increase timeout for real network requests.
  const timeout = 30000;

  const state = {
    configuration,
    data: {},
    references: [],
  };

  it('should create the full organization unit hierarchy from small sample file', async function () {
    this.timeout(timeout * 15); // Increase timeout for this larger test

    const sample = JSON.parse(
      fs.readFileSync(path.resolve('test/fixtures/sample-input-small.json'), 'utf8')
    );

    const { orgUnits } = sample.data.dhis2Structures;
    const { maxLevels } = sample.config;

    console.log(
      `🧪 Attempting to create full org unit hierarchy on: ${configuration.hostUrl}`
    );
    console.log(`   Org Units to create: ${orgUnits.length}`);

    const op = upsertOrganisationUnitHierarchy(orgUnits, { maxLevels });

    try {
      await op(state);
    } catch (error) {
      console.error('❌ Test Failed: The hierarchy creation threw an error.');
      console.error('   Underlying Error:', error.message);
      throw error;
    }

    console.log('✅ Hierarchy creation completed without throwing an error.');
    expect(state.data.mappings).to.exist;
    expect(Object.keys(state.data.mappings).length).to.equal(orgUnits.length);

    // Filter for newly created org units for cleanup
    const createdResponses = state.data.responses.filter(
      r => r.httpStatus === 'Created'
    );
    const createdIds = createdResponses.map(r => r.response.uid);

    state.createdOrgUnitIds = createdIds; // Stash for cleanup
    console.log(
      `✅ Successfully processed ${orgUnits.length} organization units.`
    );
    console.log(`   - ${createdIds.length} were newly created.`);
  }).timeout(timeout * 15);

  // Cleanup step to automatically delete the test org units.
  after(async function () {
    this.timeout(timeout * 15); // Increase timeout for cleanup

    if (state.createdOrgUnitIds && state.createdOrgUnitIds.length > 0) {
      console.log(
        `🧹 Cleaning up ${state.createdOrgUnitIds.length} created organization units...`
      );
      // We need to fetch all org units to delete them in the correct order,
      // from the highest level to the lowest.
      const allOUs = [];
      const getOp = get('organisationUnits', {
        paging: false,
        fields: 'id,level',
        filter: `id:in:[${state.createdOrgUnitIds.join(',')}]`,
      });

      try {
        await getOp(state);
        if (state.data.organisationUnits) {
          allOUs.push(...state.data.organisationUnits);
        }
      } catch (error) {
        console.error(
          'Failed to fetch created org units for cleanup.',
          error.message
        );
        return;
      }

      allOUs.sort((a, b) => b.level - a.level);

      for (const orgUnit of allOUs) {
        // Delete from child to parent
        try {
          const destroyOp = destroy('organisationUnits', orgUnit.id);
          await destroyOp(state);
          console.log(`   ✓ Deleted org unit with ID: ${orgUnit.id}`);
        } catch (error) {
          console.error(
            `   ❌ Failed to delete org unit with ID: ${orgUnit.id}. Manual cleanup might be required.`
          );
          console.error('      Underlying Error:', error.message);
        }
      }
      console.log('✅ Cleanup complete.');
    } else {
      console.log(
        'ℹ️  Skipping cleanup. No new organization units were created in the hierarchy test.'
      );
    }
  });
}); 