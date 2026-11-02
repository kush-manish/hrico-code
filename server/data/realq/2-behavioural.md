# 2 — Googlyness: what they ask and how to answer from your resume

Resume used: `manish_kushwaha_Google_London_Software_Engineer_III.pdf` (Downloads/Documents/Resumes).

**Important:** the answer outlines below are built only from your resume bullets. I do not know what actually happened in each project, so anything in [brackets] is a gap you must fill with the real detail. Do not say anything in the interview that did not happen — interviewers dig three or four follow-ups deep.

---

## 1. What the round looks like (from the reports)

- 45 minutes scheduled; 6–10 questions; several posters finished in 25–30 minutes and used the rest for their own questions.
- Mix of "tell me about a time…" and hypotheticals ("what would you do if…").
- Heavy follow-ups: "tell me more", "what would you do differently?", "whose idea was chosen in the end?"
- One interviewer said up front: if you have no experience matching a question, you may skip it.
- It is eliminatory together with the DSA screen. Two posters with good coding rounds were rejected on behavioural feedback.
- Report counts below are approximate.
- Most posters said nearly all their questions came from this list: https://leetcode.com/discuss/post/5963463/

---

## 2. Questions actually reported (2025–2026), by theme

This list is pooled from many separate interviews. One interview had 6–10 of these, not all of them. Two items are marked as coming from the FAQ list rather than from an interview report.

Follow-up probes come in the same call as the question they follow. Pairs that were reported together:
- A manager's reasonable demand → then an unreasonable one (post 8522064).
- Most challenging project → how would you approach a similar problem now (post 8552887).
- Juggling several projects → how do you scope, get approvals and plan the time (post 8181616).
- An unreasonable deadline → what do you do when the stakeholder keeps following up (post 8367035).
- Conflict with a senior → what was the outcome and whose idea was chosen (post 7521416).

**Conflict and credit**
1. A disagreement with a colleague or manager; how was it resolved; whose idea won? (6 reports)
2. Someone takes credit for your work, repeatedly. (4 reports)
3. Two teammates disagree on a technical choice — how do you resolve it?
4. Your teammates were not satisfied with your work. What did you do?
5. You proposed an idea and the team disagreed. *(From the FAQ list, not from a 2025–26 interview report.)*

**Feedback**
6. Have you given critical feedback? How did the person take it?
7. How do you handle negative feedback?
8. A time your constructive feedback had a lasting effect.

**Ambiguity, deadlines, priorities**
9. Requirements are unclear — what do you do? (4 reports)
10. A stakeholder sets an unreasonable deadline and keeps chasing.
11. A manager's reasonable demand; then an unreasonable one.
12. You could not finish by the deadline — what did you do?
13. A project with a strict deadline was taken away from you midway. How did you feel?
14. Juggling several projects: how do you scope, get approvals, and plan development time?

**Ownership and leadership**
15. Most challenging / most technically complex project; how would you approach it now? (5 reports)
16. A project you proposed and led. Have you delivered something end to end alone?
17. Taking ownership of a problem outside your responsibility.
18. Helping someone outside your team; influencing another team.
19. Helping an underperforming teammate; mentoring a junior.
20. Covering for a senior colleague on a task.
21. Advocating for yourself or a teammate.
22. A manager style you admired; what would you do as the manager; how do you lead a team?
23. An innovative solution and its impact; an instance of self-improvement.
24. A failure / a time you messed up; how you found and fixed it.
25. How do you prioritise user needs? Customer empathy.

**Hypotheticals**
26. People disagree with a majority decision on a non-work matter (example given: planning a team outing).
27. Working with remote teammates.
28. Handling cultural diversity in a team (one L4 poster stumbled here and got Lean Hire).
29. Your team is not bonding well; how does your approach change as lead? *(From the FAQ list, not from a 2025–26 interview report.)*

**Newer / personal**
30. How do you use AI in daily work? When do you not use it? How do you verify AI-written code? (2 reports, Sep–Oct 2026)
31. What would you want at work that does not exist today?
32. Why Google? (reported) Why are you leaving your current company? *(From the FAQ list; likely for you because of the October 2025 start date.)*
33. What do you want to achieve next? A personal weakness.
34. Your approach to documentation (2025).

---

## 3. Your story bank (from the resume)

Prepare these eight. Each should be tellable in about two minutes.

| ID | Story | Resume facts you can use | Gaps to fill |
|---|---|---|---|
| S1 | **Validation agent, JPMorgan** | You architect and own an agent that checks generated code against Jira acceptance criteria and feeds structured feedback into self-correction loops | Who asked for it or did you propose it? What was unclear at the start? One hard design decision |
| S2 | **LLM workflows for COB reports, JPMorgan** | Manual developer intervention down 90%; COB report generation 70% faster | Who doubted it? How did you prove safety in a regulated setting? |
| S3 | **Multi-service integration validation** | Checks generated microservices work end to end; restarts automatically on failure | A failure it caught; a time it was wrong |
| S4 | **APAC regulatory reporting** | 100% compliance, zero audit failures; Scala, Spark, AWS, Snowflake | A tight regulatory deadline; a requirement that was ambiguous |
| S5 | **Pipeline rebuild, Blue Yonder** | 80M+ records a month; data construction from 10 days to under 8 hours (95%+) | What was the bottleneck? What did you try that failed? Who had to be convinced? |
| S6 | **Snowflake automation, Blue Yonder** | Stored-procedure workflows removed manual steps, 600+ engineering hours saved a year | Was this outside your assigned work? Whose pain was it? |
| S7 | **Sigma BI overhaul / reliability, Blue Yonder** | Query-and-display time from 3 minutes to under 40 seconds across two products; 98% uptime; incidents resolved within a 2–3 day SLA | A real production incident; the customer who was affected |
| S8 | **Co-founding Al-Shala** | MVP on AWS for 1,000+ concurrent users; ping server and WebRTC streaming; subscription model for live trainer sessions | A disagreement with a co-founder; a decision that was wrong; why it ended |

You will also need three stories the resume does not show. Write real ones down in week 1 (by 16 Oct):
- **N1:** a disagreement with a manager or peer where you did not simply win.
- **N2:** critical feedback you received and what you changed.
- **N3:** a mistake you made (a bug, a missed estimate) and how you owned it.

---

## 4. Which story answers which question

| Question (number from section 2) | Best story | Angle |
|---|---|---|
| 1, 3, 5 Disagreement | N1, or S2 (sceptics of LLMs in regulated reporting), or S8 (co-founder) | Listen first, restate their concern, bring data or a small experiment, agree on a way to decide, say who was right |
| 2 Credit taken | Hypothetical unless it happened | See 5.2 |
| 4 Team unhappy with your work | N2 or N3 | What you heard, what you changed, how you checked it worked |
| 6, 8 Giving feedback | S8 (as co-founder) or a code-review example at Blue Yonder/JPMC | Private, specific, about the work; follow-up afterwards |
| 7 Receiving feedback | N2 | No defensiveness; concrete change |
| 9 Unclear requirements | S1 or S4 | Acceptance criteria in tickets are often vague — that is literally what your agent has to handle |
| 10, 11, 12 Deadlines | S4 (regulatory dates do not move) or S7 (SLA) | Re-scope, communicate early, protect quality |
| 13 Project taken away | [only if it happened] | Business reason first, hand over cleanly, no resentment |
| 14 Multiple projects | S3 + S1 at JPMC, or S5–S7 running in parallel at Blue Yonder | Impact × urgency, written priorities agreed with your manager |
| 15 Most challenging project | S5 | Best numbers on the resume: 10 days → 8 hours |
| 16 Proposed and led / end to end alone | S1 or S8 | You "architect and own" it |
| 17 Beyond your role | S6 | Nobody owned the manual work; you removed it |
| 18 Other teams | S3 or S2 | Other teams' services and reports depend on yours |
| 19 Mentoring / underperformer | S8 or [a junior at Blue Yonder/JPMC] | Find the cause before judging; pair; small goals |
| 23 Innovation | S2 | 90% and 70% |
| 24 Failure | N3 or S8 | A real cost, what you changed afterwards |
| 25 User focus | S7 or the frontend agent that gives root-cause guidance | Users were waiting 3 minutes per query; engineers were stuck on mismatches |
| 30 AI use | S1–S3 | See 5.5 — this is your strongest topic |
| 32 Why Google / why leave | — | See 5.6 |

---

## 5. Answer outlines for the most likely questions

Structure for every "tell me about a time": **Situation** (2 sentences) → **Task** (what was yours) → **Action** (what *you* did, 3–4 steps) → **Result** (number) → **What I learned / would do differently** (one sentence). Say "I", not "we", for your actions.

### 5.1 Most challenging project → S5
- **Situation:** At Blue Yonder, building the dataset for [which product/customer] took about 10 days, and volume was growing to 80M+ records a month.
- **Task:** I was responsible for [your exact scope] and needed it to finish within [target].
- **Action:** I profiled the pipeline and found [the real bottleneck]. I redesigned it with Kafka streaming and Snowflake [what changed: incremental loads, parallelism, pushing transforms into Snowflake?]. I validated correctness by [how you compared old and new output]. I rolled it out [how — in stages?].
- **Result:** Under 8 hours instead of 10 days, a reduction of over 95%.
- **Learned:** [e.g. measure before redesigning; I would add data-quality checks earlier.]
- **Follow-ups to expect (my guess, based on the probing people described):** What was hardest? What would you do differently? Who disagreed with the design?

### 5.2 Someone takes credit for your work (hypothetical is fine)
1. Assume it may be unintentional; check facts before reacting.
2. Talk to the person privately: describe what happened and how it affected you, ask for their view.
3. Agree how contributions are shown from now on (design docs with authors, demo by the person who built it, names in status updates).
4. If it repeats after that conversation, raise it with your manager with specifics, focusing on team trust rather than punishment.
5. Close with: "I care more about the team shipping than about credit, but accurate credit matters for trust and for everyone's growth."
If you have a real instance, tell it in STAR form instead.

### 5.3 Unclear requirements → S1 (or S4)
- **Situation:** On the Software Factory platform, I own an agent that decides whether generated code meets the acceptance criteria in a Jira ticket. In practice the criteria were often [incomplete / ambiguous / untestable].
- **Action:** I [spoke to the ticket authors / collected examples] to learn what "done" meant to them. I wrote down assumptions and got them confirmed. I built the smallest version that handled the clear cases and returned structured feedback when criteria could not be checked, instead of guessing. I iterated from real failures.
- **Result:** [adoption or accuracy figure if you have one; otherwise the 90% reduction in manual intervention for the wider workflow].
- **Learned:** Under ambiguity I move forward with stated assumptions and short feedback loops.

### 5.4 Disagreement with a colleague or manager → N1 / S2 / S8
- **Situation:** [Who, about what. Example shape: a teammate preferred X, you believed Y, for the legacy-to-microservices migration or for letting an LLM step into the COB workflow.]
- **Action:** I asked for their reasoning first and repeated it back. I found the real concern was [risk / time / compliance]. I proposed a way to decide — [a small proof of concept, a benchmark, a written comparison]. We reviewed the result together.
- **Result:** We went with [whose idea — say so honestly], and [outcome]. The relationship afterwards was [state it].
- **Learned:** [one sentence].
- Have a second example where the other person was right.

### 5.5 How do you use AI, and how do you verify its code? → S1–S3
- I build AI agents at work, so my default is that generated code is untrusted until checked.
- **Where I use it:** boilerplate, tests, exploring unfamiliar code, first drafts.
- **Where I do not rely on it:** architecture decisions, anything touching regulatory logic, security-sensitive code.
- **How I verify:** acceptance criteria turned into checks, tests, integration validation across services, human review. This is exactly what my validation agent automates: it compares generated code to the ticket's criteria and sends structured feedback back for another attempt.
- **Result:** 90% less manual intervention, in a domain with zero audit failures.

### 5.6 Why Google? Why leave JPMorgan after about a year?
You joined JPMorgan in October 2025, so expect this. Keep it positive and short.
- What draws you: [your real reasons — scale of infrastructure, engineering culture, working on products used by billions, specific area you care about].
- Link to your path: startup founder → large-scale data pipelines → AI agents in production. The common thread is building reliable systems at scale.
- About JPMorgan: say what you have learned there and that you are leaving *towards* something, not away. Do not criticise the employer.
- Avoid: "Google is the ultimate goal" with nothing behind it; money; brand.

### 5.7 A failure / a time you messed up → N3 or S8
- Pick a real one with a real cost. Good candidates: an incident behind the 98% uptime figure, a wrong call at Al-Shala, an estimate you missed.
- Structure: what happened → how you noticed → you told people quickly → fix → the lasting change (a test, an alert, a checklist).

### 5.8 Hypotheticals (team outing, cultural diversity, remote teammates, team not bonding)
Use the same five steps every time:
1. Clarify the goal and constraints.
2. Hear everyone, especially the quieter people and the minority view.
3. Offer options and a fair way to choose (rotate, vote, combine).
4. Decide and explain the reasoning.
5. Check afterwards how it went and adjust next time.
For diversity: give a concrete example — you have worked across India and the UK, with APAC regulatory stakeholders — time zones, communication styles, writing things down so nobody is excluded.

---

## 6. What tends to score well, and what posters got wrong

**Score well**
- Specific numbers and your own actions.
- Showing you sought other people's views before deciding.
- Saying when the other person was right.
- A lesson at the end of each story.
- Motivation framed around users and the team.

**Reported mistakes**
- One L4 candidate was red-flagged because the interviewer heard "I did the project mainly to reduce my on-call burden". Frame motivation as user or customer impact; personal convenience is a side effect.
- Vague answers without detail ("we improved things").
- STAR learned but never practised aloud — Situation and Task ran long, Action and Result were rushed.
- No example ready for cultural diversity.
- "Why Google?" answered with "everyone wants Google".
- Blaming a former manager or teammate.

---

## 7. Questions to ask them at the end (pick two)
- What does a strong first six months look like for an L4 on your team?
- How does your team decide between competing technical approaches?
- What is one thing you would change about how your team works?

---

## 8. Drill plan to 3 November
1. **Week 1 (10–16 Oct):** fill every [bracket] in the answers with the real detail. Write three bullets each for N1, N2, N3.
2. **Week 2 (17–23 Oct):** say S5, S1 and S2 out loud, timed, two minutes each, every other day. Record yourself once.
3. **Week 3 (24–30 Oct):** two full mock Googlyness rounds in the Behavioural tab (REALQ set), 45 minutes each.
4. **31 Oct – 2 Nov:** say "Tell me about yourself", 5.5 (AI) and 5.6 (Why Google) aloud once a day. Pick your two questions for the interviewer.
5. Read the FAQ post list once and tick which story covers each question.

You also have a folder of behavioural-interview PDFs on your Desktop (`Behavioural/`); "5-Preparing for the Big Three Questions" and "6-Adapting to Big Tech Behaviorals" look like the two worth skimming. I did not read them.
