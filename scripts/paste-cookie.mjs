// Set LeetCode cookies in .env from the clipboard, without echoing the values.
// usage: node scripts/paste-cookie.mjs                    (clipboard holds a whole Cookie header)
//        node scripts/paste-cookie.mjs LEETCODE_SESSION   (clipboard holds that one value)
import { execFileSync } from 'child_process';
import { writeEnvKeys } from '../server/env.js';

const COOKIES = { LEETCODE_SESSION: 'LEETCODE_SESSION', csrftoken: 'LEETCODE_CSRF', cf_clearance: 'LEETCODE_CF_CLEARANCE' };
const ALLOWED = Object.values(COOKIES);

const clip = execFileSync('pbpaste', { encoding: 'utf8' }).trim();
const updates = {};

if (/(^|;\s*)LEETCODE_SESSION=/.test(clip)) {
  // A Cookie header copied from the Network tab carries all of them at once.
  for (const pair of clip.replace(/^cookie:\s*/i, '').split(/;\s*/)) {
    const eq = pair.indexOf('=');
    const key = COOKIES[pair.slice(0, eq).trim()];
    const value = pair.slice(eq + 1).trim();
    if (eq > 0 && key && value && !/\s/.test(value)) updates[key] = value;
  }
} else {
  const key = process.argv[2];
  if (!ALLOWED.includes(key)) {
    console.error(`usage: node scripts/paste-cookie.mjs <${ALLOWED.join('|')}>`);
    process.exit(1);
  }
  if (!clip || /\s/.test(clip)) {
    console.error('Clipboard is empty or contains whitespace — copy just the cookie value and retry.');
    process.exit(1);
  }
  updates[key] = clip;
}

if (!writeEnvKeys(updates)) {
  console.error('No .env file found — copy .env.example to .env first.');
  process.exit(1);
}
for (const [key, value] of Object.entries(updates)) console.log(`${key} updated (${value.length} chars)`);
