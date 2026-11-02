import { LruCache } from './http.js';
import { UpstreamError } from './errors.js';
import { log } from './log.js';
import { llm, parseJson, num } from './llm/client.js';
import { profileBlock } from './profile.js';

const LLM_TIMEOUT_MS = 60_000;

/**
 * Behavioural question bank. Each category probes a distinct signal, so the
 * scorecard can say something more useful than "good answer".
 */
const BANK = {
  // The two areas the recruiter brief for the phone screen + Googleyness round
  // names explicitly: how you work alone and in a team, how you help others,
  // how you handle ambiguity, how you grow past your comfort zone; and the
  // hypothetical "General Cognitive Ability" questions.
  googleyness: {
    label: 'Googleyness & Leadership',
    blurb: 'Team vs solo, helping others, ambiguity, growth, mobilising people.',
    questions: [
      'Tell me how you work on your own compared with how you work in a team, with an example of each.',
      'Tell me about a time you helped a teammate who was struggling, when it was not your job to.',
      'Describe a time you joined a project with no clear direction. What did you do in the first couple of weeks?',
      'Tell me about a time you deliberately took on something well outside your comfort zone.',
      'Tell me about a time you made a new joiner or a teammate noticeably more effective.',
      'Describe a time you worked closely with people from a very different discipline or background.',
      'Tell me about a time you challenged the way things had always been done.',
      'Tell me about a time you put the user first even though it cost you or your team something.',
      'Describe a time you received critical feedback and what you actually changed.',
      'Tell me about a time you stepped up to lead when you were not the official leader.',
      'Describe a time you had to get a group of people moving on a decision you made.',
      'Tell me about a time you had to work through a problem where nobody, including you, knew the answer.',
    ],
  },
  // Restated from the REALQ reports (server/data/realq/2-behavioural.md §2):
  // questions candidates say Google actually asked in 2025–2026.
  realq: {
    label: 'REALQ — actually asked at Google',
    blurb: 'Reported in 2025–26 Googleyness rounds, with the follow-ups they came with.',
    questions: [
      'Tell me about a disagreement with a colleague or your manager. How was it resolved, and whose idea was chosen in the end?',
      'Someone keeps taking credit for your work. What do you do?',
      'Two of your teammates disagree on a technical choice. How do you help resolve it?',
      'Tell me about a time your teammates were not satisfied with your work. What did you do?',
      'Tell me about a time you proposed an idea and the team disagreed.',
      'Have you given someone critical feedback? How did they take it?',
      'How do you handle negative feedback? Give me an example.',
      'Tell me about a time your constructive feedback had a lasting effect.',
      'The requirements for your project are unclear. What do you do?',
      'A stakeholder sets an unreasonable deadline and keeps chasing you for updates. How do you handle it?',
      'Tell me about a reasonable demand your manager made, and then an unreasonable one. How did you respond to each?',
      'Tell me about a time you could not finish by the deadline. What did you do?',
      'A project with a strict deadline is taken away from you midway. How do you feel, and what do you do?',
      'You are juggling several projects. How do you scope them, get approvals and plan development time?',
      'What is the most challenging or technically complex project you have worked on, and how would you approach it now?',
      'Tell me about a project you proposed and led. Have you delivered something end to end on your own?',
      'Tell me about a time you took ownership of a problem outside your responsibility.',
      'Tell me about a time you helped someone outside your team or influenced another team.',
      'Tell me about a time you helped an underperforming teammate or mentored a junior engineer.',
      'Tell me about a time you covered for a senior colleague on a task.',
      'Tell me about a time you advocated for yourself or for a teammate.',
      'Describe a manager whose style you admired. What would you do as the manager, and how do you lead a team?',
      'Tell me about an innovative solution you came up with and its impact.',
      'Tell me about a time you messed up. How did you find out, and how did you fix it?',
      'How do you prioritise user needs? Give me an example of customer empathy.',
      'Your team has decided by majority on a non-work matter, like a team outing, and some people disagree. What do you do?',
      'How do you work effectively with remote teammates?',
      'How do you handle cultural diversity in a team?',
      'Your team is not bonding well. How does your approach change if you are the lead?',
      'How do you use AI in your daily work? When do you not use it, and how do you verify AI-written code?',
      'What would you want at work that does not exist today?',
      'Why Google, and why are you leaving your current company?',
      'What do you want to achieve next, and what is a personal weakness?',
      'What is your approach to documentation?',
    ],
  },
  // Every Google round opens with an introduction and closes with "any
  // questions for me?" — both are judged, neither was in the bank.
  opener: {
    label: 'Opening & closing every round',
    blurb: 'The first two minutes and the last five: intro, resume walk-through, your questions.',
    questions: [
      'Tell me about yourself.',
      'Walk me through your resume, and the project you are proudest of.',
      'Explain what you work on now to someone who is not an engineer.',
      'Why this Software Engineer role at Google in London, and why now?',
      'What kind of team and work do you want at Google?',
      'We have a few minutes left. What questions do you have for me?',
    ],
  },
  gca: {
    label: 'General Cognitive Ability',
    blurb: 'Hypotheticals: understand, prepare the data, recommend, support it.',
    hypothetical: true,
    questions: [
      'Your team’s service latency doubled overnight and nobody knows why. How would you approach it?',
      'You have been given a new team of five and a vague goal: improve developer productivity. What do you do in your first month?',
      'Two senior engineers on your team strongly disagree on a design and the deadline is in two weeks. What would you do?',
      'You have three bugs reported and time to fix only one before a launch. How do you decide which?',
      'You are asked to cut the running cost of a large internal service by 20% within a quarter. How would you go about it?',
      'How would you measure whether a new feature in Google Maps was a success?',
      'A new hire on your team is struggling and their onboarding buddy has just left. What would you do?',
      'You are organising an offsite for 40 people across three countries on a fixed budget. How would you approach it?',
      'Google is considering launching a product in a market it has never operated in. How would you decide whether it should?',
      'Your manager asks you to ship a feature you believe will hurt users. What do you do?',
      'You inherit a codebase with no tests and a release due next month. How do you approach it?',
      'Imagine you are designing the cafeteria for a new office of 2,000 engineers. How would you plan it?',
    ],
  },
  leadership: {
    label: 'Leadership & Influence',
    blurb: 'Driving outcomes without formal authority.',
    questions: [
      'Tell me about a time you led a project without being the formal owner.',
      'Describe a time you had to convince a skeptical senior stakeholder.',
      'Tell me about a time you had to make an unpopular decision.',
      'Describe a situation where you raised the bar for your team.',
      'Tell me about a time you mentored someone through a difficult problem.',
      'Describe a time you had to align two teams that disagreed.',
      'Tell me about a time you influenced a decision outside your own team.',
      'Describe a time you took ownership of something nobody else would.',
      'Tell me about a time you had to set direction when the requirements were unclear.',
      'Describe a time you pushed back on a deadline and how you made the case.',
      'Tell me about a time you had to lead through a change you did not agree with.',
    ],
  },
  conflict: {
    label: 'Conflict & Collaboration',
    blurb: 'Working through friction with peers.',
    questions: [
      'Tell me about a time you disagreed with a teammate on a technical decision.',
      'Describe a conflict with your manager and how you handled it.',
      'Tell me about a time you received difficult feedback.',
      'Describe a time you had to work with someone you found difficult.',
      'Tell me about a time you had to deliver bad news to a stakeholder.',
      'Describe a time a code review disagreement escalated.',
      'Tell me about a time you had to compromise on a technical approach.',
      'Describe a time you built trust with a team that was sceptical of you.',
      'Tell me about a time you had to give difficult feedback to a peer.',
      'Describe a time you and a product manager wanted different things.',
      'Tell me about a time you were wrong in a disagreement and how you handled it.',
    ],
  },
  failure: {
    label: 'Failure & Resilience',
    blurb: 'Ownership when things go wrong.',
    questions: [
      'Tell me about a time you shipped something that broke in production.',
      'Describe your biggest professional failure and what you learned.',
      'Tell me about a time you missed a deadline.',
      'Describe a decision you made that you later regretted.',
      'Tell me about a time you were wrong about a technical judgement.',
      'Describe a project that did not achieve its goal.',
      'Describe a project you would approach completely differently today.',
      'Tell me about a time you had to recover a situation you had caused.',
      'Describe a time you took a risk that did not pay off.',
      'Tell me about the biggest technical mistake you have made.',
    ],
  },
  ambiguity: {
    label: 'Ambiguity & Judgement',
    blurb: 'Acting well with incomplete information.',
    questions: [
      'Tell me about a time you had to make a decision without enough data.',
      'Describe a project where the requirements kept changing.',
      'Tell me about a time you had to choose between two bad options.',
      'Describe a situation where you had to define the problem yourself.',
      'Tell me about a time you pushed back on a requirement.',
      'Describe a time you had to trade off speed against quality.',
      'Tell me about a time you had to make a decision without all the information.',
      'Describe a time the goal changed halfway through and how you adapted.',
      'Tell me about a time you had to prioritise between two important things.',
      'Describe a time you had to estimate something you had never done before.',
      'Tell me about a time you chose the simpler solution over the more interesting one.',
    ],
  },
  execution: {
    label: 'Execution & Impact',
    blurb: 'Shipping work that measurably mattered.',
    questions: [
      'Tell me about the project you are most proud of and its impact.',
      'Describe a time you significantly improved a system’s performance.',
      'Tell me about a time you simplified something complicated.',
      'Describe a time you had to deliver under significant time pressure.',
      'Tell me about a time you identified and fixed a problem nobody had noticed.',
      'Describe how you handled competing priorities across projects.',
      'Tell me about the project you are proudest of and your specific part in it.',
      'Describe a time you improved something that was not your responsibility.',
      'Tell me about a time you had to deliver under a tight constraint.',
      'Describe a time you measured the impact of your work and what you found.',
      'Tell me about a time you simplified a process or a system.',
    ],
  },
  growth: {
    label: 'Growth & Self-awareness',
    blurb: 'How you learn and where you know you are weak.',
    questions: [
      'Tell me about a skill you deliberately set out to build.',
      'Describe a time you changed your mind about how to work.',
      'What is the most useful feedback you have ever received?',
      'Tell me about a time you stepped outside your comfort zone.',
      'Describe a technology you had to learn quickly under pressure.',
      'Where do you think you are weakest, and what are you doing about it?',
      'Tell me about a skill you deliberately built in the last year.',
      'Describe a time feedback changed how you work.',
      'Tell me about a time you asked for help and what you learned.',
      'Describe something you believed strongly and later changed your mind about.',
      'Why Google, and why now?',
    ],
  },
};

/**
 * What big-tech behavioural interviews actually score: competencies, not
 * whether the candidate recited STAR in order. Structure is a delivery
 * quality, so it sits under communication rather than occupying a dimension
 * of its own. Each level has a concrete anchor so scoring is calibrated
 * rather than a vibe.
 */
const DIMENSIONS = [
  {
    id: 'ownership',
    label: 'Ownership & drive',
    hint: 'Did they own the outcome, or narrate something that happened around them?',
    anchors: {
      1: 'Describes team activity with no identifiable personal contribution.',
      2: 'Contribution is stated but stays generic; "we" carries most of the story.',
      3: 'Clear personal actions, and they stayed with the problem past the first obstacle.',
      4: 'Took responsibility beyond their remit and drove it to a conclusion others benefited from.',
    },
  },
  {
    id: 'impact',
    label: 'Impact & scope',
    hint: 'Did anything measurably change, and how far did it reach?',
    anchors: {
      1: 'No outcome given, or the outcome is unrelated to what they did.',
      2: 'Qualitative outcome only — "it improved", "people were happy".',
      3: 'Concrete outcome affecting their team, quantified or clearly bounded.',
      4: 'Quantified outcome with scope beyond their own team, and they know the baseline.',
    },
  },
  {
    id: 'judgement',
    label: 'Judgement & trade-offs',
    hint: 'Quality of decisions under real constraints, and whether they can defend them.',
    anchors: {
      1: 'No decision is visible, or choices are asserted with no reasoning.',
      2: 'Decisions described but alternatives are unexplored or strawmanned.',
      3: 'Names the real alternatives and the constraint that decided it.',
      4: 'Articulates the trade-off precisely, including what it cost and when they would choose differently.',
    },
  },
  {
    id: 'collaboration',
    label: 'Collaboration & influence',
    hint: 'How they move work through other people, especially in disagreement.',
    anchors: {
      1: 'Others appear only as obstacles, or not at all.',
      2: 'Worked with others, but influence amounts to escalation or being overruled.',
      3: 'Engaged the disagreement directly and reached a workable outcome.',
      4: 'Changed someone\'s mind with evidence, and preserved the relationship.',
    },
  },
  {
    id: 'reflection',
    label: 'Self-awareness & growth',
    hint: 'Honest about what went wrong and what they took from it.',
    anchors: {
      1: 'Blames circumstances or other people; no learning offered.',
      2: 'Generic lesson that could follow from any story.',
      3: 'Specific about what they would change and why.',
      4: 'Names the lesson and a later situation where they applied it.',
    },
  },
  {
    id: 'communication',
    label: 'Communication',
    hint: 'Signal density: how quickly an interviewer can extract what happened.',
    anchors: {
      1: 'Rambling or evasive; the interviewer has to excavate the facts.',
      2: 'Gets there eventually, but buries the point or over-explains context.',
      3: 'Ordered and concise; the shape of the story is easy to follow.',
      4: 'Leads with the point, calibrates detail to what was asked, answers the actual question.',
    },
  },
];

const INTERVIEWER_SYSTEM = `You are a Google interviewer running a behavioural interview. This is a real
interview, not coaching.

How you speak:
- Natural spoken English, contractions, short sentences. Warm but neutral.
- One thing at a time. Never stack two questions in a turn.
- Under 60 words per reply.

What you are actually doing:
You are collecting evidence against six signals — ownership, impact, judgement,
collaboration, self-awareness and communication. After each answer, decide which
signal is thinnest and probe THAT. Do not walk through a checklist, and do not
chase story structure for its own sake; an answer told out of order but full of
evidence is a good answer.

Probes that earn signal:
- Undifferentiated "we"        -> "What was yours specifically, versus the team's?"
- Claimed impact, no number    -> "What was it before, and what was it after?"
- Decision with no alternative -> "What else was on the table, and why did you rule it out?"
- Conflict resolved by escalation -> "What did you try before escalating?"
- Lesson that fits any story   -> "Where have you applied that since?"
- Suspiciously smooth story    -> "What went wrong that you have not mentioned?"

Rules:
- Ask 3-5 probes, then wrap up.
- If an answer is vague, push once. Do not accept a second vague answer — note it
  and move on to a different signal.
- Never coach, never praise an answer's quality, never reveal what you are scoring.
- Never write their answer for them or suggest what they should have said.

You are given the time remaining. Under 5 minutes, say you will take one last
answer and then close. No markdown, no bullet lists — this is speech.`;

/**
 * Google's own guidance for the hypothetical (GCA) questions: understand,
 * prepare the data, identify a solution, support it. These are not STAR
 * stories, so the interviewer probes the framework instead.
 */
const GCA_INTERVIEWER = `THIS IS A HYPOTHETICAL (General Cognitive Ability) QUESTION, not a story.
Google evaluates it on a four-step framework. Probe whichever step is thinnest:
1. Understand — did they ask clarifying questions, or state assumptions when you
   decline to answer? If they dive straight in, ask "What would you want to know first?"
   If they ask you something, give a short, realistic answer or say "make an assumption".
2. Prepare — did they say what data they need (existing, historic, new) and where
   they would get it? Probe: "What data would you look at, and where would it come from?"
3. Identify a solution — did they weigh options and then actually commit to one?
   Probe: "Of those, which would you recommend, and why?"
4. Support it — how would they know it worked, and track it over time?
   Probe: "How would you measure whether that worked six months on?"
There is no right answer; you are listening for a structured, data-driven,
logical recommendation they can defend. Do not ask for a past example.`;

const GCA_SCORING = `THIS WAS A HYPOTHETICAL (GCA) QUESTION. Read the six signals through Google's
four-step framework rather than STAR: Understand (clarifying questions, stated
assumptions) feeds judgement and communication; Prepare (naming the data needed and
its source) feeds judgement; Identify a solution (weighing options then committing)
feeds judgement and ownership; Support it (metrics, tracking over time) feeds impact.
Collaboration = who they would involve; reflection = acknowledging risks and what
would change their mind. Do not penalise the absence of a past story. In
"improvedAnswer", rewrite their reasoning as a strong spoken answer that walks
the four steps in order, keeping their recommendation where it was sound.`;

const HYPOTHETICAL = new Set(BANK.gca.questions);
export const isHypothetical = q => HYPOTHETICAL.has(String(q || '').trim());

function scoringSystem(question) {
  const rubric = DIMENSIONS.map(dim => {
    const a = dim.anchors;
    return `${dim.id} — ${dim.label}: ${dim.hint}\n` +
      `    1: ${a[1]}\n    2: ${a[2]}\n    3: ${a[3]}\n    4: ${a[4]}`;
  }).join('\n');

  return `You are a Google interviewer writing up a behavioural interview immediately
afterwards, for a hiring committee that will read only what you write.

The assigned question was: "${question}"
${isHypothetical(question) ? `\n${GCA_SCORING}\n` : ''}
Score each signal 1-4 against these anchors. Pick the level the transcript
actually supports, not the one that feels kind:

${rubric}

THE REWRITE. "improvedAnswer" is the most useful thing you produce, so build it
carefully:

- Rewrite THEIR answer, not a new one. Keep their situation, their company,
  their decision. They have to be able to tell this story truthfully.
- Keep their own words and phrasing wherever those already work.
- Everything you add that they did NOT say must be wrapped in double square
  brackets: [[like this]]. That includes any number, metric, name, outcome or
  reflection you supply. Be rigorous — an unmarked invention is worse than no
  rewrite, because they will repeat it in a real interview as though it were
  true.
- Only mark genuine additions. Rephrasing something they said is not an
  addition; introducing a fact is.
- List each bracketed span in "additions" with the signal it supplies, quoting
  the span exactly as it appears in the text.
- Where a number is needed but you cannot know it, add a clearly generic
  placeholder such as [[roughly X%, if you have the figure]] rather than
  inventing a specific one.

Rules that matter:
- Evidence or it did not happen. Every score cites something the candidate
  actually said. If a signal was never tested, score it 1 and say the evidence
  is absent — do not award a middling score for silence.
- Score the evidence, not the storytelling. A well-structured answer with no
  numbers is not a 4 on impact. A messy answer containing a real trade-off is
  not a 1 on judgement.
- Length is not quality, but a two-line interview cannot demonstrate six
  signals. Short transcripts should score low and say why.
- "improvements" must be things to do differently next time, not compliments
  in disguise.

Overall recommendation, one of:
strong_no_hire | no_hire | lean_hire | hire | strong_hire

Reply with ONLY a JSON object, no prose and no code fence:
{
  "dimensions": [
    {"id":"ownership","score":3,"evidence":"<what they said that justifies this>","comment":"<one sentence, name the gap if there is one>"}
  ],
  "overall": "hire",
  "headline": "<one sentence a hiring committee could act on>",
  "strengths": ["<specific, quoted or paraphrased from the transcript>"],
  "improvements": ["<specific and actionable>"],
  "modelAnswer": "<3-4 sentences showing how a level-4 answer to THIS question would sound, reusing their own example so the contrast is concrete>",
  "improvedAnswer": {
    "text": "<their answer rewritten to strong-hire standard, first person, spoken register, 150-220 words>",
    "additions": [
      {"text":"<the exact added phrase, matching the [[...]] span verbatim>","why":"<which signal it supplies, in a few words>"}
    ]
  }
}`;
}

export function categories() {
  return Object.entries(BANK).map(([id, c]) => ({
    id,
    label: c.label,
    blurb: c.blurb,
    count: c.questions.length,
    hypothetical: Boolean(c.hypothetical),
  }));
}

export function questionsIn(categoryId) {
  return BANK[categoryId] ? BANK[categoryId].questions.slice() : [];
}

export function dimensions() {
  // Anchors go to the client too, so the scorecard can explain what a given
  // score actually means rather than showing a bare number.
  return DIMENSIONS.map(d => ({ id: d.id, label: d.label, hint: d.hint, anchors: d.anchors }));
}

export function randomQuestion(categoryId) {
  const c = BANK[categoryId];
  if (!c) return null;
  return c.questions[Math.floor(Math.random() * c.questions.length)];
}

/**
 * Anthropic-backed models require the first non-system message to be a user
 * turn and reject (or silently return empty for) an assistant-first array.
 * The interview transcript legitimately begins with the interviewer speaking,
 * so normalise here rather than distorting the transcript the UI shows.
 */
function normaliseTurns(messages) {
  const turns = messages.filter(m => m && (m.role === 'user' || m.role === 'assistant'));
  if (!turns.length || turns[0].role === 'user') return turns;
  return [{ role: 'user', content: 'Please begin the interview.' }, ...turns];
}

async function callModel(messages, { temperature, maxTokens, model, where = 'behavioural' }) {
  return llm.chat({ messages, model, temperature, maxTokens, where });
}

export async function interview({ question, messages, timeLeft, model, profile }) {
  const context = [
    `ASSIGNED QUESTION: ${question}`,
    timeLeft !== undefined ? `TIME REMAINING: ${timeLeft}` : '',
    profileBlock(profile),
  ].filter(Boolean).join('\n');

  const reply = await callModel([
    { role: 'system', content: INTERVIEWER_SYSTEM },
    ...(isHypothetical(question) ? [{ role: 'system', content: GCA_INTERVIEWER }] : []),
    { role: 'system', content: context },
    ...normaliseTurns(messages),
  ], { temperature: 0.55, maxTokens: 300, model });

  return reply || '(no response)';
}

/** Models wrap JSON in fences often enough that this is worth handling. */
export const extractJson = parseJson;

const VALID_OVERALL = new Set(['strong_no_hire', 'no_hire', 'lean_hire', 'hire', 'strong_hire']);

/**
 * The rewrite, with the model's [[additions]] turned into structured spans.
 * Anything it invented has to stay visibly separable from what the candidate
 * actually said — they must not walk into an interview repeating a detail
 * that was never theirs.
 */
function normaliseImproved(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const text = String(src.text || '').slice(0, 3000);
  if (!text) return null;

  const spans = [];
  let cursor = 0;
  const re = /\[\[([\s\S]{1,400}?)\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) spans.push({ added: false, text: text.slice(cursor, m.index) });
    spans.push({ added: true, text: m[1] });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) spans.push({ added: false, text: text.slice(cursor) });

  const declared = (Array.isArray(src.additions) ? src.additions : [])
    .map(a => ({
      text: String(a?.text || '').replace(/^\[\[|\]\]$/g, '').slice(0, 400),
      why: String(a?.why || '').slice(0, 200),
    }))
    .filter(a => a.text);

  // Pair each marked span with its stated reason where one was given.
  const additions = spans.filter(s2 => s2.added).map(s2 => {
    const match = declared.find(d => d.text.trim() === s2.text.trim())
      || declared.find(d => s2.text.includes(d.text) || d.text.includes(s2.text));
    return { text: s2.text, why: match?.why || '' };
  });

  return { spans, additions, addedCount: additions.length };
}

/** Never trust the model's shape — normalise before it reaches the page. */
export function normaliseScorecard(raw) {
  // A reply without a real score for every signal is a failed scoring, not a
  // low one. Throwing here makes chatJson retry on the default model and then
  // answer 502, so the page says "Scoring failed" instead of inventing a
  // 6/24 No hire out of an empty object.
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.dimensions)) {
    throw new Error('scorecard reply has no dimensions');
  }
  const byId = new Map(raw.dimensions.map(d => [String(d?.id), d]));
  const unscored = DIMENSIONS.filter(d => {
    const n = num(byId.get(d.id)?.score);
    return !Number.isFinite(n) || n < 1 || n > 4;
  });
  if (unscored.length) {
    throw new Error(`scorecard reply did not score: ${unscored.map(d => d.id).join(', ')}`);
  }
  const dims = DIMENSIONS.map(d => {
    const got = byId.get(d.id) || {};
    let score = num(got.score);
    score = Math.min(4, Math.max(1, Math.round(score)));
    return {
      id: d.id,
      label: d.label,
      hint: d.hint,
      score,
      anchor: d.anchors[score] || '',
      evidence: String(got.evidence || '').slice(0, 400),
      comment: String(got.comment || '').slice(0, 400),
    };
  });
  const list = v => (Array.isArray(v) ? v : []).map(x => String(x).slice(0, 300)).slice(0, 6);
  const total = dims.reduce((a, d) => a + d.score, 0);
  // Accept "Lean hire" / "lean-hire"; if the label is unusable, read it off
  // the scores rather than defaulting to a verdict nobody gave.
  const said = String(raw.overall || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const avg = total / dims.length;
  const overall = VALID_OVERALL.has(said) ? said
    : avg >= 3.5 ? 'strong_hire' : avg >= 3 ? 'hire' : avg >= 2.5 ? 'lean_hire' : avg >= 1.75 ? 'no_hire' : 'strong_no_hire';
  return {
    dimensions: dims,
    overall,
    total,
    max: dims.length * 4,
    percent: Math.round((total / (dims.length * 4)) * 100),
    headline: String(raw.headline || '').slice(0, 300),
    strengths: list(raw.strengths),
    improvements: list(raw.improvements),
    modelAnswer: String(raw.modelAnswer || '').slice(0, 2000),
    improvedAnswer: normaliseImproved(raw.improvedAnswer),
  };
}

export async function score({ question, messages, model, note = '', timeoutMs }) {
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${m.content}`)
    .join('\n\n');

  const messagesForModel = [
    { role: 'system', content: scoringSystem(question) },
    ...(note ? [{ role: 'system', content: note }] : []),
    { role: 'user', content: `TRANSCRIPT:\n\n${transcript}` },
  ];
  return llm.chatJson({ messages: messagesForModel, model, temperature: 0.2, maxTokens: 2400, timeoutMs, where: 'scorecard', parse: normaliseScorecard });
}



// ------------------------------------------------------------- STAR check ---
// A structural read of each answer: is the Situation set, the Task (their
// specific responsibility) clear, the Action theirs and concrete, the Result
// quantified, and is there reflection at the end. Used by the Watch tab so a
// viewer can see whether the answers they just heard were actually STAR.

const STAR_SYSTEM = `You audit behavioural-interview answers for STAR structure — Situation, Task,
Action, Result — plus a closing Reflection (what they learned or would do differently).
Be strict and literal: an element counts only if it is actually there, in the candidate's
own words, and specific. "We improved things" is not a Result; "p99 fell from 3 s to 400 ms" is.

Return ONLY this JSON:
{
  "answers": [
    {
      "turn": <1-based index among the CANDIDATE answers>,
      "situation": {"present": true|false, "quote": "the phrase that sets the scene, or ''", "note": "one short clause"},
      "task":      {"present": true|false, "quote": "", "note": ""},
      "action":    {"present": true|false, "quote": "", "note": "was it 'I' and concrete, or 'we' and vague?"},
      "result":    {"present": true|false, "quote": "", "note": "quantified?"},
      "reflection":{"present": true|false, "quote": "", "note": ""},
      "verdict": "Complete STAR" | "Missing <element(s)>" | "Not a STAR answer",
      "fix": "the single most valuable change to this answer, one sentence, concrete"
    }
  ],
  "overall": {
    "score": <0-10, structure only, not content quality>,
    "summary": "two sentences: what the answers consistently did well, and what they consistently missed",
    "mostMissed": "Situation" | "Task" | "Action" | "Result" | "Reflection" | "None"
  }
}
No markdown fences.`;

const ELEMENTS = ['situation', 'task', 'action', 'result', 'reflection'];

export function normaliseStar(raw, answerCount) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const part = v => ({
    present: Boolean(v && typeof v === 'object' ? v.present : v),
    quote: s(v?.quote, 240), note: s(v?.note, 160),
  });
  const answers = (Array.isArray(r.answers) ? r.answers : []).slice(0, 20).map((a, i) => {
    const out = { turn: Number.isInteger(a?.turn) && a.turn > 0 ? a.turn : i + 1 };
    for (const e of ELEMENTS) out[e] = part(a?.[e]);
    const missing = ELEMENTS.filter(e => !out[e].present && e !== 'reflection');
    out.complete = missing.length === 0;
    out.verdict = s(a?.verdict, 80) || (out.complete ? 'Complete STAR' : `Missing ${missing.join(', ')}`);
    out.fix = s(a?.fix, 300);
    return out;
  }).filter(a => !answerCount || a.turn <= answerCount);
  if (!answers.length) throw new Error('STAR reply contained no answers');
  const score = num(r.overall?.score);
  const most = s(r.overall?.mostMissed, 20);
  return {
    answers,
    overall: {
      score: Number.isFinite(score) ? Math.max(0, Math.min(10, Math.round(score))) : null,
      summary: s(r.overall?.summary, 600),
      mostMissed: ['Situation', 'Task', 'Action', 'Result', 'Reflection', 'None'].includes(most) ? most : 'None',
    },
    complete: answers.filter(a => a.complete).length,
    total: answers.length,
  };
}

export async function starReview({ question, messages, model }) {
  let n = 0;
  const transcript = messages.map(m => (m.role === 'user'
    ? `CANDIDATE ANSWER ${++n}: ${m.content}`
    : `INTERVIEWER: ${m.content}`)).join('\n\n');
  const messagesForModel = [
    { role: 'system', content: STAR_SYSTEM },
    { role: 'user', content: `QUESTION: ${question}\n\nTRANSCRIPT:\n\n${transcript}` },
  ];
  const out = await llm.chatJson({ messages: messagesForModel, model, temperature: 0.1, maxTokens: 2200, where: 'star', parse: raw => normaliseStar(raw, n) });
  return { ...out, model: model || llm.defaultModel || null };   // shown next to the score
}

// ---------------------------------------------------------- 10/10 rewrite ---
// The candidate's OWN answer, reframed so every STAR element (and the
// reflection) is present, specific and in the first person — their facts,
// their story, nothing invented. Checked with the same STAR reviewer the
// Today drill uses, and revised once more if it still falls short of 10/10.

/** Used when the caller picked no model; the server default answers otherwise. */
export const REWRITE_MODEL = 'devin/claude-sonnet-5';

const REWRITE_SYSTEM = `You are a Google interview coach. The candidate wrote a STAR answer to a behavioural question.
Rewrite THEIR answer so a strict STAR reviewer scores it 10/10: every element present, specific, in order.

Hard rules:
- Keep their story, project names, people, technologies and claims. Do NOT invent new events, employers, systems or numbers.
- Where a number or outcome is missing, write a bracketed placeholder for the candidate to fill, e.g. [how many teams], [time saved per release]. Never make a figure up.
- Situation: where, when, who, and what was at stake (one or two sentences).
- Task: THEIR specific responsibility, distinct from the team's (one sentence).
- Action: what THEY did, step by step, with "I" not "we"; show how they worked with others, handled ambiguity and made decisions (three to five sentences).
- Result: the outcome with a measurable figure (or a bracketed placeholder) and the effect on users or the team (one or two sentences).
- Reflection: what they learned or would do differently, one sentence.
- Answer exactly the question asked; if it asks for two examples (e.g. alone vs in a team), cover both inside the STAR parts.
- Plain spoken British English, contractions, first person, fix grammar. About 170-230 words in total.

Return ONLY this JSON:
{
  "situation": "...", "task": "...", "action": "...", "result": "...", "reflection": "...",
  "changes": ["what you changed and why, 3-6 short items, e.g. 'Turned we into I in the actions'"],
  "gaps": ["each bracketed placeholder as a question the candidate must answer, 0-5"]
}
No markdown fences.`;

const PARTS = ['situation', 'task', 'action', 'result', 'reflection'];

export function normaliseRewrite(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const arr = (v, n, k) => (Array.isArray(v) ? v : []).map(x => s(x, k)).filter(Boolean).slice(0, n);
  const out = Object.fromEntries(PARTS.map(p => [p, s(r[p], 1200)]));
  if (!out.situation || !out.action || !out.result) throw new Error('rewrite is missing a STAR part');
  return { ...out, changes: arr(r.changes, 6, 200), gaps: arr(r.gaps, 5, 200) };
}

const asAnswer = a => [`Situation: ${a.situation || a.s || ''}`, `Task: ${a.task || a.t || ''}`, `Action: ${a.action || a.a || ''}`,
  `Result: ${a.result || a.r || ''}`, ...(a.reflection ? [`Reflection: ${a.reflection}`] : [])].join('\n');

export async function starRewrite({ question, answer, model, reviewModel }) {
  const write = async (extra, m) => llm.chatJson({
    messages: [{ role: 'system', content: REWRITE_SYSTEM }, { role: 'user', content: `QUESTION: ${question}\n\nCANDIDATE'S ANSWER:\n${asAnswer(answer)}${extra}` }],
    model: m, temperature: 0.3, maxTokens: 2200, where: 'star-rewrite', parse: normaliseRewrite,
  });
  // The chosen model may be down (e.g. a provider with no auth): fall back to the server default.
  const firstPass = async extra => { try { return await write(extra, model); } catch (err) { if (!model) throw err; log.warn('star-rewrite: model failed, using default', { model, err: err.message }); model = undefined; return write(extra, undefined); } };
  // Graded by the same reviewer (and model) as the drill; if that model is down, by the rewrite model.
  const review = async rw => {
    const messages = [{ role: 'assistant', content: question }, { role: 'user', content: asAnswer(rw) }];
    try { return await starReview({ question, model: reviewModel, messages }); }
    catch (err) { log.warn('star-rewrite: review model failed', { err: err.message }); return starReview({ question, model, messages }); }
  };

  let rewrite = await firstPass('');
  let check = await review(rewrite).catch(() => null);
  let rounds = 1;
  if (check && (check.overall.score ?? 0) < 10) {
    const a = check.answers[0] || {};
    const notes = PARTS.filter(p => a[p] && (!a[p].present || a[p].note)).map(p => `- ${p}: ${a[p].present ? '' : 'MISSING. '}${a[p].note}`).join('\n');
    const revised = await firstPass(`\n\nA previous rewrite scored ${check.overall.score}/10 with the reviewer. Its notes:\n${notes}\nFix: ${a.fix || ''}\nKeep the candidate's facts; address every note.`).catch(() => null);
    const recheck = revised && await review(revised).catch(() => null);
    if (recheck && (recheck.overall.score ?? 0) >= (check.overall.score ?? 0)) { rewrite = revised; check = recheck; }
    rounds = 2;
  }
  return { rewrite, review: check, score: check?.overall.score ?? null, model: model || llm.defaultModel || null, rounds };
}

// ------------------------------------------------ answer from my stories ---
// A question with no story yet: pick the candidate's saved stories that fit
// it and frame a STAR answer from each — up to three different options, each
// from a different story, using only that story's facts.

const FRAME_SYSTEM = `You are a Google interview coach. The candidate has a bank of their own real stories (STAR notes).
For the QUESTION, choose the stories that can genuinely answer it and frame one STAR answer from each.

Hard rules:
- Use ONLY facts from the chosen story: its project, people, technologies, actions and outcomes. Never invent events, employers or numbers.
- Re-angle the story to what THIS question tests (conflict, ambiguity, feedback, ownership...), emphasising the parts of the story that show it.
- Where the question needs a detail the story lacks (a number, the other person's view), write a bracketed placeholder for the candidate to fill, e.g. [what your manager proposed].
- Frame one answer from EACH story you are given (up to the number asked), each from a DIFFERENT story, best fit first.
  Do not skip a story because it fits less well — re-angle it as far as its facts honestly allow and give it a low
  fit score, so the candidate can compare alternatives. Only leave out a story that cannot answer the question at all.
- Situation 1-2 sentences, Task 1 sentence (their own responsibility), Action 3-5 sentences with "I", Result 1-2 sentences with a figure or placeholder, Reflection 1 sentence.
- Plain spoken British English, first person, about 170-230 words per answer.

Return ONLY this JSON:
{ "answers": [ { "storyId": "the id of the story used", "situation": "...", "task": "...", "action": "...", "result": "...", "reflection": "...", "why": "one sentence: why this story fits the question", "fit": <1-10: how directly this story answers what the question tests; 9-10 only for a near-perfect match> } ] }
No markdown fences.`;

export function normaliseFramed(raw, ids, max) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const seen = new Set();
  const answers = (Array.isArray(r.answers) ? r.answers : []).map(a => ({
    storyId: s(a?.storyId, 80), why: s(a?.why, 300),
    fit: Number.isFinite(num(a?.fit)) ? Math.max(1, Math.min(10, Math.round(num(a.fit)))) : null,
    ...Object.fromEntries(PARTS.map(p => [p, s(a?.[p], 1200)])),
  })).filter(a => ids.has(a.storyId) && a.situation && a.action && !seen.has(a.storyId) && seen.add(a.storyId))
    .sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0)).slice(0, max);   // best fit first
  return { answers };
}

export async function frameFromStories({ question, stories, count, model }) {
  const ids = new Set(stories.map(x => x.id));
  const bank = stories.map(x => `STORY ${x.id}${x.title ? ` — ${x.title}` : ''}\n${x.text}`).join('\n\n');
  const ask = m => llm.chatJson({
    messages: [{ role: 'system', content: FRAME_SYSTEM }, { role: 'user', content: `QUESTION: ${question}\n\nGive up to ${count} answers.\n\nTHE CANDIDATE'S STORIES:\n\n${bank}` }],
    // Three full answers from a slower model (Grok) can take well over a minute.
    model: m, temperature: 0.4, maxTokens: 1500 * count, timeoutMs: 150_000, where: 'star-frame', parse: raw => normaliseFramed(raw, ids, count),
  });
  // xAI Grok first, then Grok through devin, then the server default: the first that answers wins.
  const chain = [model, /^grok/i.test(model || '') ? 'devin/grok-4-6' : null].filter(Boolean);
  chain.push(undefined);
  let lastErr;
  for (const m of chain) {
    try { return { ...(await ask(m)), model: m || llm.defaultModel || null }; }
    catch (err) { lastErr = err; log.warn('star-frame: model failed, trying the next', { model: m || 'default', err: err.message }); }
  }
  throw lastErr;
}


// ------------------------------------------------------------ model answer ---
// The best answer to a behavioural question for THIS candidate: built only
// from their resume profile, STAR-shaped, at the level a strong L4 hire
// answers. Nothing is stored server-side; the browser keeps it.

const MODEL_ANSWER_SYSTEM = `You write the answer a strong Google L4 (Software Engineer III) candidate would give to a
behavioural question, using ONLY the candidate's CV below. Every claim must trace to something on
the CV — a system, a number, a role. Never invent employers, projects, teams or figures. Where the
CV lacks a detail the answer needs (a number, the outcome), write it as a bracketed placeholder the
candidate must fill, e.g. [how many services], and list it under "gaps".

Return ONLY this JSON:
{
  "answer": "the full spoken answer, first person, 150-220 words, plain British English, contractions, no headings — as they would actually say it in 90 seconds",
  "star": { "situation": "one sentence", "task": "one sentence: their specific responsibility", "action": "2-3 sentences: what THEY did, 'I' not 'we'", "result": "one sentence with the number", "reflection": "one sentence: what they'd do differently or learned" },
  "evidence": ["the CV items the answer draws on, 2-4 short strings"],
  "gaps": ["what the CV does not say that this answer needs — each as a question the candidate should answer for themselves, 0-4"],
  "why": "one sentence: why this story is the right one for this question at L4",
  "followUps": ["2-3 follow-ups the interviewer will ask after this answer"]
}
No markdown fences.`;

export function normaliseModelAnswer(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const arr = (v, n, k) => (Array.isArray(v) ? v : []).map(x => s(x, k)).filter(Boolean).slice(0, n);
  const st = r.star && typeof r.star === 'object' ? r.star : {};
  return {
    answer: s(r.answer, 2000),
    star: { situation: s(st.situation, 300), task: s(st.task, 300), action: s(st.action, 600), result: s(st.result, 300), reflection: s(st.reflection, 300) },
    evidence: arr(r.evidence, 4, 160), gaps: arr(r.gaps, 4, 200), why: s(r.why, 300), followUps: arr(r.followUps, 3, 200),
  };
}

export async function modelAnswer({ question, category, profile, model }) {
  const who = profileBlock(profile, 'candidate');
  const gca = isHypothetical(question)
    ? `\n\nTHIS IS A HYPOTHETICAL (GCA) QUESTION. Do not tell a past story. The "answer" walks Google's four steps
out loud: (1) Understand — the clarifying questions and assumptions; (2) Prepare — the data needed and where it
comes from; (3) Identify a solution — options weighed, then one clear recommendation; (4) Support it — how success
is measured and tracked over time. Use the CV only to colour the reasoning. Map the "star" fields as:
situation=Understand, task=Prepare, action=Identify a solution, result=Support it, reflection=risks and what would change the call.`
    : '';
  const user = `QUESTION (${category || 'behavioural'}): ${question}${gca}

${who || 'NO CV PROVIDED: write the answer as a template with bracketed placeholders for every specific (company, system, numbers), and list every placeholder under "gaps".'}`;
  return llm.chatJson({
    model, temperature: 0.4, maxTokens: 1400, where: 'model-answer',
    messages: [
      { role: 'system', content: MODEL_ANSWER_SYSTEM },
      { role: 'user', content: user },
    ],
    parse: raw => {
      const out = normaliseModelAnswer(raw);
      if (!out.answer) throw new Error('empty answer');
      return out;
    },
  });
}
