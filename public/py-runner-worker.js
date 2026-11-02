/**
 * Loads Pyodide once and keeps it warm for the life of the tab. A fresh
 * worker would re-download/boot the ~13 MB runtime on every Run; this one
 * stays alive so only the first Python run of a session pays that cost.
 */
importScripts('/vendor/pyodide/pyodide.js');

let ready = null;
function init() {
  if (!ready) {
    ready = loadPyodide({ indexURL: '/vendor/pyodide/' }).then(async (pyodide) => {
      const src = await (await fetch('/vendor/solution-runner.py')).text();
      pyodide.runPython(src);
      postMessage({ ready: true });
      return pyodide;
    });
  }
  return ready;
}
init();

self.onmessage = async (e) => {
  const { id, code, meta, cases } = e.data;
  try {
    const pyodide = await init();
    pyodide.globals.set('_payload', pyodide.toPy({ code, meta, cases }));
    const json = pyodide.runPython('import json as _json\n_json.dumps(run_cases(_payload))');
    postMessage({ id, ...JSON.parse(json) });
  } catch (err) {
    postMessage({ id, cases: [], error: String(err && err.message || err) });
  }
};
