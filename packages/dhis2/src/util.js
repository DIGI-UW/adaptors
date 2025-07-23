import { composeNextState } from '@openfn/language-common';
import {
  request as commonRequest,
  makeBasicAuthHeader,
  logResponse,
} from '@openfn/language-common/util';

export function shouldUseNewTracker(resourceType) {
  return /^(enrollments|relationships|events|trackedEntities)$/.test(
    resourceType
  );
}
/**
 * Converts an attribute ID and value into a DHIS2 attribute object
 * @public
 * @example
 * fn(state => {
 *    const s = util.attr('w75KJ2mc4zz', 'Elias');
 *    console.log(s);
 *    return state;
 * })
 * @function
 * @param {string} attribute - A tracked entity instance (TEI) attribute ID.
 * @param {string} value - The value for that attribute.
 * @returns {object}
 */
export function attr(attribute, value) {
  return { attribute, value };
}

/**
 * Converts a dataElement and value into a DHIS2 dataValue object
 * @public
 * @example
 * fn(state => {
 *   const s = util.dv('f7n9E0hX8qk', 12);
 *   console.log(s);
 *   return state
 * })
 * @function
 * @param {string} dataElement - A data element ID.
 * @param {string} value - The value for that data element.
 * @returns {object}
 */
export function dv(dataElement, value) {
  return { dataElement, value };
}

/**
 * Gets an attribute value by its case-insensitive display name
 * @public
 * @example
 * fn(state => {
 *    const s = util.findAttributeValue(state.data.trackedEntities[0], 'first name');
 *    console.log(s);
 *    return state
 * })
 * @function
 * @param {Object} trackedEntity - A tracked entity instance (TEI) object
 * @param {string} attributeDisplayName - The 'displayName' to search for in the TEI's attributes
 * @returns {string}
 */
export function findAttributeValue(trackedEntity, attributeDisplayName) {
  return trackedEntity?.attributes?.find(
    a => a?.displayName.toLowerCase() == attributeDisplayName.toLowerCase()
  )?.value;
}

/**
 * Gets an attribute value by its uid
 * @public
 * @example
 * fn(state =>{
 *   const s = util.findAttributeValueById(state.tei, 'y1w2R6leVmh');
 *   console.log(s);
 *   return state
 * })
 * @function
 * @param {Object} trackedEntity - A tracked entity instance (TEI) object
 * @param {string} attributeUid - The uid to search for in the TEI's attributes
 * @returns {string}
 */
export function findAttributeValueById(trackedEntity, attributeUid) {
  return trackedEntity?.attributes?.find(a => a?.attribute == attributeUid)
    ?.value;
}

export const CONTENT_TYPES = {
  xml: 'application/xml',
  json: 'application/json',
  pdf: 'application/pdf',
  csv: 'application/csv',
  xls: 'application/vnd.ms-excel',
};

/**
 * Determines the attribute name for a DHIS2 system ID given a resource type.
 * @param {string} resourceType
 * @returns {string}
 */
export function selectId(resourceType) {
  if (resourceType === 'trackedEntityInstances') return 'trackedEntityInstance';
  return 'id';
}

export function handleHttpResponse(result, state) {
  if (result.status >= 400) {
    throw new Error(JSON.stringify(result.data, null, 2));
  }
  return result;
}

export function handleResponse(result, state) {
  if (result.status >= 400) {
    // Always throw an error if the request fails.
    const message = result.data?.response?.errorReports
      ? result.data.response.errorReports.map(er => er.message).join('; ')
            : JSON.stringify(result.data, null, 2);

    console.error('DHIS2 API Error:', message);
    throw new Error(message);
  }
  state.data = result.data;
  state.response = result;
}

export function prettyJson(data) {
  return JSON.stringify(data, null, 2);
}

export function ensureArray(data, key) {
  return Array.isArray(data) ? { [key]: data } : { [key]: [data] };
}

export function prefixVersionToPath(
  configuration,
  options,
  resourceType,
  path = null
) {
  let { apiVersion } = configuration;
  const urlString = '/' + resourceType;

  // Note that users can override the apiVersion from configuration with args
  if (options?.apiVersion) apiVersion = options.apiVersion;

  const apiMessage = apiVersion
    ? `Using DHIS2 api version ${apiVersion}`
    : 'Using latest available version of the DHIS2 api on this server.';

  console.log(apiMessage);

  const pathSuffix = apiVersion ? `/${apiVersion}${urlString}` : `${urlString}`;

  const urlPath = '/api' + pathSuffix;
  if (path) return `${urlPath}/${path}`;
  return urlPath;
}
export const configureAuth = (auth, headers = {}) => {
  if ('pat' in auth) {
    Object.assign(headers, {
      Authorization: `ApiToken ${auth.pat}`,
    });
  } else if ('password' in auth) {
    Object.assign(headers, makeBasicAuthHeader(auth.username, auth.password));
  } else {
    throw new Error(
      'Invalid authorization credentials. Include an pat, username or password in state.configuration'
    );
  }

  return headers;
};

export async function request(configuration, requestData) {
  const { hostUrl } = configuration;
  const { method, path, options = {}, data = {} } = requestData;

  const {
    headers = { 'content-type': 'application/json' },
    query = {},
    parseAs = 'json',
  } = options;

  if (options) console.log(`with params: `, query);

  const authHeaders = configureAuth(configuration, headers);

  const opts = {
    headers: {
      ...authHeaders,
      ...headers,
    },
    query,
    parseAs,
    body: data,
    baseUrl: hostUrl,
  };

  try {
    const result = await commonRequest(method, path, opts);
    const { headers, status, statusText, body } = result;

    return {
      headers,
      status,
      statusText,
      data: body,
    };
  } catch (error) {
    console.error(`DHIS2 Request Failed: ${error.message}`);
    // Re-throw the error to ensure it propagates up to the job.
    throw error;
  }
}
