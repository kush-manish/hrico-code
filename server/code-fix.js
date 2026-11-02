import { llm } from './llm/client.js';

/**
 * "Suggest fixes": the candidate's own code, corrected as little as possible
 * so it passes. The browser diffs it against what they wrote and lets them
 * accept each change, so the fix must stay recognisably theirs — same names,
 * same structure, same approach — not a rewrite into the model solution.
 */
const SYSTEM = `You fix a candidate's interview solution that failed on the judge.
Make the SMALLEST change that makes it correct:
- Keep their approach, function and variable names, structure, comments and formatting. Change only the lines that are wrong.
- Do not rename, reorder, restyle or "improve" working lines. Do not add comments explaining the fix.
- If the approach is fundamentally wrong (e.g. too slow for the constraints), fix it anyway with the fewest changed lines you can.
- Fix typos in identifiers only where they break the code.
Return ONLY JSON:
{ "fixed": "the complete corrected code",
  "summary": "one or two sentences: what was wrong",
  "notes": [ { "line": <1-based line number in the FIXED code of a changed line>, "why": "one short sentence for this change" } ] }
No markdown fences.`;

export function normaliseFix(raw, original) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const fixed = String(r.fixed ?? '').replace(/\r\n/g, '\n');
  if (!fixed.trim()) throw new Error('no fixed code in the reply');
  const notes = (Array.isArray(r.notes) ? r.notes : []).slice(0, 30)
    .map(n => ({ line: Math.max(1, parseInt(n?.line, 10) || 0), why: String(n?.why ?? '').trim().slice(0, 300) }))
    .filter(n => n.line && n.why);
  return { fixed, summary: String(r.summary ?? '').trim().slice(0, 600), notes, unchanged: fixed.trim() === String(original).trim() };
}

export async function suggestFix({ title, statement, code, lang, result, testInput, model }) {
  const failing = result ? [
    result.status && `Verdict: ${result.status}`,
    result.lastTestcase && `Failing input:\n${result.lastTestcase}`,
    result.expected && `Expected:\n${result.expected}`,
    result.actual && `Actual:\n${result.actual}`,
    result.error && `Error:\n${result.error}`,
  ].filter(Boolean).join('\n') : '';
  const numbered = code.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
  const out = await llm.chatJson({
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content:
      `PROBLEM: ${title}\n${String(statement || '').slice(0, 4000)}\n\nLANGUAGE: ${lang}\n\nTHEIR CODE (line numbers for reference only, not part of the code):\n${numbered}\n\n${failing ? `JUDGE RESULT:\n${failing}\n\n` : ''}${testInput ? `TEST INPUT USED:\n${String(testInput).slice(0, 1500)}\n\n` : ''}Return the minimally fixed code.` }],
    model, temperature: 0.1, maxTokens: 4000, timeoutMs: 120_000, where: 'code-fix', parse: raw => normaliseFix(raw, code),
  });
  return { ...out, model: model || llm.defaultModel || null };
}
