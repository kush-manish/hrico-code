/**
 * Talk to a Googler: a live conversation for practising how you come across
 * — the intro, the background chat, the behavioural follow-ups, the coffee
 * chat — rather than a scored interview.
 *
 * Latency is the point, so replies are streamed token by token and the
 * browser speaks them a sentence at a time as they arrive.
 */
import { UpstreamError } from './errors.js';
import { log } from './log.js';
import { llm, num } from './llm/client.js';
import { config } from './config.js';
import * as models from './models.js';
import { brief } from './interviewer.js';
import { profileBlock } from './profile.js';

export const TOPICS = {
  intro: {
    label: 'Introduce yourself',
    hint: 'The first five minutes: who you are, what you have been building, why Google. They probe one thing.',
    prompt: `THIS CALL: the opening of an interview. Ask them to introduce themselves and what they have been
working on. Listen. Pick ONE specific thing they mention — a system, a number, a decision — and
ask a real follow-up about it. Then ask why Google, and why this team/level. Keep it moving.`,
  },
  behavioural: {
    label: 'Behavioural, conversationally',
    hint: 'Two or three "tell me about a time" questions with the follow-ups a Googler actually asks.',
    prompt: `THIS CALL: a behavioural conversation. Ask one "tell me about a time" question at a time
(conflict, a failure, influencing without authority, a hard trade-off, mentoring). After each answer,
probe what is missing — the number, their own part, the trade-off, what they would do differently —
before moving on. Two or three questions in total.`,
  },
  resume: {
    label: 'Deep-dive on my resume',
    hint: 'They have read your CV. Expect pointed questions about the systems and claims on it.',
    prompt: `THIS CALL: a deep-dive on the candidate's CV, which you have read. Pick the most substantial
project or claim and dig: what exactly did they build, what was hard, what were the numbers, what
broke, what would they change. One question at a time. Be specific, not general.`,
  },
  chat: {
    label: 'Coffee chat with a Googler',
    hint: 'Informal. Life on the team, London, the process. You should ask questions too.',
    prompt: `THIS CALL: an informal chat, not an interview. Talk about your team, what a week looks like,
London, the interview process. Answer their questions honestly and briefly. Ask them about themselves
too — what they want from the next role. Relaxed, human, no probing.`,
  },
  phone: {
    label: 'Recruiter phone screen',
    hint: 'Timeline, level, motivation, logistics — and how you talk about your experience in two minutes.',
    prompt: `THIS CALL: you are the recruiter (not an engineer) on a first phone screen. Cover: a two-minute
summary of their background, why they are looking, what level and team they are aiming for, timeline,
and one or two light questions about their most recent work. Friendly, efficient, no technical probing.`,
  },
};

export function systemFor({ topic, interviewer, profile }) {
  const t = TOPICS[topic] || TOPICS.intro;
  const who = topic === 'phone'
    ? `YOU ARE: ${interviewer.name}, a technical recruiter at Google's ${interviewer.office} office. British, based in London.`
    : brief(interviewer).split('\n\nHOW THE HOUR RUNS')[0];
  return `${who}

YOU ARE ON A VOICE CALL. This is a conversation, not a document:
- Under 45 words per turn unless a short story is genuinely needed. One question at a time.
- React to what they just said before asking the next thing — a half-sentence of acknowledgement, not praise.
- If they ramble, steer them gently: "Give me the short version — what was your call?"
- If they give a vague answer, ask for the specific: the number, the decision, their own part.
- Never lecture, never list, never use headings or bullet points — you are speaking.
- Plain British English, contractions, warm and a little understated.

${t.prompt}

${profileBlock(profile) || 'You have not seen their CV; ask.'}

When the conversation has run its course (after the questions above), wrap up naturally in one turn
and say goodbye.`;
}

/** Content deltas of one reply from one model. */
function replyStream({ topic, messages, interviewer, profile, model, signal }) {
  const history = messages.map(m => ({ role: m.role, content: m.content }));
  if (!history.length || history[0].role !== 'user') {
    history.unshift({ role: 'user', content: `[The candidate has just joined the call.] Open the call as ${interviewer.firstName} — greet them in one or two sentences and ask your first question. Stay in character; you are ${interviewer.name}, nothing else.` });
  }
  return llm.stream({
    model, temperature: 0.6, maxTokens: 260, signal, where: 'talk',
    messages: [{ role: 'system', content: systemFor({ topic, interviewer, profile }) }, ...history],
  });
}

/**
 * The models tried for a turn: the one asked for, then the configured
 * chain. Each sits behind its own quota, so the chain also spreads load.
 */
export async function modelChain(requested) {
  // models.resolve() answers undefined for "no choice" or an unknown id, and
  // the filter below drops undefined, so the configured default has to be
  // named explicitly or a call with no model picked would try nothing but
  // the talk chain.
  const chain = [await models.resolve(requested), config.llm.model || process.env.LLM_MODEL];
  for (const id of config.llm.talkModels) {
    const m = await models.resolve(id);
    if (m && !chain.includes(m)) chain.push(m);
  }
  return chain.filter(Boolean);
}

/**
 * One turn of the call as a stream of text deltas, with the model that
 * produced it. Models are tried in order; the first ~80 characters of a
 * reply are held back and checked, and a model that answers as an AI
 * assistant instead of the interviewer is dropped for the next one, so the
 * candidate never sees it. `onModel` fires once, when a reply passes.
 */
export async function* turn({ topic, messages, interviewer, profile, requestedModel, signal, onModel }) {
  const chain = await modelChain(requestedModel);
  let lastErr = null;
  for (const model of chain) {
    if (signal?.aborted) return;
    let held = '', passed = false, leaked = false, failed = false;
    const chunks = [];
    try {
      for await (const d of replyStream({ topic, messages, interviewer, profile, model, signal })) {
        if (passed) { chunks.push(d); yield d; continue; }
        held += d;
        if (LEAK.test(held)) { leaked = true; break; }
        if (held.length >= 80) { passed = true; onModel?.(model); yield held; }
      }
    } catch (err) {
      if (signal?.aborted) return;
      if (passed) {
        // Part of the reply is already on the wire; say so rather than end
        // as though the sentence were finished.
        log.warn('talk stream ended early', { model, err: err.message });
        throw Object.assign(new UpstreamError('the reply was cut off', 502), { partial: true });
      }
      failed = true; lastErr = err;
      log.warn('talk: model failed, trying the next', { model, err: err.message });
    }
    if (failed) continue;
    if (leaked) { log.warn('talk: model answered out of character, trying the next', { model, sample: held.slice(0, 60) }); continue; }
    if (!passed && !held.trim()) {                          // an empty reply is a failure, try the next
      lastErr = new UpstreamError('the model returned an empty reply', 502);
      log.warn('talk: empty reply, trying the next', { model });
      continue;
    }
    if (!passed) { onModel?.(model); yield held; }            // a short reply that never hit the threshold
    return;
  }
  throw lastErr || new UpstreamError('no model would take the call', 503);
}

const FEEDBACK_SYSTEM = `You coach people on how they come across in interview conversations. Given the
transcript of a practice call, return ONLY this JSON:
{
  "scores": { "clarity": 1-5, "concision": 1-5, "structure": 1-5, "specificity": 1-5, "warmth": 1-5 },
  "didWell": ["2-3 things, each with a short quote from the transcript"],
  "fix": ["3 concrete changes, most valuable first, each with the moment it applies to"],
  "fillers": "one line on filler words, hedging or rambling if present, else ''",
  "oneLiner": "one sentence: how a Googler would describe this candidate after the call"
}
Judge the CANDIDATE's turns only. Be specific and kind. No markdown fences.`;

export function normaliseFeedback(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const sc = r.scores && typeof r.scores === 'object' ? r.scores : {};
  const n = v => { const x = Math.round(num(v)); return Number.isFinite(x) ? Math.max(1, Math.min(5, x)) : null; };
  const arr = (v, k) => (Array.isArray(v) ? v : []).map(x => String(x ?? '').trim()).filter(Boolean).slice(0, k);
  const out = {
    scores: { clarity: n(sc.clarity), concision: n(sc.concision), structure: n(sc.structure), specificity: n(sc.specificity), warmth: n(sc.warmth) },
    didWell: arr(r.didWell, 3), fix: arr(r.fix, 4),
    fillers: String(r.fillers || '').slice(0, 300), oneLiner: String(r.oneLiner || '').slice(0, 300),
  };
  // Nothing usable came back: fail, so the page shows an error with a retry
  // rather than empty headings.
  const anyScore = Object.values(out.scores).some(x => x != null);
  if (!anyScore && !out.didWell.length && !out.fix.length && !out.oneLiner) throw new Error('feedback reply was empty');
  return out;
}

export async function feedback({ messages, model }) {
  const transcript = messages.map(m => `${m.role === 'user' ? 'CANDIDATE' : 'GOOGLER'}: ${m.content}`).join('\n\n');
  return llm.chatJson({
    model, temperature: 0.2, maxTokens: 900, where: 'talk-feedback',
    messages: [{ role: 'system', content: FEEDBACK_SYSTEM }, { role: 'user', content: `TRANSCRIPT:\n\n${transcript}` }],
    parse: normaliseFeedback,
  });
}


/** Some models on this proxy answer as an AI assistant when there is no
 *  conversation yet. The relay checks the opening words for that. */
export const LEAK = /\b(claude|anthropic|openai|chatgpt|gemini|language model|ai assistant|cli assistant|as an ai)\b/i;
