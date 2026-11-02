import { log } from './log.js';
import { UpstreamError } from './errors.js';

export { UpstreamError };

/**
 * fetch with a hard deadline. The original code had no timeout at all, so a
 * hung LeetCode or LLM connection pinned a request open indefinitely.
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new UpstreamError(`upstream timed out after ${timeoutMs}ms`, 504);
    }
    throw new UpstreamError(`upstream request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Bounded LRU so the solution cache can no longer grow without limit. */
export class LruCache {
  constructor(max = 200) {
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
      log.debug('cache evict', { key: oldest });
    }
  }

  get size() {
    return this.map.size;
  }
}
