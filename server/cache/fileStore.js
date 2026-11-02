/**
 * A small JSON document store on disk: one file per key, atomic writes,
 * async I/O so a cache read never blocks the event loop on the request
 * path. Keys are namespaced (`slug.kind`) and restricted to a safe
 * character set, so a key can never escape the directory.
 */
import { promises as fs } from 'fs';
import path from 'path';

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

export class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.ready = fs.mkdir(dir, { recursive: true }).catch(() => {});
  }

  file(key) {
    if (!SAFE_KEY.test(key)) throw new Error(`invalid store key: ${key}`);
    return path.join(this.dir, `${key}.json`);
  }

  async get(key) {
    await this.ready;
    try { return JSON.parse(await fs.readFile(this.file(key), 'utf8')); } catch { return null; }
  }

  async set(key, value) {
    await this.ready;
    const target = this.file(key);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value));
    await fs.rename(tmp, target);
    return value;
  }

  async delete(key) {
    await this.ready;
    try { await fs.unlink(this.file(key)); return true; } catch { return false; }
  }

  async has(key) {
    await this.ready;
    try { await fs.access(this.file(key)); return true; } catch { return false; }
  }

  /** Last-modified time in ms, or null when the key is absent; cheap enough to call before every read. */
  async mtime(key) {
    await this.ready;
    try { return (await fs.stat(this.file(key))).mtimeMs; } catch { return null; }
  }

  /** Every key in the store, without reading the documents. */
  async keys() {
    await this.ready;
    let names = [];
    try { names = await fs.readdir(this.dir); } catch { return []; }
    return names.filter(n => n.endsWith('.json')).map(n => n.slice(0, -5));
  }
}
