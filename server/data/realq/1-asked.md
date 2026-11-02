# 1 — DSA questions Google asked (from LeetCode Discuss)

**Coverage:** Google-tagged Discuss posts from June 2025 to 4 Oct 2026 (about 1,050 listed, about 150 interview reports read in full), plus older Europe/London posts they link to.
**Wording:** questions are restated from the posts, keeping every detail the poster gave. "≈" means my closest LeetCode match; no "≈" means the poster named that problem.
**Links:** `https://leetcode.com/discuss/post/<id>/`
**Follow-ups:** unless a line says "different interview", a question's follow-ups were asked in the same call as its main question. Where I combined reports, each part names its post.
**Report counts:** "first-hand" means the candidate's own post. The Sep 2026 compilation (post 8525983) copies several of those posts, so I do not count it as an extra report.
**Solutions:** file 4 has code for these, numbered Q1.1, Q1.2, … — A1→Q1, A6/A7→Q2, B1→Q3, A2→Q4, A5→Q5, A14→Q6, C3→Q7, A3→Q8, A4→Q9, A9→Q10, A10→Q11, A11→Q12, isValid partition→Q13, groups of 5→Q14, A13→Q15, stuck keyboard→Q16, B2→Q17, B3→Q18, C1→Q19, C4→Q20, onsite→Q21–Q28.

---

## A. Shortlist for 3 Nov (highest repeat count, do these first in week 1)

| Priority | Question | Why |
|---|---|---|
| 1 | Mouse / cat grid, maximise the minimum distance (A1) | 2 first-hand reports since mid-Sep 2026; a 2024 compilation lists similarly titled questions |
| 2 | Stream dedupe / rate limiter in a time window (A6, A7) | 3 first-hand reports in 2025–26, plus 2 compilation entries |
| 3 | Who is present in each interval — sweep line (B1) | London L3 phone screen, India L4 phone screen, L3 onsite |
| 4 | Root a tree as binary tree + colour follow-up (A2) | 2 reports in the last 10 weeks |
| 5 | Topological sort / cycle detection (A5) | 3 phone-screen reports |
| 6 | Equal tasks on N CPUs, then minimum CPUs (A14) | 1 phone screen + 2 onsites |
| 7 | Longest subsequence with difference 1, then ≤ d (C3) | L3 screen, L4 onsite, London L4 onsite |

---

## B. Phone screen — L4 / SWE III reports

### A1. Mouse and cat grid — Sep/Oct 2026 (2 first-hand reports)
- **Warm-up:** N×N grid, some cells are water (impassable), moves are up/down/left/right. Does a path from S to T exist? (Poster only had to describe BFS.)
- **Main:** a mouse goes from S to treat T over land only. A cat sits at C and does not move. Find the S→T path for which the minimum Manhattan distance to the cat along the path is as large as possible. Return that value, or -1 if no path.
- **Follow-up:** several cats. *Different interview from the warm-up:* post 8522716 had warm-up + main; post 8552887 had main + several cats.
- **Related LC:** ≈ 2812 Find the Safest Path in a Grid, 1102 Path With Maximum Minimum Value.
- **Approach:** binary search on the distance d + BFS that skips cells closer than d (O(N² log N)), or a max-heap Dijkstra. With several cats, compute distances with a multi-source BFS first.
- Posts: 8522716, 8552887 (also copied into compilation 8525983)

### A2. Root a tree as a binary tree — Sep 2026 (also an onsite in Jul 2026)
- **Main:** undirected, connected, acyclic graph; every node has at most 3 edges. Find a node that, if chosen as root, makes the graph a binary tree.
- **Follow-up 1:** each node is black or white. The root must also make every level a single colour, alternating by depth (either colour may start). Interviewer wanted O(N) without BFS. *Same call as the main question (post 8522064).*
- **Follow-up 2 — different interview (onsite round, post 8423598):** there the main question was "return all roots that give a binary tree with alternating level colours", and the follow-up was the minimum number of colour changes to make it possible.
- **Approach:** a root is valid if its degree ≤ 2 (every other node loses one edge to its parent). Alternating levels in a tree means every edge joins different colours, so one pass over the edges answers it. For minimum changes: a tree has exactly two proper 2-colourings; count mismatches against each and take the smaller.
- Posts: 8522064, 8423598

### A3. Count paths across a matrix — Aug 2026
- **Main:** n×m matrix, start at (n-1, 0), reach (n-1, m-1). Allowed moves: diagonally up-right, right, diagonally down-right. Count the ways.
- **Follow-up 1:** some cells are checkpoints; count only paths that visit all of them.
- **Follow-up 2:** checkpoints must be visited in order; reduce space.
- **Related LC:** ≈ 62 / 63 Unique Paths, 1220-style column DP.
- **Approach:** column-by-column DP with one array of size n. Every move advances one column, so a checkpoint column allows only that row: zero out the other rows in that column.
- Post: 8525084

### A4. Top K similar movies — May 2026
- **Main:** each movie has a rating; a graph says which movies are similar (similarity is transitive through the graph). Given a movie, return the K highest-rated movies similar to it.
- **Follow-up:** use O(K) extra space for the ranking and O(log K) per candidate.
- **Related LC:** ≈ 215 / 347 + graph traversal.
- **Approach:** BFS/DFS from the movie, keep a min-heap of size K.
- Post: 8276966

### A5. Topological sort / dependency validity — 3 reports
- Three separate interviews, one question each; no algorithmic follow-up reported.
- Dependency resolution, described as "very similar to" Course Schedule and Course Schedule II. (Bangalore L4, May and Jun 2026)
- US version: sequences such as [A, B, C] and [D, E, F] mean C depends on B depends on A. Are the sequences valid together? Solved as cycle detection, then 20 minutes of API-design discussion.
- **LC:** 207, 210. ≈ 444 Sequence Reconstruction (also asked at an SDE-3 onsite).
- Posts: 8265899, 8355549, 8181616

### A6. Dedupe a stream of events — US SWE III, Sep 2026; also May 2026
- **Main:** devices emit events like "Battery at 10%" with timestamps. Remove repeats of the same event that fall within 10 seconds of each other. Code is written in a doc, not run.
- **Variant — different interview (May 2026, post 8302587):** design a structure that receives timestamped items and dedupes those within a one-minute window. Two follow-ups in that call; one changed the dedupe rule, the other was not described.
- **Harder variant — different interview (known only from compilation 8525983):** a message is shown only if it does not appear twice within any 10-second window; if it does, both copies are suppressed. So you cannot print immediately — buffer until the window has passed.
- **Follow-ups, same call as the main question (post 8500374):** time/space complexity; which bottlenecks you expect in production and how you would handle them. (Points to raise, my suggestion: memory growth and eviction, sharding by key, out-of-order events.)
- **Related LC:** ≈ 359 Logger Rate Limiter, 362 Design Hit Counter.
- **Approach:** hashmap message → last timestamp, plus a queue to evict old entries so memory stays bounded.
- Posts: 8500374, 8302587, 8525983

### A7. Rate exceeded? — Oct 2025 ("selected")
- **Main:** given `max_count` and `period_s`, implement `bool event(int64 time_s)`. Events arrive in real time; return true if the number of events in the last `period_s` seconds exceeds `max_count`. Two more follow-ups were coded (not described).
- **Related LC:** ≈ 362, 933 Number of Recent Calls.
- **Approach:** queue of timestamps, pop expired ones; for huge rates, bucket counts per second in a ring buffer.
- Post: 7268507

### A8. Two Sum, then an ads puzzle — India L4, Aug 2026
- **Main:** Two Sum (LC 1): brute force → sort + two pointers → hashmap, with overflow discussion.
- **Puzzle:** function F returns the 4 best ads for a user; function G returns the worst ad of any set you pass it. Get the single best ad. Then: what if you may call F once and G once — maximise your chance of returning the best. Poster reached 33%; interviewer wanted more.
- Post: 8551877

### A9. Shuffle a playlist — Dec 2025
- **Main:** given songs with artists, write a shuffle so that no two adjacent songs share an artist (or as few as possible).
- **Related LC:** ≈ 767 Reorganize String, 1054 Distant Barcodes.
- **Approach:** max-heap by remaining count, always place the most frequent artist that differs from the last.
- Post: 7435801

### A10. Truncate to a cap so the total fits — Sep 2025 and Jun 2025
- **Version 1:** fixed-size integer array and a storage limit S. Choose x (not necessarily in the array); every element above x is cut down to x. Find the largest x such that the total does not exceed S.
- **Version 2:** messages tagged A/B/C…; keep only K messages with a "fair" allocation, meaning one common cap per category. How many from each category are kept? The statement was deliberately vague. Poster missed that leftover slots must then be handed out.
- **Related LC:** ≈ 1300 Sum of Mutated Array Closest to Target.
- **Approach:** sort counts and water-fill, or binary search on the cap.
- Posts: 7182123, 6833396

### A11. Merge two screenshots — Jul 2025 (reject)
- **Main:** two h×w screenshots of the same scrolled page; the bottom rows of the first may overlap the top rows of the second. Return one long screenshot with no duplicated rows. The problem was given verbally with no example.
- **Follow-up:** better than comparing every overlap length.
- **Related LC:** ≈ 1392 Longest Happy Prefix (KMP prefix function).
- **Approach:** hash each row, then find the longest suffix of screen 1 that equals a prefix of screen 2 with KMP.
- Post: 6927378

### A12. Three small questions in one screen — Jun 2025
- Sort in place an array that contains only a fixed small set of values (≈ 75 Sort Colors).
- Same, but sort by the result of an operation applied to each integer.
- Unix path simplifier (71 Simplify Path).
- Post: 6862446

### A13. Special string — India SDE-3, Jan 2026 (reject)
- **Main:** given string s (length ≤ 10) and a dictionary, return true if every subsequence of s with length ≥ 3 is in the dictionary. Strings shorter than 3 are automatically special.
- **Trap:** poster said O(N!) instead of O(2^N).
- Post: 7521416

### A14. Tasks on CPUs — Nov 2025 (also two onsites in 2026)
- **Main:** N CPUs and M tasks with given durations, one task per CPU at a time. Minimum time to finish everything. (In the onsite versions all tasks take equal time.)
- **Follow-up:** once you know that minimum time, what is the smallest number of CPUs that still achieves it? Interviewer also asked "do you really need a heap?"
- **Related LC:** ≈ 1011, 2402 Meeting Rooms III.
- **Approach:** binary search on the number of CPUs calling the first function.
- Posts: 7370210, 8096071, 8325811

### A15. Other L4 phone-screen questions (one report each)
| Question | Related LC | Post |
|---|---|---|
| Kadane-style maximum subarray, then a hashmap optimisation | ≈ 53, 560 | 8319665 |
| Longest path in a tree where all nodes share one value | ≈ 687 | 8325811 |
| Can the array be split into groups of 5 consecutive increasing numbers (duplicates matter) | ≈ 846, 1296 | 8096071 |
| `isValid(s)` tells you whether a hidden prefix P matches. Move all valid strings to the front with the fewest in-memory moves; state complexity including the API cost | two pointers | 7685567 |
| Visible people where a taller observer is not blocked by shorter people; follow-up for all indices | ≈ 1944 | 7881477 |
| Knapsack DP variation | ≈ 416 | 7867127 |
| Text editor / bookkeeping class, heavy on data-structure trade-offs | ≈ 2296 | 8306526 |
| On-call schedule from {name, start, end} | sweep line | 6968844 |
| Encode and decode a DAG; follow-up: graph with cycles | ≈ 297, 133 | 7392327 |
| Stuck keyboard: return all dictionary words the user could have meant | Trie, ≈ 925 | 7855988 |
| Subsets (warm-up that ate the whole 45 minutes) | 78 | 7827768 |
| Array swaps, "simple but tricky" | — | 7497189 |
| Two medium BFS questions | — | 7571793 |
| Monotonic stack problem with one follow-up | ≈ 739, 496 | 7183165 |
| Easy tree traversal, then a variation | — | 7093091 |
| `GetTotalCount(num_docs)`: sum word counts fetched through a worker API where each worker handles one call at a time; follow-up limits the number of workers | concurrency / scheduling | 6934898 |
| Vertical line that splits a set of (possibly overlapping) rectangles into equal areas | ≈ 3453 | 5584385 |

---

## C. Europe / London reports (closest to your loop)

### B1. Google L3 London — Jan 2026 (post 7490325)
- **Phone screen:** given logs of when people enter and leave, return who was present in each interval. Do not output empty intervals; several people can enter or leave at the same time. → sweep line over sorted events. ≈ 759, 253.
- **Coding 1:** N×N board with N-1 rooks, no two sharing a row or column. You cannot see the board. `countRooksInsideRectangle(a,b,c,d)` returns the rooks inside a rectangle. Return where the N-th rook goes. → binary search for the empty row, then the empty column.
- **Coding 2:** chat logs: `registerEvent(sender, receiver, timestamp)`, `getMostActiveUser()` where activity = number of distinct users chatted with. Follow-ups: top K; what changes if register is called millions of times a day and the getter once.
- **Coding 3:** design `BookShelfManager` with addBooks, removeBooks, moveBooks, getBooks and a bookmark index.

### B2. Google London L4 (SRE-SWE) — Aug–Oct 2024, offer (post 5979952)
- **Phone screen:** average of the last n elements of a stream, exposed as an interface. Follow-up: ignore a few of the highest values. → 346, ≈ 1825 Finding MK Average.
- **Onsite 1:** longest subsequence where neighbours differ by 1, then 2407 Longest Increasing Subsequence II.
- **Onsite 2:** shortest path in a graph including input parsing; follow-up needs several BFS runs.
- **Onsite 3:** a problem that turns out to be topological sort.
- **Onsite 4:** behavioural.

### B3. Google Europe L3 — Dec 2025 (post 7406634)
- **Phone screen:** count ordered pairs (i, j), including i = j, with a[i] - a[j] = i - j. Example [1,2,3] → 9. → group by a[i] - i, sum of count². ≈ 2364.
- **Onsite 1:** directed graph with a security level per edge; a path's level is its largest edge. Find the path from start to end with the smallest level. ≈ 1631, 778.
- **Onsite 2:** split a data size into the minimum number of packets with a maximum capacity; among those, minimise the largest packet.
- **Onsite 3:** events sorted by timestamp, each with an ID; is there an event whose end − start exceeds a timeout? Follow-ups: O(1) space; events stored in files; events split across files.

### B4. Google Poland L4 — Dec 2025, reject (post 7392327)
- **Screen:** encode/decode a DAG, then with cycles.
- **Onsite 1:** parking lot with (vehicleType, slots) and (vehicleType, costPerMin) and three functions; interviewer expected unit tests and end-to-end code.
- **Onsite 2:** linked list where each node stores value, next pointer, and a hash of its value combined with the next node's hash; write `addNode` and a validator that detects tampering.

### B5. Others
- Warsaw phone screen: sliding-window maximum of stock prices over the last s seconds; interviewer refused an assumed heap helper (LC 239). (2315084)
- Warsaw SDE-3, Apr 2026: subsets/backtracking warm-up; given a second attempt. (7827768)
- Europe L3, Mar 2026: can the array be split into two equal parts; then with up to k changes. (7691552)
- Zurich SDE-2, Mar 2026: two pointers screen; greedy, binary search on answer, hard DP onsites. (7623170)
- Munich L3: distribute a vertex's value equally to neighbours; first-bad-version variant; lucky numbers; 1293. (1941615)

---

## D. L3 phone screens (same pool, 2026)

| # | Question | Related LC | Post |
|---|---|---|---|
| C1 | Count squares among N points including rotated ones; follow-ups: duplicate points, count rhombi. Opened with questions on AI use | ≈ 2013 | 8550611 |
| C2 | 3026 Maximum Good Subarray Sum, but return a pair of indices | 3026 | 8543506 |
| C3 | Longest increasing subsequence where neighbours differ by exactly 1; then by 1..d | ≈ 1218, 2407 | 8527382 |
| C4 | Remove a node and its edges from a weighted graph; return the largest remaining edge; get to O(1) per query | — | 8173874 |
| C5 | String of parentheses and digits; each digit deletes characters to its left; can any deletion order leave a balanced string | interval DP / memo | 8519361 |
| C6 | Happy-number-like problem | 202 | 7510682 |
| C7 | Hashmap problem whose O(N) answer was queue + map | — | 7662934 |
| C8 | Components of a graph, then decisions based on the count | ≈ 323, 547 | 6907232 |

---

## E. Onsite DSA — L4 (for the two in-person rounds)

### Asked more than once
| Question | Times | Related LC |
|---|---|---|
| Largest-area rectangle from 2D points, sides at any angle | 3 first-hand (a 4th post only said "LC-hard geometry") | 963 (named), 939 |
| Ad service: `insertAd(content, score)`; `getAd()` returns the top-scored ad, lowers its score by 1, never the same ad twice in a row. Follow-up: per-ad delay before it may return again, close to O(1) | 3 | ≈ 767, 358, 621 |
| Flights with departure and arrival times: can a package get from origin to destination; then earliest arrival | 3 | time-ordered BFS / Dijkstra |
| Count lakes inside the island containing a given cell; then land inside a lake | 2 | ≈ 1254, 200 |
| 1235 Maximum Profit in Job Scheduling (O(N log N) expected) | 2 | 1235 |
| Equal tasks on machines → minimum CPUs | 2 | binary search |
| Longest subsequence difference 1 → ≤ d (segment tree) | 2 | 1218, 2407 |
| Next-word prediction from sentences; follow-up: pick by probability | 2 | ≈ 528 |

### Asked once (2025–26)
- Shortest path in an unweighted graph → all nodes on some shortest path → can Alice reach the target without Bob catching her. (8525084)
- Friendship logs: earliest time everyone is connected (1101); with a cap k; with "unfriend" events. (8525084)
- Route matcher: `registerHandler("/users/{id}/pictures/{pictureId}")`, `getRouteHandler(url)`; return parameters too. (8423598)
- LFU-style cache where access raises a score and only even-score entries may be evicted (≈ 460). (8265899)
- `%key%` template substitution with nested keys and cycle detection. (8218498)
- Unique-string generator for a URL shortener: lowercase, shortest first, no character used more than T times. (7685567)
- LRU cache (146), then time-based expiry. (7685567)
- Order book / auction; merge intervals with line sweep + heap. (7867127)
- Lexicographically smallest walk of exactly k steps returning to the start in a grid with obstacles. (8516819)
- Player ranks: n players, results (a beat b); which players' ranks are fully determined? → count ancestors + descendants = n-1 (≈ 1462). (7126128)
- N-th licence plate in a sequence 00000…99999, A0000…Z9999, AA000…, up to ZZZZZ. (7126128)
- App versions each supporting an OS range; for an OS version return the newest supporting app → sweep line + heap, then binary search. (7126128)
- 778 Swim in Rising Water variant; assign questions to volunteers by tags; assign students to apartments by sharing preference. (6846591)
- Range-module variant: union queries + point lookup (≈ 715); 777 Swap Adjacent in LR String reworded; reachable nodes → minimum set of start vertices (≈ 1557). (6968844)
- 1671 Minimum Removals to Make Mountain Array variant; Pacman-style grid problem. (7571793)
- DAG DP; largest square of identical characters in a grid (≈ 221). (7497189)
- Unlock patterns of length ≥ L on an N×M dot grid; speed up with symmetry (≈ 351). (7370210)
- Fenwick-tree problem with an unusual variant. (7307983)
- 1094 Car Pooling; 444 Sequence Reconstruction; matchmaker class that pairs players within a rating difference. (6934898)
- Huffman-encoding variation; Dijkstra / multi-source BFS / components. (8306526)
- LC-hard sliding window with precomputation follow-up; LC-hard geometry. (8319665)
- Restaurant ordering system (low-level design) — one poster got No Hire for modelling only two parties. (7044181)

### Also in the Sep 2026 six-month compilation (post 8525983)
2402 Meeting Rooms III · 68 Text Justification · 60 Permutation Sequence · 351 Android Unlock Patterns · 1970 Last Day Where You Can Still Cross · 127 Word Ladder (as "change one letter, each word must be in the list") · 91 Decode Ways · 278 First Bad Version with overflow follow-up · 694 Number of Distinct Islands · 1544 Make The String Great, with and without a stack, plus unit tests · simplify `a+b+a+c-b-(d+c)` · max product of K elements (negatives; no extra space; no sort) · longest path in a DAG · watchtower: height costs H per unit, each covered house pays C, maximise profit · do two sentences differ only by one inserted phrase · range-assign queries, n and q up to 10^5 · horizontal line halving total square area (≈ 3453) · boat/wind DP with energy cap k · nearest favourite city (Dijkstra) · count squares formed by connected line segments · islands in a binary tree of 0/1 nodes · top N users by word count · group items sharing any attribute (DSU) · count words with a prefix in a sorted list · sparse bit array with range "contains a 1?" queries · longest substring whose first character is smaller than its last, in O(n).

### Lower confidence
A second-hand summary (post 8546037) lists 200, 416, 174, 410, 128, 346, 315, 2188 as named in 2026 reports.

---

## F. Pattern count across all phone-screen reports

My own rough tally of the phone-screen questions listed above (a report can count under two patterns):

| Pattern | Reports (approx.) |
|---|---|
| Graph / grid BFS-DFS, topological sort, components | 14 |
| Arrays: two pointers, prefix sums, sorting, counting | 12 |
| Hashmap + queue / stream / sliding window design | 10 |
| Trees | 5 |
| Binary search on the answer | 4 |
| Heap / top K | 4 |
| DP | 3 |
| Backtracking / Trie | 3 |
| Stack / monotonic stack | 3 |
| Intervals / sweep line | 2 |

Dynamic programming is rare in screens and common in onsites. Segment tree / Fenwick appeared only in onsites.
