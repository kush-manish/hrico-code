/**
 * The interview toolkit: how to declare and use each data structure and Python
 * trick, with counts and real snippets mined from every cached solution
 * (Pro-Learn topics, their alternative approaches, and per-question answers).
 * Pure text analysis — no model calls.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, '../.cache');
const DIRS = {
  topics: process.env.PROLEARN_CACHE_DIR || path.join(CACHE, 'prolearn'),
  approaches: process.env.PROLEARN_APPROACH_CACHE_DIR || path.join(CACHE, 'prolearn-approaches'),
  explain: process.env.EXPLAIN_CACHE_DIR || path.join(CACHE, 'explain'),
};

export const IMPORTS = `from collections import deque, defaultdict, Counter, OrderedDict
import heapq
from bisect import bisect_left, bisect_right, insort
from functools import cache, lru_cache, cmp_to_key
from itertools import accumulate, combinations, permutations, product
from math import inf
from typing import List, Optional`;

// `match`: any regex hits; with `all: true`, every regex must hit.
const IDIOMS = [
  // ------------------------------------------------------------ containers
  { id: 'stack', group: 'Core containers', name: 'Stack (list)',
    when: 'Undo the most recent thing first: matching brackets, parsing, DFS without recursion.',
    define: 'stack = []',
    use: `stack.append(x)       # push
top = stack[-1]       # peek — guard with \`if stack\`
x = stack.pop()       # pop`,
    tricks: ['Never list.pop(0) — it is O(n); use a deque for FIFO.', 'Store indices, not values, when you need distances later.', '`while stack and ...` guards the empty case in one line.'],
    cost: 'push / pop / peek O(1)',
    match: [/\b(stack|stk|st)\s*=\s*\[/] },
  { id: 'monostack', group: 'Core containers', name: 'Monotonic stack',
    when: 'Next greater / smaller element, spans, largest rectangle, daily temperatures.',
    define: 'stack = []   # indices whose values are decreasing',
    use: `for i, x in enumerate(nums):
    while stack and nums[stack[-1]] < x:
        j = stack.pop()
        ans[j] = i - j        # x is j's next greater
    stack.append(i)`,
    tricks: ['Each index is pushed and popped once, so the whole loop is O(n).', 'Whatever is left in the stack has no answer — keep the default.', 'Circular array: loop 2n times and use i % n.'],
    cost: 'O(n) total',
    match: [/while\s+(stack|stk|st)\s+and\b/] },
  { id: 'deque', group: 'Core containers', name: 'Queue (deque)',
    when: 'First in, first out: BFS, task scheduling, a buffer of the last k items.',
    define: `from collections import deque
q = deque([start])`,
    use: `q.append(x)           # enqueue at the right
x = q.popleft()       # dequeue O(1)
q.appendleft(x); q.pop()   # it is double-ended`,
    tricks: ['deque(maxlen=k) keeps only the last k items automatically.', 'Level by level: `for _ in range(len(q)):` inside `while q:`.', 'queue.Queue is thread-safe and slow — never use it in interviews.'],
    cost: 'append / popleft O(1); q[i] is O(n)',
    match: [/\bdeque\s*\(/] },
  { id: 'monodeque', group: 'Core containers', name: 'Monotonic deque',
    when: 'Maximum / minimum of every sliding window of size k.',
    define: 'dq = deque()   # indices, values decreasing',
    use: `for i, x in enumerate(nums):
    while dq and nums[dq[-1]] <= x:
        dq.pop()
    dq.append(i)
    if dq[0] <= i - k:
        dq.popleft()             # front fell out of the window
    if i >= k - 1:
        out.append(nums[dq[0]])`,
    tricks: ['Store indices so you can tell when the front leaves the window.', 'The front is always the window max.'],
    cost: 'O(n) total',
    match: [/\bdeque\s*\(/, /while\s+(dq|q|window|d)\s+and\s+\w+\[\s*\w+\[-1\]\s*\]/], all: true },
  { id: 'defaultdict', group: 'Core containers', name: 'defaultdict',
    when: 'Grouping (anagrams, adjacency lists) or counting without key checks.',
    define: `from collections import defaultdict
groups = defaultdict(list)    # missing key -> []
count = defaultdict(int)      # missing key -> 0`,
    use: `groups[key].append(x)
count[x] += 1`,
    tricks: ['Merely READING a missing key inserts it — test with `key in d` first.', 'Keys must be hashable: tuple(sorted(s)) or a 26-count tuple, never a list.', 'defaultdict(set), defaultdict(lambda: inf) also work.'],
    cost: 'get / set O(1) average',
    match: [/\bdefaultdict\s*\(/] },
  { id: 'counter', group: 'Core containers', name: 'Counter',
    when: 'Frequencies, anagram checks, top-k frequent, "can I build X from Y".',
    define: `from collections import Counter
cnt = Counter(nums)`,
    use: `cnt[x] += 1
cnt[missing]              # 0, and does NOT insert
cnt.most_common(k)        # [(item, freq), ...]
Counter(s) == Counter(t)  # anagram
need - have               # keeps only positive counts`,
    tricks: ['most_common is O(n log n); a size-k heap is O(n log k) if asked.', 'Comparing two Counters is O(alphabet), fine for sliding-window anagrams.'],
    cost: 'build O(n)',
    match: [/\bCounter\s*\(/] },
  { id: 'set', group: 'Core containers', name: 'Hash set (seen / visited)',
    when: 'O(1) membership: duplicates, visited nodes, longest consecutive sequence.',
    define: 'seen = set()',
    use: `if x in seen: ...
seen.add(x)
a & b, a | b, a - b      # intersection, union, difference`,
    tricks: ['Grid cells go in as tuples (r, c).', 'In BFS mark visited when you ENQUEUE, not when you pop, or nodes get queued twice.', 'set(nums) dedups in O(n).'],
    cost: 'add / in O(1) average',
    match: [/\b\w+\s*=\s*set\(\s*\)/, /\b(seen|visited|vis)\s*=\s*\{/] },
  { id: 'ordereddict', group: 'Core containers', name: 'OrderedDict (LRU cache)',
    when: 'LRU cache, anything that needs "least recently used" in O(1).',
    define: `from collections import OrderedDict
cache = OrderedDict()`,
    use: `cache.move_to_end(key)          # mark as most recent
cache[key] = value
if len(cache) > capacity:
    cache.popitem(last=False)     # evict least recent`,
    tricks: ['Interviewers often ask for the hand-built version: dict + doubly linked list with dummy head and tail.'],
    cost: 'all operations O(1)',
    match: [/OrderedDict/] },

  // ---------------------------------------------------------------- heaps
  { id: 'minheap', group: 'Heaps & ordering', name: 'Min-heap (heapq)',
    when: 'Repeatedly take the smallest: k-way merge, scheduling, running medians, Dijkstra.',
    define: `import heapq
heap = []
heapq.heapify(nums)       # in place, O(n)`,
    use: `heapq.heappush(heap, x)
smallest = heap[0]        # peek
x = heapq.heappop(heap)
heapq.heappushpop(heap, x)   # push then pop, faster`,
    tricks: ['heapq is MIN-heap only.', 'heap[0] is the min; heap[-1] is NOT the max.', 'heapify is O(n), not O(n log n).'],
    cost: 'push / pop O(log n), peek O(1)',
    match: [/\bheapq\b|\bheappush\b|\bheappop\b|\bheapify\b/] },
  { id: 'maxheap', group: 'Heaps & ordering', name: 'Max-heap (negate)',
    when: 'Repeatedly take the largest: last stone weight, k closest points, the lower half of a median.',
    define: `heap = [-x for x in nums]
heapq.heapify(heap)`,
    use: `heapq.heappush(heap, -x)
largest = -heap[0]
x = -heapq.heappop(heap)`,
    tricks: ['Negate on BOTH push and pop — the classic bug is forgetting one.', 'Strings cannot be negated: push (-count, word) tuples instead.'],
    cost: 'O(log n)',
    match: [/heappush\(\s*\w+\s*,\s*\(?\s*-/, /heapify\(\s*\[\s*-/, /-\s*heapq\.heappop|-\s*heappop/] },
  { id: 'topk', group: 'Heaps & ordering', name: 'Heap of tuples / top-k',
    when: 'Top k frequent, k closest, merge k sorted lists.',
    define: 'heap = []   # (priority, tiebreak, item)',
    use: `for x, c in cnt.items():
    heapq.heappush(heap, (c, x))
    if len(heap) > k:
        heapq.heappop(heap)       # keep the k largest

heapq.nlargest(k, cnt, key=cnt.get)   # one-liner`,
    tricks: ['Ties compare the next field — add an index, (dist, i, node), when items are not comparable (ListNode, TreeNode).', 'A size-k MIN-heap keeps the k LARGEST, in O(n log k).'],
    cost: 'O(n log k)',
    match: [/heappush\(\s*\w+\s*,\s*\(/, /\bnlargest\b|\bnsmallest\b/] },
  { id: 'sortkey', group: 'Heaps & ordering', name: 'Sorting with key',
    when: 'Intervals, custom orders, greedy after sorting.',
    define: 'intervals.sort(key=lambda x: x[0])',
    use: `sorted(words, key=lambda w: (-cnt[w], w))   # count desc, then word asc
from functools import cmp_to_key
nums.sort(key=cmp_to_key(lambda a, b: -1 if a + b > b + a else 1))  # Largest Number`,
    tricks: ['Sort is stable — sort by the secondary key first if you need to.', 'Tuple keys give multi-level order; negate one field for descending.', 'Sorting is usually the O(n log n) floor — say so.'],
    cost: 'O(n log n)',
    match: [/\bsort(ed)?\([^)\n]*key\s*=/, /cmp_to_key/] },
  { id: 'intervals', group: 'Heaps & ordering', name: 'Intervals / sweep line',
    when: '"Who is present in each interval", merge/insert intervals, meeting rooms, max overlap, free slots.',
    define: `events = []                     # (time, delta) or (time, +1/-1, who)
for s, e in intervals:
    events.append((s, 1)); events.append((e, -1))
events.sort()                   # ends (-1) before starts (+1) at the same time`,
    use: `# merge overlapping intervals
intervals.sort(key=lambda x: x[0])
merged = [intervals[0]]
for s, e in intervals[1:]:
    if s <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], e)
    else: merged.append([s, e])

# sweep: active count / active set at every boundary
active, best, prev = 0, 0, None
for t, d in events:
    if prev is not None and t != prev: best = max(best, active)   # [prev, t) had 'active' people
    active += d; prev = t`,
    tricks: ['Sort ends before starts at equal times when touching intervals do NOT overlap; the reverse when they do.',
      'Min-heap of end times gives "rooms in use" for meeting rooms II: pop while heap[0] <= start.',
      'For "who is present" keep a set and record [prev, t, sorted(active)] before applying the events at t.'],
    cost: 'O(n log n) for the sort, O(n) sweep',
    match: [/\bevents\b[\s\S]{0,200}\.sort\(/, /merged\[-1\]\[1\]/, /\bintervals\.sort\(/] },

  // ---------------------------------------------------------------- search
  { id: 'bisect', group: 'Search', name: 'bisect',
    when: 'Sorted arrays: insertion points, counts in a range, LIS in O(n log n).',
    define: 'from bisect import bisect_left, bisect_right, insort',
    use: `i = bisect_left(a, x)     # first index with a[i] >= x
j = bisect_right(a, x)    # first index with a[j] >  x
count = j - i
insort(a, x)              # keeps sorted, but O(n)`,
    tricks: ['LIS: `i = bisect_left(tails, x); tails[i:i+1] = [x]`.', 'Python 3.10+: bisect_left(a, x, key=...).', 'Offer to write binary search by hand if they want to see it.'],
    cost: 'O(log n) search, O(n) insort',
    match: [/\bbisect(_left|_right)?\s*\(|\bbisect\.|\binsort\s*\(/] },
  { id: 'binsearch', group: 'Search', name: 'Binary search template',
    when: 'Sorted input, rotated arrays, first / last position.',
    define: 'lo, hi = 0, len(a) - 1',
    use: `while lo <= hi:
    mid = (lo + hi) // 2
    if a[mid] == target:
        return mid
    if a[mid] < target:
        lo = mid + 1
    else:
        hi = mid - 1
return lo          # insertion point`,
    tricks: ['`while lo < hi` with `hi = mid` finds the FIRST index where a condition turns True.', 'Rotated array: first decide which half is sorted.', 'Say the invariant out loud: "the answer is always in [lo, hi]".'],
    cost: 'O(log n)',
    match: [/while\s+(lo|left|l|low|start)\s*<=?\s*(hi|right|r|high|end)\s*:/, /\bmid\s*=/], all: true },
  { id: 'answersearch', group: 'Search', name: 'Binary search on the answer',
    when: 'Minimise the maximum / "smallest capacity that works": Koko bananas, ship packages, split array.',
    define: `def ok(cap):            # monotonic: if cap works, larger works too
    ...`,
    use: `lo, hi = max(w), sum(w)
while lo < hi:
    mid = (lo + hi) // 2
    if ok(mid):
        hi = mid
    else:
        lo = mid + 1
return lo`,
    tricks: ['The tell: the answer is a number and feasibility is monotonic in it.', 'Set lo and hi to the tightest bounds you can justify.'],
    cost: 'O(n log range)',
    match: [/def\s+(ok|can\w*|feasible|check|possible|enough|good|valid)\s*\(/, /while\s+\w+\s*<\s*\w+\s*:/], all: true },
  { id: 'twopointers', group: 'Search', name: 'Two pointers',
    when: 'Sorted pair sums, palindromes, container with most water, 3Sum.',
    define: 'l, r = 0, len(a) - 1',
    use: `while l < r:
    s = a[l] + a[r]
    if s == target:
        return [l, r]
    if s < target:
        l += 1
    else:
        r -= 1`,
    tricks: ['Needs sorted input or a symmetric check.', '3Sum dup skip: `while l < r and a[l] == a[l - 1]: l += 1`.'],
    cost: 'O(n)',
    match: [/while\s+(l|left|i|lo)\s*<\s*(r|right|j|hi)\s*:/] },
  { id: 'window', group: 'Search', name: 'Sliding window',
    when: 'Longest / shortest substring or subarray satisfying a condition.',
    define: `left = 0
window = defaultdict(int)`,
    use: `for right, x in enumerate(s):
    window[x] += 1
    while window[x] > 1:          # invalid -> shrink
        window[s[left]] -= 1
        left += 1
    best = max(best, right - left + 1)`,
    tricks: ['Shrink with `while`, not `if`.', 'Fixed size k: add s[right], remove s[right - k] once right >= k.', 'Only works when shrinking can only fix, never break, validity (no negatives for sums).'],
    cost: 'O(n)',
    match: [/for\s+(right|r|end|hi|j)\s*(,\s*\w+\s*)?in\b/, /\b(left|l|start|lo)\s*\+=\s*1/], all: true },
  { id: 'prefix', group: 'Search', name: 'Prefix sums',
    when: 'Range sums, subarray sum equals k, product except self.',
    define: `from itertools import accumulate
pre = [0, *accumulate(nums)]     # pre[i] = sum(nums[:i])`,
    use: `range_sum = pre[r + 1] - pre[l]

seen = {0: 1}                     # subarray sum == k
for p in accumulate(nums):
    ans += seen.get(p - k, 0)
    seen[p] = seen.get(p, 0) + 1`,
    tricks: ['Seed {0: 1} so subarrays starting at index 0 count.', 'accumulate(nums, initial=0) gives the leading 0 too.'],
    cost: 'O(n) build, O(1) query',
    match: [/accumulate\s*\(/, /\b(prefix|pre|ps)\s*=\s*\[0\]/, /\{\s*0\s*:\s*-?1\s*\}/,
      /\b(prefix|pre|ps|psum)\s*\[\s*\w+\s*\+\s*1\s*\]\s*=\s*\1\s*\[\s*\w+\s*\]\s*\+/] },

  // -------------------------------------------------------- graphs & trees
  { id: 'adjacency', group: 'Graphs & trees', name: 'Adjacency list',
    when: 'Any graph given as an edge list.',
    define: `graph = defaultdict(list)
for u, v in edges:
    graph[u].append(v)
    graph[v].append(u)          # undirected only`,
    use: `for nxt in graph[node]: ...
graph[u].append((v, w))         # weighted`,
    tricks: ['Isolated nodes have no key — loop range(n) when counting components.', 'Clarify: directed? weighted? duplicates? self-loops?'],
    cost: 'O(V + E) space',
    match: [/\b(graph|adj|g|G)\s*=\s*defaultdict\(\s*(list|set)\s*\)/, /\b(graph|adj|g)\s*=\s*\[\s*\[\s*\]\s+for\s+_\s+in\s+range/] },
  { id: 'bfs', group: 'Graphs & trees', name: 'BFS (level order)',
    when: 'Shortest path in an unweighted graph or grid, level-order traversal.',
    define: `q = deque([start])
seen = {start}
steps = 0`,
    use: `while q:
    for _ in range(len(q)):          # one level
        node = q.popleft()
        if node == target:
            return steps
        for nxt in graph[node]:
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)
    steps += 1`,
    tricks: ['Multi-source BFS: put every source in the queue first (Rotting Oranges, 01 Matrix).', 'Weighted edges need Dijkstra, not BFS.'],
    cost: 'O(V + E)',
    match: [/\bpopleft\s*\(/, /\bwhile\s+(q|queue|dq|frontier|bfs)\s*:/], all: true },
  { id: 'dirs', group: 'Graphs & trees', name: 'Grid directions',
    when: 'Islands, flood fill, grid BFS / DFS.',
    define: `DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]
rows, cols = len(grid), len(grid[0])`,
    use: `for dr, dc in DIRS:
    nr, nc = r + dr, c + dc
    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == '1':
        ...`,
    tricks: ['Chained comparison `0 <= nr < rows` reads cleanly.', 'Overwriting the cell (grid[r][c] = "#") marks visited without a set — ask whether mutating input is allowed.'],
    cost: 'O(rows × cols)',
    match: [/\(\s*-?[01]\s*,\s*-?[01]\s*\)\s*,\s*\(\s*-?[01]\s*,\s*-?[01]\s*\)/, /0\s*<=\s*\w+\s*<\s*(rows|cols|m|n|R|C|ROWS|COLS|len\()/] },
  { id: 'dfs', group: 'Graphs & trees', name: 'DFS (recursive)',
    when: 'Trees, connected components, path search, anything "explore fully".',
    define: `def dfs(node):
    if not node:
        return 0`,
    use: `    return 1 + max(dfs(node.left), dfs(node.right))

return dfs(root)`,
    tricks: ['Deep inputs (10^5 nodes) can overflow recursion — sys.setrecursionlimit or an explicit stack.', 'Return values bubble up; `nonlocal best` for a global answer.'],
    cost: 'O(V + E), O(depth) stack',
    match: [/\bdef\s+(dfs\w*|helper|go|walk|visit|explore|solve|rec)\s*\(/] },
  { id: 'unionfind', group: 'Graphs & trees', name: 'Union-Find',
    when: 'Dynamic connectivity, redundant connection, accounts merge, Kruskal.',
    define: `parent = list(range(n))
rank = [0] * n

def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]   # path halving
        x = parent[x]
    return x`,
    use: `def union(a, b):
    ra, rb = find(a), find(b)
    if ra == rb:
        return False                    # already joined -> cycle
    if rank[ra] < rank[rb]:
        ra, rb = rb, ra
    parent[rb] = ra
    if rank[ra] == rank[rb]:
        rank[ra] += 1
    return True`,
    tricks: ['Track a `components` counter that drops on each successful union.', 'Path compression + rank → near O(1) per op (inverse Ackermann).'],
    cost: 'α(n) per op',
    match: [/def\s+find\s*\(/] },
  { id: 'topo', group: 'Graphs & trees', name: 'Topological sort (Kahn)',
    when: 'Course schedule, build order, alien dictionary, cycle detection in a DAG.',
    define: `indeg = [0] * n
for u, v in edges:
    graph[u].append(v)
    indeg[v] += 1`,
    use: `q = deque(i for i in range(n) if indeg[i] == 0)
order = []
while q:
    u = q.popleft()
    order.append(u)
    for v in graph[u]:
        indeg[v] -= 1
        if indeg[v] == 0:
            q.append(v)
return order if len(order) == n else []    # shorter -> cycle`,
    tricks: ['Check the edge direction in the prompt ([a, b] may mean b -> a).'],
    cost: 'O(V + E)',
    match: [/indeg|in_degree|indegree/i] },
  { id: 'dijkstra', group: 'Graphs & trees', name: 'Dijkstra',
    when: 'Shortest path with non-negative weights; network delay, cheapest path.',
    define: `dist = {src: 0}
heap = [(0, src)]`,
    use: `while heap:
    d, u = heapq.heappop(heap)
    if d > dist.get(u, inf):
        continue                          # stale entry
    for v, w in graph[u]:
        nd = d + w
        if nd < dist.get(v, inf):
            dist[v] = nd
            heapq.heappush(heap, (nd, v))`,
    tricks: ['Skip stale heap entries instead of decrease-key.', 'Negative weights: Bellman-Ford. At most k stops: Bellman-Ford with k rounds.'],
    cost: 'O(E log V)',
    match: [/\bheappop\b/, /\bdist\w*\s*[=\[]/], all: true },
  { id: 'trie', group: 'Graphs & trees', name: 'Trie',
    when: 'Prefix search, word dictionary with wildcards, word search II.',
    define: `class TrieNode:
    def __init__(self):
        self.children = {}
        self.end = False`,
    use: `node = root
for ch in word:
    node = node.children.setdefault(ch, TrieNode())
node.end = True`,
    tricks: ['Store the whole word at the end node to avoid rebuilding it in DFS.', 'Prune leaves after a match in Word Search II.'],
    cost: 'O(len(word)) per op',
    match: [/TrieNode|children\s*=\s*\{\s*\}|children\s*=\s*defaultdict/] },
  { id: 'tree', group: 'Graphs & trees', name: 'Binary tree traversal',
    when: 'Level order, depth / diameter / path sums, LCA, validate BST, serialise.',
    define: `def dfs(node):
    if not node:
        return (0, True)        # a tuple when the parent needs two facts`,
    use: `# level order
q = deque([root])
while q:
    level = []
    for _ in range(len(q)):
        n = q.popleft()
        level.append(n.val)
        if n.left: q.append(n.left)
        if n.right: q.append(n.right)

# inorder without recursion
stack, cur = [], root
while stack or cur:
    while cur:
        stack.append(cur); cur = cur.left
    cur = stack.pop()
    visit(cur.val); cur = cur.right

# post-order pair returns: (height, balanced) / (rob, skip)
lh, lok = dfs(node.left)
rh, rok = dfs(node.right)`,
    tricks: ['Check `if n.left:` before enqueueing — a None in the queue crashes on .val.', 'BST: inorder is sorted; validate with (lo, hi) bounds, not just a parent compare.', 'A global answer (diameter, max path sum) lives in `nonlocal best`; the function returns the one-arm value.'],
    cost: 'O(n), O(h) stack',
    match: [/\.left\b/, /\.right\b/], all: true },
  { id: 'linkedlist', group: 'Graphs & trees', name: 'Linked list: dummy + fast/slow',
    when: 'Merges, removals, cycle detection, finding the middle.',
    define: `dummy = ListNode(0, head)
cur = dummy`,
    use: `slow = fast = head
while fast and fast.next:
    slow, fast = slow.next, fast.next.next

prev, cur = None, head               # reverse
while cur:
    cur.next, prev, cur = prev, cur, cur.next
return dummy.next`,
    tricks: ['The dummy node removes every "is it the head?" special case.', 'Check `fast and fast.next` in that order.'],
    cost: 'O(n), O(1) space',
    match: [/dummy\s*=\s*ListNode/, /fast\s*=\s*fast\.next\.next|fast\.next\.next/] },

  // --------------------------------------------------------- dp & recursion
  { id: 'memo', group: 'DP & recursion', name: 'Memoised recursion (@cache)',
    when: 'Top-down DP: write the recurrence, let Python cache it.',
    define: 'from functools import cache    # or @lru_cache(None)',
    use: `@cache
def dp(i, j):
    if i == len(a):
        return 0
    return max(dp(i + 1, j), a[i] + dp(i + 2, j))

return dp(0, 0)`,
    tricks: ['Arguments must be hashable — tuples, not lists.', 'Deep recursion: sys.setrecursionlimit, or convert to bottom-up.', 'dp.cache_clear() between test cases in a class.'],
    cost: 'states × work per state',
    match: [/@(functools\.)?(lru_cache|cache)\b/] },
  { id: 'dp1', group: 'DP & recursion', name: '1-D DP table',
    when: 'House robber, climbing stairs, coin change, word break.',
    define: 'dp = [0] * (n + 1)      # dp[i] = answer for the first i items',
    use: `for i in range(1, n + 1):
    dp[i] = max(dp[i - 1], dp[i - 2] + nums[i - 1])

prev2, prev1 = 0, 0               # O(1) space version
for x in nums:
    prev2, prev1 = prev1, max(prev1, prev2 + x)`,
    tricks: ['n + 1 slots makes "empty prefix" the base case.', 'Say the state definition first: "dp[i] means …".'],
    cost: 'O(n)',
    match: [/\bdp\s*=\s*\[[^\]\n]*\]\s*\*/] },
  { id: 'dp2', group: 'DP & recursion', name: '2-D DP table',
    when: 'LCS, edit distance, unique paths, palindromic substrings, knapsack.',
    define: 'dp = [[0] * (cols + 1) for _ in range(rows + 1)]',
    use: `for i in range(1, rows + 1):
    for j in range(1, cols + 1):
        if a[i - 1] == b[j - 1]:
            dp[i][j] = dp[i - 1][j - 1] + 1
        else:
            dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])`,
    tricks: ['NEVER `[[0] * m] * n` — every row is the same list object.', 'Interval DP fills by length: for length in range(2, n + 1).', 'Often reducible to two rows.'],
    cost: 'O(rows × cols)',
    match: [/\[\s*\[[^\]\n]*\]\s*\*\s*[^\]\n]+?\s+for\s+_\s+in\s+range/] },
  { id: 'inf', group: 'DP & recursion', name: 'Infinity sentinels',
    when: 'Minimum cost, shortest distance, "return -1 if impossible".',
    define: `from math import inf        # or float('inf')`,
    use: `best = inf
best = min(best, cost)
return best if best < inf else -1`,
    tricks: ['-inf for maximisation.', 'inf + 1 is still inf, so it is safe in transitions.'],
    cost: '—',
    match: [/float\(\s*['"]-?inf['"]\s*\)|math\.inf|\binf\b/] },
  { id: 'backtrack', group: 'DP & recursion', name: 'Backtracking',
    when: 'Subsets, permutations, combinations, N-Queens, word search.',
    define: 'res, path = [], []',
    use: `def bt(start):
    res.append(path[:])                 # copy!
    for i in range(start, len(nums)):
        if i > start and nums[i] == nums[i - 1]:
            continue                    # skip dups (sorted)
        path.append(nums[i])
        bt(i + 1)
        path.pop()                      # undo

bt(0)`,
    tricks: ['Append a COPY (path[:]) — appending path itself gives a list of empties.', 'Sort first so duplicates are adjacent.', 'Prune early: stop when the remaining sum is negative.'],
    cost: 'O(2^n) / O(n!) — say it',
    match: [/\b(path|cur|curr|comb|combo|perm|subset|track|stack)\.append\(/, /\b(path|cur|curr|comb|combo|perm|subset|track)\.pop\(\)/], all: true },

  // ------------------------------------------------------ pythonic tricks
  { id: 'enumzip', group: 'Pythonic tricks', name: 'enumerate / zip',
    when: 'Index + value, parallel iteration, adjacent pairs, transpose.',
    define: 'for i, x in enumerate(nums): ...',
    use: `for a, b in zip(s, t): ...
for a, b in zip(nums, nums[1:]): ...     # adjacent pairs
rotated = [list(r) for r in zip(*matrix[::-1])]   # rotate 90°`,
    tricks: ['zip stops at the shorter input.', 'enumerate(nums, 1) starts counting at 1.'],
    cost: 'O(n)',
    match: [/\benumerate\s*\(|\bzip\s*\(/] },
  { id: 'chars', group: 'Pythonic tricks', name: 'Character arithmetic',
    when: 'Fixed-alphabet counts, anagram keys, Caesar shifts.',
    define: 'count = [0] * 26',
    use: `count[ord(ch) - ord('a')] += 1
key = tuple(count)                 # hashable anagram key
ch = chr(ord('a') + i)
ch.isalnum(), ch.isdigit(), ch.lower()`,
    tricks: ['A 26-slot array is O(1) space — mention it.', 'string.ascii_lowercase gives "abc…z".'],
    cost: 'O(1) per char',
    match: [/\bord\s*\(/] },
  { id: 'nonlocal', group: 'Pythonic tricks', name: 'nonlocal / closures',
    when: 'Updating a running answer from inside a nested helper (diameter, max path sum).',
    define: 'best = 0',
    use: `def dfs(node):
    nonlocal best
    ...
    best = max(best, left + right)`,
    tricks: ['Only needed when REASSIGNING — res.append(x) needs nothing.', 'Alternative: self.best on the Solution object.'],
    cost: '—',
    match: [/\bnonlocal\b/] },
  { id: 'itertools', group: 'Pythonic tricks', name: 'itertools',
    when: 'Quick combinations / permutations, grouping runs, cartesian products.',
    define: 'from itertools import combinations, permutations, product, groupby, pairwise',
    use: `list(combinations(nums, 2))
list(permutations(nums))
[(k, len(list(g))) for k, g in groupby(s)]    # run-length`,
    tricks: ['Ask first — interviewers usually want the backtracking written by hand.'],
    cost: 'size of the output',
    match: [/\b(combinations|permutations|product|pairwise|groupby)\s*\(/] },
  { id: 'bits', group: 'Pythonic tricks', name: 'Bit tricks',
    when: 'Single number, counting bits, subsets as masks, power of two.',
    define: 'mask = 0',
    use: `x & (x - 1)        # clear lowest set bit
x & -x             # isolate lowest set bit
a ^= b             # XOR cancels pairs
x.bit_count()      # popcount (3.10+)
mask | (1 << i); (mask >> i) & 1`,
    tricks: ['Python ints are unbounded — mask with 0xFFFFFFFF for 32-bit problems.'],
    cost: 'O(1)',
    match: [/\w\s*&\s*\(\s*\w+\s*-\s*1\s*\)|&\s*-\s*\w|\^=|\bbit_count\s*\(|<<\s*\w/] },
  { id: 'intmath', group: 'Pythonic tricks', name: 'Integer maths',
    when: 'Digit problems, ceiling division, overflow-free midpoints.',
    define: 'q, r = divmod(n, 10)     # peel the last digit',
    use: `ceil = -(-a // b)          # or (a + b - 1) // b
mid = (lo + hi) // 2
int(str(x)[::-1])          # reverse digits`,
    tricks: ['// floors toward −∞: -7 // 2 == -4. Use int(a / b) to truncate toward 0.'],
    cost: 'O(1)',
    match: [/\bdivmod\s*\(|-\s*\(\s*-\s*\w+\s*\/\/|math\.ceil/] },

  // ------------------------------------------------------ classes & design
  { id: 'classdef', group: 'Classes & design', name: 'Defining a class',
    when: 'A node, a record with a few fields, or any "design a …" question (LRU cache, rate limiter, iterator).',
    define: `class Node:
    __slots__ = ('val', 'next')       # optional: less memory, no typos
    def __init__(self, val, next=None):
        self.val = val
        self.next = next
    def __repr__(self):               # nice printing while debugging
        return f'Node({self.val})'`,
    use: `n = Node(3)                   # calls __init__
n.next = Node(4)
print(n)                      # Node(3)
isinstance(n, Node)           # True`,
    tricks: ['self is the instance; every method takes it first and you never pass it yourself.', 'No `new`, no types needed: `class Foo:` then `def __init__(self, ...)`.', 'Attributes are created the first time you assign them in __init__ — list them all there.', 'Default mutable args are shared: use `children=None` then `self.children = children or []`.', 'Equality and hashing are by identity unless you define __eq__ / __hash__.'],
    cost: 'attribute get / set O(1)',
    match: [/^\s*class\s+\w+\s*(\([^)]*\))?\s*:\s*$/m, /def\s+__init__\s*\(/], all: true },
  { id: 'dataclass', group: 'Classes & design', name: '@dataclass',
    when: 'A record you would otherwise write __init__ / __repr__ / __eq__ for by hand: events, intervals, jobs.',
    define: `from dataclasses import dataclass, field

@dataclass
class Job:
    start: int
    end: int
    weight: int = 1                        # default
    tags: list = field(default_factory=list)   # mutable default done right`,
    use: `j = Job(1, 5)                 # Job(start=1, end=5, weight=1, tags=[])
j.end = 7
Job(1, 5) == Job(1, 5)        # True: __eq__ is generated
@dataclass(order=True)        # adds <, so it can sit in a heap
@dataclass(frozen=True)       # immutable and hashable: usable as a dict key`,
    tricks: ['Fields with defaults must come after fields without.', 'order=True compares field by field, in declaration order — put the sort key first.', 'frozen=True makes instances hashable, so they can go in sets and dict keys.', 'Named tuples are the lighter cousin: `Point = namedtuple("Point", "x y")`.'],
    cost: '—',
    match: [/@dataclass\b|\bnamedtuple\s*\(|\bNamedTuple\b/] },
  { id: 'dunder', group: 'Classes & design', name: 'Objects in a heap / sort (__lt__)',
    when: 'You want objects in heapq or sorted() without a key, or a custom comparison.',
    define: `class Task:
    def __init__(self, pri, name):
        self.pri, self.name = pri, name
    def __lt__(self, other):          # heapq and sorted only need <
        return self.pri < other.pri`,
    use: `heap = []
heapq.heappush(heap, Task(2, 'b'))
heapq.heappush(heap, Task(1, 'a'))
heapq.heappop(heap).name      # 'a'
sorted(tasks)                 # uses __lt__ too`,
    tricks: ['Simpler for interviews: push tuples `(pri, counter, obj)` — the counter breaks ties so obj is never compared.', 'Define __eq__ and __hash__ together or not at all, else sets and dicts misbehave.', '__len__, __iter__, __getitem__, __contains__ make your class work with len(), for, [] and in.'],
    cost: 'O(log n) per push / pop',
    match: [/def\s+__(lt|gt|eq|hash|len|iter|getitem|contains|call)__\s*\(/] },
  { id: 'designclass', group: 'Classes & design', name: '"Design a …" class',
    when: 'LRU cache, hit counter, rate limiter, iterator, stream median, time-based key-value store.',
    define: `class HitCounter:
    def __init__(self):
        self.q = deque()              # (timestamp, count)
        self.total = 0

    def hit(self, t: int) -> None:
        if self.q and self.q[-1][0] == t:
            self.q[-1] = (t, self.q[-1][1] + 1)
        else:
            self.q.append((t, 1))
        self.total += 1
        self._evict(t)

    def get_hits(self, t: int) -> int:
        self._evict(t)
        return self.total

    def _evict(self, t):              # leading _ means "private helper"
        while self.q and self.q[0][0] <= t - 300:
            self.total -= self.q.popleft()[1]`,
    use: `hc = HitCounter()
hc.hit(1); hc.hit(1); hc.hit(300)
hc.get_hits(300)              # 3
hc.get_hits(301)              # 1`,
    tricks: ['Say the per-call cost of each method out loud; the interviewer scores the design on that.', 'State goes on self in __init__; helpers that touch state are methods, pure helpers can stay plain functions.', 'Keep one structure per guarantee: a dict for O(1) lookup plus a deque or heap for order.', 'Iterator: define __iter__ returning self and __next__ raising StopIteration.'],
    cost: 'as designed — state it per method',
    match: [/^\s*class\s+\w+\s*(\([^)]*\))?\s*:\s*$/m, /def\s+__init__\s*\(\s*self/, /\bself\.\w+\s*=\s*(deque|\{\}|\[\]|defaultdict|OrderedDict|set\(\))/], all: true },
];

/**
 * Priority from the interview-report tally (how many reports used each
 * topic). Marked ★ in the UI so the high-yield cards are read first.
 */
const PRIORITY = {
  // Graph / grid BFS-DFS, topological sort, components — 14
  bfs: 14, dfs: 14, dirs: 14, adjacency: 14, topo: 14, unionfind: 14,
  // Arrays: two pointers, prefix sums, sorting, counting — 12
  twopointers: 12, prefix: 12, sortkey: 12, counter: 12,
  // Hashmap + queue / stream / sliding-window design — 10
  deque: 10, defaultdict: 10, window: 10, ordereddict: 10, monodeque: 10,
  // Trees — 5
  tree: 5,
  // Binary search on the answer — 4
  answersearch: 4, binsearch: 4, bisect: 4,
  // Heap / top K — 4
  minheap: 4, maxheap: 4, topk: 4,
  // DP — 3
  memo: 3, dp1: 3, dp2: 3,
  // Backtracking / Trie — 3
  backtrack: 3, trie: 3,
  // Stack / monotonic stack — 3
  stack: 3, monostack: 3,
  // Intervals / sweep line — 2
  intervals: 2,
};
for (const i of IDIOMS) if (PRIORITY[i.id]) i.priority = PRIORITY[i.id];

// ---------------------------------------------------------------- mining ---

async function readJsonDir(dir, filter = () => true) {
  let names = [];
  try { names = await fs.readdir(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (n.startsWith('.') || !n.endsWith('.json') || !filter(n)) continue;
    try { out.push(JSON.parse(await fs.readFile(path.join(dir, n), 'utf8'))); } catch { /* skip a bad file */ }
  }
  return out;
}

async function sources() {
  const [topics, approaches, explains] = await Promise.all([
    readJsonDir(DIRS.topics),
    readJsonDir(DIRS.approaches),
    readJsonDir(DIRS.explain, n => n.endsWith('.explain.json')),
  ]);
  const byTopic = new Map();
  for (const t of topics) {
    if (!t?.slug || !t.code?.source) continue;
    byTopic.set(t.slug, { type: 'topic', slug: t.slug, title: t.title || t.slug, codes: [t.code.source] });
  }
  for (const a of approaches) {
    const t = byTopic.get(a?.slug);
    if (!t) continue;
    for (const it of a.items || []) if (it?.code) t.codes.push(String(it.code));
  }
  const out = [...byTopic.values()];
  for (const e of explains) {
    const code = e?.code?.python;
    if (!e?.slug || !code || /import pandas|\bpd\.|^\s*SELECT\b/im.test(code)) continue;
    out.push({ type: 'question', slug: e.slug, title: e.title || e.slug, difficulty: e.difficulty || '', codes: [code] });
  }
  return out;
}

function hits(idiom, code) {
  return idiom.all ? idiom.match.every(r => r.test(code)) : idiom.match.some(r => r.test(code));
}

/**
 * The idioms a piece of code relies on, in catalogue order, each with its
 * declare / use / cost card. Lets a handbook page show the API of every data
 * structure it touches without the reader looking it up elsewhere.
 */
export function idiomsIn(code) {
  const src = String(code || '');
  if (!src.trim()) return [];
  return IDIOMS.filter(i => hits(i, src)).map(({ match, all, ...rest }) => rest);
}

/** The lines around the first match, dedented. */
function snippet(idiom, code) {
  for (const r of idiom.match) {
    const m = r.exec(code);
    if (!m) continue;
    const lines = code.split('\n');
    const at = code.slice(0, m.index).split('\n').length - 1;
    const part = lines.slice(Math.max(0, at - 1), at + 5);
    while (part.length && !part[part.length - 1].trim()) part.pop();
    const indent = Math.min(...part.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
    return part.map(l => l.slice(indent)).join('\n');
  }
  return '';
}

async function build() {
  const t0 = Date.now();
  const srcs = await sources();
  const idioms = IDIOMS.map(idiom => {
    const refs = [];
    const examples = [];
    for (const s of srcs) {
      const code = s.codes.find(c => hits(idiom, c));
      if (!code) continue;
      refs.push({ type: s.type, slug: s.slug, title: s.title, difficulty: s.difficulty });
      // Short question solutions make the clearest examples.
      if (s.type === 'question' && examples.length < 3) {
        const text = snippet(idiom, code);
        if (text) examples.push({ type: s.type, slug: s.slug, title: s.title, code: text });
      }
    }
    if (examples.length < 3) {
      for (const s of srcs) {
        if (examples.length >= 3) break;
        if (s.type !== 'topic') continue;
        const code = s.codes.find(c => hits(idiom, c));
        const text = code && snippet(idiom, code);
        if (text) examples.push({ type: s.type, slug: s.slug, title: s.title, code: text });
      }
    }
    refs.sort((a, b) => (a.type === b.type ? a.title.localeCompare(b.title) : a.type === 'topic' ? -1 : 1));
    const { match, all, ...rest } = idiom;
    return {
      ...rest,
      topics: refs.filter(r => r.type === 'topic').length,
      questions: refs.filter(r => r.type === 'question').length,
      refs, examples,
    };
  });
  const scanned = {
    topics: srcs.filter(s => s.type === 'topic').length,
    questions: srcs.filter(s => s.type === 'question').length,
  };
  log.info('toolkit built', { ms: Date.now() - t0, ...scanned });
  return { imports: IMPORTS, scanned, idioms, builtAt: new Date().toISOString() };
}

let memo = null;
let memoAt = 0;
const TTL = 10 * 60_000;

export function toolkit() {
  if (!memo || Date.now() - memoAt > TTL) {
    memoAt = Date.now();
    memo = build().catch(err => { memo = null; throw err; });
  }
  return memo;
}
