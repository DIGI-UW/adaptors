import {
  execute as commonExecute,
  fn,
} from '@openfn/language-common';
import { expandReferences, throwError } from '@openfn/language-common/util';
import {
  handleResponse,
  selectId,
  shouldUseNewTracker,
  ensureArray,
  prefixVersionToPath,
  request,
} from './util.js';

/**
 * State object
 * @typedef {Object} DHIS2State
 * @private
 * @property data - The response body (as JSON)
 * @property references - An array of all previous data objects used in the Job
 */

/**
 * Global SFTP client for batch processing
 * @private
 */
let sftpClient = null;

/**
 * Options object
 * @typedef {Object} RequestOptions
 * @property {object} query - An object of query parameters to be encoded into the URL
 * @property {object} headers - An object of all request headers
 * @property {string} [parseAs='json'] - The response format to parse (e.g., 'json', 'text', 'stream', or 'base64'. Defaults to `json`
 * @property {string} [apiVersion=42] - The apiVersion of the request. Defaults to 42.
 */

/**
 * Execute a sequence of operations.
 * Wraps `language-common/execute`, and prepends initial state for DHIS2.
 * @example
 * execute(
 *   create('foo'),
 *   delete('bar')
 * )(state)
 * @private
 * @param {Operations} operations - Operations to be performed.
 * @returns {Operation}
 */
export function execute(...operations) {
  const initialState = {
    references: [],
    data: null,
  };

  return state => {
    const version = state.configuration?.apiVersion;

    if (+version < 36) {
      console.warn(
        `WARNING: This adaptor is INCOMPATIBLE with DHIS2 tracker API versions before v36. Some functionality may break. See https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/tracker.html`
      );
    }

    return commonExecute(
      configMigrationHelper,
      ...operations
    )({ ...initialState, ...state });
  };
}

/**
 * Migrates `apiUrl` to `hostUrl` if `hostUrl` is `blank`.
 * For `OpenFn.org` users with the `old-style configuration`.
 * @example
 * configMigrationHelper(state)
 * @function
 * @param {object} state - the runtime state
 * @returns {object}
 */
function configMigrationHelper(state) {
  const { hostUrl, apiUrl } = state.configuration;
  if (!hostUrl) {
    console.warn(
      'DEPRECATION WARNING: Please migrate instance address from `apiUrl` to `hostUrl`.'
    );
    state.configuration.hostUrl = apiUrl;
    return state;
  }
  return state;
}

/**
 * Connect to SFTP server (for combined credentials)
 * @private
 */
function sftpConnect(state) {
  const { sftpConfiguration } = state.configuration || {};
  
  if (!sftpConfiguration || !sftpConfiguration.host) {
    console.log('ℹ️  DHIS2: No SFTP configuration found, skipping SFTP connection');
    return state;
  }
  
  console.log('🔗 DHIS2: Establishing SFTP connection...');
  
  if (sftpClient) {
    console.log('⚠️  DHIS2: SFTP connection already exists, reusing existing connection');
    return state;
  }
  
  const SftpClient = require('ssh2-sftp-client');
  sftpClient = new SftpClient();
  
  // Clean host URI if present
  const cleanedConfig = { ...sftpConfiguration };
  if (cleanedConfig.host && typeof cleanedConfig.host === 'string') {
    cleanedConfig.host = cleanedConfig.host.replace(/^(sftp|ftp):\/\//, '');
  }
  
  console.log(`🔗 DHIS2: Connecting to ${cleanedConfig.host}:${cleanedConfig.port || 22}`);
  
  return sftpClient.connect(cleanedConfig).then(() => {
    console.log('✅ DHIS2: SFTP connection established successfully');
    return state;
  }).catch(error => {
    console.error('❌ DHIS2: SFTP connection failed:', error.message);
    sftpClient = null;
    throw new Error(`DHIS2 SFTP connection failed: ${error.message}`);
  });
}

/**
 * Disconnect from SFTP server  
 * @private
 */
function sftpDisconnect(state) {
  if (!sftpClient) {
    console.log('ℹ️  DHIS2: No SFTP connection to disconnect');
    return state;
  }
  
  console.log('🔌 DHIS2: Disconnecting from SFTP server...');
  
  try {
    sftpClient.end();
    console.log('✅ DHIS2: SFTP connection closed successfully');
  } catch (error) {
    console.warn('⚠️  DHIS2: Error closing SFTP connection:', error.message);
  } finally {
    sftpClient = null;
  }
  
  return state;
}

/**
 * Execute DHIS2 operations with SFTP support
 * Use this when you need both DHIS2 and SFTP functionality in the same job
 * @example
 * executeWithSftp(
 *   getExcelChunk('/path/file.xlsx', 0, 5000),
 *   create('dataValueSets', transformedData)
 * )(state)
 * @public
 * @param {Operations} operations - Operations to be performed
 * @returns {Operation}
 */
export function executeWithSftp(...operations) {
  const initialState = {
    references: [],
    data: null,
  };

  return state => {
    const version = state.configuration?.apiVersion;

    if (+version < 36) {
      console.warn(
        `WARNING: This adaptor is INCOMPATIBLE with DHIS2 tracker API versions before v36. Some functionality may break. See https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/tracker.html`
      );
    }

    return commonExecute(
      configMigrationHelper,
      sftpConnect,      // Connect to SFTP if needed
      ...operations,    // Your operations (can now use SFTP)
      sftpDisconnect    // Disconnect from SFTP
    )({ ...initialState, ...state }).catch(error => {
      console.error('❌ DHIS2: executeWithSftp encountered error:', error.message);
      
      // Emergency cleanup
      try {
        sftpDisconnect(state);
      } catch (cleanupError) {
        console.warn('⚠️  DHIS2: Error during emergency SFTP cleanup:', cleanupError.message);
      }
      
      throw error;
    });
  };
}

/**
 * Create a record
 * @public
 * @example <caption>Create a program</caption>
 * create('programs', {
 *   name: 'name 20',
 *   shortName: 'n20',
 *   programType: 'WITHOUT_REGISTRATION',
 * });
 * @example <caption>Create a single event</caption>
 * create('events', {
 *   program: 'eBAyeGv0exc',
 *   orgUnit: 'DiszpKrYNg8',
 *   occurredAt: '2025-06-19',
 *   status: 'COMPLETED',
 * });
 * @example <caption>Create a single tracker entity. See [Create tracker docs](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-241/tracker.html#webapi_nti_import)</caption>
 * create('trackedEntities', {
 *   orgUnit: 'TSyzvBiovKh',
 *   trackedEntityType: 'nEenWmSyUEp',
 *   attributes: [
 *     {
 *       attribute: 'w75KJ2mc4zz',
 *       value: 'Gigiwe',
 *     },
 *   ]
 * });
 * @example <caption>Create a dataSet</caption>
 * create('dataSets', { name: 'OpenFn Data Set', periodType: 'Monthly', shortName: 'ODS' });
 * @example <caption>a dataSetNotification</caption>
 * create('dataSetNotificationTemplates', {
 *   dataSetNotificationTrigger: 'DATA_SET_COMPLETION',
 *   notificationRecipient: 'ORGANISATION_UNIT_CONTACT',
 *   name: 'Notification',
 *   messageTemplate: 'Hello',
 *   deliveryChannels: ['SMS'],
 *   dataSets: [],
 * });
 * @example <caption>Create a dataElement</caption>
 * create('dataElements', {
 *   aggregationType: 'SUM',
 *   domainType: 'AGGREGATE',
 *   valueType: 'NUMBER',
 *   name: 'Paracetamol',
 *   shortName: 'Para',
 * });
 * @example <caption>Create a dataElementGroup</caption>
 * create('dataElementGroups', {
 *   name: 'Data Element Group 1',
 *   shortName: 'DEG1',
 *   dataElements: [],
 * });
 * @example <caption>Create a dataElementGroupSet</caption>
 * create('dataElementGroupSets', {
 *   name: 'Data Element Group Set 4',
 *   dataDimension: true,
 *   shortName: 'DEGS4',
 *   dataElementGroups: [],
 * });
 * @example <caption>Create a dataValueSet</caption>
 * create('dataValueSets', {
 *   dataElement: 'f7n9E0hX8qk',
 *   period: '201401',
 *   orgUnit: 'DiszpKrYNg8',
 *   value: '12',
 * });
 * @example <caption>Create a dataValueSet with related dataValues</caption>
 * create('dataValueSets', {
 *   dataSet: 'pBOMPrpg1QX',
 *   completeDate: '2014-02-03',
 *   period: '201401',
 *   orgUnit: 'DiszpKrYNg8',
 *   dataValues: [
 *     {
 *       dataElement: 'f7n9E0hX8qk',
 *       value: '1',
 *     },
 *     {
 *       dataElement: 'Ix2HsbDMLea',
 *       value: '2',
 *     },
 *     {
 *       dataElement: 'eY5ehpbEsB7',
 *       value: '3',
 *     },
 *   ],
 * });
 * @example <caption>Create an enrollment</caption>
 * create('enrollments', {
 *   trackedEntity: 'bmshzEacgxa',
 *   orgUnit: 'TSyzvBiovKh',
 *   program: 'ur1Edk5Oe2n',
 *   enrolledAt: '2013-09-17',
 *   enrollmentDate: '2013-09-17',
 *   incidentDate: '2013-09-17',
 * });
 * @function
 * @param {string} path - Path to the resource to be created
 * @magic path $.children.resourceTypes[*]
 * @param {DHIS2Data} data - An object, or array of objects, to create.
 * @param {object} params - Optional object of query parameters to include in the request
 * @state data - The created resource as returned by DHIS2
 * @returns {Operation}
 */
export function create(path, data, params = {}) {
  return async state => {
    const { configuration } = state;
    if (path === 'tracker') {
      throw new Error('Invalid resourceType. Use `tracker.import()` instead.');
    }

    const [resolvedPath, resolvedData, resolvedParams] = expandReferences(
      state,
      path,
      data,
      params
    );

    let response;
    if (shouldUseNewTracker(resolvedPath)) {
      response = await callNewTracker(
        'create',
        configuration,
        {
          query: resolvedParams,
        },
        resolvedPath,
        resolvedData
      );
    } else {
      const path = prefixVersionToPath(configuration, {}, resolvedPath);
      response = await request(configuration, {
        method: 'POST',
        path,
        options: {
          query: resolvedParams,
        },
        data: resolvedData,
      });
    }
    console.log(`Created ${resolvedPath}`);

    const { location } = response.headers;
    if (location) {
      console.log(
        `Record available @ ${
          response.headers.location || `${state.configuration.hostUrl}/${path}`
        }${location}`
      );
    }

    return handleResponse(response, state);

  };
}

/**
 * Get any resource, as JSON, from DHIS2. Pass in any valid DHIS2 REST path, excluding /api and the version.
 * For the new tracker API, see `tracker.export()`
 * @public
 * @example <caption>Get all data values for the 'pBOMPrpg1QX' dataset</caption>
 * get('dataValueSets', {
 *   dataSet: 'pBOMPrpg1QX',
 *   orgUnit: 'DiszpKrYNg8',
 *   period: '201401',
 *   fields: '*',
 * });
 * @example <caption>Get all programs for an organization unit</caption>
 * get('programs', { orgUnit: 'TSyzvBiovKh', fields: '*' });
 * @example <caption>Get a single tracked entity given the provided ID. See [TrackedEntities docs](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-241/tracker.html#tracked-entities-get-apitrackertrackedentities)</caption>
 * get('tracker/trackedEntities/F8yKM85NbxW');
 * @function
 * @param {string} path - Path to the resource
 * @param {object} params - Object of query parameters to include in the request
 * @state data - the resource returned by DHIS2
 * @returns {Operation}
 */
export function get(path, params = {}) {
  return async state => {
    const [resolvedPath, resolvedParams] = expandReferences(
      state,
      path,
      params
    );

    const response = await request(state.configuration, {
      method: 'GET',
      path: prefixVersionToPath(state.configuration, {}, resolvedPath),
      options: { query: resolvedParams },
    });

    console.log(`Retrieved ${resolvedPath}`);

    return handleResponse(response, state);
  };
}

/**
 * Update a resource object of any type. Updating an object requires all fields of the object you are updating, even if they have not been modified
 * @public
 * @example <caption>a program</caption>
 * update('programs', 'qAZJCrNJK8H', {
 *   name: '14e1aa02c3f0a31618e096f2c6d03bed',
 *   shortName: '14e1aa02',
 *   programType: 'WITHOUT_REGISTRATION',
 * });
 * @example <caption>an event</caption>
 * update('events', 'PVqUD2hvU4E', {
 *   program: 'eBAyeGv0exc',
 *   orgUnit: 'Ngelehun CHC',
 *   status: 'COMPLETED',
 *   storedBy: 'admin',
 *   dataValues: [],
 * });
 * @example <caption>Update a tracker entity. See [Update tracker docs](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-241/tracker.html#webapi_nti_import)</caption>
 * update('trackedEntities', '', {
 *   createdAt: '2015-08-06T21:12:37.256',
 *   orgUnit: 'TSyzvBiovKh',
 *   createdAtClient: '2015-08-06T21:12:37.256',
 *   trackedEntity: 'IeQfgUtGPq2',
 *   trackedEntityType: 'nEenWmSyUEp',
 *   inactive: false,
 *   deleted: false,
 *   featureType: 'NONE',
 *   programOwners: [
 *     {
 *       ownerOrgUnit: 'TSyzvBiovKh',
 *       program: 'IpHINAT79UW',
 *       trackedEntity: 'IeQfgUtGPq2',
 *     },
 *   ],
 *   attributes: [
 *     {
 *       lastUpdated: '2016-01-12T00:00:00.000',
 *       displayName: 'Last name',
 *       created: '2016-01-12T00:00:00.000',
 *       valueType: 'TEXT',
 *       attribute: 'zDhUuAYrxNC',
 *       value: 'Russell',
 *     },
 *     {
 *       lastUpdated: '2016-01-12T00:00:00.000',
 *       code: 'MMD_PER_NAM',
 *       displayName: 'First name',
 *       created: '2016-01-12T00:00:00.000',
 *       valueType: 'TEXT',
 *       attribute: 'w75KJ2mc4zz',
 *       value: 'Catherine',
 *     },
 *   ],
 * });
 * @example <caption>Update a dataSet</caption>
 * update('dataSets', 'lyLU2wR22tC', { name: 'OpenFN Data Set', periodType: 'Weekly' });
 * @example <caption>a dataSetNotification</caption>
 * update('dataSetNotificationTemplates', 'VbQBwdm1wVP', {
 *   dataSetNotificationTrigger: 'DATA_SET_COMPLETION',
 *   notificationRecipient: 'ORGANISATION_UNIT_CONTACT',
 *   name: 'Notification',
 *   messageTemplate: 'Hello Updated',
 *   deliveryChannels: ['SMS'],
 *   dataSets: [],
 * });
 * @example <caption>Update a dataElement</caption>
 * update('dataElements', 'FTRrcoaog83', {
 *   aggregationType: 'SUM',
 *   domainType: 'AGGREGATE',
 *   valueType: 'NUMBER',
 *   name: 'Paracetamol',
 *   shortName: 'Para',
 * });
 * @example <caption>Update a dataElementGroup</caption>
 * update('dataElementGroups', 'QrprHT61XFk', {
 *   name: 'Data Element Group 1',
 *   dataElements: [],
 * });
 * @example <caption>Update a dataElementGroupSet</caption>
 * update('dataElementGroupSets', 'VxWloRvAze8', {
 *   name: 'Data Element Group Set 4',
 *   dataDimension: true,
 *   shortName: 'DEGS4',
 *   dataElementGroups: [],
 * });
 * @example <caption>Update a dataValueSet</caption>
 * update('dataValueSets', 'AsQj6cDsUq4', {
 *   dataElement: 'f7n9E0hX8qk',
 *   period: '201401',
 *   orgUnit: 'DiszpKrYNg8',
 *   value: '12',
 * });
 * @example <caption>Update a dataValueSet with related dataValues</caption>
 * update('dataValueSets', 'Ix2HsbDMLea', {
 *   dataSet: 'pBOMPrpg1QX',
 *   completeDate: '2014-02-03',
 *   period: '201401',
 *   orgUnit: 'DiszpKrYNg8',
 *   dataValues: [
 *     {
 *       dataElement: 'f7n9E0hX8qk',
 *       value: '1',
 *     },
 *     {
 *       dataElement: 'Ix2HsbDMLea',
 *       value: '2',
 *     },
 *     {
 *       dataElement: 'eY5ehpbEsB7',
 *       value: '3',
 *     },
 *   ],
 * });
 * @example <caption>Update an enrollment given the provided ID</caption>
 * update('enrollments', 'CmsHzercTBa' {
 *   trackedEntity: 'bmshzEacgxa',
 *   orgUnit: 'TSyzvBiovKh',
 *   program: 'gZBxv9Ujxg0',
 *   enrollmentDate: '2013-10-17',
 *   incidentDate: '2013-10-17',
 * });
 * @function
 * @param {string} resourceType - The type of resource to be updated. E.g. `dataElements`, `organisationUnits`, etc.
 * @param {string} path - The `id` or `path` to the `object` to be updated. E.g. `FTRrcoaog83` or `FTRrcoaog83/{collection-name}/{object-id}`
 * @param {Object} data - Data to update. It requires to send the full body. If you want partial updates, use patch operation.
 * @param {RequestOptions} [options] - An optional object containing query, parseAs,and headers for the request.
 * @state data - the resource returned by DHIS2
 * @returns {Operation}
 */
export function update(resourceType, path, data, options = {}) {
  return async state => {
    console.log(`Preparing update operation...`);

    const [resolvedResourceType, resolvedPath, resolvedData, resolvedOptions] =
      expandReferences(state, resourceType, path, data, options);
    const { configuration } = state;

    let response;
    if (shouldUseNewTracker(resolvedResourceType)) {
      response = await callNewTracker(
        'update',
        configuration,
        resolvedOptions,
        resolvedResourceType,
        resolvedData
      );
    } else {
      response = await request(configuration, {
        method: 'PUT',
        path: prefixVersionToPath(
          configuration,
          resolvedOptions,
          resolvedResourceType,
          resolvedPath
        ),
        options: resolvedOptions,
        data: resolvedData,
      });
    }

    console.log(`Updated ${resolvedResourceType} at ${resolvedPath}`);
    return handleResponse(response, state);
  };
}

/**
 * Upsert a record. This will atomically update a record if it already exists, or otherwise create it.
 * This function does not work with the absolute tracker path `api/tracker` but rather the new tracker paths and deprecated tracker endpoints.
 * @public
 * @example <caption>Upsert a trackedEntity</caption>
 * upsert('trackedEntities', {}, {
 *  orgUnit: 'TSyzvBiovKh',
 *  trackedEntityType: 'nEenWmSyUEp',
 *  attributes: [
 *    {
 *      attribute: 'w75KJ2mc4zz',
 *      value: 'Qassim',
 *    },
 *  ],
 * });
 * @example <caption> Upsert a dataElement </caption>
 * upsert(
 *   'dataElements',
 *   { filter: 'id:eq:P3jJH5Tu5VC' },
 *   {
 *     op: 'add',
 *     path: '/domainType',
 *     name: 'Acute',
 *     shortName: 'AFP follow-up',
 *     dimensionItemType: 'DATA_ELEMENT',
 *     legendSets: [],
 *     aggregationType: 'SUM',
 *     valueType: 'NUMBER',
 *     domainType: 'AGGREGATE',
 *     code: 'DE_359049',
 *     name: 'Acute Flaccid Paralysis (AFP) follow-up',
 *    }
 *  );
 * @function
 * @param {string} resourceType - The type of a resource to `upsert`. E.g. `trackedEntities`.
 * @param {Object} query - A query object that allows to uniquely identify the resource to update. If no matches found, then the resource will be created.
 * @param {Object} data - The data to use for update or create depending on the result of the query.
 * @param {RequestOptions} [options] - An optional object containing query, parseAs,and headers for the request
 * @throws {RangeError} - Throws range error
 * @state {DHIS2State}
 * @returns {Operation}
 */
export function upsert(
  resourceType, // resourceType supplied to both the `get` and the `create/update`
  query, // query supplied to the `get`
  data, // data supplied to the `create/update`
  options = {} // options supplied to both the `get` and the `create/update`
) {
  return async state => {
    const [resolvedResourceType, resolvedOptions, resolvedData, resolvedQuery] =
      expandReferences(state, resourceType, options, data, query);

    let response;
    const { configuration } = state;
    if (shouldUseNewTracker(resolvedResourceType)) {
      response = await callNewTracker(
        'create_and_update',
        configuration,
        resolvedOptions,
        resolvedResourceType,
        resolvedData
      );
    } else {
      response = await request(configuration, {
        method: 'GET',
        path: prefixVersionToPath(
          configuration,
          resolvedOptions,
          resolvedResourceType
        ),
        options: {
          ...resolvedOptions,
          query: {
            ...resolvedQuery,
          },
        },
      });
      const resources = response.data[resourceType];
      if (resources.length > 1) {
        throwError(409, {
          description:
            'Upsert failed: Multiple records found for a non-unique attribute.',
          fix: 'Ensure the attribute is unique or modify the request to target a single record.',
          error: 'Conflict',
        });
      } else if (resources.length <= 0) {
        response = await request(configuration, {
          method: 'POST',
          path: prefixVersionToPath(
            configuration,
            resolvedOptions,
            resolvedResourceType
          ),
          options: resolvedOptions,
          data: resolvedData,
        });
      } else {
        // Pick out the first (and only) resource in the array and grab its
        // ID to be used in the subsequent `update` by the path determined
        // by the `selectId(...)` function.
        const path = resources[0][selectId(resourceType)];
        response = await request(configuration, {
          method: 'PUT',
          path: prefixVersionToPath(
            configuration,
            resolvedOptions,
            resolvedResourceType,
            path
          ),
          options: resolvedOptions,
          data: resolvedData,
        });
      }
    }
    return handleResponse(response, state);
  };
}

export function upsertOrganisationUnitHierarchy(
  orgUnitStructures,
  options = {}
) {
  return async function (state) {
    console.log('Upserting organisation unit hierarchy...');
    const { maxLevels, openingDate } = options;
    if (!maxLevels) {
      throw new Error('maxLevels option must be provided.');
    }

    const mappings = {}; // Map name to ID
    const responses = []; // Collect all individual responses

    const orgUnitsByLevel = orgUnitStructures.reduce((acc, ou) => {
      acc[ou.level] = acc[ou.level] || [];
      acc[ou.level].push(ou);
      return acc;
    }, {});

    for (let level = 1; level <= maxLevels; level++) {
      const orgUnits = orgUnitsByLevel[level] || [];
      if (orgUnits.length > 0)
        console.log(`Processing Level ${level}: ${orgUnits.length} units.`);

      for (const orgUnit of orgUnits) {
        const payload = {
          name: orgUnit.name,
          shortName: orgUnit.shortName,
          code: orgUnit.code,
          openingDate: openingDate || '2024-01-01',
        };

        if (orgUnit.parent) {
          const parentId = mappings[orgUnit.parent];
          if (!parentId) {
            console.log(
              `   ❌ ERROR: Parent '${orgUnit.parent}' not found. Skipping '${orgUnit.name}'.`
            );
            continue;
          }
          payload.parent = { id: parentId };
        }

        const upsertOp = upsert(
          'organisationUnits',
          { filter: `code:eq:${orgUnit.code}` },
          payload
        );

        try {
          await upsertOp(state); // This mutates state

          // Deep copy the response before it's overwritten by the next operation
          const responseData = JSON.parse(JSON.stringify(state.data));
          responses.push(responseData);

          if (responseData.response?.uid) {
            const newId = responseData.response.uid;
            mappings[orgUnit.name] = newId;
          } else {
            console.error(
              `   ❌ ERROR: Could not determine UID from upsert response for '${orgUnit.name}'.`
            );
          }
        } catch (error) {
          console.error(
            `   ❌ Failed to upsert: ${orgUnit.name}. Error: ${error.message}`
          );
          responses.push({
            error: error.message,
            orgUnit: orgUnit.name,
          });
        }
      }
    }

    // Set the final state to a combined report of all operations
    state.data = { mappings, responses };
  };
}

/**
 * Delete record.
 * @public
 * @function
 * @example <caption>a tracked entity instance. See [Delete tracker docs](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-241/tracker.html#webapi_nti_import)</caption>
 * destroy('trackedEntities', 'LcRd6Nyaq7T');
 * @param {string} resourceType - The type of resource to be deleted. E.g. `trackedEntities`, `organisationUnits`, etc.
 * @param {string} path - Can be an `id` of an `object` or `path` to the `nested object` to `delete`.
 * @param {Object} [data] - Optional. This is useful when you want to remove multiple objects from a collection in one request. You can send `data` as, for example, `{"identifiableObjects": [{"id": "IDA"}, {"id": "IDB"}, {"id": "IDC"}]}`. See more {@link https://docs.dhis2.org/2.34/en/dhis2_developer_manual/web-api.html#deleting-objects on DHIS2 API docs}
 * @param {RequestOptions} [options] - An optional object containing query, parseAs,and headers for the request.
 * @state {DHIS2State}
 * @returns {Operation}
 */
export function destroy(resourceType, path, data = null, options = {}) {
  return async state => {
    console.log('Preparing destroy operation...');

    const [resolvedResourceType, resolvedPath, resolvedData, resolvedOptions] =
      expandReferences(state, resourceType, path, data, options);

    const { configuration } = state;

    let response;
    if (shouldUseNewTracker(resolvedResourceType)) {
      response = await callNewTracker(
        'delete',
        configuration,
        resolvedOptions,
        resolvedResourceType,
        resolvedData
      );
    } else {
      response = await request(configuration, {
        method: 'DELETE',
        path: prefixVersionToPath(
          configuration,
          resolvedOptions,
          resolvedResourceType,
          resolvedPath
        ),
        options: resolvedOptions,
        data: resolvedData,
      });
    }

    console.log(`Deleted ${resolvedResourceType} at ${resolvedPath}`);
    return handleResponse(response, state);
  };
}

function callNewTracker(
  type = 'update',
  configuration,
  options,
  resourceType,
  data = {}
) {
  let importStrategy;
  switch (type) {
    case 'create':
      importStrategy = 'CREATE';
      break;
    case 'update':
      importStrategy = 'UPDATE';
      break;
    case 'delete':
      importStrategy = 'DELETE';
      break;
    default:
      importStrategy = 'CREATE_AND_UPDATE';
  }

  return request(configuration, {
    method: 'POST',
    path: prefixVersionToPath(configuration, options, 'tracker'),
    options: {
      ...options,
      query: {
        ...options.query,
        async: false,
        importStrategy,
      },
    },
    data: ensureArray(data, resourceType),
  });
}

/**
 * Read a specific chunk from an Excel file via SFTP
 * @public
 * @example
 * getExcelChunk('/data/file.xlsx', 0, 5000)(state)
 * @function
 * @param {string} filePath - Path to the Excel file on the SFTP server
 * @param {number} chunkIndex - Zero-based index of the chunk to read (0 = first chunk)
 * @param {number} chunkSize - Number of rows per chunk (default: 5000)
 * @param {object} options - Additional parsing options
 * @returns {Operation}
 */
export function getExcelChunk(filePath, chunkIndex = 0, chunkSize = 5000, options = {}) {
  return async state => {
    console.log(`📄 DHIS2: Reading Excel chunk ${chunkIndex + 1} from ${filePath}`);
    console.log(`📊 DHIS2: Chunk size: ${chunkSize}`);
    
    // Use the connected SFTP client (managed by executeWithSftp)
    if (!sftpClient || !sftpClient.sftp) {
      throw new Error('DHIS2 getExcelChunk: No SFTP connection available. Make sure to use executeWithSftp() to wrap your operations.');
    }
    
    try {
      const startTime = Date.now();
      
      // Read the Excel file buffer using the managed SFTP connection
      console.log(`📖 DHIS2: Reading Excel chunk ${chunkIndex + 1} from ${filePath}`);
      const buffer = await sftpClient.get(filePath);
      
      // Process the Excel chunk using the buffer
      const result = await processExcelChunk(buffer, filePath, chunkIndex, chunkSize);
      
      const totalDuration = Date.now() - startTime;
      console.log(`✅ DHIS2: Successfully read chunk ${chunkIndex + 1} with ${result.chunkData.length} rows in ${totalDuration}ms`);
      
      // Return state with only current chunk data (memory efficient)
      return { 
        ...state, 
        chunkData: result.chunkData,
        chunkMetadata: {
          chunkIndex: result.chunkIndex,
          chunkSize: result.chunkSize,
          rowsInChunk: result.chunkData.length,
          filePath: result.filePath,
          processedAt: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('❌ DHIS2: Excel chunk reading failed:', error.message);
      throw new Error(`Excel chunk reading failed: ${error.message}`);
    }
  };
}

/**
 * Process an Excel chunk to DHIS2 in one atomic operation
 * @public
 * @example
 * processExcelChunkToDHIS2(
 *   '/data/excel-files/data.xlsx',
 *   0,
 *   5000,
 *   (chunkData, metadata) => ({
 *     dataValues: chunkData.map(row => ({
 *       dataElement: row.dataElement,
 *       orgUnit: row.orgUnit,
 *       period: row.period,
 *       value: row.value
 *     })),
 *     completeDate: new Date().toISOString()
 *   })
 * );
 * @function
 * @param {string} filePath - Path to the Excel file
 * @param {number} chunkIndex - Index of the chunk to process (0-based)
 * @param {number} chunkSize - Size of each chunk
 * @param {function} transformFn - Function to transform chunk data to DHIS2 format
 * @param {object} uploadOptions - Optional parameters for the DHIS2 upload
 * @returns {Operation}
 */
export function processExcelChunkToDHIS2(filePath, chunkIndex, chunkSize, transformFn, uploadOptions = {}) {
  return async state => {
    const chunkNumber = chunkIndex + 1;
    console.log(`📦 Processing chunk ${chunkNumber}/${Math.ceil(state.totalRows / chunkSize || 1)}`);
    
    try {
      // Step 1: Read chunk using existing getExcelChunk
      console.log(`📄 Reading chunk ${chunkNumber} from ${filePath}`);
      const chunkState = await getExcelChunk(filePath, chunkIndex, chunkSize)(state);
      
      if (!chunkState.chunkData || chunkState.chunkData.length === 0) {
        console.log(`⚠️  Chunk ${chunkNumber} is empty, skipping`);
        return {
          ...state,
          chunkProcessingResult: {
            chunkIndex,
            chunkNumber,
            rowsProcessed: 0,
            uploadSuccess: false,
            skipped: true,
            reason: 'Empty chunk',
            timestamp: new Date().toISOString()
          }
        };
      }
      
      // Step 2: Transform data to DHIS2 format
      console.log(`🔄 Transforming chunk ${chunkNumber} to DHIS2 format`);
      const transformedData = transformFn(chunkState.chunkData, chunkState.chunkMetadata);
      
      if (!transformedData || !transformedData.dataValues || transformedData.dataValues.length === 0) {
        console.log(`⚠️  Chunk ${chunkNumber} transformation resulted in no data values`);
        return {
          ...state,
          chunkProcessingResult: {
            chunkIndex,
            chunkNumber,
            rowsProcessed: chunkState.chunkData.length,
            uploadSuccess: false,
            skipped: true,
            reason: 'No data values after transformation',
            timestamp: new Date().toISOString()
          }
        };
      }
      
      console.log(`📝 Generated ${transformedData.dataValues.length} data values for chunk ${chunkNumber}`);
      
      // Step 3: Upload to DHIS2 using existing create
      console.log(`⬆️  Uploading chunk ${chunkNumber} to DHIS2`);
      const uploadState = await create('dataValueSets', transformedData, uploadOptions)(chunkState);
      
      console.log(`✅ Chunk ${chunkNumber} uploaded successfully`);
      
      return {
        ...uploadState,
        chunkProcessingResult: {
          chunkIndex,
          chunkNumber,
          rowsProcessed: chunkState.chunkData.length,
          dataValuesUploaded: transformedData.dataValues.length,
          uploadSuccess: true,
          uploadResult: uploadState.data,
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error(`❌ Chunk ${chunkNumber} failed: ${error.message}`);
      
      return {
        ...state,
        chunkProcessingResult: {
          chunkIndex,
          chunkNumber,
          rowsProcessed: 0,
          uploadSuccess: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  };
}

/**
 * Process Excel chunk from buffer (re-implemented from SFTP adaptor for memory efficiency)
 * @private
 */
async function processExcelChunk(buffer, filePath, chunkIndex, chunkSize) {
  console.log('🔧 DHIS2: Starting Excel chunk processing...');
  console.log('🔧 DHIS2: Target chunk:', chunkIndex);
  console.log('🔧 DHIS2: Chunk size:', chunkSize);
  
  // Import modules
  let xlstreamModule;
  let writeFileSync, unlinkSync, join, tmpdir;
  
  try {
    xlstreamModule = await import('xlstream');
    const fsModule = await import('fs');
    const pathModule = await import('path');
    const osModule = await import('os');
    
    writeFileSync = fsModule.writeFileSync;
    unlinkSync = fsModule.unlinkSync;
    join = pathModule.join;
    tmpdir = osModule.tmpdir;
    
    console.log('✅ DHIS2: Required modules imported for chunk processing');
  } catch (importError) {
    console.error('❌ DHIS2: Failed to import required modules:', importError.message);
    throw new Error(`Module import failed: ${importError.message}`);
  }
  
  const { getXlsxStream } = xlstreamModule;
  
  // Create temporary file
  const tempDir = tmpdir();
  const tempFileName = `excel-chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.xlsx`;
  const tempFilePath = join(tempDir, tempFileName);
  
  console.log('🔧 DHIS2: Creating temporary file for chunk:', tempFilePath);
  
  let tempFileCreated = false;
  
  try {
    writeFileSync(tempFilePath, buffer);
    tempFileCreated = true;
    
    return new Promise(async (resolve, reject) => {
      // Helper function to clean up temporary file
      const cleanupTempFile = () => {
        if (tempFileCreated) {
          try {
            unlinkSync(tempFilePath);
            console.log('✅ DHIS2: Temporary chunk file cleaned up');
          } catch (cleanupError) {
            console.warn('⚠️  DHIS2: Could not clean up temporary chunk file:', cleanupError.message);
          }
        }
      };
      
      try {
        const streamOptions = {
          filePath: tempFilePath,
          sheet: 0,
          withHeader: true,
          ignoreEmpty: true,
        };
        
        const stream = await getXlsxStream(streamOptions);
        
        let currentRow = 0;
        let chunkData = [];
        let finished = false;
        
        const startRow = chunkIndex * chunkSize;
        const endRow = startRow + chunkSize - 1;
        
        console.log('🔧 DHIS2: Target row range:', startRow, 'to', endRow);
        
        stream.on('data', (row) => {
          if (finished) return;
          
          // Check if we're in the target chunk range
          if (currentRow >= startRow && currentRow <= endRow) {
            chunkData.push(row.formatted || row);
            
            // Log progress within chunk
            if (chunkData.length % 1000 === 0) {
              console.log('📦 DHIS2: Chunk data collected:', chunkData.length, 'rows');
            }
          }
          
          currentRow++;
          
          // Stop processing if we've collected the full chunk
          if (chunkData.length >= chunkSize) {
            console.log('📦 DHIS2: Chunk collection complete');
            finished = true;
            stream.destroy();
            cleanupTempFile();
            resolve(createChunkResult(chunkData, chunkIndex, chunkSize, filePath));
            return;
          }
          
          // Skip ahead if we haven't reached the target chunk yet
          if (currentRow < startRow && currentRow % 10000 === 0) {
            console.log('📊 DHIS2: Skipping to chunk, current row:', currentRow);
          }
        });
        
        stream.on('end', () => {
          console.log('✅ DHIS2: Chunk stream ended successfully');
          
          if (!finished) {
            finished = true;
            cleanupTempFile();
            resolve(createChunkResult(chunkData, chunkIndex, chunkSize, filePath));
          }
        });
        
        stream.on('error', (error) => {
          console.error('❌ DHIS2: Chunk stream error:', error.message);
          console.error('❌ DHIS2: Error details:', {
            code: error.code,
            message: error.message,
            chunkIndex,
            chunkSize,
            currentRow,
            collectedRows: chunkData.length
          });
          
          if (!finished) {
            finished = true;
            cleanupTempFile();
            reject(new Error(`Excel chunk processing failed for chunk ${chunkIndex}: ${error.message}`));
          }
        });
        
        // Handle stream close events
        stream.on('close', () => {
          console.log('📡 DHIS2: Chunk stream closed');
          if (!finished) {
            console.log('✅ DHIS2: Chunk processing completed on stream close');
            finished = true;
            cleanupTempFile();
            resolve(createChunkResult(chunkData, chunkIndex, chunkSize, filePath));
          }
        });
        
      } catch (error) {
        console.error('❌ DHIS2: Error in chunk processing:', error.message);
        cleanupTempFile();
        reject(error);
      }
    });
    
  } catch (error) {
    console.error('❌ DHIS2: Error in processExcelChunk:', error.message);
    // Clean up if we created the file but failed before returning the Promise
    if (tempFileCreated) {
      try {
        unlinkSync(tempFilePath);
        console.log('✅ DHIS2: Temporary chunk file cleaned up after error');
      } catch (cleanupError) {
        console.warn('⚠️  DHIS2: Could not clean up temporary chunk file:', cleanupError.message);
      }
    }
    throw error;
  }
}



/**
 * Create chunk result object (re-implemented from SFTP adaptor)
 * @private
 */
function createChunkResult(chunkData, chunkIndex, chunkSize, filePath) {
  console.log('📦 DHIS2: Chunk complete:');
  console.log('   - Chunk index:', chunkIndex);
  console.log('   - Rows collected:', chunkData.length);
  
  return {
    chunkData,
    chunkIndex,
    chunkSize,
    filePath
  };
}

export {
  alterState,
  as,
  cursor,
  dataPath,
  dataValue,
  dateFns,
  each,
  field,
  fields,
  fn,
  fnIf,
  group,
  lastReferenceValue,
  map,
  merge,
  sourceValue,
} from '@openfn/language-common';
