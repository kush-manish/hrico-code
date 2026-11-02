import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { log } from './log.js';
import { LruCache, UpstreamError, fetchWithTimeout } from './http.js';
import { BadRequest } from './validate.js';

/**
 * Neural speech via Piper, so the interviewer does not sound like a 1990s
 * screen reader. The browser's speechSynthesis stays as the fallback: it needs
 * no server, works offline and costs nothing, it just sounds robotic.
 *
 * Piper is invoked with spawn and an argument array — never a shell — and the
 * text is length-bounded before it gets anywhere near the process.
 */
const ROOT = process.env.TTS_DIR || '/root/dsa-prep/.tts';
// Kokoro runs as its own service because the model is 311 MB and must stay
// resident; Piper is a per-call binary and remains the fallback.
const KOKORO_URL = process.env.KOKORO_URL || 'http://127.0.0.1:9226';
const BIN = path.join(ROOT, 'bin', 'piper');
const VOICE_DIR = path.join(ROOT, 'voices');

const MAX_CHARS = 1200;
const SYNTH_TIMEOUT_MS = 30_000;

// Audio is deterministic for a given voice and text, and an interviewer
// repeats stock phrases, so a small cache removes most repeat synthesis.
const cache = new LruCache(40);

let available = null;
let voiceList = [];
let kokoro = { available: false, voices: [], default: null, checked: 0 };

const isKokoroVoice = v => /^(bf_|bm_)/.test(String(v || ''));

/** Re-checked periodically so a restarted speech service is picked up. */
async function checkKokoro() {
  if (kokoro.checked && Date.now() - kokoro.checked < 60_000) return kokoro;
  kokoro.checked = Date.now();
  try {
    const r = await fetchWithTimeout(`${KOKORO_URL}/voices`, {}, 4000);
    if (r.ok) {
      const d = await r.json();
      kokoro.voices = Array.isArray(d.voices) ? d.voices : [];
      kokoro.default = d.default || kokoro.voices[0] || null;
      kokoro.available = kokoro.voices.length > 0;
    } else kokoro.available = false;
  } catch {
    kokoro.available = false;
  }
  return kokoro;
}
export { checkKokoro };

async function synthKokoro(text, voice, pace = 1) {
  const r = await fetchWithTimeout(`${KOKORO_URL}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pace !== 1 ? { text, voice, speed: +(1 / pace).toFixed(3) } : { text, voice }),
  }, SYNTH_TIMEOUT_MS);
  // An older Kokoro service may not know `speed`: say it again at normal pace.
  if (!r.ok && pace !== 1) return synthKokoro(text, voice, 1);
  if (!r.ok) {
    log.warn('kokoro synth failed', { status: r.status });
    throw new UpstreamError('speech synthesis failed');
  }
  return Buffer.from(await r.arrayBuffer());
}

export function detect() {
  if (available !== null) return { available, voices: voiceList };
  try {
    fs.accessSync(BIN, fs.constants.X_OK);
    voiceList = fs.readdirSync(VOICE_DIR)
      .filter(f => f.endsWith('.onnx'))
      .map(f => f.replace(/\.onnx$/, ''))
      .sort();
    available = voiceList.length > 0;
  } catch {
    available = false;
    voiceList = [];
  }
  log.info('tts detect', { available, voices: voiceList.length });
  return { available, voices: voiceList };
}

/** Kokoro first: it is markedly more natural, and Piper covers its absence. */
export function allVoices() {
  return [
    ...kokoro.voices.map(id => ({ id, engine: 'kokoro', label: id.replace(/^b([fm])_/, (_, g) => (g === 'f' ? 'British female — ' : 'British male — ')) })),
    ...detect().voices.map(id => ({ id, engine: 'piper', label: id.replace(/^en_GB-/, 'British — ').replace(/_/g, ' ') })),
  ];
}
export const voices = () => detect().voices;
export const isAvailable = () => detect().available || kokoro.available;

export function defaultVoice() {
  if (kokoro.available) return kokoro.default || kokoro.voices[0];
  const v = voices();
  // Medium Piper models synthesise about twice as fast as the high ones for a
  // difference most listeners will not notice over a conversation.
  return v.find(n => /jenny_dioco-medium/.test(n))
    || v.find(n => /-medium$/.test(n))
    || v[0] || null;
}

/** `pace` > 1 speaks more slowly (a teaching pace for Shorts); 1 is normal. */
export async function synthesise(text, voice, pace = 1) {
  pace = Math.min(1.5, Math.max(0.75, Number(pace) || 1));
  await checkKokoro();
  if (!isAvailable()) throw new UpstreamError('speech synthesis is not configured on this server', 503);
  const clean = String(text || '').trim();
  if (!clean) throw new BadRequest('nothing to speak');
  if (clean.length > MAX_CHARS) throw new BadRequest(`text too long (${MAX_CHARS} characters max)`);

  const known = [...kokoro.voices, ...voices()];
  const chosen = known.includes(voice) ? voice : defaultVoice();
  if (!chosen) throw new UpstreamError('no voice models installed', 503);

  const key = createHash('sha1').update(`${chosen}::${pace}::${clean}`).digest('hex');
  const hit = cache.get(key);
  if (hit) return { audio: hit, voice: chosen, cached: true };

  if (isKokoroVoice(chosen)) {
    const audio = await synthKokoro(clean, chosen, pace);
    cache.set(key, audio);
    return { audio, voice: chosen, cached: false };
  }

  const out = path.join(os.tmpdir(), `tts-${key}.wav`);
  const model = path.join(VOICE_DIR, `${chosen}.onnx`);

  const audio = await new Promise((resolve, reject) => {
    const p = spawn(BIN, ['-m', model, '-f', out, ...(pace !== 1 ? ['--length_scale', String(pace), '--sentence_silence', '0.15'] : [])], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new UpstreamError('speech synthesis timed out', 504)); }, SYNTH_TIMEOUT_MS);

    p.stderr.on('data', d => { stderr += d.toString().slice(0, 500); });
    p.on('error', err => { clearTimeout(timer); reject(new UpstreamError(`could not run piper: ${err.message}`)); });
    p.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 && pace !== 1) {
        // This piper build may not take --length_scale: fall back to normal pace.
        return synthesise(clean, chosen, 1).then(r => resolve(r.audio), reject);
      }
      if (code !== 0) {
        log.error('piper failed', { code, stderr: stderr.slice(0, 200) });
        return reject(new UpstreamError('speech synthesis failed'));
      }
      fs.readFile(out, (err, buf) => {
        fs.unlink(out, () => {});
        if (err) return reject(new UpstreamError('could not read synthesised audio'));
        resolve(buf);
      });
    });
    p.stdin.end(clean);
  });

  cache.set(key, audio);
  return { audio, voice: chosen, cached: false };
}
