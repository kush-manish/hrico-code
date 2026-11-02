# 3 — How Google runs the interview and how to give yourself the best chance

Everything here comes from candidate reports on LeetCode Discuss (2025–2026) unless marked as my advice. Nobody can guarantee a result; this is about removing the avoidable ways people failed.

---

## 1. The process for L4 / SWE III

| Stage | What happens | Notes from reports |
|---|---|---|
| Recruiter call | 15–30 min, background, language, prep time | Some candidates also get the Google Hiring Assessment (situational questionnaire) or a coding OA first |
| **Virtual round 1 — DSA** | 45 min, one interviewer | Eliminatory |
| **Virtual round 2 — Googlyness** | 45 min, behavioural | Eliminatory; often the same day or the next day |
| **Onsite — 2 DSA rounds** | In person, back to back, 45 min each | Only after both virtual rounds are positive |
| Team matching | "Fit call" with hiring managers | A conversation, but it can take weeks or months |
| Hiring committee | Reviews the whole packet | Can ask for one extra coding round |
| Offer | Compensation discussion | |

- This "2 virtual + 2 onsite" format is what almost every 2026 L4 report describes. A few locations still ran phone screen + 3 coding + Googlyness (a London L3 loop in Jan 2026 had a phone screen and three coding rounds).
- Time from virtual rounds to a result: same day to 3 weeks. Onsite is usually 2–4 weeks later.
- Cool-down if rejected at interviews: 12 months. For the assessment/OA: 6 months.
- Several people who narrowly missed the coding screen were offered a second coding round instead of a rejection. If the result is borderline, ask your recruiter about it.
- One recruiter told a London/Dublin candidate that positive interview results stay valid for 18 months during team matching.

---

## 2. How the DSA round actually runs

- **Environment:** a shared document or simple editor. No compiler, no autocomplete, no running code. Practise every solution in a plain Google Doc from now until 3 Nov.
- **Timing is strict:** 45 minutes including introductions.
- **Typical flow:** 2–5 min intro → problem (sometimes given verbally, deliberately vague) → your questions → approach → code → dry run → complexity → follow-up(s) → your questions.
- **Shape of the 45 minutes.** Most reports: one main question, then one or two follow-ups in the same call. Some: a short warm-up, then the main question. A few: two or three small questions in a row. Several candidates were marked down for not reaching the follow-up.
- **Follow-ups in my files.** File 4 numbers every part (Q1.1, Q1.2, …) and says under each question whether the parts were asked in one call or come from different interviews.
- **Sometimes a short resume or AI-usage chat first** (one US L4 screen spent 15–20 minutes on projects; a recent L3 screen opened with questions on using AI for coding).
- **Follow-ups often drift into system-design territory:** "what breaks in production?", "what if this is called millions of times?", "what if the data is in files?"
- **Interviewers for India and Europe slots are often in Europe** (Poland, London, Zurich); accents and audio can cost time, so ask them to paste the problem as text.

Ratings interviewers give: Strong Hire, Hire, Lean Hire, Lean No Hire, No Hire. For the screen you need a clear positive on DSA and a positive on Googlyness.

---

## 3. What they are grading

From recruiter feedback quoted in the posts, the write-up covers roughly four things:

| Area | What positive feedback mentioned | What negative feedback mentioned |
|---|---|---|
| Problem solving | Clarifying questions, brute force → optimal, reached optimal with at most a small hint | "Needed hints", "didn't ask clarifying questions", "only solved the warm-up" |
| Coding | Clean, modular, helper functions, good names, a `struct`/class for data | "Code comprehension", everything in one function, nested pairs and maps, syntax slips |
| Verification | Dry run without being asked, edge cases found before the interviewer | "No dry run", "missed edge cases", "couldn't find the bug" |
| Communication | Thinking aloud, concise, explains trade-offs | Rambling, silence, wrong time complexity |

One L4 candidate was told their DSA knowledge was "outstanding" and was still failed on code quality. Another solved three onsite problems and was put on hold because "every round had a concern about code comprehension".

---

## 4. A 45-minute plan (my advice, built from the failures above)

| Minute | Do this |
|---|---|
| 0–3 | Short intro: name, 4 years, JPMorgan (AI validation agents, Spark pipelines), Blue Yonder before that. Thirty seconds. |
| 3–8 | Restate the problem. Ask: input size, value ranges, duplicates, empty input, what to return when there is no answer, can I modify the input. Write one small example. |
| 8–12 | State brute force in one sentence with its complexity. Then the better idea and why it works. Get a "sounds good" before coding. |
| 12–27 | Code. Signature first, helpers named before they are written, talk while typing. |
| 27–31 | Dry-run your example line by line, then one edge case. Fix bugs yourself. |
| 31–33 | Time and space complexity — include the sort, and API call costs if there is an API. |
| 33–43 | Follow-up. Even if you cannot finish coding it, explain the approach completely. |
| 43–45 | One question for the interviewer. |

**If you are stuck for more than 2–3 minutes:** say what you are considering and why it fails. A small hint taken early costs less than ten silent minutes.

**If the first question feels easy:** it is the warm-up. Finish it in 10–15 minutes. Three candidates were failed or marked down because the first question used up the slot and the follow-up never happened.

**If the statement is vague:** that is intentional. "Fair allocation", "merge screenshots", "what could the question be?" — your job is to define the problem by asking.

---

## 5. Checklist of avoidable mistakes

- [ ] Do not start coding before the interviewer agrees with the approach.
- [ ] Do not skip the dry run, even if nobody asks.
- [ ] Do not misstate complexity: sorting is O(n log n); `map`/`TreeMap` is O(log n) per operation; subsets are O(2^n), not O(n!).
- [ ] Do not write notes on paper off-screen — one rejected candidate named this as their own likely mistake; think in the shared doc.
- [ ] Do not assume library helpers the interviewer has not accepted; be ready to implement a heap or say which language has one. Python `heapq`, Java `PriorityQueue`, C++ `priority_queue`.
- [ ] Do not model data as nested pairs; define a small class.
- [ ] Do not argue with a hint; take it and say how it changes your approach.
- [ ] Do not go silent, and do not ramble; short sentences.
- [ ] Check integer overflow and empty input out loud.
- [ ] Be ready to write unit-test cases for your function (asked in several reports).

---

## 6. Your plan to Monday 3 November (my advice)

**Week 1 · 10–16 Oct — the most repeated questions**
1. Each day, 2 hours: solve one or two of Q1–Q7 in a Google Doc, no IDE, 45-minute timer, talking aloud. Start with the mouse/cat grid (≈ LC 2812) and the stream dedupe with the "suppress both" variant (≈ LC 359).
2. Rewrite the templates from memory: BFS on a grid, topological sort (Kahn), binary search on the answer, heap top-K, sweep line.
3. Googlyness: fill every [bracket] in your answers with the real details; write N1–N3.

**Week 2 · 17–23 Oct — breadth**
1. Q8–Q16, one or two a day, same rules. Redo any Week 1 question you could not finish in 30 minutes.
2. Two Pro-Learn chapters you are weakest in (for example Monotonic Stack, Intervals).
3. Say three behavioural answers aloud every other day.

**Week 3 · 24–30 Oct — under real conditions**
1. Q17–Q20, then Q21–Q28 as harder practice.
2. Two full 45-minute mock coding rounds and two mock Googlyness rounds on this site. Ask the recruiter about a practice interview with a Googler.
3. Write down every mistake from the mocks and re-read the checklist in section 5.

**31 Oct – 2 Nov — taper**
1. Redo Q1–Q7 timed once more; read the one-page recap.
2. Say "Tell me about yourself", the AI answer and "Why Google" aloud once a day.
3. Sunday 2 Nov: light review only. Stop early. Sleep matters more than one more problem.

**Monday 3 November — the interview**
- Pick one language and stay in it. Your resume lists Python first; it is the quickest to write in a doc.
- Test camera, microphone and the meeting link 15 minutes early. Have water, and keep your resume open.
- Close every other window. One candidate was asked to share their screen during a coding round.
- If the interviewer is late or does not show (it happens often), email the recruiter at once; it is rescheduled without penalty.
- After each round, write down the question and how it went while you remember. It helps the recruiter conversation and your onsite prep.

---

## 7. After you clear the screen — the two in-person DSA rounds

- Expect harder problems than the screen: medium-hard to hard, usually one problem with two follow-ups.
- Topics seen at L4 onsites: graphs (Dijkstra, multi-source BFS, DSU, shortest-path variants), intervals and sweep line, heap-based design (ad service, LRU/LFU variants), geometry (rectangle from points), DP with binary search (LC 1235), segment tree / Fenwick occasionally.
- In person you may write on a laptop or a whiteboard; back to back with no break. Eat first.
- Ask the recruiter for (a) two to three weeks of preparation time and (b) a mock interview with a Googler — one candidate was offered this, and it is worth asking.
- An L4 recruiter told one candidate that not finishing the follow-up is acceptable at L4 if the main problem is clean. Others were rejected for it. Aim to finish, but protect the quality of the main solution first.
- Work through file 1, section E, in order of repeat count.

**Team matching (London):** it is a real stage. Reports from London describe waits of one to several months and managers sometimes choosing internal candidates. Keep other processes running, tell the recruiter about competing deadlines, and prepare a clear two-minute summary of your JPMorgan and Blue Yonder work for fit calls.

---

## 8. Where each claim comes from (post IDs)

Process and format: 8551877, 8522064, 8527382, 7540443, 7521416, 7490325, 5979952, 7595211
Second-chance coding round: 7909727, 7827768, 5584385
Code-quality rejections: 7909727, 6846591, 8265899, 8268786
Warm-up trap: 7827768, 7855988, 8319665
Dry run / complexity: 7691552, 7662934, 7521416
Vague questions: 6927378, 6833396, 7183165, 7328482
Googlyness red flag: 7493097
Team matching: 7595211, 8340444, 7867127, 7572765
Mock interview offer: 7693483

Open any of them at `https://leetcode.com/discuss/post/<id>/`.
