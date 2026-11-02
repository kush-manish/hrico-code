import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ENV_PATH = process.env.ENV_FILE || path.join(__dirname, '../.env');

/**
 * Parse a .env file. Handles comments, blank lines, `export ` prefixes,
 * single/double quoted values and keys containing digits — all of which the
 * previous regex (/^([A-Z_]+)=(.*)$/) silently dropped.
 */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let [, key, value] = m;
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length > 1) {
      value = value.slice(1, -1);
      if (q === '"') value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      value = value.split(' #')[0].trim();
    }
    out[key] = value;
  }
  return out;
}

export function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const parsed = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
  // Real environment wins over the file, so systemd/CI can override.
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

/**
 * Rewrite the named keys in .env, leaving every other line untouched. Returns
 * false when there is no file to update (configuration came from the real
 * environment), so a caller never creates one by surprise.
 */
export function writeEnvKeys(updates) {
  if (!fs.existsSync(ENV_PATH)) return false;
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  for (const [key, value] of Object.entries(updates)) {
    const at = lines.findIndex(l => new RegExp(`^(?:export\\s+)?${key}\\s*=`).test(l.trim()));
    if (at >= 0) lines[at] = `${key}=${value}`;
    else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, `${key}=${value}`);
  }
  // Write-then-rename so a crash mid-write cannot leave a truncated .env.
  const tmp = `${ENV_PATH}.tmp`;
  fs.writeFileSync(tmp, lines.join('\n'), { mode: 0o600 });
  fs.renameSync(tmp, ENV_PATH);
  return true;
}

/**
 * Feature-gate by capability instead of refusing to boot. A missing LeetCode
 * cookie should disable run/submit, not take the whole study tool offline.
 */
export function capabilities() {
  return {
    leetcode: Boolean(process.env.LEETCODE_SESSION && process.env.LEETCODE_CSRF),
    llm: Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL),
  };
}

export function describeMissing() {
  const missing = [];
  if (!process.env.LEETCODE_SESSION) missing.push('LEETCODE_SESSION');
  if (!process.env.LEETCODE_CSRF) missing.push('LEETCODE_CSRF');
  if (!process.env.LLM_BASE_URL) missing.push('LLM_BASE_URL');
  if (!process.env.LLM_API_KEY) missing.push('LLM_API_KEY');
  if (!process.env.LLM_MODEL) missing.push('LLM_MODEL');
  return missing;
}
