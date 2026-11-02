/**
 * A different interviewer each session.
 *
 * A real loop does not open with "take your time" — it opens with a person
 * telling you who they are and what they work on, asking about you, and only
 * then reaching the problem. The identity below drives that opening and is
 * carried in the prompt so the interviewer stays the same person throughout.
 */
const FIRST = [
  'Alex', 'Priya', 'Tom', 'Aisha', 'Dan', 'Sofia', 'Marcus', 'Nina', 'Raj', 'Ellie',
  'Ben', 'Chloe', 'Omar', 'Hannah', 'Kwame', 'Lucia', 'Sam', 'Yuki', 'Joe', 'Farah',
];
const LAST = [
  'Whitfield', 'Nair', 'Brennan', 'Okonkwo', 'Larsen', 'Moreau', 'Patel', 'Hughes',
  'Okafor', 'Silva', 'Fitzgerald', 'Kaur', 'Andersson', 'Mensah', 'Doyle', 'Reyes',
];

/** London-based engineering areas, with work that is plausible for each. */
const TEAMS = [
  { team: 'Search Infrastructure', work: ['serving latency for the web index', 'the query understanding pipeline', 'index freshness'] },
  { team: 'Google Cloud — Storage', work: ['the metadata layer behind Cloud Storage', 'regional replication', 'consistency guarantees for object writes'] },
  { team: 'YouTube — Playback', work: ['adaptive bitrate selection', 'the player on low-end Android devices', 'startup latency'] },
  { team: 'Ads — Serving', work: ['the auction serving path', 'latency budgets in the ad request path', 'real-time budget enforcement'] },
  { team: 'Android — Framework', work: ['background execution limits', 'the job scheduler', 'battery regressions'] },
  { team: 'Google Maps — Routing', work: ['live traffic ingestion', 'route ranking', 'transit schedules'] },
  { team: 'Payments', work: ['the transaction ledger', 'fraud signals at authorisation time', 'reconciliation'] },
  { team: 'Chrome — Networking', work: ['connection reuse', 'the HTTP cache', 'prefetch heuristics'] },
  { team: 'Workspace — Drive', work: ['the sharing permission model', 'large-file uploads', 'offline sync'] },
  { team: 'Core — Developer Infrastructure', work: ['the build cache', 'test flakiness at scale', 'release tooling'] },
];

const pick = a => a[Math.floor(Math.random() * a.length)];

export function newInterviewer() {
  const t = pick(TEAMS);
  const years = 2 + Math.floor(Math.random() * 9);
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  return {
    name,
    firstName: name.split(' ')[0],
    team: t.team,
    work: pick(t.work),
    years,
    office: 'King’s Cross, London',
  };
}

/**
 * The opening turn is generated here rather than by the model: it is the one
 * line that must always land, it costs nothing, and it removes a round trip
 * from the start of every interview.
 */
export function greeting(iv) {
  const tenure = iv.years === 1 ? 'a year' : `${iv.years} years`;
  const openers = [
    `Hi, I'm ${iv.firstName} — I'm a software engineer on ${iv.team} here in ${iv.office}. I've been at Google ${tenure}, mostly working on ${iv.work}. Before we get into the problem, tell me a bit about yourself and what you've been working on recently.`,
    `Morning — ${iv.firstName}, I work on ${iv.team} out of the ${iv.office} office. ${tenure.charAt(0).toUpperCase() + tenure.slice(1)} in now, currently on ${iv.work}. Let's start with you though: give me a quick tour of your background and what you're working on at the moment.`,
    `Hey, good to meet you. I'm ${iv.firstName}, ${iv.team} — I've spent most of my ${tenure} here on ${iv.work}. We'll do some coding shortly, but first I'd like to hear about you. What have you been building lately?`,
  ];
  return pick(openers);
}

/** Prepended to the coding interviewer's system prompt. */
export function brief(iv) {
  return `YOU ARE: ${iv.name}, a software engineer on ${iv.team} at Google's ${iv.office}
office, ${iv.years} years at the company, currently working on ${iv.work}.

You are British and based in London. Speak the way a London engineer actually
speaks in an interview: plain, warm, a little understated. "Right", "fair
enough", "that's a good shout", "let's have a look". Never American-corporate,
never "awesome" or "reach out". Do not overdo it either — you are a working
engineer, not a character.

HOW THE HOUR RUNS. Track where you are from the transcript:
1. You have already introduced yourself and asked about the candidate.
   Spend two or three exchanges on their background. Ask one real follow-up
   about something they mention — a system, a trade-off, a scale figure.
2. Then move to the problem yourself, plainly: "Right, let's get you coding."
   Point them at the problem statement on screen.
3. From then on behave as described below while they work.
4. If they finish early, ask about complexity, then about how they would test
   it, then what they would change to handle more scale.
5. Ask exactly one Google-style follow-up per round (scale, streaming input or
   a changed constraint). The app tells you when: a FOLLOW-UP NOW line in the
   context. Do not ask a second one unprompted.
6. In a Google realistic round nothing can be run: the candidate proves the
   code by tracing it by hand, so ask for that rather than for a test run.

Never announce these stages or number them. Stay in character as ${iv.firstName}
throughout — you are one person, not a script.`;
}
