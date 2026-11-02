#!/usr/bin/env node
/**
 * Pre-builds every Short's code traces into server/data/shorts-traces/ so the
 * live server only reads files: no code runs when someone opens a Short.
 *
 *   node scripts/build-short-traces.mjs          # build what is missing, drop stale files
 *   node scripts/build-short-traces.mjs --check  # report only, exit 1 if anything is missing
 *
 * File names hash the code, signature and input, so editing a Short's script
 * makes its old trace stale automatically (and this script replaces it).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { runTrace } from '../server/routes/debug.js';
import { traceName, argsOf } from '../server/routes/shorts.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'server/data/shorts.json');
const OUT = path.join(ROOT, 'server/data/shorts-traces');
const check = process.argv.includes('--check');

const shorts = JSON.parse(fs.readFileSync(DATA, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const jobs = [];
for (const [slug, s] of Object.entries(shorts)) {
  if (s.optimalCode) jobs.push({ slug, which: 'optimal', code: s.optimalCode, meta: s.meta, input: s.input });
  if (s.brute?.code) jobs.push({ slug, which: 'brute', code: s.brute.code, meta: s.meta, input: s.input });
}
const want = new Set(jobs.map(j => (j.name = traceName(j.slug, j.which, j.code, j.meta, j.input))));
const have = new Set(fs.readdirSync(OUT).filter(f => f.endsWith('.json')));
const todo = jobs.filter(j => !have.has(j.name));
const stale = [...have].filter(f => !want.has(f));

if (check) {
  console.log(`${want.size} traces wanted · ${want.size - todo.length} present · ${todo.length} missing · ${stale.length} stale`);
  process.exit(todo.length ? 1 : 0);
}
for (const f of stale) fs.rmSync(path.join(OUT, f));

let done = 0, failed = [];
const worker = async () => {
  for (let j; (j = todo.shift());) {
    let d;
    try { d = await runTrace({ code: j.code, meta: j.meta, args: argsOf(j.meta, j.input) }); }
    catch (e) { d = { steps: [], error: e.message }; }
    // An error trace is still a valid answer for the player, but say so.
    if (d.error) failed.push(`${j.slug}/${j.which}: ${String(d.error).split('\n').pop().slice(0, 100)}`);
    fs.writeFileSync(path.join(OUT, j.name), JSON.stringify(d));
    if (++done % 50 === 0) console.log(`  ${done} built…`);
  }
};
const n = Math.max(1, Math.min(4, os.cpus().length));
const total = todo.length;
await Promise.all(Array.from({ length: n }, worker));
console.log(`built ${total}, removed ${stale.length} stale, ${want.size} total in ${path.relative(ROOT, OUT)}`);
if (failed.length) { console.log(`${failed.length} traces ended in an error:`); failed.forEach(f => console.log('  ' + f)); }
