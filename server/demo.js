import { llm } from './llm/client.js';
import { profileBlock } from './profile.js';

/**
 * A worked interview you watch rather than sit.
 *
 * Two agents alternate: a strong candidate and the interviewer questioning
 * them. Generated a turn at a time rather than as one transcript, so the
 * viewer can stop it, and so the code appears as it is written rather than
 * arriving finished.
 */
const CANDIDATE = `You are a strong candidate in a Google interview in London, being
observed by someone learning how these go. Show them what good looks like.

- Think out loud. State the approach before writing anything, and say why the
  naive version is not enough.
- Give complexity unprompted, in plain text: O(n log n).
- Name your assumptions and ask when something is genuinely ambiguous.
- Be honest when you are unsure rather than bluffing — that reads well.
- Speak like a person, not an essay. Under 110 words per turn.
- British register, plain and unshowy.

When you write code, wrap it in a fenced block. Write it incrementally across
turns rather than dumping a finished solution in one go.
Never use LaTeX or dollar-sign maths. Write complexity in plain text: O(n log n),
O(n^2), 10^4. This is speech, not a paper.`;

const INTERVIEWER = `You are the Google interviewer running this session in London.
Plain, warm, understated British register. Under 50 words per turn.

Probe like a real interviewer: ask for complexity, push on an edge case, ask
what they would change at scale. One question per turn. Never solve it for
them. If they have done well, say so briefly and move on rather than gushing.
Never use LaTeX or dollar-sign maths. Write complexity in plain text: O(n log n),
O(n^2), 10^4. This is speech, not a paper.`;

const BEHAVIOURAL_CANDIDATE = `You are a strong candidate answering a behavioural question
at Google, observed by someone learning how to answer these well.

- Answer with a specific, concrete story — a real system, a real number.
- In your first answer, hit every STAR part out loud and in order: one or two lines of Situation, then
  say your Task explicitly in its own sentence ("My job was to…" / "I was responsible for…") — your
  personal goal, distinct from the team's — then your Actions, the Result, and a one-line Reflection.
  A strict reviewer only credits a part you actually say.
- Make your own contribution unmistakable: "I", not an undifferentiated "we".
- Quantify the outcome, and name the trade-off you accepted.
- Close with what you would do differently, briefly and honestly.
- Speak, do not recite. Under 130 words per turn. British register.
Never use LaTeX or dollar-sign maths. Write complexity in plain text: O(n log n),
O(n^2), 10^4. This is speech, not a paper.`;

const BEHAVIOURAL_INTERVIEWER = `You are a Google interviewer running a Googleyness & Leadership round
in London, observed by someone learning how these go. Plain, warm, understated British register.
Under 45 words per turn, one question per turn.

Run it like the real round: put the question, then probe the answer the way Google interviewers do —
"What did YOU specifically do?", "How did the other person react?", "What was the measurable result?",
"What would you do differently?", "What if they had still said no?". Probe the weakest part of what they
just said, never repeat a question already answered. After three or four follow-ups, thank them briefly
and close. Never coach or judge out loud.`;

/** Grok through devin answers when the xAI subscription cannot (e.g. the proxy is out of date). */
export const GROK_FALLBACK = 'devin/grok-4-6';

async function call(system, messages, model) {
  const ask = (m, timeoutMs) => llm.chat({
    messages: [{ role: 'system', content: system }, ...messages],
    model: m, temperature: 0.6, maxTokens: 500, timeoutMs, where: 'demo',
  });
  // Grok first (xAI, then through devin), each given 40 s, then the server default — so a slow
  // Grok never stalls the round. Returns which model answered, so a saved round says who played it.
  const chain = /grok/i.test(model || '') ? [...new Set([model, GROK_FALLBACK])] : [model].filter(Boolean);
  for (const m of chain) {
    try { return { text: await ask(m, 40_000), model: m }; } catch { /* next in the chain */ }
  }
  return { text: await ask(undefined), model: llm.defaultModel || null };
}

/**
 * One turn. The transcript is replayed from the speaker's point of view, so
 * each agent sees the other as the user rather than as itself.
 */
export async function turn({ mode, speaker, question, statement, transcript, model, profile, stories }) {
  const isCandidate = speaker === 'candidate';
  let system = isCandidate
    ? (mode === 'behavioural' ? BEHAVIOURAL_CANDIDATE : CANDIDATE)
    : (mode === 'behavioural' ? BEHAVIOURAL_INTERVIEWER : INTERVIEWER);
  // With a profile, the candidate is a specific person and the interviewer
  // has read their CV. Without one, the generic strong candidate.
  const who = profileBlock(profile, isCandidate ? 'candidate' : 'interviewer');
  if (who) system = `${system}\n\n${who}`;
  if (isCandidate && mode === 'behavioural' && stories?.length) {
    system += `\n\nYOUR OWN STORY BANK. The person watching wrote these; they want to see how THEIR stories
should be delivered to crack this question. Pick the one that fits the question best and tell it — keep
its facts exactly (never invent employers, numbers or outcomes; where a number is missing say "roughly"
or leave it out), but deliver it at strong-hire level: one-line situation, your task, what YOU did step by
step, a measurable result, one honest reflection. In follow-ups, use the other stories if they fit better.
${stories.map((x, i) => `STORY ${i + 1}${x.title ? ` — ${x.title}` : ''}:\n${x.text}`).join('\n\n')}`;
  }

  const brief = mode === 'behavioural'
    ? `QUESTION: ${question}`
    : `PROBLEM: ${question}\n\n${String(statement || '').slice(0, 2500)}`;

  const history = (transcript || []).map(t => ({
    // From this speaker's seat, their own lines are assistant turns.
    role: t.speaker === speaker ? 'assistant' : 'user',
    content: t.text,
  }));

  const messages = [{ role: 'system', content: brief }];
  if (!history.length) {
    messages.push({
      role: 'user',
      content: isCandidate
        ? 'Begin — talk me through how you are thinking about this.'
        : mode === 'behavioural'
          ? 'Open the round: greet them in one line and ask the question exactly as written.'
          : 'Open the interview: greet them briefly and put the problem to them.',
    });
  } else {
    // Anthropic-backed models reject an assistant-first array.
    if (history[0].role === 'assistant') messages.push({ role: 'user', content: 'Continue.' });
    messages.push(...history);
    if (history[history.length - 1].role === 'assistant') {
      messages.push({ role: 'user', content: 'Continue.' });
    }
  }

  const { text, model: used } = await call(system, messages, model);
  return { speaker, text: text || '(no response)', model: used };
}

/** Code the candidate has written so far, pulled out of their fenced blocks. */
export function extractCode(transcript) {
  const blocks = (transcript || [])
    .filter(t => t.speaker === 'candidate')
    .flatMap(t => [...String(t.text).matchAll(/```[a-z]*\n([\s\S]*?)```/gi)].map(m => m[1]));
  return blocks.length ? blocks[blocks.length - 1].trim() : '';
}
