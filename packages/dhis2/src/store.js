import { request } from './util.js';

const DEFAULT_NAMESPACE = 'openfn-workflows';

function buildPath(namespace, key) {
  const ns = namespace || DEFAULT_NAMESPACE;
  if (!key) {
    throw new Error('dataStore operations require a key');
  }
  return `/dataStore/${ns}/${key}`;
}

export async function dataStoreGet(configuration, namespace, key, options = {}) {
  try {
    const response = await request(configuration, {
      method: 'GET',
      path: buildPath(namespace, key),
    });
    return response.data;
  } catch (error) {
    if (error.status === 404 && options.suppressErrors) {
      return null;
    }
    throw error;
  }
}

export async function dataStoreSet(configuration, namespace, key, value) {
  const response = await request(configuration, {
    method: 'PUT',
    path: buildPath(namespace, key),
    data: value,
  });
  return response.data;
}

export async function dataStoreDelete(configuration, namespace, key) {
  return request(configuration, {
    method: 'DELETE',
    path: buildPath(namespace, key),
  });
}


