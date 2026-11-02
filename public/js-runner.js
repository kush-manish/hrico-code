/**
 * Runs a plain (non-class) JavaScript solution against parsed test cases
 * inside a sandboxed Worker — no network call, so Run never touches the
 * server or LeetCode for this language. Candidate code gets the same trust
 * level as pasting it into the browser's own DevTools console.
 */
window.JsRunner = (function () {
  const TIMEOUT_MS = 5000;

  function workerSource() {
    return `
      self.onmessage = (e) => {
        const { code, fnName, cases } = e.data;
        try { (0, eval)(code); }
        catch (err) { postMessage({ error: 'Could not load the solution: ' + (err && err.message || err) }); return; }
        let fn;
        try { fn = (0, eval)(fnName); } catch { fn = undefined; }
        if (typeof fn !== 'function') { postMessage({ error: 'Could not find a function named ' + fnName }); return; }
        const out = [];
        for (const args of cases) {
          try { out.push({ output: JSON.stringify(fn(...args)) }); }
          catch (err) { out.push({ error: String(err && err.message || err) }); }
        }
        postMessage({ cases: out });
      };
    `;
  }

  /** @param {string} code @param {string} fnName @param {any[][]} cases */
  function run(code, fnName, cases) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const blob = new Blob([workerSource()], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      const finish = fn => (...a) => { if (!settled) { settled = true; clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); fn(...a); } };
      const ok = finish(resolve), fail = finish(reject);
      const timer = setTimeout(() => fail(new Error(`Timed out after ${TIMEOUT_MS / 1000}s — likely an infinite loop.`)), TIMEOUT_MS);
      worker.onmessage = e => (e.data?.error ? fail(new Error(e.data.error)) : ok(e.data));
      worker.onerror = e => fail(new Error(e.message || 'Worker error'));
      worker.postMessage({ code, fnName, cases });
    });
  }

  return { run };
})();
