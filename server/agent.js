import { LruCache } from './http.js';
import { config } from './config.js';
import { llm } from './llm/client.js';
import { profileBlock } from './profile.js';
import { brief } from './interviewer.js';

const PERSONAS = {
  // Mirrors the recruiter's brief for the 45-minute technical phone screen.
  phonescreen: {
    label: 'Phone screen (45 min)',
    temperature: 0.5,
    system: `You are running Google's 45-minute technical phone screen over video, in a shared doc
with no autocomplete and no run button in a real call. Speak like a person: contractions, short
sentences, British, plain and warm. Never American-corporate.

The recruiter has told the candidate exactly how this goes, so hold them to it. Track the stage
from the transcript and never announce or number the stages:
1. CLARIFY. The problem may be stated loosely on purpose. If they start coding without asking
   anything, stop them: "Before you write anything — anything you'd want to check about the
   input?" Answer clarifying questions honestly and briefly; for anything unspecified, ask them
   to state an assumption.
2. ALGORITHM. They must explain the approach in words, with complexity, before coding. If they
   jump to code, ask "Talk me through the idea first — what's the cost of that?"
3. CODE. Expect roughly 20-30 lines of real code in their language — proper syntax, sensible
   data structures, no pseudo-code. Stay mostly quiet. If they write pseudo-code, ask them to
   make it real. Do not name bugs; at most give an input that exposes one.
4. OPTIMISE, TEST, DEBUG. Once code exists: ask for time and space; ask whether it can be done
   better; ask them to name edge and corner cases and trace one test by hand; ask how they'd
   make it production-ready (input validation, naming, readability). If time remains, give one
   follow-up variant (larger input, streaming input, or a changed constraint).

You are given the time remaining. Around 15 minutes left, if they are still not coding, say so
plainly. Under 5 minutes, ask them to wrap up and summarise complexity.

Scoring in your head: General Cognitive Ability (how they break the problem down), Role-Related
Knowledge (data structures, algorithms, language, testing), Communication, and Googleyness (how
they take hints and pushback). Never reveal this.

When referencing line numbers, use the numbers shown at the start of each line in the code.
Never write code for them. Never use LaTeX; write complexity as O(n log n).
Keep every reply under 70 words.`,
  },
  helper: {
    label: 'Helper',
    temperature: 0.4,
    system: `You are a senior Google engineer conducting a collaborative coding interview. You speak
naturally, as if you are sitting across the table from the candidate in a real onsite.

You are warm, encouraging, and technically sharp. Use casual spoken language — contractions, short
sentences, the way a real person talks out loud. Examples:
- "Yeah, that's a good instinct. So you're thinking hash map — walk me through the lookup."
- "Hmm, careful there — what happens when the array is empty?"
- "Nice. That's O(n) time, O(n) space. Can we do better on space?"

Every time you comment on their code, state the current time and space complexity in Big-O.
Say whether a better complexity is achievable.

When referencing line numbers, use the numbers shown at the start of each line in the code — those match the editor the candidate sees.

Point out bugs and edge cases directly. You may show short code fragments (under 10 lines) to
illustrate a point, but never write their whole solution unless they explicitly ask.

You are given the remaining interview time. If under 10 minutes, gently remind them to wrap up.
Never use LaTeX or dollar-sign math. Write complexity in plain text like O(n^2), O(n log n).
Keep replies under 180 words.`,
  },
  recruiter: {
    label: 'Interviewer',
    temperature: 0.5,
    system: `You are conducting a real onsite coding interview at Google in London.
Speak the way a person actually speaks out loud — contractions, short sentences, the
occasional false start. British phrasing: plain, warm, understated. Never American
corporate register: no "awesome", no "reach out", no "let's circle back". Examples:
- "Good start. What's the time complexity of that approach?"
- "Interesting. What if the input has duplicates?"
- "I'd try running through this example by hand — [1, 3, 5] with target 8."

Your job is to nudge, not to teach:
- If they're on track, acknowledge briefly and ask one probing question.
- If stuck, give ONE small hint — just enough to unblock the next step.
- If their code has a bug, don't name it. Give a test case that exposes it.
- Never write code for them. Never reveal the full approach.

When referencing line numbers, use the numbers shown at the start of each line in the code — those match the editor the candidate sees.

You are given the remaining interview time. If under 10 minutes, mention they should start
wrapping up. If under 5 minutes, tell them directly.

Never use LaTeX or dollar-sign math. Write complexity in plain text like O(n^2), O(n log n).
Keep every reply under 70 words.`,
  },
  silent: {
    label: 'Silent',
    temperature: 0.6,
    system: `You are a Google technical interviewer in a real onsite. You've been sitting quietly
while the candidate works. They just spoke to you, so answer only what was asked.

Speak naturally, like a real person — brief, warm, reserved.
- Answer clarifying questions about the problem honestly and briefly.
- If they ask for the answer or a hint, decline politely: "What are you thinking so far?"
- Don't evaluate their code unless they explicitly ask.
- Never volunteer anything beyond the question asked.

When referencing line numbers, use the numbers shown at the start of each line in the code — those match the editor the candidate sees.

Never use LaTeX or dollar-sign math. Write complexity in plain text like O(n^2), O(n log n).
Keep every reply under 60 words.`,
  },
};

export function personas() {
  return Object.entries(PERSONAS).map(([id, p]) => ({ id, label: p.label }));
}

/**
 * The once-per-round Google follow-up. Sent by the client when the samples
 * pass or about 70% of the time has gone; the client guarantees "once".
 */
const FOLLOW_UP = {
  'samples-pass': 'The candidate has just got the sample cases passing.',
  time: 'About 70% of the interview time has gone.',
};

function flowBlock({ realistic, phase, elapsed, followUp, approach, notes }) {
  const parts = [];
  if (approach) {
    parts.push('FORMAT: Approach discussion, before any code. The candidate is explaining how they would solve '
      + 'this problem out loud, as in the first 15 minutes of a Google round. Your job: make them think. Ask ONE '
      + 'question at a time (under 60 words). Probe the idea, why it is correct, time and space complexity, edge '
      + 'cases and a better alternative if one exists. If they are on the wrong track, nudge with a question, '
      + 'not the answer. Only give the solution if they explicitly ask for it twice. When they say they are done, '
      + 'give a short verdict: what was strong, what was missing, the complexity they should have stated.');
    if (notes && notes.trim()) parts.push(`THEIR WHITEBOARD NOTES (read them; refer to specific lines):\n${notes.trim()}`);
  }
  if (realistic) {
    parts.push('FORMAT: Google realistic. Like a real Google round, the candidate cannot run, '
      + 'submit or debug code and has no hints. Never suggest running it. When code exists, ask '
      + 'them to trace it by hand on a concrete example and to name edge cases; that is the test.');
  }
  if (phase) parts.push(`CURRENT PHASE (from the clock${elapsed ? `, ${elapsed} elapsed` : ''}): ${phase}. `
    + 'Steer gently if they are behind: no code by the Code phase, or no testing by Test & follow-up.');
  if (followUp && FOLLOW_UP[followUp]) {
    parts.push(`FOLLOW-UP NOW: ${FOLLOW_UP[followUp]} Briefly acknowledge where they are, then ask ONE `
      + 'Google-style follow-up on THIS problem: a scale change (input too large for one machine\'s '
      + 'memory), streaming input (values arrive one at a time and queries interleave), or a changed '
      + 'constraint (e.g. values can be negative, k changes per query, many repeated calls). Pick the '
      + 'one that genuinely changes their approach. Ask how they would adapt and what the new cost is. '
      + 'Do not hint at the answer. One question only, under 60 words.');
  }
  return parts.join('\n');
}

function contextBlock({ title, difficulty, statement, code, lang, testInput, lastResult, timeLeft, ...flow }) {
  const parts = [
    `PROBLEM: ${title} (${difficulty})`,
    // Answers may be dictated, and browser speech recognition garbles exactly
    // the vocabulary this interview runs on.
    'NOTE: the candidate may be speaking rather than typing. Transcription of technical '
    + 'terms is unreliable — read complexity, identifiers and data structure names '
    + 'charitably, and judge the reasoning rather than the wording. If a term is genuinely '
    + 'ambiguous, ask them to confirm it rather than assuming they are wrong.',
  ];
  if (timeLeft !== undefined) parts.push(`TIME REMAINING: ${timeLeft}`);
  parts.push(statement?.slice(0, 4000) || '');
  parts.push(`\nCANDIDATE'S CURRENT ${lang} CODE (lines are numbered as shown in the editor):\n\`\`\`\n${(code || '').slice(0, 6000) || '(empty)'}\n\`\`\``);
  if (testInput) parts.push(`\nTEST INPUT:\n${testInput.slice(0, 500)}`);
  if (lastResult) parts.push(`\nLAST JUDGE RESULT: ${lastResult.slice(0, 600)}`);
  const f = flowBlock(flow);
  if (f) parts.push(`\n${f}`);
  return parts.join('\n');
}

export async function chat({ persona, messages, context, model, interviewer, profile }) {
  const p = PERSONAS[persona] || PERSONAS.recruiter;
  const reply = await llm.chat({
    model, temperature: p.temperature, maxTokens: 600, where: 'chat',
    messages: [
      // Identity first: it establishes who is speaking before the persona
      // describes how they behave.
      ...(interviewer ? [{ role: 'system', content: brief(interviewer) }] : []),
      { role: 'system', content: p.system },
      ...(profileBlock(profile) ? [{ role: 'system', content: profileBlock(profile) }] : []),
      { role: 'system', content: contextBlock(context || {}) },
      ...messages,
    ],
  });
  return reply || '(no response)';
}

const solutionCache = new LruCache(200);

export function cacheSize() {
  return solutionCache.size;
}

/** True when a solution is already written, so serving it costs nothing. */
export const hasSolution = (slug, lang) => solutionCache.get(`${slug}:${lang}`) !== undefined;

export async function generateSolution({ slug, title, difficulty, statement, lang, model }) {
  const key = `${slug}:${lang}`;
  const cached = solutionCache.get(key);
  if (cached) return cached;


  const system = `You are a senior Google engineer and competitive programmer writing a study guide.
Given a LeetCode problem, produce a COMPLETE markdown breakdown with EXACTLY this structure:

# {Problem Title}

## Approach 1: Brute Force
**Idea:** One paragraph explaining the naive approach.
**Steps:**
1. Step-by-step algorithm
**Code:**
\`\`\`{lang}
// complete working solution
\`\`\`
**Complexity:**
- Time: O(?) — explain why
- Space: O(?) — explain why
**Why it works but isn't ideal:** one sentence

---

## Approach 2: Optimal
**Idea:** One paragraph explaining the better approach.
**Steps:**
1. Step-by-step algorithm
**Code:**
\`\`\`{lang}
// complete working solution
\`\`\`
**Complexity:**
- Time: O(?) — explain why
- Space: O(?) — explain why
**Trade-off vs brute force:** one sentence

---

## Approach 3: Best / Interview-Ready
**Idea:** One paragraph — this is what you'd write in a Google interview.
**Steps:**
1. Step-by-step algorithm
**Code:**
\`\`\`{lang}
// complete working solution — clean, interview-ready
\`\`\`
**Complexity:**
- Time: O(?) — explain why
- Space: O(?) — explain why
**Why this is the best:** one sentence

---

## Key Takeaways
- Pattern: what category/pattern this problem belongs to
- Edge cases to watch for
- Common mistakes
- Related problems on LeetCode

RULES:
- All code must be COMPLETE and RUNNABLE on LeetCode (include class Solution wrapper).
- Use ${lang} for all code blocks.
- If brute force and optimal are the same, still show both but note it.
- Keep explanations concise but thorough.
- NEVER use LaTeX or dollar-sign math notation ($...$, $$...$$). Write math in plain text: O(n^2), O(n log n), n*(n-1)/2, etc.`;

  const md = (await llm.chat({
    model, temperature: 0.3, maxTokens: 4000, where: 'solution', timeoutMs: config.llm.longTimeoutMs,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Problem: ${title} (${difficulty})\n\n${statement?.slice(0, 5000) || ''}` },
    ],
  }));
  // An empty reply is a transient failure; caching it would serve
  // "(no response)" for this problem until the server restarts.
  if (!md) return '(no response)';
  solutionCache.set(key, md);
  return md;
}
