# 4 — Solutions in Python: brute force, optimal, complexity, follow-ups

Questions are taken from file 1 and ordered by when you need them.

Your interview is on **Monday 3 November 2026**. Plan from 10 October:

| When | Section | Questions |
|---|---|---|
| **Week 1 · 10–16 Oct** | Part 1 — most repeated phone-screen questions: code each one in a plain doc, then again from memory | Q1–Q7 |
| **Week 2 · 17–23 Oct** | Part 2 — other L4 phone screens, last 12 months: code all of them | Q8–Q16 |
| **Week 3 · 24–30 Oct** | Part 3 — London / Europe / L3 screens, then Part 4 for harder practice; two timed 45-minute mocks | Q17–Q28 |
| **31 Oct – 2 Nov** | Redo Q1–Q7 timed, read the recap, say the Googlyness answers aloud. Light day on 2 Nov | Recap |
| **Mon 3 Nov** | Interview day | — |

Notes
- The question text is restated from the posts. Where the post was vague I say which assumption the code makes — ask the interviewer the same thing.
- Every snippet was run against the brute-force version on random inputs.
- Not included: Two Sum (LC 1), Simplify Path (LC 71), Sort Colors (LC 75), Course Schedule (LC 207/210) as plain LeetCode problems, and questions whose posts gave too little detail to code (Kadane variant, array swaps, visible-people follow-up).
- TC = time complexity, SC = extra space.
- Parts are numbered Q1.1, Q1.2, …: `.1` is the first thing asked, later numbers are follow-ups or, where stated, versions from other interviews. Questions with a single part keep the plain number.
- **Same call?** under each heading says whether the follow-ups were asked in one interview or whether I combined them from different interviews. Anything marked "my addition" or "my guess" was not reported by a candidate.

All snippets assume:

```python
import heapq, math, random
from bisect import bisect_left, bisect_right, insort
from collections import Counter, defaultdict, deque
from itertools import accumulate, groupby, permutations

DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))
INF = float("inf")
```

---

# Part 1 — Week 1 (10–16 Oct): most repeated

## Q1. Mouse and cat grid (2 first-hand reports, Sep–Oct 2026; repeated in the Sep 2026 compilation)

**Same call?** Not all together. One interview had the warm-up + main (post 8522716). A different interview had the main + "several cats" (post 8552887). No report had all three parts.

**Q1.1 Warm-up.** N×N grid, `1` = land, `0` = water. Moves: up, down, left, right. Does a path from S to T exist?

**Q1.2 Main.** A mouse walks from S to T on land. A cat sits at C and never moves. Among all S→T paths, find the one whose *smallest* Manhattan distance to the cat is as *large* as possible. Return that distance, or -1 if T cannot be reached.

**Q1.3 Follow-up.** Several cats instead of one.

```text
distance to cat          best path: min distance on it = 2
4 3 2 3 4                * * * * *
3 2 1 2 3                * . . . *
2 1 C 1 2                S . C . T
3 2 1 2 3                . . . . .
4 3 2 3 4                . . . . .

Straight line S→T passes distance 1.  Going round the top never drops below 2.
```

### Q1.1 Warm-up — does a path exist?

*Asked together with Q1.2 in one interview (post 8522716).*

**Solution — BFS**

```python
def path_exists(grid, s, t):
    n = len(grid)
    if grid[s[0]][s[1]] == 0 or grid[t[0]][t[1]] == 0:
        return False
    seen, q = {s}, deque([s])
    while q:
        r, c = q.popleft()
        if (r, c) == t:
            return True
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < n and 0 <= nc < n and grid[nr][nc] == 1 and (nr, nc) not in seen:
                seen.add((nr, nc))
                q.append((nr, nc))
    return False
```

### Q1.2 Main — stay as far from the cat as possible

*Asked in both interviews (posts 8522716, 8552887).*

**Shared helpers** (they take a list of cats, so Q1.3 needs no new code)

```python
def cat_distance(n, cats):
    """Manhattan distance from every cell to its nearest cat (multi-source BFS)."""
    dist = [[-1] * n for _ in range(n)]
    q = deque()
    for r, c in cats:
        dist[r][c] = 0
        q.append((r, c))
    while q:
        r, c = q.popleft()
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < n and 0 <= nc < n and dist[nr][nc] == -1:
                dist[nr][nc] = dist[r][c] + 1
                q.append((nr, nc))
    return dist


def reachable_keeping(grid, s, t, dist, d):
    """Can we go S -> T using only land cells that are at least d away from every cat?"""
    n = len(grid)
    ok = lambda r, c: grid[r][c] == 1 and dist[r][c] >= d
    if not ok(*s) or not ok(*t):
        return False
    seen, q = {s}, deque([s])
    while q:
        r, c = q.popleft()
        if (r, c) == t:
            return True
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < n and 0 <= nc < n and (nr, nc) not in seen and ok(nr, nc):
                seen.add((nr, nc))
                q.append((nr, nc))
    return False
```

**Brute force — try every distance from the largest down**

```python
def safest_brute(grid, s, t, cats):
    n = len(grid)
    dist = cat_distance(n, cats)
    for d in range(2 * (n - 1), -1, -1):
        if reachable_keeping(grid, s, t, dist, d):
            return d
    return -1
```

**Optimal A — binary search on the answer** (if distance d works, every smaller d works)

```python
def safest_binary(grid, s, t, cats):
    n = len(grid)
    dist = cat_distance(n, cats)
    lo, hi, ans = 0, 2 * (n - 1), -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if reachable_keeping(grid, s, t, dist, mid):
            ans, lo = mid, mid + 1
        else:
            hi = mid - 1
    return ans
```

**Optimal B — max-heap (Dijkstra on the bottleneck)**

```python
def safest_heap(grid, s, t, cats):
    n = len(grid)
    if grid[s[0]][s[1]] == 0 or grid[t[0]][t[1]] == 0:
        return -1
    dist = cat_distance(n, cats)
    best = {s: dist[s[0]][s[1]]}
    heap = [(-best[s], s)]
    while heap:
        neg, (r, c) = heapq.heappop(heap)
        if (r, c) == t:
            return -neg
        if -neg < best[(r, c)]:
            continue
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < n and 0 <= nc < n and grid[nr][nc] == 1:
                cand = min(-neg, dist[nr][nc])
                if cand > best.get((nr, nc), -1):
                    best[(nr, nc)] = cand
                    heapq.heappush(heap, (-cand, (nr, nc)))
    return -1
```

### Q1.3 Follow-up — several cats

*Asked after Q1.2 in a different interview (post 8552887), not together with Q1.1.*

No new code: pass every cat in `cats`, for example `safest_binary(grid, s, t, [(2, 2), (0, 4)])`. `cat_distance` starts its BFS from all cats at once.

**Complexity for Q1.1–Q1.3**

| Version | TC | SC |
|---|---|---|
| Q1.1 BFS | O(N²) | O(N²) |
| Q1.2 brute force | O(N³) — up to 2N BFS runs | O(N²) |
| Q1.2 binary search + BFS | O(N² log N) | O(N²) |
| Q1.2 max-heap | O(N² log N) | O(N²) |
| Q1.3 K cats | same; the distance grid costs O(N²) once, not O(K·N²) | O(N²) |

Say aloud: with one cat the distance is just `|r-cr| + |c-cc|`; the BFS distance grid is what makes many cats free.

---

## Q2. Stream of events in a time window (3 first-hand reports, plus 2 entries in the Sep 2026 compilation)

**Same call?** No. Q2.1, Q2.2 and Q2.3 come from three separate interviews. Inside Q2.1, the complexity and production questions were in the same call. Inside Q2.3, the poster coded two follow-ups in the same call but did not say what they were.

Three versions, from three separate interviews. Timestamps arrive in non-decreasing order.

### Q2.1 Drop repeats within 10 seconds

*Its own interview: US SWE III phone screen, Sep 2026 (post 8500374). A one-minute version was asked in another interview (post 8302587).*

Devices emit events such as "Battery at 10%". Drop an event if the same message was kept less than 10 seconds ago.
*Assumption to confirm:* the window is measured from the last **kept** message, and exactly 10 seconds later counts as outside.

```text
time   1    4    9    11   12   25
msg    A    A    B    A    B    A
keep   yes  no   yes  yes  no   yes
            |         |
            3s after  10s after the kept A at t=1 -> outside the window
```

**Brute force**

```python
class DedupeBrute:
    def __init__(self, window=10):
        self.window = window
        self.kept = []

    def should_keep(self, ts, msg):
        for t, m in self.kept:
            if m == msg and ts - t < self.window:
                return False
        self.kept.append((ts, msg))
        return True
```

**Optimal — hashmap plus a queue that evicts old entries**

```python
class Dedupe:
    def __init__(self, window=10):
        self.window = window
        self.last = {}          # msg -> timestamp it was last kept
        self.order = deque()    # (timestamp, msg) in arrival order, for eviction

    def should_keep(self, ts, msg):
        while self.order and ts - self.order[0][0] >= self.window:
            t, m = self.order.popleft()
            if self.last.get(m) == t:
                del self.last[m]
        if msg in self.last:
            return False
        self.last[msg] = ts
        self.order.append((ts, msg))
        return True
```

| Version | TC per event | SC |
|---|---|---|
| Brute force | O(K), K = everything kept so far | O(K), grows forever |
| Hashmap + queue | O(1) amortised | O(distinct messages inside one window) |

### Q2.2 Harder variant — suppress **both** copies

*A separate interview, known only from the Sep 2026 compilation (post 8525983).*

A message is shown only if no identical message is within 10 seconds of it, before **or after**. So nothing can be printed on arrival; a message is released once 10 seconds have passed without a duplicate.

```text
time   1    5    8    23   40
msg    foo  foo  bar  foo  (end of stream)
       x    x              the two foo at 1 and 5 cancel each other
                 ok   ok   bar@8 and foo@23 have no twin within 10s

output, in order:  bar@8 (released at t=23),  foo@23 (released at close)
```

**Brute force (offline, needs the whole stream)**

```python
def unique_in_window_brute(events, window=10):
    out = []
    for i, (ts, msg) in enumerate(events):
        clash = any(j != i and m == msg and abs(t - ts) < window
                    for j, (t, m) in enumerate(events))
        if not clash:
            out.append((ts, msg))
    return out
```

**Optimal — buffer for one window, then release**

```python
class SuppressBoth:
    def __init__(self, window=10):
        self.window = window
        self.pending = deque()   # entries [ts, msg, still_ok] waiting for their window to pass
        self.latest = {}         # msg -> its most recent entry

    def on_message(self, ts, msg):
        prev = self.latest.get(msg)
        entry = [ts, msg, True]
        if prev is not None and ts - prev[0] < self.window:
            prev[2] = entry[2] = False
        self.latest[msg] = entry
        self.pending.append(entry)
        return self._release(ts)

    def _release(self, now):
        out = []
        while self.pending and now - self.pending[0][0] >= self.window:
            entry = self.pending.popleft()
            if entry[2]:
                out.append((entry[0], entry[1]))
            if self.latest.get(entry[1]) is entry:
                del self.latest[entry[1]]
        return out

    def close(self):
        return self._release(INF)
```

| Version | TC | SC |
|---|---|---|
| Brute force | O(n²) total, and it is not streaming | O(n) |
| Buffer + hashmap | O(1) amortised per message | O(messages inside one window) |

### Q2.3 `bool event(time_s)` — is the rate above the limit?

*Its own interview: L4 phone screen, Oct 2025, result "selected" (post 7268507).*

Given `max_count` and `period_s`. Each call records an event at `time_s` and returns True if the number of events in the last `period_s` seconds is greater than `max_count`.

```text
max_count = 2, period_s = 10

event(1)  window [1]          -> 1 event   False
event(3)  window [1,3]        -> 2         False
event(7)  window [1,3,7]      -> 3         True
event(12) window [3,7,12]     -> 3         True    (1 fell out: 12-1 >= 10)
event(30) window [30]         -> 1         False
```

**Brute force**

```python
class RateBrute:
    def __init__(self, max_count, period_s):
        self.max_count, self.period, self.times = max_count, period_s, []

    def event(self, t):
        self.times.append(t)
        return sum(1 for x in self.times if t - x < self.period) > self.max_count
```

**Optimal — queue of timestamps**

```python
class RateQueue:
    def __init__(self, max_count, period_s):
        self.max_count, self.period, self.q = max_count, period_s, deque()

    def event(self, t):
        self.q.append(t)
        while t - self.q[0] >= self.period:
            self.q.popleft()
        return len(self.q) > self.max_count
```

### Q2.4 Possible follow-up to Q2.3 — very high event rate

*My guess, not reported. The poster coded two follow-ups in the same call as Q2.3 but did not say what they were.*

**Idea — count per second instead of storing each event**

```python
class RateBuckets:
    def __init__(self, max_count, period_s):
        self.max_count, self.period = max_count, period_s
        self.buckets = deque()   # [second, count]
        self.total = 0

    def event(self, t):
        if self.buckets and self.buckets[-1][0] == t:
            self.buckets[-1][1] += 1
        else:
            self.buckets.append([t, 1])
        self.total += 1
        while t - self.buckets[0][0] >= self.period:
            self.total -= self.buckets.popleft()[1]
        return self.total > self.max_count
```

| Version | TC per call | SC |
|---|---|---|
| Brute force | O(n) | O(n) |
| Queue | O(1) amortised | O(events in window) |
| Q2.4 buckets | O(1) amortised | O(period_s) — independent of the event rate |

### Q2.5 Follow-up to Q2.1 — what breaks in production?

*Asked in the same call as Q2.1 (post 8500374). Discussion only, no code.*

The interviewer asked which bottlenecks to expect in a real deployment and how to handle them. Points to raise (my suggestions, not from the post): memory growth (eviction), many devices (shard by message or device key), out-of-order timestamps (small reorder buffer), restarts (state is lost unless persisted), and thread safety (lock per key or a single-writer queue).

---

## Q3. Who is present in each interval? (London L3 screen, India L4 screen, L3 onsite)

**Same call?** No follow-up was reported in any of the three interviews.

Given `[name, start, end]` for each person, return every time interval together with the people present in it. Skip intervals where nobody is present. Several people may enter or leave at the same time.

```text
Mary     10 ============== 40
John               30 ======== 50
Peter                          50 ============ 80
Crystal                                             100 ========== 150
Jane                                                       120 ========== 180

cut at every start/end:
[10,30] Mary | [30,40] John,Mary | [40,50] John | [50,80] Peter |
(80-100 empty, skipped) | [100,120] Crystal | [120,150] Crystal,Jane | [150,180] Jane
```

**Brute force — for each pair of neighbouring time points, scan everyone**

```python
def presence_brute(roster):
    points = sorted({t for _, s, e in roster for t in (s, e)})
    res = []
    for a, b in zip(points, points[1:]):
        names = sorted(name for name, s, e in roster if s <= a and b <= e)
        if names:
            res.append([a, b, names])
    return res
```

**Optimal — sweep line with an active set**

```python
def presence_sweep(roster):
    events = defaultdict(lambda: ([], []))      # time -> (entering, leaving)
    for name, s, e in roster:
        events[s][0].append(name)
        events[e][1].append(name)
    active, res, prev = set(), [], None
    for t in sorted(events):
        if prev is not None and active:
            res.append([prev, t, sorted(active)])
        entering, leaving = events[t]
        active.difference_update(leaving)
        active.update(entering)
        prev = t
    return res
```

| Version | TC | SC |
|---|---|---|
| Brute force | O(n²) — up to 2n intervals × n people | O(n) besides output |
| Sweep line | O(n log n) + size of the output | O(n) |

Mention: the output itself can hold O(n²) names when everyone overlaps, so no algorithm beats that in the worst case.

---

## Q4. Root a tree so it becomes a binary tree (2 reports, Jul and Sep 2026)

**Same call?** Main + follow-up 1 were one phone screen (post 8522064). Follow-up 2 is from a different interview, an onsite round (post 8423598), where the colours were already part of the main question.

**Q4.1 Main.** Undirected, connected graph with no cycles; every node has at most 3 edges. Find a node (or all nodes) that, used as root, makes it a binary tree (every node has at most 2 children).

**Q4.2 Follow-up.** Nodes are Black or White. The root must also make each level a single colour, alternating level by level. Wanted: O(N), no BFS.

**Q4.3 Follow-up.** Minimum number of nodes to recolour so that Q4.2 becomes possible.

```text
        0                degree:  0->2  1->3  2->1  3->1  4->1
       / \
      1   2              root = 1 ?  1 would have 3 children  -> not allowed
     / \                 root = 0, 2, 3 or 4 ?  fine: node 1 keeps 1 parent + 2 children
    3   4
                         rule: a node can be root  <=>  its degree <= 2

colours  0:B  1:W  2:W  3:B  4:B     every edge joins B with W  -> levels alternate for ANY root
```

### Q4.1 Main — which nodes can be the root?

*Phone screen, Sep 2026 (post 8522064).*

**Brute force — try each node as root and walk the tree**

```python
def binary_roots_brute(n, edges):
    adj = defaultdict(list)
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    roots = []
    for root in range(n):
        ok, stack = True, [(root, -1)]
        while stack and ok:
            u, parent = stack.pop()
            children = [v for v in adj[u] if v != parent]
            ok = len(children) <= 2
            stack.extend((v, u) for v in children)
        if ok:
            roots.append(root)
    return roots
```

**Optimal — count degrees**

```python
def binary_roots(n, edges):
    degree = [0] * n
    for u, v in edges:
        degree[u] += 1
        degree[v] += 1
    return [u for u in range(n) if degree[u] <= 2]
```

### Q4.2 Follow-up — levels must alternate in colour

*Same call as Q4.1 (post 8522064).*

**Optimal — check the edges.** In a tree, "each level one colour, alternating" is the same as "every edge joins two different colours". So check the edges once.

```python
def coloured_roots(n, edges, colour):
    if any(colour[u] == colour[v] for u, v in edges):
        return []
    return binary_roots(n, edges)
```

**Brute force (for comparison)**

```python
def coloured_roots_brute(n, edges, colour):
    adj = defaultdict(list)
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    res = []
    for root in binary_roots_brute(n, edges):
        ok, level, seen = True, [root], {root}
        expect = colour[root]
        while level and ok:
            ok = all(colour[u] == expect for u in level)
            expect = "W" if expect == "B" else "B"
            nxt = [v for u in level for v in adj[u] if v not in seen]
            seen.update(nxt)
            level = nxt
        if ok:
            res.append(root)
    return res
```

### Q4.3 Follow-up — minimum recolouring

*A different interview: an onsite round, Jul 2026 (post 8423598), where the colours were already part of the main question.*

**Optimal.** A tree has exactly two valid alternating colourings (depth-even = B or depth-even = W). Count mismatches against one; the other needs `n - mismatches`.

```python
def min_recolour(n, edges, colour):
    adj = defaultdict(list)
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    depth, stack = {0: 0}, [0]
    while stack:
        u = stack.pop()
        for v in adj[u]:
            if v not in depth:
                depth[v] = depth[u] + 1
                stack.append(v)
    mismatches = sum(1 for u in range(n) if colour[u] != "BW"[depth[u] % 2])
    return min(mismatches, n - mismatches)
```

| Version | TC | SC |
|---|---|---|
| Q4.1 brute force | O(N²) | O(N) |
| Q4.1 degree count | O(N) | O(N) |
| Q4.2 brute force | O(N²) | O(N) |
| Q4.2 edge check | O(N) | O(N) |
| Q4.3 minimum recolouring | O(N) | O(N) |

---

## Q5. Are the dependency sequences valid? (3 phone-screen reports)

**Same call?** Three separate interviews, each with this one question. Nobody reported "return a valid order" as a follow-up; I added it because one poster said the question resembled both Course Schedule I and II. The US interview continued with an API-design discussion instead.

Each sequence such as `[A, B, C]` means B depends on A, and C depends on B. Given several sequences, decide whether they are consistent (no circular dependency). Not reported as a follow-up, but worth having ready: return a valid order.

```text
[A, B, C]  and  [D, E, F]         [A, B, C]  and  [C, A]

A -> B -> C     D -> E -> F       A -> B -> C
                                  ^_________|      cycle  -> invalid
valid, e.g. order A D B E C F
```

### Q5.1 Are the sequences valid?

*Asked in three separate interviews (posts 8181616, 8265899, 8355549).*

**Brute force — from every node, search for a way back to itself**

```python
def sequences_valid_brute(seqs):
    graph = defaultdict(set)
    for seq in seqs:
        for a, b in zip(seq, seq[1:]):
            graph[a].add(b)

    def returns_to(start):
        stack, seen = list(graph[start]), set()
        while stack:
            u = stack.pop()
            if u == start:
                return True
            if u not in seen:
                seen.add(u)
                stack.extend(graph.get(u, ()))
        return False

    return not any(returns_to(u) for u in list(graph))
```

**Optimal — Kahn's algorithm (also gives the order)**

```python
def dependency_order(seqs):
    graph, indegree, nodes = defaultdict(set), defaultdict(int), set()
    for seq in seqs:
        nodes.update(seq)
        for a, b in zip(seq, seq[1:]):
            if b not in graph[a]:
                graph[a].add(b)
                indegree[b] += 1
    q = deque(u for u in nodes if indegree[u] == 0)
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in graph[u]:
            indegree[v] -= 1
            if indegree[v] == 0:
                q.append(v)
    return order if len(order) == len(nodes) else None      # None means there is a cycle
```

### Q5.2 Return a valid order (my addition, not reported)

*No candidate reported this as a follow-up. `dependency_order` above already returns the order, or `None` when there is a cycle.*

| Version | TC | SC |
|---|---|---|
| Brute force | O(V · (V + E)) | O(V + E) |
| Kahn | O(V + E) | O(V + E) |

---

## Q6. Tasks on CPUs, then the fewest CPUs (1 phone screen, 2 onsites)

**Same call?** Yes. Main + follow-up were in the same call in all three reports.

**Q6.1 Main.** N CPUs, M tasks, a CPU runs one task at a time. Earliest time all tasks are done. In the onsite reports every task takes the same time T.

**Q6.2 Follow-up.** Keep that finishing time. What is the smallest number of CPUs that still achieves it? ("Do you really need a heap?")

```text
M = 7 tasks, T = 2 each, N = 4 CPUs

cpu1 |##|##|        rounds needed = ceil(7 / 4) = 2   -> finish at 2 * 2 = 4
cpu2 |##|##|
cpu3 |##|##|        with 3 CPUs: ceil(7 / 3) = 3 rounds -> 6   (too slow)
cpu4 |##|           so the minimum number of CPUs for time 4 is 4

M = 8, N = 6:  ceil(8/6) = 2 rounds.  4 CPUs also give ceil(8/4) = 2 rounds -> answer 4
```

### Q6.1 Main — earliest finishing time

*Asked in all three interviews (posts 7370210, 8096071, 8325811).*

**Brute force — simulate with a heap (also works when durations differ and tasks are taken in order)**

```python
def finish_time_simulated(durations, cpus):
    free_at = [0] * cpus
    heapq.heapify(free_at)
    for d in durations:
        heapq.heappush(free_at, heapq.heappop(free_at) + d)
    return max(free_at)
```

**Optimal for equal tasks — arithmetic**

```python
def finish_time_equal(m, t, cpus):
    return -(-m // cpus) * t          # ceil(m / cpus) rounds
```

### Q6.2 Follow-up — fewest CPUs for the same finishing time

*Same call as Q6.1 in all three interviews.*

**Brute force — try every CPU count**

```python
def min_cpus_brute(m, t, n):
    target = finish_time_equal(m, t, n)
    for cpus in range(1, n + 1):
        if finish_time_equal(m, t, cpus) == target:
            return cpus
```

**Optimal — binary search (finish time never gets worse with more CPUs)**

```python
def min_cpus_binary(m, t, n):
    target = finish_time_equal(m, t, n)
    lo, hi = 1, n
    while lo < hi:
        mid = (lo + hi) // 2
        if finish_time_equal(m, t, mid) <= target:
            hi = mid
        else:
            lo = mid + 1
    return lo
```

**Closed form**

```python
def min_cpus_formula(m, t, n):
    rounds = -(-m // n)
    return -(-m // rounds)
```

| Version | TC | SC |
|---|---|---|
| Q6.1 heap simulation | O(M log N) | O(N) |
| Q6.1 formula for equal tasks | O(1) | O(1) |
| Q6.2 linear scan | O(N) | O(1) |
| Q6.2 binary search | O(log N) | O(1) |
| Q6.2 formula | O(1) | O(1) |

---

## Q7. Longest subsequence with difference exactly 1, then at most d (L3 screen, L4 onsite, London L4 onsite)

**Same call?** Yes. Main + follow-up were in the same call in all three reports.

**Q7.1 Main.** Longest subsequence (order kept, not necessarily adjacent) in which each element is exactly 1 more than the previous one.

**Q7.2 Follow-up.** The step may be anything from 1 to d.

```text
a = [3, 1, 4, 2, 5, 3, 6]

difference exactly 1:   3 . 4 . 5 . 6      -> length 4
                        ^   ^   ^   ^

best[x] = longest chain ending with value x
read 3: best[3]=1   read 1: best[1]=1   read 4: best[4]=best[3]+1=2
read 2: best[2]=2   read 5: best[5]=3   read 3: best[3]=best[2]+1=3   read 6: best[6]=4
```

### Q7.1 Main — difference exactly 1

*Asked in all three interviews (posts 8527382, 8355549, 5979952).*

**Brute force — O(n²) DP**

```python
def chain_diff1_brute(a):
    dp = [1] * len(a)
    for i in range(len(a)):
        for j in range(i):
            if a[i] - a[j] == 1:
                dp[i] = max(dp[i], dp[j] + 1)
    return max(dp, default=0)
```

**Optimal — hashmap**

```python
def chain_diff1(a):
    best = {}
    for x in a:
        best[x] = max(best.get(x, 0), best.get(x - 1, 0) + 1)
    return max(best.values(), default=0)
```

### Q7.2 Follow-up — difference from 1 to d

*Same call as Q7.1 in all three interviews.*

**Brute force**

```python
def chain_diff_d_brute(a, d):
    dp = [1] * len(a)
    for i in range(len(a)):
        for j in range(i):
            if 1 <= a[i] - a[j] <= d:
                dp[i] = max(dp[i], dp[j] + 1)
    return max(dp, default=0)
```

**Optimal — segment tree over the values (max query on `[x-d, x-1]`)**

```python
def chain_diff_d(a, d):
    values = sorted(set(a))
    size = len(values)
    tree = [0] * (2 * size)

    def update(i, v):
        i += size
        while i >= 1:
            tree[i] = max(tree[i], v)
            i //= 2

    def query(lo, hi):                 # max over positions [lo, hi)
        res, lo, hi = 0, lo + size, hi + size
        while lo < hi:
            if lo & 1:
                res = max(res, tree[lo]); lo += 1
            if hi & 1:
                hi -= 1; res = max(res, tree[hi])
            lo //= 2; hi //= 2
        return res

    ans = 0
    for x in a:
        cur = query(bisect_left(values, x - d), bisect_left(values, x)) + 1
        update(bisect_left(values, x), cur)
        ans = max(ans, cur)
    return ans
```

| Version | TC | SC |
|---|---|---|
| Q7.1 brute force | O(n²) | O(n) |
| Q7.1 hashmap | O(n) | O(n) |
| Q7.2 brute force | O(n²) | O(n) |
| Q7.2 hashmap trying each step (not coded above) | O(n·d) — fine when d is small | O(n) |
| Q7.2 segment tree | O(n log n) | O(n) |

---

# Part 2 — Week 2 (17–23 Oct): other L4 phone screens

## Q8. Count paths across a matrix (L4, Aug 2026)

**Same call?** Yes. Main and both follow-ups were in one phone screen (post 8525084).

**Q8.1 Main.** n×m matrix. Start at the bottom-left `(n-1, 0)`, finish at the bottom-right `(n-1, m-1)`. Each move goes one column right: diagonally up, straight, or diagonally down. Count the paths.

**Q8.2 Follow-up.** Some cells are checkpoints; count paths that pass through all of them.

**Q8.3 Follow-up.** Checkpoints must be visited in a given order; use less memory.

```text
n = 3, m = 4           ways to reach each cell, column by column

row0   . . . .          0  0  1  3      each cell = sum of the (up to) three cells
row1   . . . .          0  1  2  5      to its left: up-left, left, down-left
row2   S . . E          1  1  2  4   <- answer 4 (bottom-right)

checkpoint at (row1, col1): column 1 becomes  0 / 1 / 0  -> every path is forced through it
```

### Q8.1 Main and Q8.2 checkpoints

*Q8.1, Q8.2 and Q8.3 were all asked in one phone screen (post 8525084). Both functions take an optional list of checkpoints: none is Q8.1, some is Q8.2.*

**Brute force — recursion**

```python
def count_paths_brute(n, m, checkpoints=()):
    need = set(checkpoints)

    def go(r, c, hit):
        hit += (r, c) in need
        if c == m - 1:
            return int(r == n - 1 and hit == len(need))
        return sum(go(nr, c + 1, hit) for nr in (r - 1, r, r + 1) if 0 <= nr < n)

    return go(n - 1, 0, 0)
```

**Optimal — one column of DP at a time (O(n) memory, which is the "less memory" part of Q8.3)**

```python
def count_paths(n, m, checkpoints=()):
    required_row = {}
    for r, c in checkpoints:
        if required_row.setdefault(c, r) != r:
            return 0                              # two checkpoints in one column
    col = [0] * n
    col[n - 1] = 1
    for c in range(m):
        if c > 0:
            col = [(col[r - 1] if r > 0 else 0) + col[r] + (col[r + 1] if r < n - 1 else 0)
                   for r in range(n)]
        if c in required_row:
            col = [v if r == required_row[c] else 0 for r, v in enumerate(col)]
    return col[n - 1]
```

### Q8.3 Follow-up — checkpoints in a given order

**Idea.** Every move goes one column right, so checkpoints can only be visited in increasing column order. If the required order is not strictly increasing by column, the answer is 0; otherwise it equals Q8.2.

```python
def count_paths_in_order(n, m, ordered_checkpoints):
    cols = [c for _, c in ordered_checkpoints]
    if any(a >= b for a, b in zip(cols, cols[1:])):
        return 0
    return count_paths(n, m, ordered_checkpoints)
```

| Version | TC | SC |
|---|---|---|
| Q8.1 / Q8.2 brute force | O(3^m) | O(m) recursion |
| Q8.1–Q8.3 column DP | O(n·m) | O(n) |

---

## Q9. Top K similar movies (L4 Bangalore, May 2026)

**Same call?** Yes. Main + follow-up were in one call (post 8276966).

**Q9.1 Main.** Every movie has a rating. A graph links similar movies, and similarity carries through the graph. For a given movie return the K highest-rated movies similar to it.

**Q9.2 Follow-up.** Keep only O(K) candidates while ranking, O(log K) per movie.

```text
ratings   A:5  B:9  C:7  D:8  E:6  F:10
edges     A-B  B-C  A-D  E-F          query (A, K=2)

   A --- B --- C        E --- F     <- different component, never visited
   |
   D                    reachable from A: B(9) C(7) D(8)   -> top 2 = B, D
```

### Q9.1 Main — top K similar movies

*Phone screen, May 2026 (post 8276966).*

**Solution — collect everything, sort**

```python
def top_k_movies_brute(ratings, edges, movie, k):
    adj = defaultdict(list)
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    seen, stack = {movie}, [movie]
    while stack:
        for v in adj[stack.pop()]:
            if v not in seen:
                seen.add(v)
                stack.append(v)
    seen.discard(movie)
    return sorted(seen, key=lambda mv: (-ratings[mv], mv))[:k]
```

### Q9.2 Follow-up — O(K) space for the ranking

*Same call as Q9.1.*

**Solution — min-heap of size K**

```python
def top_k_movies(ratings, edges, movie, k):
    adj = defaultdict(list)
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    heap, seen, stack = [], {movie}, [movie]
    while stack:
        u = stack.pop()
        if u != movie:
            heapq.heappush(heap, (ratings[u], u))
            if len(heap) > k:
                heapq.heappop(heap)
        for v in adj[u]:
            if v not in seen:
                seen.add(v)
                stack.append(v)
    return [mv for _, mv in sorted(heap, reverse=True)]
```

| Version | TC | SC |
|---|---|---|
| Q9.1 sort everything | O(V + E + C log C), C = component size | O(C) |
| Q9.2 heap of size K | O(V + E + C log K) | O(K) for the ranking, plus O(C) visited set |

---

## Q10. Shuffle a playlist with no artist twice in a row (L4, Dec 2025)

**Same call?** Single question; no follow-up reported.

Given songs with artists, return an order in which no two neighbouring songs share an artist. If that is impossible, keep such neighbours to a minimum.

```text
artists:  A A A B B C

always play the artist with most songs left, except the one just played:
A  B  A  B  A  C        (heap picks A, holds A back one step, picks B, ...)

A A A A B  ->  A B A A A   two repeats cannot be avoided
                           (four A's need three separators, there is only one other song)
```

**Brute force — try every order**

```python
def min_repeats_brute(artists):
    best = len(artists)
    for order in set(permutations(artists)):
        best = min(best, sum(a == b for a, b in zip(order, order[1:])))
    return best
```

**Optimal — max-heap, hold the last artist back for one turn**

```python
def shuffle_playlist(songs):
    by_artist = defaultdict(list)
    for title, artist in songs:
        by_artist[artist].append(title)
    heap = [(-len(titles), artist) for artist, titles in by_artist.items()]
    heapq.heapify(heap)
    out, held = [], None
    while heap:
        count, artist = heapq.heappop(heap)
        out.append((by_artist[artist].pop(), artist))
        if held:
            heapq.heappush(heap, held)
        held = (count + 1, artist) if count + 1 < 0 else None
    if held:                                    # only one artist left: repeats are unavoidable
        count, artist = held
        out.extend((by_artist[artist].pop(), artist) for _ in range(-count))
    return out
```

| Version | TC | SC |
|---|---|---|
| All permutations | O(n! · n) | O(n) |
| Heap | O(n log A), A = number of artists | O(n) |

---

## Q11. Cut values down to a cap so the total fits (L4, Sep 2025 and Jun 2025)

**Same call?** No. Q11.1 and Q11.2 are two separate interviews; neither reported a follow-up. The three Q11.1 solutions are alternatives, not follow-ups.

**Q11.1 (Sep 2025, post 7182123).** Integer array and a limit S. Choose a cap x; every element larger than x becomes x. Find the largest x for which the total is at most S.

**Q11.2 (Jun 2025, post 6833396 — a different interview).** A list of messages, each tagged with a category (A, B, C…). Keep only K of them, allocated fairly, where "fair" turned out to mean one common cap per category. How many messages are kept from each category? The statement was deliberately vague.

```text
a = [2, 5, 9],  S = 12

cap 9:  2 + 5 + 9 = 16   too big
cap 6:  2 + 5 + 6 = 13   too big
cap 5:  2 + 5 + 5 = 12   fits      <- answer 5

sorted view: small values are paid in full, the rest share what is left
2 -> paid (left 10 for 2 items) | 5 -> paid (left 5 for 1 item) | 9 > 5 -> cap = 5 // 1
```

### Q11.1 Largest cap so the total fits

**Brute force — try caps from the top**

```python
def cap_brute(a, s):
    for x in range(max(a), -1, -1):
        if sum(min(v, x) for v in a) <= s:
            return x
    return -1
```

**Optimal A — binary search on the cap**

```python
def cap_binary(a, s):
    lo, hi, ans = 0, max(a), -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if sum(min(v, mid) for v in a) <= s:
            ans, lo = mid, mid + 1
        else:
            hi = mid - 1
    return ans
```

**Optimal B — sort once and "pour"**

```python
def cap_sorted(a, s):
    a = sorted(a)
    remaining = s
    for i, v in enumerate(a):
        left = len(a) - i
        if v * left > remaining:
            return remaining // left
        remaining -= v
    return a[-1]                    # everything fits, no cut needed
```

### Q11.2 Fair allocation of K messages

*The poster applied the cap but forgot to hand out the slots left over afterwards, and expected a rejection for it. Which categories get the leftover slots is a tie-break to ask about; here the larger categories get them.*

```text
messages: A B A A B B A C B A B      counts  A:5  B:5  C:1      K = 9

cap = 4  ->  A:4  B:4  C:1  = 9 kept            (cap 5 would keep 11)

K = 10:  cap is still 4 (9 kept), 1 slot left over -> give it to A  ->  A:5  B:4  C:1
```

**Brute force — hand out one slot at a time, round-robin**

```python
def fair_allocation_brute(categories, k):
    counts = Counter(categories)
    kept = dict.fromkeys(counts, 0)
    order = sorted(counts, key=lambda c: -counts[c])
    left = min(k, len(categories))
    while left:
        for c in order:
            if left and kept[c] < counts[c]:
                kept[c] += 1
                left -= 1
    return kept
```

**Optimal — compute the cap with Q11.1, then place the leftovers**

```python
def fair_allocation(categories, k):
    counts = Counter(categories)
    if not counts:
        return {}
    cap = cap_sorted(list(counts.values()), k)
    kept = {c: min(n, cap) for c, n in counts.items()}
    spare = min(k, len(categories)) - sum(kept.values())
    for c in sorted(counts, key=lambda c: -counts[c]):
        if spare and counts[c] > kept[c]:
            kept[c] += 1
            spare -= 1
    return kept
```

| Version | TC | SC |
|---|---|---|
| Q11.1 brute force | O(n · max(a)) | O(1) |
| Q11.1 binary search | O(n log max(a)) | O(1) |
| Q11.1 sort and pour | O(n log n) | O(n) |
| Q11.2 round-robin | O(n + C · largest category), C = categories | O(C) |
| Q11.2 cap + leftovers | O(n + C log C) | O(C) |

---

## Q12. Merge two screenshots (L4, Jul 2025 — rejected for missing the optimisation)

**Same call?** Yes. The interviewer asked for the brute force and its complexity, then asked to optimise it, in the same call (post 6927378).

Two screenshots of one scrolled page, each a list of rows. The bottom of the first may overlap the top of the second. Return one tall screenshot with the overlap kept once.

```text
screen 1      screen 2          merged
a a a         c c c             a a a
b b b         d d d             b b b
c c c   <---> e e e             c c c
d d d   <---> f f f             d d d
                                e e e
overlap = longest suffix of screen 1 that is a prefix of screen 2 (here 2 rows)
```

**Brute force — try every overlap length, longest first**

```python
def merge_screens_brute(top, bottom):
    for k in range(min(len(top), len(bottom)), -1, -1):
        if top[len(top) - k:] == bottom[:k]:
            return top + bottom[k:]
```

**Optimal — give each distinct row an id, then KMP prefix function**

```python
def merge_screens(top, bottom):
    ids = {}
    t = [ids.setdefault(row, len(ids)) for row in top]
    b = [ids.setdefault(row, len(ids)) for row in bottom]
    seq = b + [-1] + t                      # -1 never matches a row id
    pi = [0] * len(seq)
    for i in range(1, len(seq)):
        j = pi[i - 1]
        while j and seq[i] != seq[j]:
            j = pi[j - 1]
        if seq[i] == seq[j]:
            j += 1
        pi[i] = j
    return top + bottom[pi[-1]:]
```

| Version | TC | SC |
|---|---|---|
| Brute force | O(h² · w) | O(1) besides output |
| Row ids + KMP | O(h · w) to hash rows + O(h) | O(h) |

Rows must be hashable (strings or tuples).

---

## Q13. Move valid strings to the front with the fewest writes (L4, Mar 2026)

**Same call?** Single question; the complexity-including-API discussion was part of the same call.

`isValid(s)` is a black box that returns True when a hidden prefix P matches `s`. Rearrange the array so all valid strings come first, moving as few elements as possible. Order among valid strings does not matter. State complexity including the API cost.

```text
P = "a"      ad   cat   awe   dog   apple
              i                       j        ad valid      -> i moves right
                   i                  j        cat invalid, apple valid -> swap
             ad  apple  awe   dog   cat
                         i     j               awe valid -> i moves; i meets j -> stop

one swap; valid strings that were already in front are never touched
```

**Brute force — build a new array**

```python
def partition_valid_brute(words, is_valid):
    return [w for w in words if is_valid(w)] + [w for w in words if not is_valid(w)]
```

**Optimal — two pointers, in place**

```python
def partition_valid(words, is_valid):
    i, j = 0, len(words) - 1
    while i < j:
        if is_valid(words[i]):
            i += 1
        elif not is_valid(words[j]):
            j -= 1
        else:
            words[i], words[j] = words[j], words[i]
            i += 1
            j -= 1
    return words
```

| Version | TC | SC | Writes |
|---|---|---|---|
| New array | O(n · L) | O(n) | n |
| Two pointers | O(n · L), at most 2n API calls (cache the result to make it n) | O(1) | 2 per misplaced valid string — the minimum |

L = cost of one `isValid` call (length of the prefix compared).

---

## Q14. Groups of five consecutive numbers (L4 SDE-3, Apr 2026)

**Same call?** Single question; no follow-up reported.

Can the array be split into groups of size 5 where each group is five consecutive increasing numbers? Every element must be used exactly once; duplicates are the tricky part.

```text
a = [1,2,3,4,5, 2,3,4,5,6]

count:  1:1  2:2  3:2  4:2  5:2  6:1
start at smallest (1), take 1..5   ->  2:1 3:1 4:1 5:1 6:1
start at smallest left (2), take 2..6 -> all zero  -> True

a = [1,2,3,4,6]  -> starting at 1 needs a 5, none left -> False
```

**Brute force — repeatedly remove the smallest and its four successors**

```python
def can_group_brute(a, size=5):
    a = sorted(a)
    if len(a) % size:
        return False
    while a:
        start = a[0]
        for x in range(start, start + size):
            if x not in a:
                return False
            a.remove(x)
    return True
```

**Optimal — counter, smallest value first**

```python
def can_group(a, size=5):
    if len(a) % size:
        return False
    count = Counter(a)
    for x in sorted(count):
        need = count[x]
        if need:
            for y in range(x, x + size):
                if count[y] < need:
                    return False
                count[y] -= need
    return True
```

| Version | TC | SC |
|---|---|---|
| Brute force | O(n²) | O(n) |
| Counter | O(n log n) | O(n) |

---

## Q15. Special string (India SDE-3, Jan 2026)

**Same call?** Single question; no follow-up reported.

Given `s` (length up to 10) and a dictionary. `s` is special if every subsequence of `s` with length ≥ 3 is in the dictionary. A string shorter than 3 is special.

```text
s = "abcd"
subsequences of length >= 3:   abc  abd  acd  bcd  abcd
dictionary {abc, abd, acd, bcd, abcd}  -> True
dictionary {abc, abd, acd, bcd}        -> False (abcd missing)
```

**Brute force — every bitmask**

```python
def is_special_brute(s, words):
    words, n = set(words), len(s)
    for mask in range(1 << n):
        if bin(mask).count("1") >= 3:
            sub = "".join(s[i] for i in range(n) if mask >> i & 1)
            if sub not in words:
                return False
    return True
```

**Better — backtracking that stops at the first missing subsequence**

```python
def is_special(s, words):
    words = set(words)
    if len(words) < len(s) - 2:          # at least len(s)-2 distinct subsequences are required
        return False

    def extend(i, cur):
        if len(cur) >= 3 and cur not in words:
            return False
        return all(extend(j + 1, cur + s[j]) for j in range(i, len(s)))

    return extend(0, "")
```

| Version | TC | SC |
|---|---|---|
| Bitmask | O(2ⁿ · n) | O(n) |
| Backtracking | O(2ⁿ · n) worst case, stops early on a miss | O(n) recursion |

There is no polynomial solution; 2ⁿ is the size of the thing being checked. The poster lost points for saying O(n!).

---

## Q16. Stuck keyboard keys (L5 screen, Apr 2026)

**Same call?** Single question. The interviewer had follow-ups, but time ran out and the poster never saw them. The indexed version below is my own addition.

Some keys stick, so a character may be typed more times than intended. Given what was typed and a dictionary, return every word the user could have meant.

```text
typed  "heeellooo"   ->  runs  h1 e3 l2 o3

hello   -> h1 e1 l2 o1   same letters in the same order, each count <= typed count   -> match
helo    -> h1 e1 l1 o1                                                             -> match
help    -> h e l p        letters differ                                           -> no
heeeello-> e4 > e3                                                                 -> no
```

### Q16.1 Main — which words could the user have meant?

*L5 phone screen (post 7855988). The poster used a Trie with backtracking; the interviewer's follow-ups were never reached.*

**Solution — two pointers against every word (LC 925 per word)**

```python
def intended_words_brute(typed, words):
    def could_be(word):
        i = 0
        for j, ch in enumerate(typed):
            if i < len(word) and word[i] == ch:
                i += 1
            elif j == 0 or ch != typed[j - 1]:
                return False
        return i == len(word)

    return [w for w in words if could_be(w)]
```

### Q16.2 Many queries against one dictionary (my addition, not reported)

**Solution — index the dictionary by its letter runs**

```python
def letter_runs(s):
    return [(ch, len(list(group))) for ch, group in groupby(s)]


class StuckKeyboard:
    def __init__(self, words):
        self.index = defaultdict(list)          # "helo" -> [(word, [run counts])]
        for w in words:
            runs = letter_runs(w)
            self.index["".join(ch for ch, _ in runs)].append((w, [n for _, n in runs]))

    def intended(self, typed):
        runs = letter_runs(typed)
        have = [n for _, n in runs]
        candidates = self.index.get("".join(ch for ch, _ in runs), [])
        return [w for w, need in candidates if all(a <= b for a, b in zip(need, have))]
```

| Version | TC | SC |
|---|---|---|
| Q16.1 two pointers per word | O(D · L) per query, D = dictionary size | O(1) |
| Q16.2 run index | O(total letters) to build; O(L + matches·L) per query | O(total letters) |

The poster used a Trie with backtracking; the run index is simpler to code and to explain.

---

# Part 3 — Week 3 (24–27 Oct): London / Europe / L3 screens

## Q17. Average of the last n stream values, then ignore the k highest (London L4 phone screen, 2024, offer)

**Same call?** Yes. Main + follow-up were in one phone screen (post 5979952).

**Q17.1 Main.** Provide a class: `add(x)` returns the average of the last n values.

**Q17.2 Follow-up.** Leave the k largest values of the window out of the average.

```text
n = 3
add(1) -> [1]        1.0
add(10)-> [1,10]     5.5
add(4) -> [1,10,4]   5.0
add(7) -> [10,4,7]   7.0        (1 dropped out)

follow-up, k = 1:   window [10,4,7] -> ignore 10 -> (4+7)/2 = 5.5
```

### Q17.1 Main — average of the last n

*Q17.1 and Q17.2 were asked in one phone screen (post 5979952). The brute-force class takes `k`, so it covers both.*

**Brute force**

```python
class MovingAverageBrute:
    def __init__(self, n, k=0):
        self.n, self.k, self.values = n, k, []

    def add(self, x):
        self.values.append(x)
        window = sorted(self.values[-self.n:])
        kept = window[:max(0, len(window) - self.k)]
        return sum(kept) / len(kept) if kept else 0.0
```

**Optimal (main) — queue and running total**

```python
class MovingAverage:
    def __init__(self, n):
        self.n, self.q, self.total = n, deque(), 0

    def add(self, x):
        self.q.append(x)
        self.total += x
        if len(self.q) > self.n:
            self.total -= self.q.popleft()
        return self.total / len(self.q)
```

### Q17.2 Follow-up — ignore the k highest

**Optimal — keep the window sorted as well**

```python
class MovingAverageDropTop:
    def __init__(self, n, k):
        self.n, self.k = n, k
        self.q, self.ordered, self.total = deque(), [], 0

    def add(self, x):
        self.q.append(x)
        insort(self.ordered, x)
        self.total += x
        if len(self.q) > self.n:
            old = self.q.popleft()
            self.ordered.pop(bisect_left(self.ordered, old))
            self.total -= old
        m = len(self.ordered)
        if m <= self.k:
            return 0.0
        top = sum(self.ordered[m - self.k:]) if self.k else 0
        return (self.total - top) / (m - self.k)
```

| Version | TC per add | SC |
|---|---|---|
| Q17.1 / Q17.2 brute force | O(n log n) | O(all values) |
| Q17.1 queue + total | O(1) | O(n) |
| Q17.2 sorted window | O(n) for the list shift + O(k) for the top sum | O(n) |
| Q17.2 sorted window with a balanced structure (`SortedList`, or two heaps with lazy deletion — LC 1825) | O(log n) | O(n) |

Say the last row out loud; Python's standard library has no balanced tree.

---

## Q18. Count pairs with a[i] − a[j] = i − j (Google Europe L3 phone screen, Dec 2025)

**Same call?** Single question; no follow-up reported.

Count ordered pairs (i, j), where (i, j) and (j, i) are different and (i, i) counts.

```text
a[i] - a[j] = i - j   <=>   a[i] - i = a[j] - j

a      = [2, 4, 6, 5, 9, 9, 11]
a[i]-i = [2, 3, 4, 2, 5, 4,  5]

groups:  2 -> 2 indices   3 -> 1   4 -> 2   5 -> 2
pairs :  2*2 + 1*1 + 2*2 + 2*2 = 13
```

**Brute force**

```python
def count_pairs_brute(a):
    n = len(a)
    return sum(a[i] - a[j] == i - j for i in range(n) for j in range(n))
```

**Optimal**

```python
def count_pairs(a):
    groups = Counter(x - i for i, x in enumerate(a))
    return sum(c * c for c in groups.values())
```

| Version | TC | SC |
|---|---|---|
| Brute force | O(n²) | O(1) |
| Group by a[i] − i | O(n) | O(n) |

---

## Q19. Count squares among points, any rotation (L3 phone screen, Oct 2026)

**Same call?** Yes. Main, duplicate points and rhombi were all in one call (post 8550611); the poster did not finish the rhombus part.

**Q19.1 Main.** Given N distinct points, count squares whose four corners are in the set, including rotated ones.

**Q19.2 Follow-up.** Points may repeat.

**Q19.3 Follow-up.** Count rhombi instead.

```text
      . B .
      A . C          A(0,1) B(1,2) C(2,1) D(1,0)  -> a square standing on its corner
      . D .

pick a diagonal A-C:  centre (1,1), half-diagonal (1,0)
rotate it 90 degrees -> (0,1)  -> the other corners are centre +/- (0,1) = B and D
if both are in the set, it is a square.  Each square is found twice (two diagonals).
```

### Q19.1 Main — count squares

*Q19.1, Q19.2 and Q19.3 were all asked in one phone screen (post 8550611).*

**Brute force — every 4 points**

```python
def count_squares_brute(points):
    def is_square(p):
        d = sorted((p[i][0] - p[j][0]) ** 2 + (p[i][1] - p[j][1]) ** 2
                   for i in range(4) for j in range(i + 1, 4))
        return d[0] > 0 and d[0] == d[1] == d[2] == d[3] and d[4] == d[5] == 2 * d[0]

    n, total = len(points), 0
    for a in range(n):
        for b in range(a + 1, n):
            for c in range(b + 1, n):
                for d in range(c + 1, n):
                    total += is_square([points[a], points[b], points[c], points[d]])
    return total
```

**Optimal — every pair as a diagonal** (uses a Counter, which is what Q19.2 needs)

```python
def count_squares(points):
    count = Counter(points)
    distinct = list(count)
    total = 0
    for i, (x1, y1) in enumerate(distinct):
        for x2, y2 in distinct[i + 1:]:
            dx, dy = x2 - x1, y2 - y1
            if (x1 + x2 - dy) % 2 or (y1 + y2 + dx) % 2:
                continue                        # other corners would not be integers
            p3 = ((x1 + x2 - dy) // 2, (y1 + y2 + dx) // 2)
            p4 = ((x1 + x2 + dy) // 2, (y1 + y2 - dx) // 2)
            total += count[(x1, y1)] * count[(x2, y2)] * count[p3] * count[p4]
    return total // 2                           # each square seen from both diagonals
```

### Q19.2 Follow-up — duplicate points

No new code: `count_squares` multiplies the counts of the four corners, so repeated points are already handled. With distinct points every count is 1.

### Q19.3 Follow-up — rhombi

**Idea.** A rhombus is two diagonals with the same midpoint that are perpendicular. Group pairs by midpoint; inside a group, match each direction with its perpendicular.

```python
def count_rhombi(points):
    def direction(dx, dy):
        g = math.gcd(dx, dy)
        dx, dy = dx // g, dy // g
        return (-dx, -dy) if dx < 0 or (dx == 0 and dy < 0) else (dx, dy)

    by_mid = defaultdict(Counter)
    for i, (x1, y1) in enumerate(points):
        for x2, y2 in points[i + 1:]:
            by_mid[(x1 + x2, y1 + y2)][direction(x2 - x1, y2 - y1)] += 1
    total = 0
    for dirs in by_mid.values():
        for (dx, dy), c in dirs.items():
            total += c * dirs.get(direction(-dy, dx), 0)
    return total // 2
```

| Version | TC | SC |
|---|---|---|
| Q19.1 brute force | O(n⁴) | O(1) |
| Q19.1 / Q19.2 diagonal pairs | O(n²) | O(n) |
| Q19.3 midpoint groups | O(n²) | O(n²) |

---

## Q20. Remove a node, report the heaviest remaining edge (L3 screen, May 2026)

**Same call?** Single question. The interviewer pushed from the heap idea to O(1) queries within the same call.

Weighted graph. For a query node x, remove x and all its edges and return the largest remaining edge weight. Get queries down to O(1).

```text
edges:  A-B 9   B-C 7   C-D 5   A-D 4

heaviest edge is A-B (9)
remove C or D -> A-B survives              -> 9
remove A      -> best edge without A = B-C -> 7
remove B      -> best edge without B = C-D -> 5

only the two endpoints of the heaviest edge need a precomputed answer
```

**Brute force**

```python
def max_edge_without_brute(edges, x):
    return max((w for u, v, w in edges if x not in (u, v)), default=None)
```

**Optimal — precompute three numbers**

```python
class MaxEdgeAfterRemoval:
    def __init__(self, edges):
        self.top = max(edges, key=lambda e: e[2], default=None)
        self.without = {}
        if self.top:
            for x in self.top[:2]:
                self.without[x] = max((w for u, v, w in edges if x not in (u, v)), default=None)

    def query(self, x):
        if self.top is None:
            return None
        return self.without[x] if x in self.without else self.top[2]
```

| Version | TC | SC |
|---|---|---|
| Brute force | O(E) per query | O(1) |
| Precompute | O(E) once, O(1) per query | O(1) |

---

# Part 4 — Week 3 (28–30 Oct): onsite-level practice

## Q21. Largest rectangle from points, sides at any angle (3 first-hand reports; LC 963 asks for the smallest)

**Same call?** Single question in each first-hand report. One compiled report had two parts in a row: sides parallel to the axes first, then any angle.

```text
        B
      /   \          A(0,1) B(1,2) C(3,0) D(2,-1)
    A       \        diagonals A-C and B-D:
      \       C        same midpoint (1.5, 0.5) and same length  -> rectangle
        \   /        area = |AB| * |BC|
          D
```

**Brute force — pick the corner with the right angle**

```python
def max_rectangle_brute(points):
    pts, best = set(points), 0.0
    for p1 in points:
        for p2 in points:
            for p3 in points:
                if p1 == p2 or p1 == p3 or p2 == p3:
                    continue
                ax, ay = p2[0] - p1[0], p2[1] - p1[1]
                bx, by = p3[0] - p1[0], p3[1] - p1[1]
                if ax * bx + ay * by == 0 and (p2[0] + bx, p2[1] + by) in pts:
                    best = max(best, math.hypot(ax, ay) * math.hypot(bx, by))
    return best
```

**Optimal — group point pairs by (midpoint, length); two pairs in one group are the diagonals of a rectangle**

```python
def max_rectangle(points):
    groups = defaultdict(list)
    for i, (x1, y1) in enumerate(points):
        for x2, y2 in points[i + 1:]:
            key = (x1 + x2, y1 + y2, (x1 - x2) ** 2 + (y1 - y2) ** 2)
            groups[key].append(((x1, y1), (x2, y2)))
    best = 0.0
    for diagonals in groups.values():
        for i, (p1, p2) in enumerate(diagonals):
            for p3, _ in diagonals[i + 1:]:
                best = max(best, math.dist(p1, p3) * math.dist(p2, p3))
    return best
```

| Version | TC | SC |
|---|---|---|
| Brute force | O(n³) | O(n) |
| Diagonal groups | O(n²) to group; pairing inside groups is small in practice, O(n³) in a contrived worst case | O(n²) |

---

## Q22. Ad service (3 reports)

**Same call?** Yes. Main + delay follow-up were in one call in two reports (posts 8423598, 8276966); a third report had the main only.

**Q22.1 Main.** `insertAd(content, score)`. `getAd()` returns the ad with the highest score, lowers its score by 1, and must never return the same ad twice in a row.

**Q22.2 Follow-up.** Each ad has a `delay`: after being returned it cannot be returned for the next `delay` calls.

```text
insert X:5  Y:5  Z:1          (ties: earlier insert first)

getAd -> X   scores X:4 Y:5 Z:1   X is resting
getAd -> Y   scores X:4 Y:4 Z:1   Y is resting, X is back
getAd -> X   scores X:3 Y:4 Z:1
getAd -> Y   ...
```

### Q22.1 Main — never the same ad twice in a row

*Asked in three interviews (posts 8423598, 8276966, 8524882).*

**Brute force — scan a list**

```python
class AdServiceBrute:
    def __init__(self):
        self.ads, self.last = [], None      # [score, order, content]

    def insert_ad(self, content, score):
        self.ads.append([score, len(self.ads), content])

    def get_ad(self):
        options = [ad for ad in self.ads if ad is not self.last]
        if not options:
            self.last = None                # nothing served this call, so nothing is "last"
            return None
        best = max(options, key=lambda ad: (ad[0], -ad[1]))
        best[0] -= 1
        self.last = best
        return best[2]
```

### Q22.1 optimal, and Q22.2 Follow-up — per-ad delay

*Q22.2 was asked in the same call as Q22.1 in two of the three interviews. One class covers both: `delay=1` is Q22.1.*

**Solution — max-heap plus a "resting" heap**

```python
class AdService:
    def __init__(self):
        self.ready, self.resting = [], []   # (-score, order, content, delay) / (back_at_call, ...)
        self.calls = self.order = 0

    def insert_ad(self, content, score, delay=1):
        heapq.heappush(self.ready, (-score, self.order, content, delay))
        self.order += 1

    def get_ad(self):
        self.calls += 1
        while self.resting and self.resting[0][0] <= self.calls:
            heapq.heappush(self.ready, heapq.heappop(self.resting)[1])
        if not self.ready:
            return None
        neg, order, content, delay = heapq.heappop(self.ready)
        heapq.heappush(self.resting, (self.calls + delay + 1, (neg + 1, order, content, delay)))
        return content
```

| Version | insert | getAd | SC |
|---|---|---|---|
| Q22.1 list scan | O(1) | O(n) | O(n) |
| Q22.1 / Q22.2 two heaps | O(log n) | O(log n) amortised | O(n) |

---

## Q23. Flights with times: can the package arrive, and how early? (3 reports)

**Same call?** Yes. "Can it arrive?" first, then the minimum time, in one onsite round (post 8355549).

Flights are `(from, to, departure, arrival)`. The package is at the origin at time 0. It can board a flight only if it is already at that airport when the flight departs.

**Q23.1 Main.** Can the package reach the destination?

**Q23.2 Follow-up.** If it can, what is the earliest arrival time?

```text
NYC --(dep 0, arr 4)--> LAX --(dep 5, arr 7)--> SFO      arrives LAX at 4, next flight leaves at 5  -> OK, 7
NYC --(dep 0, arr 4)--> LAX --(dep 3, arr 5)--> SFO      leaves at 3, before we arrive              -> impossible
```

### Q23.1 and Q23.2 — one function answers both

*Asked in that order in one onsite round (post 8355549). Both functions return the earliest arrival, or -1 when the package cannot arrive.*

**Brute force — relax every flight until nothing changes**

```python
def earliest_arrival_brute(flights, origin, dest):
    best, changed = {origin: 0}, True
    while changed:
        changed = False
        for src, dst, dep, arr in flights:
            if best.get(src, INF) <= dep and arr < best.get(dst, INF):
                best[dst] = arr
                changed = True
    return best.get(dest, -1)
```

**Optimal — one pass over flights sorted by departure** (needs arrival > departure)

```python
def earliest_arrival(flights, origin, dest):
    best = {origin: 0}
    for src, dst, dep, arr in sorted(flights, key=lambda f: f[2]):
        if best.get(src, INF) <= dep and arr < best.get(dst, INF):
            best[dst] = arr
    return best.get(dest, -1)
```

| Version | TC | SC |
|---|---|---|
| Repeated relaxation | O(F²) | O(A), A = airports |
| Sort by departure | O(F log F) | O(A) |

"Can it arrive?" is `earliest_arrival(...) != -1`.

---

## Q24. Count the lakes of one island (2 reports)

**Same call?** Yes. Main + the "land inside a lake" twist were in one round (post 8276966); another report had the main only.

**Q24.1 Main.** Grid of `1` land and `0` water; outside the grid is ocean. Given a cell of an island, count the lakes inside that island (water fully enclosed by it).

**Q24.2 Follow-up (twist).** There may be land inside a lake.

```text
0 0 0 0 0 0 0 0
0 1 1 1 0 1 1 0        left island: the 0 in its middle is enclosed   -> 1 lake
0 1 0 1 0 1 0 0        right island: its 0 touches the outer water    -> 0 lakes
0 1 1 1 0 1 1 0
0 0 0 0 0 0 0 0

twist:   1 1 1 1 1     outer island: ring of water with a small island inside -> still 1 lake
         1 0 0 0 1     inner island (centre cell): 0 lakes — the water surrounds it,
         1 0 1 0 1                                  it is not inside it
         1 0 0 0 1
         1 1 1 1 1
```

### Q24.1 Main — count the lakes

*Asked in two interviews (posts 8522064, 8276966).*

**Simple version (base question only)** — a lake is a water region next to the island that never reaches the border.

```python
def island_cells(grid, cell):
    rows, cols = len(grid), len(grid[0])
    seen, stack = {cell}, [cell]
    while stack:
        r, c = stack.pop()
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1 and (nr, nc) not in seen:
                seen.add((nr, nc))
                stack.append((nr, nc))
    return seen


def count_lakes_simple(grid, cell):
    rows, cols = len(grid), len(grid[0])
    island, seen, lakes = island_cells(grid, cell), set(), 0
    for r, c in island:
        for dr, dc in DIRS:
            start = (r + dr, c + dc)
            if not (0 <= start[0] < rows and 0 <= start[1] < cols) or grid[start[0]][start[1]] or start in seen:
                continue
            seen.add(start)
            stack, enclosed = [start], True
            while stack:
                wr, wc = stack.pop()
                for er, ec in DIRS:
                    nr, nc = wr + er, wc + ec
                    if not (0 <= nr < rows and 0 <= nc < cols):
                        enclosed = False
                    elif grid[nr][nc] == 0 and (nr, nc) not in seen:
                        seen.add((nr, nc))
                        stack.append((nr, nc))
            lakes += enclosed
    return lakes
```

### Q24.2 Follow-up — land inside a lake

*Same call as Q24.1 in one of the two (post 8276966); the poster only explained the approach.*

**Version that handles the twist** — flood the *outside* of this island; whatever is neither island nor outside is inside it.

```python
def count_lakes(grid, cell):
    rows, cols = len(grid), len(grid[0])
    island = island_cells(grid, cell)

    outside, stack = {(-1, -1)}, [(-1, -1)]            # start in a 1-cell border around the grid
    while stack:
        r, c = stack.pop()
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if -1 <= nr <= rows and -1 <= nc <= cols and (nr, nc) not in island and (nr, nc) not in outside:
                outside.add((nr, nc))
                stack.append((nr, nc))

    lakes, seen = 0, set()
    for r in range(rows):
        for c in range(cols):
            if (r, c) in island or (r, c) in outside or (r, c) in seen:
                continue
            lakes += 1                                  # a new enclosed region
            seen.add((r, c))
            stack = [(r, c)]
            while stack:
                wr, wc = stack.pop()
                for dr, dc in DIRS:
                    nxt = (wr + dr, wc + dc)
                    if (0 <= nxt[0] < rows and 0 <= nxt[1] < cols and nxt not in island
                            and nxt not in outside and nxt not in seen):
                        seen.add(nxt)
                        stack.append(nxt)
    return lakes
```

| Version | TC | SC |
|---|---|---|
| Q24.1 simple | O(R·C) | O(R·C) |
| Q24.2 outside flood (also correct for Q24.1) | O(R·C) | O(R·C) |

The simple version gives a wrong answer for the inner island in the twist (it reports 1). Both versions treat water as connected in 4 directions; confirm that with the interviewer.

---

## Q25. Maximum Profit in Job Scheduling — LC 1235 (2 reports, O(N log N) expected)

**Same call?** Single question; no follow-up reported in either interview.

Jobs have start, end, profit. Choose non-overlapping jobs (one may start exactly when another ends) for maximum profit.

```text
job   start end profit
 1      1    3    50          1 |====|                 50
 2      2    4    10          2    |====|              10
 3      3    5    40          3       |====|           40
 4      3    6    70          4       |======|         70

best: job 1 + job 4 = 120
```

**Brute force — take or skip each job**

```python
def job_scheduling_brute(start, end, profit):
    jobs = sorted(zip(start, end, profit))

    def go(i, free_at):
        if i == len(jobs):
            return 0
        s, e, p = jobs[i]
        best = go(i + 1, free_at)
        if s >= free_at:
            best = max(best, p + go(i + 1, e))
        return best

    return go(0, -INF)
```

**Optimal — sort by end time, DP with binary search**

```python
def job_scheduling(start, end, profit):
    ends, best = [-INF], [0]            # best[i] = max profit using jobs that end by ends[i]
    for e, s, p in sorted(zip(end, start, profit)):
        i = bisect_right(ends, s) - 1   # last recorded state that ends at or before s
        if best[i] + p > best[-1]:
            ends.append(e)
            best.append(best[i] + p)
    return best[-1]
```

| Version | TC | SC |
|---|---|---|
| Take / skip | O(2ⁿ) | O(n) |
| DP + binary search | O(n log n) | O(n) |

---

## Q26. Next-word prediction (2 reports)

**Same call?** Yes. Main + probability follow-up were in one round (post 6910405).

**Q26.1 Main.** Given sentences as word lists. `predict(word)` returns the word that most often follows it.

**Q26.2 Follow-up.** Return a following word at random, with probability proportional to its frequency.

```text
[I, AM, SAM]  [SAM, LIKES, ICECREAM]  [I, AM, TALL]  [I, WANT, COOKIE]

after "I":   AM x2, WANT x1      predict("I") -> AM
follow-up:   AM with probability 2/3, WANT with 1/3

cumulative counts [2, 3]; draw r in 0..2:  r = 0,1 -> AM    r = 2 -> WANT
```

### Q26.1 Main — most frequent next word

**Brute force — rescan the sentences on every call**

```python
def predict_brute(sentences, word):
    counts = Counter(b for s in sentences for a, b in zip(s, s[1:]) if a == word)
    return max(counts, key=counts.get) if counts else None
```

### Q26.1 optimal, and Q26.2 Follow-up — pick by probability

*Same call (post 6910405). `predict` is Q26.1, `sample` is Q26.2.*

**Optimal — precompute**

```python
class NextWord:
    def __init__(self, sentences):
        follow = defaultdict(Counter)
        for s in sentences:
            for a, b in zip(s, s[1:]):
                follow[a][b] += 1
        self.best = {w: max(c, key=c.get) for w, c in follow.items()}
        self.cumulative = {w: (list(c), list(accumulate(c.values()))) for w, c in follow.items()}

    def predict(self, word):
        return self.best.get(word)

    def sample(self, word):                       # follow-up, same idea as LC 528
        if word not in self.cumulative:
            return None
        words, cum = self.cumulative[word]
        return words[bisect_right(cum, random.randrange(cum[-1]))]
```

| Version | TC | SC |
|---|---|---|
| Q26.1 rescan | O(W) per call, W = total words | O(distinct followers) |
| Q26.1 / Q26.2 precompute | O(W) once; `predict` O(1); `sample` O(log F), F = distinct followers | O(W) |

---

## Q27. Earliest time everyone is connected — LC 1101 (L4 onsite, Aug 2026)

**Same call?** Yes. Main and two follow-ups were in one onsite round (post 8525084): first a variant with a cap k on connections, which the poster called "similar to the original" and did not define clearly, so it is not coded here; then "unfriend".

**Q27.1 Main.** Logs `(timestamp, userA, userB)` say two users connected. There are n users. Return the first timestamp at which all users are in one group, or -1.

**Q27.2 Follow-up (not coded).** A variant with a cap k on connections; the poster called it "similar to the original" and did not define it clearly.

**Q27.3 Follow-up (not coded).** Logs may also contain "unfriend". That is dynamic connectivity (offline: divide and conquer over time with a rollback DSU). The poster could not finish it; explain the idea and say it is O(L log L · log n).

```text
n = 4     t=1: 0-1      {0,1} {2} {3}       groups = 3
          t=3: 2-3      {0,1} {2,3}         groups = 2
          t=4: 0-1      (already together)  groups = 2
          t=7: 1-2      {0,1,2,3}           groups = 1  -> answer 7
```

### Q27.1 Main

*Q27.1, Q27.2 and Q27.3 were asked in one onsite round (post 8525084).*

**Brute force — after each log, BFS to check connectivity**

```python
def earliest_all_connected_brute(logs, n):
    adj = defaultdict(list)
    for ts, a, b in sorted(logs):
        adj[a].append(b)
        adj[b].append(a)
        seen, stack = {0}, [0]
        while stack:
            for v in adj[stack.pop()]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        if len(seen) == n:
            return ts
    return -1
```

**Optimal — union-find**

```python
def earliest_all_connected(logs, n):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    groups = n
    for ts, a, b in sorted(logs):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            groups -= 1
            if groups == 1:
                return ts
    return -1
```

| Version | TC | SC |
|---|---|---|
| BFS after each log | O(L · (n + L)) | O(n + L) |
| Union-find | O(L log L) for the sort + nearly O(L) | O(n) |

---

## Q28. Place the last rook using only a counting API (London L3 onsite, Bangalore L3 onsite)

**Same call?** Single question. The push to use fewer API calls happened in the same round.

N×N board, 1-indexed. N−1 rooks are placed so that no two share a row or column. You cannot see the board. `count(a, b, c, d)` returns the number of rooks in rows a..b and columns c..d. Return the cell for the N-th rook. The interviewer cares about the number of API calls.

```text
n = 4, rooks at (1,2) (2,4) (4,1)        . R . .
                                         . . . R
rows 1..2 hold 2 rooks  -> full          . . . .   <- empty row 3
rows 1..3 hold 2 rooks  -> one missing   R . . .
=> first prefix of rows with fewer rooks than rows ends at row 3
same search on columns -> column 3       answer (3, 3)
```

**Brute force — ask about every row and every column**

```python
def place_rook_brute(n, count):
    row = next(r for r in range(1, n + 1) if count(r, r, 1, n) == 0)
    col = next(c for c in range(1, n + 1) if count(1, n, c, c) == 0)
    return row, col
```

**Optimal — binary search on the prefix**

```python
def place_rook(n, count):
    def first_short_prefix(rooks_in_first):
        lo, hi = 1, n
        while lo < hi:
            mid = (lo + hi) // 2
            if rooks_in_first(mid) < mid:
                hi = mid
            else:
                lo = mid + 1
        return lo

    row = first_short_prefix(lambda m: count(1, m, 1, n))
    col = first_short_prefix(lambda m: count(1, n, 1, m))
    return row, col
```

| Version | API calls | SC |
|---|---|---|
| Row by row | up to 2N | O(1) |
| Binary search | about 2·log₂N | O(1) |

---

## One-page recap for the morning

| Q | Trigger words in the problem | Reach for |
|---|---|---|
| 1 | "path that maximises the minimum …" | binary search on the answer + BFS, or max-heap |
| 2 | "within the last X seconds" | hashmap + queue with eviction |
| 3 | "who / how many in each interval" | sort the endpoints, sweep with an active set |
| 4 | "choose a root so that …" | count degrees; bipartite colouring by edges |
| 5 | "depends on", "valid order" | Kahn's algorithm |
| 6 | "fewest machines that still …" | binary search over a monotone function |
| 7 | "longest chain where next = previous + 1" | hashmap DP; range → segment tree |
| 8 | "count paths, moves always go right" | one-column DP |
| 9 | "top K among connected …" | traversal + heap of size K |
| 10 | "no two adjacent equal" | max-heap, hold the last one back |
| 11 | "largest cap so total ≤ S" | binary search, or sort and pour |
| 12 | "overlap of end and start" | KMP prefix function |
| 13 | "minimise moves, order irrelevant" | two pointers from both ends |
| 14 | "groups of consecutive numbers" | Counter, start from the smallest |
