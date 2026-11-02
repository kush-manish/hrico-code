/**
 * Writes every handbook page into the cache ahead of time, so a reader never
 * waits on the model. Safe to stop and re-run: pages already written at the
 * current schema are skipped unless --force.
 *
 *   node server/prolearn-warm.js [--jobs=20] [--force] [--simple|--approaches] [--only=chapter substring]
 *
 * --simple warms the short revision view and its animation instead of the full
 * page. --approaches warms the brute-force and variant traces. Both build on
 * the full page, so run the plain warmer first.
 */
import { outline, article } from './prolearn.js';
import { simple } from './prolearn-simple.js';
import { approaches } from './prolearn-approaches.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const wantSimple = args.includes('--simple');
const wantAppr = args.includes('--approaches');
const only = args.find(a => a.startsWith('--only='))?.slice(7)?.toLowerCase();
const jobs = Math.max(1, Math.min(32, Number(args.find(a => a.startsWith('--jobs='))?.slice(7)) || 6));

const slugs = outline()
  .filter(c => !only || c.chapter.toLowerCase().includes(only))
  .flatMap(c => c.groups.flatMap(g => g.articles.map(a => a.slug)));

const ATTEMPTS = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let written = 0, cached = 0, failed = 0, next = 0, finished = 0;

const describe = doc => {
  if (wantAppr) {
    return doc.items.length
      ? `${doc.items.length} approaches: ${doc.items.map(i => i.name).join(', ')}`
      : 'NO APPROACHES';
  }
  if (wantSimple) {
    return `${doc.steps.length} steps, ${doc.drills.length} drills, ${doc.anim
      ? `${doc.anim.kind} anim ${doc.anim.examples.map(e => e.frames.length).join('+')} frames`
      : 'NO ANIM'}`;
  }
  return `${doc.sections.length} sections, ${doc.problems.length} problems`;
};

async function write(slug, at) {
  for (let attempt = 1; ; attempt++) {
    const t = Date.now();
    try {
      // Both rewrite anything missing or below the current schema, so a fast
      // return here means the page was already good.
      const doc = wantAppr
        ? await approaches(slug, { refresh: force })
        : wantSimple
          ? await simple(slug, { refresh: force })
          : await article(slug, { refresh: force });
      const secs = (Date.now() - t) / 1000;
      if (secs < 2 && !force) { cached++; console.log(`${at} cached`); return; }
      written++;
      console.log(`${at} ${secs.toFixed(0)}s · ${describe(doc)}`);
      return;
    } catch (err) {
      if (attempt >= ATTEMPTS) {
        failed++;
        console.error(`${at} FAILED after ${attempt} attempts: ${err.message}`);
        return;
      }
      // Running wide means the proxy pushes back; back off rather than lose the page.
      const wait = 5000 * 2 ** (attempt - 1);
      console.warn(`${at} attempt ${attempt} failed (${err.message}), retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

async function worker() {
  while (next < slugs.length) {
    const i = next++;
    await write(slugs[i], `[${++finished}/${slugs.length}] ${slugs[i]}`);
  }
}

console.log(`${slugs.length} ${wantSimple ? 'simple views' : 'pages'}, ${jobs} at a time${force ? ' (forced)' : ''}`);
const started = Date.now();
await Promise.all(Array.from({ length: jobs }, worker));

console.log(`done in ${((Date.now() - started) / 60000).toFixed(1)}min: ${written} written, ${cached} already cached, ${failed} failed`);
if (failed) process.exitCode = 1;
