/**
 * Thin request/response wrapper around py-runner-worker.js: one worker,
 * reused across runs, with requests correlated by id so a slow first call
 * (loading the runtime) doesn't block a later one.
 */
window.PyRunner = (function () {
  const TIMEOUT_MS = 20_000; // first call also pays for the runtime download
  let workerPromise = null;
  let reqId = 0;
  const pending = new Map();

  function getWorker() {
    if (!workerPromise) {
      workerPromise = new Promise((resolve) => {
        const w = new Worker('/py-runner-worker.js');
        w.onmessage = (e) => {
          const { id, ready } = e.data;
          if (ready) { resolve(w); return; }
          const p = pending.get(id);
          if (!p) return;
          pending.delete(id);
          p.resolve(e.data);
        };
        w.onerror = (e) => { resolve(w); /* surfaced to the caller on first use via timeout/message */ console.error('PyRunner worker error', e); };
      });
    }
    return workerPromise;
  }

  function run(code, meta, cases) {
    return getWorker().then(w => new Promise((resolve, reject) => {
      const id = ++reqId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Timed out \u2014 likely an infinite loop, or the Python runtime is still loading. Try again in a moment.'));
      }, TIMEOUT_MS);
      pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); } });
      w.postMessage({ id, code, meta, cases });
    }));
  }

  return { run };
})();
