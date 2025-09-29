import { composeNextState, util as commonUtil } from '@openfn/language-common';
const {
  request: commonRequest,
  makeBasicAuthHeader,
  logResponse,
} = commonUtil;

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

  const updateState = currentState => {
    const nextState = composeNextState(currentState, result.data);
    nextState.response = result;
    return nextState;
  };

  if (state.infoFunction) {
    const nextState = state.infoFunction(state, result, updateState);
    return nextState ? nextState : updateState(state);
  }

  return updateState(state);
}

export function prettyJson(data) {
  return JSON.stringify(data, null, 2);
}

export function ensureArray(data, key) {
  return Array.isArray(data) ? { [key]: data } : { [key]: [data] };
}

// Generate a stable DHIS2 code from a display name
export function generateCodeFromName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

// Normalize various period formats to YYYYMM (monthly) for dataValueSets
export function normalizePeriod(p) {
  if (!p) return p;
  const s = String(p);
  const yyyymm = s.match(/^(\d{6})$/);
  if (yyyymm) return yyyymm[1];
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) {
    const d = new Date(iso);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}${m}`;
  }
  const q = s.match(/^(\d{4})Q([1-4])$/i);
  if (q) {
    const year = q[1];
    const quarter = Number(q[2]);
    const month = (quarter - 1) * 3 + 1;
    return `${year}${String(month).padStart(2, '0')}`;
  }
  return s;
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
  // Test-only override hook
  if (request.__override) {
    return await request.__override(configuration, requestData);
  }
  const { hostUrl } = configuration;
  const { method, path, options = {}, data = {} } = requestData;

  const {
    headers = { 'content-type': 'application/json' },
    query = {},
    parseAs = 'json',
  } = options;

  // Some callers may pass { query: { query: {...} } } by mistake. Flatten it.
  const normalizedQuery = (query && typeof query === 'object' && !Array.isArray(query) && 'query' in query && typeof query.query === 'object')
    ? query.query
    : query;

  if (options) console.log(`with params: `, normalizedQuery);

  // TEMP DEBUG (unsafe): log the credentials used for this request
  try {
    const p = String(configuration?.password || '');
    const user = String(configuration?.username || '');
    let authHeader = '';
    try {
      const hdr = makeBasicAuthHeader(user, p);
      authHeader = hdr?.Authorization || '';
    } catch (_) {}
    console.log(
      'ADA AUTH DEBUG:',
      `host=${String(hostUrl || '')}`,
      `user=${user}`,
      `pw_raw=${p}`,
      `auth=${authHeader}`,
      `pat=${configuration?.pat ? '[set]' : '(none)'}`
    );
  } catch (_) {}

  // Detailed request logging for reproducibility (e.g., Postman)
  try {
    const base = String(hostUrl || '').replace(/\/+$/, '');
    const fullUrl = `${base}${path}`;
    const qs = new URLSearchParams(normalizedQuery || {}).toString();
    const urlWithQuery = qs ? `${fullUrl}?${qs}` : fullUrl;
    console.log('ADA HTTP Request:', method, urlWithQuery);
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      let preview = '';
      try {
        preview = JSON.stringify(data);
      } catch (e) {
        preview = '[unserializable payload]';
      }
      // Truncate large payloads to keep logs readable
      if (preview && preview.length > 2000) preview = preview.slice(0, 2000) + '…';
      console.log('ADA HTTP Payload Preview:', preview);
    }
  } catch (e) {
    // best-effort logging only
  }

  const authHeaders = configureAuth(configuration, headers);

  const opts = {
    headers: {
      ...authHeaders,
      ...headers,
    },
    query: normalizedQuery,
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
    try {
      const base = String(hostUrl || '').replace(/\/+$/, '');
      const fullUrl = `${base}${path}`;
      const q = (options && options.query) || {};
      const flat = (q && typeof q === 'object' && 'query' in q && typeof q.query === 'object') ? q.query : q;
      const qs = new URLSearchParams(flat || {}).toString();
      const urlWithQuery = qs ? `${fullUrl}?${qs}` : fullUrl;
      console.error('ADA HTTP Error:', method, urlWithQuery, '→', error.message);
    } catch (_) {}
    console.error(`DHIS2 Request Failed: ${error.message}`);
    // Re-throw the error to ensure it propagates up to the job.
    throw error;
  }
}
