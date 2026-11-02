/** Step debugger: traces Python solutions locally, LeetCode-style.
 *
 * The judge runs code on LeetCode; this runs it here, under a tracer, so the
 * UI can replay the execution line by line with locals, watch expressions and
 * stdout. Python only — it is the language the rest of the app teaches in.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import * as v from '../validate.js';
import { BadRequest, UpstreamError } from '../errors.js';
import { question } from '../questions.js';
import { judgeLimit, validateBody, wrap } from '../middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(__dirname, '../debug-runner.py');
const TIMEOUT_MS = 10_000;
const MAX_OUTPUT = 4 * 1024 * 1024;

export function runTrace(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-I', RUNNER], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const finish = fn => (...a) => { if (!done) { done = true; clearTimeout(timer); fn(...a); } };
    const ok = finish(resolve), fail = finish(reject);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new UpstreamError(`${payload.mode === 'run' ? 'Local run' : 'Debug run'} timed out after 10 s — likely an infinite loop.`, 504));
    }, TIMEOUT_MS);
    child.stdout.on('data', d => { out += d; if (out.length > MAX_OUTPUT) { child.kill('SIGKILL'); fail(new UpstreamError('Trace too large.', 502)); } });
    child.stderr.on('data', d => { err += d; });
    child.on('error', fail);
    child.on('close', (code, signal) => {
      // The runner's CPU rlimit ends a runaway loop with a signal, not an exit code.
      if (signal && !out) return fail(new UpstreamError(`${payload.mode === 'run' ? 'Local run' : 'Debug run'} hit its CPU limit — likely an infinite loop.`, 504));
      if (code !== 0 && !out) return fail(new UpstreamError(`Debugger crashed: ${err.slice(0, 400)}`, 502));
      try { ok(JSON.parse(out)); }
      catch { fail(new UpstreamError('Debugger returned malformed output.', 502)); }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

/** One test case: each line of LeetCode's data-input format is one JSON arg. */
function parseArgs(dataInput, paramCount) {
  const lines = String(dataInput).split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) throw new BadRequest('no test input');
  const take = lines.slice(0, paramCount);
  if (take.length < paramCount) throw new BadRequest(`this question needs ${paramCount} input lines per case, got ${take.length}`);
  return take.map(l => {
    try { return JSON.parse(l); }
    catch { return l; }   // bare strings are legal in LC inputs
  });
}

/** Every case in the raw input, `perCase` lines each (max 10 cases). */
function parseCases(dataInput, perCase) {
  const lines = String(dataInput).split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) throw new BadRequest('no test input');
  if (!perCase) throw new BadRequest('this question takes no input');
  const cases = [];
  for (let i = 0; i + perCase <= lines.length && cases.length < 10; i += perCase) {
    cases.push(lines.slice(i, i + perCase).map(l => {
      try { return JSON.parse(l); } catch { return l; }
    }));
  }
  if (!cases.length) throw new BadRequest(`this question needs ${perCase} input lines per case`);
  return cases;
}

function metaOf(q) {
  let meta = q.metaData;
  if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = null; } }
  return meta;
}

export function mount(app) {
  /**
   * Runs the example cases locally, untraced: the stand-in for LeetCode's Run
   * when the judge is unreachable. Python only. Returns one row per case with
   * the answer as JSON text; it never decides pass/fail — the client compares
   * against expected outputs only where it actually knows them.
   */
  app.post('/api/run-local', judgeLimit, validateBody(b => ({
    slug: v.slug(b.slug),
    code: v.code(b.code),
    dataInput: v.dataInput(b.dataInput),
  })), wrap(async (req, res) => {
    const q = question(req.clean.slug);
    if (!q) throw new BadRequest('unknown question');
    const meta = metaOf(q);
    const design = !!meta?.classname;
    if (!meta || (!design && !meta.name)) throw new BadRequest('this question has no callable metadata, so it cannot be run locally');
    const cases = parseCases(req.clean.dataInput, design ? 2 : (meta.params || []).length);
    const out = await runTrace({ mode: 'run', code: req.clean.code, meta, cases });
    res.json({ design, cases: cases.length, results: out.cases || [], error: out.error || null });
  }));

  app.post('/api/debug', judgeLimit, validateBody(b => ({
    slug: v.slug(b.slug),
    code: v.code(b.code),
    dataInput: v.dataInput(b.dataInput),
    watch: (Array.isArray(b.watch) ? b.watch : []).slice(0, 8).map(w => String(w).slice(0, 200)),
  })), wrap(async (req, res) => {
    const q = question(req.clean.slug);
    if (!q) throw new BadRequest('unknown question');
    let meta = q.metaData;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = null; } }
    const design = !!meta?.classname;
    if (!meta || (!design && !meta.name)) throw new BadRequest('this question has no callable metadata, so it cannot be traced');
    const args = parseArgs(req.clean.dataInput, design ? 2 : (meta.params || []).length);
    res.json(await runTrace({ code: req.clean.code, meta, args, watch: req.clean.watch }));
  }));
}
