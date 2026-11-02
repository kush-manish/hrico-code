/**
 * The HFT hub's AI coach: a streamed conversation that knows the candidate
 * (from the profile they write in the hub), the firm they are looking at,
 * and the hub's own data, so advice is specific rather than generic tips.
 * Only the box owner (the admin account) gets the built-in JPMorgan persona
 * as a fallback; everyone else gets a neutral one with no personal claims.
 */
import { llm } from './llm/client.js';
import * as models from './models.js';
import { log } from './log.js';
import { UpstreamError } from './errors.js';
import { FIRMS, TYPE_LABELS, cityById } from './hft-firms.js';

export const MODES = {
  coach: "Career coach: which firms and roles fit, how to position the candidate's current background, a prep plan and timeline.",
  explain: 'Tutor: explain the concept the candidate asks about from first principles, with a worked example and how it shows up in a trading-firm interview.',
  mock: 'Mock interviewer: run ONE realistic interview question for the chosen firm, one step at a time. Wait for the answer, then probe and give short feedback before moving on.',
  negotiate: 'Offer & pay advisor: compare packages (base / bonus / sign-on / deferred), explain how bonuses work at prop firms vs banks, and suggest negotiation lines.',
};

function firmContext(firmId) {
  const f = FIRMS.find(x => x.id === firmId);
  if (!f || f.id === 'jpmc') return '';
  const cities = f.cities.map(c => cityById(c)?.name).filter(Boolean).join(', ');
  return `\n\nFIRM IN FOCUS: ${f.name} (${TYPE_LABELS[f.type] || f.type}; HQ ${f.hq}; offices ${cities}; languages ${f.langs.join(', ')}).
${f.blurb}
Reported SWE loop:\n- ${f.process.join('\n- ')}
Topics it leans on: ${f.topics.join('; ')}.
Matching practice questions (LeetCode slugs): ${f.coding.join(', ')}.`;
}

const OWNER_PERSONA = 'Candidate: Senior Software Engineer (SDE3 / VP-equivalent) at JPMorgan Chase in the UK, aiming to move into HFT, market-making or quant-fund engineering roles in London, Amsterdam or elsewhere in Europe.';
const NEUTRAL_PERSONA = 'Candidate: a software engineer exploring HFT, market-making or quant-fund engineering roles. They have not described their background; do not assume an employer, level or location. Ask one short question about their background when it would change the advice.';

export function systemFor({ mode, firm, profile, payNote, owner = false }) {
  const summary = String(profile?.summary || '').trim();
  const who = summary
    ? `Candidate profile (from their own notes): ${summary.slice(0, 1200)}`
    : (owner ? OWNER_PERSONA : NEUTRAL_PERSONA);
  return `You are a sharp, practical mentor who has hired engineers at top trading firms (Optiver, IMC, Jane Street, Citadel Securities, HRT, Jump, XTX, G-Research).
${who}

ROLE: ${MODES[mode] || MODES.coach}

How to answer:
- Be concrete and specific to this candidate and firm. No filler, no generic motivational talk.
- Use short sections and bullet points; use \`code\` and fenced code blocks for code (C++, Java or Python).
- When relevant, connect to what the candidate already knows from their background${owner && !summary ? ' (as a bank engineer: low-latency payments, risk, Java/Spring, large systems)' : ''} and what is new at a trading firm (latency budgets, market data, order books, P&L ownership, smaller teams).
- If you state compensation, say it is approximate and refer to the pay table in the hub (levels.fyi data).
- Do not invent specific interview questions as "confirmed"; say "commonly reported" instead.
- Keep replies under ~350 words unless the user asks for more depth.${firmContext(firm)}${payNote ? `\n\nPAY DATA THE USER IS LOOKING AT (levels.fyi, approximate): ${String(payNote).slice(0, 800)}` : ''}`;
}

/** Streams the coach's reply; tries the requested model first, then the server default. */
export async function* coach({ mode, firm, messages, profile, payNote, owner, requestedModel, signal, onModel }) {
  const chain = [];
  const req = await models.resolve(requestedModel);
  if (req) chain.push(req);
  chain.push(undefined);                       // the configured default
  const history = messages.map(m => ({ role: m.role, content: m.content }));
  let lastErr = null;
  for (const model of chain) {
    if (signal?.aborted) return;
    let started = false;
    try {
      for await (const d of llm.stream({
        model, temperature: 0.5, maxTokens: 900, signal, where: 'hft-coach',
        messages: [{ role: 'system', content: systemFor({ mode, firm, profile, payNote, owner }) }, ...history],
      })) {
        if (!started) { started = true; onModel?.(model || 'default'); }
        yield d;
      }
      if (started) return;
    } catch (err) {
      if (signal?.aborted) return;
      if (started) { log.warn('hft coach stream ended early', { err: err.message }); return; }
      lastErr = err;
      log.warn('hft coach: model failed, trying the next', { model: model || 'default', err: err.message });
    }
  }
  throw lastErr || new UpstreamError('the coach is unavailable right now', 503);
}
