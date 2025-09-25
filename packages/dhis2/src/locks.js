import { dataStoreGet, dataStoreSet, dataStoreDelete } from './store.js';

const DEFAULT_NAMESPACE = 'openfn-locks';

function now() {
  return Date.now();
}

function toMillis(ttlSeconds) {
  const seconds = Number(ttlSeconds || 600);
  if (Number.isNaN(seconds) || seconds <= 0) return 600000;
  return seconds * 1000;
}

function lockPath(options) {
  const namespace = options.namespace || DEFAULT_NAMESPACE;
  const key = options.key;
  if (!key) {
    throw new Error('locks.acquire requires a `key` option');
  }
  return { namespace, key };
}

function resolveOwner(options) {
  if (options.owner) return options.owner;
  const state = options.state || {};
  return state.executionId || state.runId || `openfn-${Math.random().toString(16).slice(2)}`;
}

export async function acquireLock(configuration, options = {}) {
  const { namespace, key } = lockPath(options);
  const owner = resolveOwner(options);
  const ttlMillis = toMillis(options.ttlSeconds);

  const existing = await dataStoreGet(configuration, namespace, key, {
    suppressErrors: true,
  });

  const currentTime = now();
  const expiresAt = currentTime + ttlMillis;

  if (existing?.owner && existing?.expiresAt) {
    const expiration = new Date(existing.expiresAt).getTime();
    if (expiration > currentTime && existing.owner !== owner) {
      return {
        acquired: false,
        lock: existing,
      };
    }
  }

  const lock = {
    owner,
    key,
    namespace,
    acquiredAt: new Date(currentTime).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  };

  await dataStoreSet(configuration, namespace, key, lock);

  return {
    acquired: true,
    lock,
  };
}

export async function releaseLock(configuration, lock) {
  if (!lock?.key) return false;
  const namespace = lock.namespace || DEFAULT_NAMESPACE;
  const existing = await dataStoreGet(configuration, namespace, lock.key, {
    suppressErrors: true,
  });
  if (!existing) return true;

  if (existing.owner !== lock.owner) {
    return false;
  }

  await dataStoreDelete(configuration, namespace, lock.key);
  return true;
}

export async function withLock(configuration, options, callback) {
  const result = await acquireLock(configuration, options);
  if (!result.acquired) {
    return {
      lock: result.lock,
      acquired: false,
      data: null,
    };
  }

  try {
    const data = await callback(result.lock);
    await releaseLock(configuration, result.lock);
    return {
      lock: result.lock,
      acquired: true,
      data,
    };
  } catch (error) {
    await releaseLock(configuration, result.lock).catch(() => {});
    throw error;
  }
}



