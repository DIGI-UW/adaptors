import fs from 'fs';
import path from 'path';

const DEFAULT_NAMESPACE = 'sftp-workflows';
const STATE_DIR = path.join(process.cwd(), 'projects/openfn-workflows/state');

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function resolveFile(namespace, key) {
  ensureDir();
  const ns = namespace || DEFAULT_NAMESPACE;
  const safeNs = ns.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeKey = (key || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(STATE_DIR, `${safeNs}__${safeKey}.json`);
}

export function loadState(namespace, key) {
  const filePath = resolveFile(namespace, key);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`⚠️ SFTP state: failed to read ${filePath}: ${error.message}`);
    return null;
  }
}

export function saveState(namespace, key, value) {
  const filePath = resolveFile(namespace, key);
  try {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`❌ SFTP state: failed to write ${filePath}: ${error.message}`);
    throw error;
  }
}

export function deleteState(namespace, key) {
  const filePath = resolveFile(namespace, key);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (error) {
    console.warn(`⚠️ SFTP state: failed to delete ${filePath}: ${error.message}`);
    return false;
  }
}



