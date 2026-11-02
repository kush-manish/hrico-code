import { llm, num } from './llm/client.js';
import { config } from './config.js';

/**
 * What a coding loop is actually scored on. Deliberately not the behavioural
 * rubric: the signals differ, and "did they write clean code" is not the same
 * question as "did they own the outcome".
 */
const DIMENSIONS = [
  {
    id: 'problem_solving',
    label: 'Problem solving',
    hint: 'Getting from the statement to a workable approach, and recognising when one is wrong.',
    anchors: {
      1: 'Never reached a working approach, or waited to be handed one.',
      2: 'Reached an approach but only after substantial prompting.',
      3: 'Found a reasonable approach independently and refined it when pushed.',
      4: 'Reached the optimal approach quickly and explained why the naive one falls short.',
    },
  },
  {
    id: 'coding',
    label: 'Coding',
    hint: 'Whether the code they wrote is correct, clean and idiomatic.',
    anchors: {
      1: 'Code does not run, or does not implement the stated approach.',
      2: 'Roughly right but with real bugs, or messy enough to be hard to follow.',
      3: 'Correct and readable, with sensible names and structure.',
      4: 'Correct, tight and idiomatic — the kind of code that needs no cleanup.',
    },
  },
  {
    id: 'complexity',
    label: 'Complexity analysis',
    hint: 'Stating time and space cost accurately, and knowing where it comes from.',
    anchors: {
      1: 'No analysis given, or the stated complexity is wrong.',
      2: 'Correct figure but cannot justify it.',
      3: 'Correct time and space, with the reasoning behind both.',
      4: 'Correct, justified, and compared against the alternatives they rejected.',
    },
  },
  {
    id: 'testing',
    label: 'Testing & edge cases',
    hint: 'Whether they probed their own solution before being asked to.',
    anchors: {
      1: 'Never tested or considered an edge case.',
      2: 'Tested only when prompted, and only the happy path.',
      3: 'Walked through an example unprompted and named the obvious edge cases.',
      4: 'Traced the code deliberately and found a real problem before the interviewer did.',
    },
  },
  {
    id: 'communication',
    label: 'Communication',
    hint: 'Thinking out loud in a way an interviewer can follow and assess.',
    anchors: {
      1: 'Coded in silence; the interviewer had to ask what was happening.',
      2: 'Explained after the fact rather than as they went.',
      3: 'Narrated the approach clearly and answered questions directly.',
      4: 'Kept the interviewer with them throughout, flagging uncertainty honestly.',
    },
  },
];

const VALID = new Set(['strong_no_hire', 'no_hire', 'lean_hire', 'hire', 'strong_hire']);

// The four attributes Google interviewers file feedback against.
const ATTRIBUTES = [
  { id: 'gca', label: 'General Cognitive Ability', hint: 'Problem breakdown, handling ambiguity, quality of reasoning.' },
  { id: 'rrk', label: 'Role-Related Knowledge', hint: 'Data structures, algorithms, language fluency, complexity, testing.' },
  { id: 'communication', label: 'Communication', hint: 'Whether the interviewer could follow the candidate.' },
  { id: 'googleyness', label: 'Googleyness & Leadership', hint: 'Collaboration, humility, response to challenge.' },
];
const LEVELS = new Set(['L3', 'L4', 'L5', 'L6', 'insufficient evidence']);

export const attributes = () => ATTRIBUTES.map(a => ({ ...a }));

/** The committee-facing write-up, normalised like everything else. */
function normalisePacket(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const byId = new Map((Array.isArray(src.attributes) ? src.attributes : []).map(a => [String(a?.id), a]));
  const attrs = ATTRIBUTES.map(a => {
    const got = byId.get(a.id) || {};
    let score = num(got.score);
    if (!Number.isFinite(score)) score = 1;
    return {
      id: a.id, label: a.label, hint: a.hint,
      score: Math.min(4, Math.max(1, Math.round(score))),
      note: String(got.note || '').slice(0, 500),
    };
  });
  const level = LEVELS.has(src.level) ? src.level : 'insufficient evidence';
  return {
    attributes: attrs,
    level,
    questionAsked: String(src.questionAsked || '').slice(0, 300),
    notes: String(src.notes || '').slice(0, 4000),
    toCommittee: String(src.toCommittee || '').slice(0, 2000),
  };
}

export const dimensions = () => DIMENSIONS.map(d => ({ ...d }));

/** How the round was run, as the scorer should weigh it. */
function modeBlock({ realistic, aidsUsed, aids }) {
  const used = Number(aidsUsed) || 0;
  const list = (aids || []).slice(0, 12).join(', ');
  if (realistic) {
    return `
ROUND FORMAT: Google realistic. As in a real Google round, the candidate could
not run, submit or debug code and had no hints or solution. Judge accordingly:
- Testing & edge cases weighs MORE heavily here. Reward tracing the code by hand
  on a concrete example, line by line, out loud; naming edge cases unprompted;
  and finding their own bug by reasoning. Absence of a run is not a defect;
  absence of a hand trace is.
- "Coding" is judged on whether the code would run as written, since nothing
  ran it: look for syntax slips, off-by-ones and unhandled empty input.
- Aids the candidate unlocked anyway: ${used}${list ? ` (${list})` : ''}. Each one
  is evidence of reliance; reflect it in problem solving and in the packet.`;
  }
  return `
ROUND FORMAT: practice. The candidate could run code and open aids. Aids
opened during the round: ${used}${list ? ` (${list})` : ''}. Weigh solutions
reached only after hints or a solution view accordingly.`;
}

/** Pacing evidence the client measured; facts, not opinions. */
function pacingBlock(p) {
  if (!p) return '';
  const mmss = s => (s == null ? 'never' : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`);
  const lines = [
    `PACING (measured by the app, ${p.durationMin} minute round):`,
    `- Elapsed at the end: ${mmss(p.elapsedSec)}; phase reached: ${p.phase || 'unknown'}.`,
    `- First code typed at: ${mmss(p.firstCodeSec)} (at this length, coding should be under way by about ${mmss(p.codeTargetSec)}).`,
    `- Complexity stated by the candidate in chat: ${p.complexityStated ? `yes, first at ${mmss(p.complexityAtSec)}` : 'no evidence in the transcript'}.`,
  ];
  if (p.samplesPassSec != null) lines.push(`- Sample cases first passed at: ${mmss(p.samplesPassSec)}.`);
  if (p.followUp) lines.push(`- The interviewer asked a follow-up (${p.followUp}).`);
  lines.push('Use these in the notes where they support a claim (e.g. coding started too late,');
  lines.push('complexity never stated). Do not invent timings that are not listed.');
  return lines.join('\n');
}

function systemPrompt(question, difficulty) {
  const rubric = DIMENSIONS.map(d => {
    const a = d.anchors;
    return `${d.id} — ${d.label}: ${d.hint}\n    1: ${a[1]}\n    2: ${a[2]}\n    3: ${a[3]}\n    4: ${a[4]}`;
  }).join('\n');

  return `You are a Google interviewer writing up a coding interview immediately
afterwards, for a hiring committee that reads only what you write.

PROBLEM: ${question} (${difficulty || 'unknown difficulty'})

Score each signal 1-4 against these anchors, picking the level the evidence
actually supports:

${rubric}

Rules:
- Evidence or it did not happen. Cite what they said or wrote. If a signal was
  never exercised — they were never asked about complexity, say — score it 1
  and state that the evidence is absent rather than awarding a polite middle.
- Judge the interview, not the final code alone. Code that only became correct
  after heavy hinting is not a 4 on problem solving.
- A short interview cannot demonstrate five signals. Say so plainly.
- "improvements" must be things to do differently next time.

Overall recommendation, one of:
strong_no_hire | no_hire | lean_hire | hire | strong_hire

You must also produce the write-up the interviewer actually files. Google
interviewers submit feedback to a hiring committee rather than deciding
themselves, and that feedback is structured around four attributes:

- GCA (General Cognitive Ability): how they broke the problem down, handled
  ambiguity, and reasoned toward a solution.
- RRK (Role-Related Knowledge): data structures, algorithms, language fluency,
  complexity, testing instinct.
- Communication: whether the interviewer could follow their thinking.
- Googleyness: collaboration, humility, response to being challenged. Often
  thin in a coding round — say so rather than inventing it.

Rate each attribute on the same 1-4 scale. Also give a level read (L3 entry,
L4 mid, L5 senior, or "insufficient evidence"), and write the notes section
the way an interviewer does: what was asked, what the candidate actually did in
order, and what you would tell the committee. Quote the candidate where it
supports a claim. A committee member who was not in the room must be able to
act on it.

Reply with ONLY a JSON object, no prose and no code fence:
{
  "dimensions": [
    {"id":"problem_solving","score":3,"evidence":"<what they said or wrote>","comment":"<one sentence, name the gap if there is one>"}
  ],
  "overall": "hire",
  "headline": "<one sentence a hiring committee could act on>",
  "strengths": ["<specific, drawn from the transcript or code>"],
  "improvements": ["<specific and actionable>"],
  "modelAnswer": "<3-4 sentences on what a level-4 performance on THIS problem would have looked like>",
  "packet": {
    "attributes": [
      {"id":"gca","score":3,"note":"<one or two sentences of evidence>"},
      {"id":"rrk","score":3,"note":"<...>"},
      {"id":"communication","score":3,"note":"<...>"},
      {"id":"googleyness","score":2,"note":"<...or that the round gave little signal>"}
    ],
    "level":"L4",
    "questionAsked":"<the problem, as you would record it>",
    "notes":"<what happened, in order, as the interviewer would write it up>",
    "toCommittee":"<the recommendation paragraph a committee member would read>"
  }
}`;
}


/** The model's shape is never trusted. */
export function normalise(raw) {
  const byId = new Map((Array.isArray(raw.dimensions) ? raw.dimensions : []).map(d => [String(d?.id), d]));
  const dims = DIMENSIONS.map(d => {
    const got = byId.get(d.id) || {};
    let score = num(got.score);
    if (!Number.isFinite(score)) score = 1;
    score = Math.min(4, Math.max(1, Math.round(score)));
    return {
      id: d.id, label: d.label, hint: d.hint, score,
      anchor: d.anchors[score] || '',
      evidence: String(got.evidence || '').slice(0, 400),
      comment: String(got.comment || '').slice(0, 400),
    };
  });
  const list = v => (Array.isArray(v) ? v : []).map(x => String(x).slice(0, 300)).slice(0, 6);
  const total = dims.reduce((a, d) => a + d.score, 0);
  return {
    kind: 'coding',
    dimensions: dims,
    overall: (o => (VALID.has(o) ? o : 'no_hire'))(String(raw.overall || '').trim().toLowerCase().replace(/[\s-]+/g, '_')),
    total, max: dims.length * 4,
    percent: Math.round((total / (dims.length * 4)) * 100),
    headline: String(raw.headline || '').slice(0, 300),
    strengths: list(raw.strengths),
    improvements: list(raw.improvements),
    modelAnswer: String(raw.modelAnswer || '').slice(0, 2000),
    packet: normalisePacket(raw.packet),
  };
}

export async function score({ question, difficulty, transcript, code, lang, result, model,
  realistic = false, aidsUsed = 0, aids = [], pacing = null }) {

  const convo = (transcript || [])
    .map(m => `${m.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${m.content}`)
    .join('\n\n')
    .slice(0, 14_000);

  const judge = result
    ? `JUDGE: ${result.status || 'n/a'}${result.passed != null ? ` — ${result.passed}/${result.total} cases` : ''}`
    : 'JUDGE: the candidate never ran or submitted the code.';

  const user = [
    convo ? `TRANSCRIPT:\n\n${convo}` : 'TRANSCRIPT: the candidate did not speak to the interviewer.',
    '',
    `FINAL CODE (${lang || 'unknown'}):\n${String(code || '(nothing written)').slice(0, 8000)}`,
    '',
    realistic && !result ? 'JUDGE: not available in this format; the code was never run.' : judge,
    modeBlock({ realistic, aidsUsed, aids }),
    pacingBlock(pacing),
  ].join('\n');

  const card = await llm.chatJson({
    model, temperature: 0.2, maxTokens: 3000, timeoutMs: config.llm.longTimeoutMs, where: 'coding-score',
    messages: [
      { role: 'system', content: systemPrompt(question, difficulty) },
      { role: 'user', content: user },
    ],
    parse: normalise,
  });
  // Echo the measured facts so the write-up and History can show them
  // without trusting the model to repeat them.
  return { ...card, session: { realistic: !!realistic, aidsUsed: Number(aidsUsed) || 0, aids: aids.slice(0, 12), pacing } };
}
