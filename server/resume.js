import { UpstreamError } from './errors.js';
import { log } from './log.js';
import { llm } from './llm/client.js';
import { config } from './config.js';
import { BadRequest } from './validate.js';


export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;   // 2 MB
const MAX_TEXT_CHARS = 24_000;
const MIN_TEXT_CHARS = 180;

export const ACCEPTED = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'txt',
};

function kindFor(mimetype, filename) {
  if (ACCEPTED[mimetype]) return ACCEPTED[mimetype];
  const ext = String(filename || '').toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt' || ext === 'md') return 'txt';
  return null;
}

/**
 * Extracts plain text from an uploaded resume.
 *
 * The buffer stays in memory for the life of the request — nothing about a
 * resume is written to disk, cached, or logged. Only sizes and outcomes are
 * recorded, never content.
 */
export async function extractText(buffer, mimetype, filename) {
  const kind = kindFor(mimetype, filename);
  if (!kind) throw new BadRequest('unsupported file type — upload a PDF, DOCX, TXT or MD');
  if (!buffer?.length) throw new BadRequest('the uploaded file is empty');

  let text = '';
  try {
    if (kind === 'pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      text = result?.text || '';
    } else if (kind === 'docx') {
      const mammoth = (await import('mammoth')).default;
      const result = await mammoth.extractRawText({ buffer });
      text = result?.value || '';
    } else {
      text = buffer.toString('utf8');
    }
  } catch (err) {
    log.warn('resume extraction failed', { kind, bytes: buffer.length, err: err.message });
    throw new BadRequest(`could not read that ${kind.toUpperCase()} — it may be encrypted or corrupted`);
  }

  text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (text.length < MIN_TEXT_CHARS) {
    throw new BadRequest(
      'hardly any text came out of that file — if it is a scanned or image-only PDF, ' +
      'export a text-based copy and try again',
    );
  }
  log.info('resume extracted', { kind, bytes: buffer.length, chars: text.length });
  return text.slice(0, MAX_TEXT_CHARS);
}

const SYSTEM = `You are a senior Google interviewer preparing to interview a candidate. You have
their resume. Produce the questions you would actually ask.

Work through the resume section by section. For every role, project, claimed
skill and qualification, generate the questions a sharp interviewer would use to
test whether the claim holds up.

Cover all of these:
- An opening "walk me through your resume" style section.
- One section per role: technical deep-dives into what they actually built,
  plus behavioural questions about how they worked.
- One section per project.
- Claimed skills: questions that separate real depth from buzzwords.
- Education, if there is anything worth probing.
- Risks: gaps in dates, short tenures, sideways moves, vague claims,
  unquantified impact. Be direct — these are the uncomfortable questions they
  should rehearse.

Rules:
- Every question must be specific to THIS resume. Quote their own wording in
  the question where it helps. Never produce generic filler.
- 4-8 questions per section.
- "why" states what the interviewer is really testing, in one short phrase.
- If the resume is thin or vague, say so in the summary and ask the questions
  that expose it.

Reply with ONLY a JSON object, no prose and no code fence:
{
  "summary": {"headline":"<one sentence read on this candidate>",
              "level":"<your estimate, e.g. mid / senior / staff>",
              "focus":"<their apparent specialism>",
              "watchOuts":["<thing an interviewer would push on>"]},
  "sections": [
    {"title":"<e.g. Acme Corp - Senior Software Engineer>",
     "kind":"overview|experience|project|skills|education|risk",
     "source":"<short quote from the resume this section is drawn from>",
     "questions":[{"q":"<the question>","type":"technical|behavioural|probing",
                   "why":"<what it tests>"}]}
  ]
}`;


const KINDS = new Set(['overview', 'experience', 'project', 'skills', 'education', 'risk']);
const TYPES = new Set(['technical', 'behavioural', 'probing']);

/** The model's shape is never trusted; normalise before it reaches the page. */
export function normaliseQuestions(raw) {
  const str = (v, n) => String(v ?? '').slice(0, n);
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .slice(0, 24)
    .map((s, i) => ({
      id: `s${i}`,
      title: str(s?.title, 160) || `Section ${i + 1}`,
      kind: KINDS.has(s?.kind) ? s.kind : 'experience',
      source: str(s?.source, 400),
      questions: (Array.isArray(s?.questions) ? s.questions : [])
        .slice(0, 12)
        .map(q => ({
          // Trim before the emptiness check: a whitespace-only question is
          // truthy and would otherwise render as a blank row.
          q: str(q?.q, 500).trim(),
          type: TYPES.has(q?.type) ? q.type : 'probing',
          why: str(q?.why, 200).trim(),
        }))
        .filter(q => q.q),
    }))
    .filter(s => s.questions.length);

  const sum = raw.summary || {};
  return {
    summary: {
      headline: str(sum.headline, 400),
      level: str(sum.level, 60),
      focus: str(sum.focus, 160),
      watchOuts: (Array.isArray(sum.watchOuts) ? sum.watchOuts : [])
        .slice(0, 6).map(x => str(x, 240)).filter(Boolean),
    },
    sections,
    totalQuestions: sections.reduce((a, s) => a + s.questions.length, 0),
  };
}

export async function generateQuestions(resumeText, model) {
  try {
    return await llm.chatJson({
      model, temperature: 0.4, maxTokens: 4000, timeoutMs: config.llm.longTimeoutMs, where: 'resume',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `RESUME:\n\n${resumeText}` },
      ],
      parse: raw => {
        const out = normaliseQuestions(raw);
        if (!out.sections.length) throw new Error('no usable sections');
        return out;
      },
    });
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 502) {
      // The client already logged the failure without the content, which is derived from the resume.
      throw new UpstreamError('could not turn that resume into questions — try again', 502, { cause: err });
    }
    throw err;
  }
}
