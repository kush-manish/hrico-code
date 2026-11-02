/* Repairs what speech recognition does to interview vocabulary.
 *
 * Browser recognisers are tuned for everyday English and reliably mangle the
 * exact terms that matter here: "O(n^2)" comes back as "any square", "O(1)"
 * as "orphan", "nums" as "numbs". The corrections below are deliberately
 * narrow — each one fixes an observed mis-hearing rather than guessing — and
 * the result lands in the editable box, so anything wrong is visible and
 * fixable before it is sent.
 */
(function (root) {
  // Order matters: longer, more specific phrases must win over shorter ones.
  const RULES = [
    // --- complexity: n log n ------------------------------------------------
    [/\b(?:big\s*)?(?:o|oh|of|owe)\s*(?:of\s*)?n\s*log\s*(?:n|in|and)\b/gi, 'O(n log n)'],
    [/\bn\s*log\s*(?:n|in)\b/gi, 'n log n'],

    // --- complexity: log n --------------------------------------------------
    [/\b(?:big\s*)?(?:o|oh|of|owe)\s*(?:of\s*)?log\s*(?:n|in|and)\b/gi, 'O(log n)'],
    [/\blog\s*(?:in|and)\b/gi, 'log n'],

    // --- complexity: n squared ---------------------------------------------
    [/\b(?:big\s*)?(?:o|oh|of|owe)\s*(?:of\s*)?(?:n|an|and|any|in)\s*squared?\b/gi, 'O(n^2)'],
    [/\b(?:any|an\s*n|and\s*n)\s*squared?\b/gi, 'O(n^2)'],
    [/\bn\s*squared?\b/gi, 'n^2'],

    // --- complexity: constant ----------------------------------------------
    // "orphan" and "oh of one" are both common renderings of O(1).
    [/\borphan\b/gi, 'O(1)'],
    [/\b(?:big\s*)?(?:o|oh|of|owe)\s*(?:of\s*)?(?:one|1)\b/gi, 'O(1)'],

    // --- complexity: linear / n m ------------------------------------------
    [/\b(?:big\s*)?(?:o|oh|owe)\s*of\s*(?:n|an|and)\b/gi, 'O(n)'],
    [/\b(?:big\s*)?o\s*\(\s*(?:n|an|and)\s*\)/gi, 'O(n)'],

    // --- common identifiers -------------------------------------------------
    [/\bnumbs?\b/gi, 'nums'],
    [/\bnum'?s\b/gi, 'nums'],
    [/\bhash\s*map\b/gi, 'hashmap'],
    [/\blinked\s*list\b/gi, 'linked list'],
    [/\btwo\s*pointer(s)?\b/gi, 'two-pointer$1'],
    [/\bbinary\s*search\b/gi, 'binary search'],
    [/\bdi\s*graph\b/gi, 'digraph'],

    // --- arithmetic spoken aloud -------------------------------------------
    [/\b([ijkn])\s*plus\s*(?:one|1)\b/gi, '$1 + 1'],
    [/\b([ijkn])\s*minus\s*(?:one|1)\b/gi, '$1 - 1'],
    [/\bplus\s*equals?\b/gi, '+='],
  ];

  /** Applies the corrections. Returns the text unchanged when nothing matches. */
  function normaliseTechnical(text) {
    if (typeof text !== 'string' || !text) return '';
    let out = text;
    for (const [re, to] of RULES) out = out.replace(re, to);
    // Recognisers emit no punctuation, so collapse the double spaces the
    // substitutions can leave behind.
    return out.replace(/[ \t]{2,}/g, ' ').trim();
  }

  /** What changed, for showing the candidate why their words moved. */
  function corrections(before, after) {
    if (before === after) return [];
    const b = before.toLowerCase().split(/\s+/);
    const a = after.toLowerCase().split(/\s+/);
    return b.length === a.length && b.every((w, i) => w === a[i]) ? [] : ['technical terms tidied'];
  }

  const api = { normaliseTechnical, corrections, RULES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Dictation = api;
})(typeof window !== 'undefined' ? window : globalThis);
