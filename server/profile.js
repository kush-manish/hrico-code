/**
 * The candidate profile: a compact, structured reading of the resume that the
 * interviewers and the watched candidate are given, so questions are about
 * the real CV and the watched candidate answers as that person.
 *
 * The profile is returned to the browser and kept there (localStorage). The
 * server sees it only inside the requests that carry it and never logs or
 * stores it — the same guarantee the resume upload already makes.
 */
import { UpstreamError } from './errors.js';
import { llm } from './llm/client.js';
import { config } from './config.js';


const SYSTEM = `You read a software engineer's resume and return a compact profile as JSON, for
use by a mock interviewer. Be concrete and faithful: only what the resume supports, no
embellishment. Return ONLY this JSON object:
{
  "name": "full name as written",
  "headline": "one line, e.g. Senior backend engineer, 7 years, distributed systems in Go and Java",
  "targetRole": "the role they appear to be applying for, if the resume says (e.g. Software Engineer III, Google London), else ''",
  "location": "city/country if given, else ''",
  "yearsExperience": 7,
  "currentRole": "title @ company (dates)",
  "companies": [{"name": "", "role": "", "period": "", "highlights": ["2-3 concrete things they did there, with numbers where the resume gives them"]}],
  "stack": ["languages, frameworks, infra — the ones they actually list, most-used first"],
  "projects": [{"name": "", "what": "one sentence", "impact": "the number or outcome the resume claims", "tech": ["..."]}],
  "strengths": ["3-5 things an interviewer would rate as clear evidence"],
  "gaps": ["2-4 things an interviewer would probe: unquantified claims, missing depth, short tenures"],
  "education": "degree, institution, year if given, else ''"
}
Keep every string short. No markdown fences.`;

const str = (v, n) => String(v ?? '').trim().slice(0, n);
const arr = (v, n, f) => (Array.isArray(v) ? v : []).slice(0, n).map(f).filter(Boolean);

/** The model's shape is never trusted; also the validator for profiles sent back by the browser. */
export function normaliseProfile(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const years = Number(r.yearsExperience);
  return {
    name: str(r.name, 80),
    headline: str(r.headline, 200),
    targetRole: str(r.targetRole, 120),
    location: str(r.location, 80),
    yearsExperience: Number.isFinite(years) && years >= 0 && years < 60 ? Math.round(years * 2) / 2 : null,
    currentRole: str(r.currentRole, 160),
    companies: arr(r.companies, 8, c => c && typeof c === 'object' ? {
      name: str(c.name, 80), role: str(c.role, 100), period: str(c.period, 60),
      highlights: arr(c.highlights, 4, h => str(h, 240)),
    } : null).filter(c => c.name || c.role),
    stack: arr(r.stack, 20, s => str(s, 40)),
    projects: arr(r.projects, 8, p => p && typeof p === 'object' ? {
      name: str(p.name, 100), what: str(p.what, 240), impact: str(p.impact, 200), tech: arr(p.tech, 8, t => str(t, 40)),
    } : null).filter(p => p.name || p.what),
    strengths: arr(r.strengths, 6, s => str(s, 200)),
    gaps: arr(r.gaps, 6, s => str(s, 200)),
    education: str(r.education, 160),
  };
}

export const isEmptyProfile = p => !p || !(p.name || p.headline || p.companies?.length || p.stack?.length);

/** The profile as a system-prompt block. `who` is 'candidate' or 'interviewer'. */
export function profileBlock(p, who = 'interviewer') {
  if (isEmptyProfile(p)) return '';
  const lines = [];
  lines.push(who === 'candidate'
    ? `YOU ARE THIS CANDIDATE. Answer as ${p.name || 'this person'} would, drawing only on the experience below. Every story you tell must come from this CV — real systems, real numbers from it. Never invent employers or projects that are not here. If the CV lacks a detail, say so plainly rather than inventing it.`
    : `THE CANDIDATE'S CV. Use it: address them by first name, ask about the specific systems and claims below, and probe the gaps. Do not read it back to them.`);
  if (p.name) lines.push(`Name: ${p.name}`);
  if (p.headline) lines.push(`Headline: ${p.headline}`);
  if (p.targetRole) lines.push(`Applying for: ${p.targetRole}`);
  if (p.yearsExperience != null) lines.push(`Experience: ${p.yearsExperience} years`);
  if (p.currentRole) lines.push(`Current role: ${p.currentRole}`);
  if (p.location) lines.push(`Location: ${p.location}`);
  for (const c of p.companies || []) {
    lines.push(`- ${c.role || 'Engineer'} at ${c.name}${c.period ? ` (${c.period})` : ''}`);
    for (const h of c.highlights || []) lines.push(`    · ${h}`);
  }
  if (p.projects?.length) {
    lines.push('Projects:');
    for (const pr of p.projects) lines.push(`- ${pr.name}: ${pr.what}${pr.impact ? ` Impact: ${pr.impact}.` : ''}${pr.tech?.length ? ` [${pr.tech.join(', ')}]` : ''}`);
  }
  if (p.stack?.length) lines.push(`Stack: ${p.stack.join(', ')}`);
  if (p.strengths?.length) lines.push(`Strengths: ${p.strengths.join(' | ')}`);
  if (p.gaps?.length) lines.push(`${who === 'candidate' ? 'Known weak spots (be honest about them if pressed)' : 'Probe these'}: ${p.gaps.join(' | ')}`);
  if (p.education) lines.push(`Education: ${p.education}`);
  return lines.join('\n');
}


export async function extractProfile(resumeText, model) {
  try {
    return await llm.chatJson({
      model, temperature: 0.2, maxTokens: 1800, timeoutMs: config.llm.longTimeoutMs, where: 'profile',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `RESUME:\n\n${resumeText}` },
      ],
      parse: raw => {
        const out = normaliseProfile(raw);
        if (isEmptyProfile(out)) throw new Error('empty profile');
        return out;
      },
    });
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 502) throw new UpstreamError('could not read a profile from that resume', 502, { cause: err });
    throw err;
  }
}
