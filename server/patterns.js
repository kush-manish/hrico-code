/**
 * The pattern catalogue behind the Learn tab.
 *
 * Interview questions are recombinations of a small number of shapes. Grouped
 * this way, "I have seen this before" arrives far sooner than it does working
 * through a list of problems in order. The first ten groups and their problem
 * sets follow algomaster.io's DSA-patterns taxonomy; the rest are the standard
 * set that Google loops draw from.
 *
 * Each entry carries what the pattern is, the cue that should make you reach
 * for it, a skeleton worth memorising, the traps that actually cost people
 * offers, and practice problems.
 */
const PATTERNS = [
  {
    id: 'two-pointers',
    name: 'Two Pointers',
    family: 'Arrays & strings',
    visual: 'twoPointers',
    cue: 'A sorted array, or a question about pairs, triples, or converging from both ends.',
    idea: 'Two indices move toward each other (or in the same direction). Each step rules out a whole class of candidates, so an O(n^2) scan collapses to O(n).',
    skeleton: `left, right = 0, len(nums) - 1
while left < right:
    total = nums[left] + nums[right]
    if total == target:
        return [left, right]
    if total < target:
        left += 1          # only a larger left can help
    else:
        right -= 1         # only a smaller right can help`,
    complexity: 'O(n) time, O(1) space — after an O(n log n) sort if the input is unsorted.',
    traps: [
      'Forgetting the array must be sorted for the converging variant.',
      'Skipping duplicates wrongly in 3Sum — advance past equal values after recording a hit.',
      'Off-by-one on `while left < right` versus `<=`; the strict form is right when the two must differ.',
    ],
    problems: ['Merge Sorted Array', 'Two Sum II - Input Array Is Sorted', 'Container With Most Water', '3Sum', 'Trapping Rain Water'],
  },
  {
    id: 'sliding-window-fixed',
    name: 'Sliding Window — fixed size',
    family: 'Arrays & strings',
    visual: 'slidingWindow',
    cue: 'Anything asking about every subarray or substring "of length k".',
    idea: 'Compute the first window, then slide: add the entering element and remove the leaving one. Never recompute the whole window.',
    skeleton: `window = sum(nums[:k])
best = window
for i in range(k, len(nums)):
    window += nums[i] - nums[i - k]   # enter, leave
    best = max(best, window)`,
    complexity: 'O(n) time, O(1) space for sums; O(k) if you keep a frequency map.',
    traps: [
      'Recomputing the window each step, which quietly restores O(n*k).',
      'For anagram windows, comparing maps every step instead of tracking a match count.',
    ],
    problems: ['Maximum Average Subarray I', 'Find All Anagrams in a String', 'Permutation in String', 'Maximum Sum of Distinct Subarrays With Length K', 'Substring with Concatenation of All Words'],
  },
  {
    id: 'sliding-window-dynamic',
    name: 'Sliding Window — dynamic size',
    family: 'Arrays & strings',
    visual: 'slidingWindow',
    cue: '"Longest" or "shortest" subarray satisfying a condition, with no fixed length.',
    idea: 'Expand the right edge greedily. When the window becomes invalid, contract from the left until it is valid again. Each index enters and leaves once.',
    skeleton: `left = 0
counts = {}
best = 0
for right, ch in enumerate(s):
    counts[ch] = counts.get(ch, 0) + 1
    while <window is invalid>:
        counts[s[left]] -= 1
        left += 1
    best = max(best, right - left + 1)`,
    complexity: 'O(n) time — each pointer only moves forward — O(k) space for the window state.',
    traps: [
      'Using `if` instead of `while` to shrink; one contraction is rarely enough.',
      'Measuring the answer before restoring validity.',
      'For "shortest", record the length inside the shrink loop, not after it.',
    ],
    problems: ['Longest Substring Without Repeating Characters', 'Longest Repeating Character Replacement', 'Minimum Size Subarray Sum', 'Max Consecutive Ones III', 'Minimum Window Substring'],
  },
  {
    id: 'prefix-sum',
    name: 'Prefix Sum',
    family: 'Arrays & strings',
    visual: 'prefixSum',
    cue: 'Repeated range-sum queries, or counting subarrays that sum to a target.',
    idea: 'Store running totals so any range is one subtraction. Paired with a hash map of seen totals, "how many subarrays sum to k" becomes a single pass.',
    skeleton: `seen = {0: 1}        # empty prefix, so a whole-array match counts
running = count = 0
for n in nums:
    running += n
    count += seen.get(running - k, 0)
    seen[running] = seen.get(running, 0) + 1`,
    complexity: 'O(n) time, O(n) space.',
    traps: [
      'Omitting the `{0: 1}` seed, which loses every subarray starting at index 0.',
      'Incrementing the map before the lookup, which lets an element pair with itself.',
      'For divisibility questions, Python and C++ disagree on the sign of `%` for negatives.',
    ],
    problems: ['Range Sum Query - Immutable', 'Subarray Sum Equals K', 'Subarray Sums Divisible by K', 'Continuous Subarray Sum', 'Contiguous Array'],
  },
  {
    id: 'kadane',
    name: "Kadane's Algorithm",
    family: 'Arrays & strings',
    visual: 'kadane',
    cue: 'Maximum-sum contiguous subarray, and its circular and product variants.',
    idea: 'At each index decide one thing: extend the current run, or start fresh here. That local choice is enough for a global optimum.',
    skeleton: `best = current = nums[0]
for n in nums[1:]:
    current = max(n, current + n)   # start fresh, or extend
    best = max(best, current)`,
    complexity: 'O(n) time, O(1) space.',
    traps: [
      'Initialising `best` to 0, which breaks on all-negative input.',
      'For the product variant you must track the minimum too — a negative can become the maximum.',
      'Circular: the answer is either the plain maximum or total minus the minimum subarray; the all-negative case needs a guard.',
    ],
    problems: ['Maximum Subarray', 'Maximum Sum Circular Subarray', 'Maximum Product Subarray', 'Best Sightseeing Pair'],
  },
  {
    id: 'hash-map',
    name: 'Hashing & frequency maps',
    family: 'Arrays & strings',
    visual: 'hashmap',
    cue: 'Membership, counting, grouping, or trading space for a nested loop.',
    idea: 'A hash map turns "have I seen this" from a scan into a lookup. Most O(n^2) brute forces collapse to O(n) by remembering what you have already passed.',
    skeleton: `seen = {}
for i, n in enumerate(nums):
    if target - n in seen:
        return [seen[target - n], i]
    seen[n] = i          # store after the lookup, or n pairs with itself`,
    complexity: 'O(n) average time, O(n) space. Worst case O(n) per lookup with adversarial keys.',
    traps: [
      'Storing before looking up, so an element matches itself.',
      'Using a list as a key — tuples or sorted strings instead.',
      'Assuming iteration order; use an ordered structure if order matters.',
    ],
    problems: ['Group Anagrams', 'Longest Consecutive Sequence', 'Isomorphic Strings', 'Contains Duplicate II', 'Ransom Note'],
  },
  {
    id: 'binary-search',
    name: 'Binary Search (and on the answer)',
    family: 'Searching',
    visual: 'binarySearch',
    cue: 'A sorted array — or any question where you can test "is x good?" monotonically.',
    idea: 'Halve the search space each step. The powerful variant searches the answer space, not the array: binary search the smallest capacity, speed or size that satisfies a feasibility check.',
    skeleton: `lo, hi = min_answer, max_answer
while lo < hi:
    mid = (lo + hi) // 2
    if feasible(mid):
        hi = mid            # mid might be the answer; keep it
    else:
        lo = mid + 1
return lo`,
    complexity: 'O(log n), or O(n log range) when each feasibility check is a linear pass.',
    traps: [
      'Mixing the `lo <= hi` and `lo < hi` templates — pick one and keep it.',
      'Writing `hi = mid - 1` in the lower-bound form, which skips the answer.',
      '`(lo + hi) // 2` overflows in languages with fixed-width ints; use `lo + (hi - lo) // 2`.',
    ],
    problems: ['Search in Rotated Sorted Array', 'Find Minimum in Rotated Sorted Array', 'Koko Eating Bananas', 'Median of Two Sorted Arrays', 'Split Array Largest Sum'],
  },
  {
    id: 'monotonic-stack',
    name: 'Monotonic Stack',
    family: 'Stacks & queues',
    visual: 'monotonicStack',
    cue: '"Next greater", "previous smaller", spans, or histogram-shaped problems.',
    idea: 'Keep a stack whose values are always increasing or decreasing. Popping resolves the answer for the element being removed, so every element is pushed and popped once.',
    skeleton: `stack = []                      # indices, values decreasing
result = [-1] * len(nums)
for i, n in enumerate(nums):
    while stack and nums[stack[-1]] < n:
        result[stack.pop()] = n     # n is the next greater for that index
    stack.append(i)`,
    complexity: 'O(n) time despite the inner loop — amortised, each index moves twice.',
    traps: [
      'Storing values when you need indices to compute a width.',
      'Getting the comparison backwards: `<` gives next-greater, `>` gives next-smaller.',
      'Forgetting the sentinel that flushes the stack at the end.',
    ],
    problems: ['Daily Temperatures', 'Next Greater Element II', 'Largest Rectangle in Histogram', 'Trapping Rain Water', 'Remove K Digits'],
  },
  {
    id: 'heap',
    name: 'Heaps / Top-K',
    family: 'Stacks & queues',
    visual: 'heap',
    cue: '"Top k", "k-th largest", "merge k sorted", or a running median.',
    idea: 'A heap of size k gives the k best in O(n log k) without sorting everything. Two heaps facing each other maintain a median in O(log n).',
    skeleton: `import heapq
heap = []                       # min-heap of size k
for n in nums:
    heapq.heappush(heap, n)
    if len(heap) > k:
        heapq.heappop(heap)     # evict the smallest
return heap[0]                  # k-th largest`,
    complexity: 'O(n log k) time, O(k) space.',
    traps: [
      'Using a max-heap for k-th largest; you want a min-heap of size k.',
      'Python only has a min-heap — negate values for max behaviour.',
      'Quickselect gives O(n) average if the interviewer pushes past the heap answer.',
    ],
    problems: ['Kth Largest Element in an Array', 'Top K Frequent Elements', 'Merge k Sorted Lists', 'Find Median from Data Stream', 'Task Scheduler'],
  },
  {
    id: 'intervals',
    name: 'Intervals',
    family: 'Sorting & greedy',
    visual: 'intervals',
    cue: 'Meetings, bookings, ranges — merging, inserting, or counting overlaps.',
    idea: 'Sort by start, then sweep. Overlap is exactly `current.start <= previous.end`. For "how many at once", sweep start and end events separately.',
    skeleton: `intervals.sort(key=lambda x: x[0])
merged = [intervals[0]]
for start, end in intervals[1:]:
    if start <= merged[-1][1]:
        merged[-1][1] = max(merged[-1][1], end)   # overlap: extend
    else:
        merged.append([start, end])`,
    complexity: 'O(n log n) for the sort, O(n) sweep.',
    traps: [
      'Sorting by end when the question needs start (or the reverse, for non-overlapping counts).',
      'Assuming the merged end is the new end — take the max.',
      'Deciding whether touching intervals [1,2] and [2,3] count as overlapping; ask.',
    ],
    problems: ['Merge Intervals', 'Insert Interval', 'Non-overlapping Intervals', 'Meeting Rooms II', 'Minimum Number of Arrows to Burst Balloons'],
  },
  {
    id: 'linked-list',
    name: 'Linked lists — fast & slow pointers',
    family: 'Linked structures',
    visual: 'fastSlow',
    cue: 'Cycle detection, finding the middle, or the n-th node from the end.',
    idea: 'Two pointers at different speeds. Fast covers twice the ground, so when it ends slow is at the midpoint; in a cycle they must eventually meet.',
    skeleton: `slow = fast = head
while fast and fast.next:
    slow = slow.next
    fast = fast.next.next
    if slow is fast:
        break              # cycle found`,
    complexity: 'O(n) time, O(1) space — the reason this beats a hash set.',
    traps: [
      'Not guarding both `fast` and `fast.next` before stepping.',
      'Confusing the meeting point with the cycle start — reset one pointer to head and step both once each.',
      'Losing the list by reversing without keeping the previous pointer.',
    ],
    problems: ['Linked List Cycle', 'Linked List Cycle II', 'Middle of the Linked List', 'Reverse Linked List', 'Reorder List'],
  },
  {
    id: 'tree-traversal',
    name: 'Tree traversal (DFS & BFS)',
    family: 'Trees',
    visual: 'tree',
    cue: 'Anything on a binary tree: depth, paths, level order, validation.',
    idea: 'DFS recursion for anything defined in terms of subtrees; BFS with a queue for anything defined by level. In a BST, in-order traversal yields sorted values.',
    skeleton: `def dfs(node):
    if not node:
        return 0
    left, right = dfs(node.left), dfs(node.right)
    return 1 + max(left, right)     # combine children

# level order
q = deque([root])
while q:
    for _ in range(len(q)):         # freeze the level size first
        node = q.popleft()
        q.extend(filter(None, (node.left, node.right)))`,
    complexity: 'O(n) time; O(h) space for DFS recursion, O(width) for BFS.',
    traps: [
      'Not freezing `len(q)` before the inner loop, which mixes levels.',
      'Validating a BST against the parent only — pass down (low, high) bounds.',
      'Recursion depth on a skewed tree; mention the iterative form.',
    ],
    problems: ['Binary Tree Level Order Traversal', 'Validate Binary Search Tree', 'Lowest Common Ancestor of a Binary Tree', 'Diameter of Binary Tree', 'Serialize and Deserialize Binary Tree'],
  },
  {
    id: 'graph-traversal',
    name: 'Graphs — BFS, DFS, union-find',
    family: 'Graphs',
    visual: 'graph',
    cue: 'Grids, islands, connectivity, shortest path on an unweighted graph.',
    idea: 'BFS gives the shortest path when every edge costs the same. DFS suits connectivity and component counting. Union-find answers "same group?" incrementally.',
    skeleton: `q = deque([start]); seen = {start}; steps = 0
while q:
    for _ in range(len(q)):
        node = q.popleft()
        if node == goal: return steps
        for nxt in neighbours(node):
            if nxt not in seen:
                seen.add(nxt); q.append(nxt)
    steps += 1`,
    complexity: 'O(V + E). On an R x C grid that is O(R*C).',
    traps: [
      'Marking visited on pop rather than on push, which queues duplicates.',
      'Using DFS for shortest path on an unweighted graph — it does not give one.',
      'Forgetting union-find needs both path compression and union by rank to stay near O(1).',
    ],
    problems: ['Number of Islands', 'Rotting Oranges', 'Course Schedule', 'Word Ladder', 'Number of Connected Components'],
  },
  {
    id: 'topological-sort',
    name: 'Topological Sort',
    family: 'Graphs',
    visual: 'topo',
    cue: 'Ordering with prerequisites, build dependencies, or detecting a cycle in a DAG.',
    idea: "Repeatedly take nodes with no remaining prerequisites (Kahn's algorithm). If you cannot empty the graph, a cycle exists.",
    skeleton: `indeg = Counter()
q = deque(n for n in nodes if indeg[n] == 0)
order = []
while q:
    n = q.popleft(); order.append(n)
    for m in adj[n]:
        indeg[m] -= 1
        if indeg[m] == 0:
            q.append(m)
return order if len(order) == len(nodes) else []   # short means a cycle`,
    complexity: 'O(V + E).',
    traps: [
      'Building the edge direction backwards — "a before b" is an edge a → b.',
      'Not checking the final length, which silently returns a partial order on a cyclic graph.',
    ],
    problems: ['Course Schedule', 'Course Schedule II', 'Alien Dictionary', 'Minimum Height Trees', 'Sequence Reconstruction'],
  },
  {
    id: 'backtracking',
    name: 'Backtracking',
    family: 'Recursion',
    visual: 'backtracking',
    cue: '"All combinations", "all permutations", subsets, N-Queens, sudoku.',
    idea: 'Build a candidate one choice at a time; when it cannot lead anywhere, undo the last choice and try the next. The undo is the pattern.',
    skeleton: `def backtrack(start, path):
    if <complete>:
        result.append(path[:])      # copy, not the live list
        return
    for i in range(start, len(choices)):
        if i > start and choices[i] == choices[i-1]:
            continue                # skip duplicates at this level
        path.append(choices[i])
        backtrack(i + 1, path)
        path.pop()                  # undo`,
    complexity: 'Exponential by nature — O(2^n) for subsets, O(n!) for permutations. Pruning is what makes it tractable.',
    traps: [
      'Appending `path` rather than a copy, so every result aliases the same list.',
      'Forgetting the pop, which leaks state into sibling branches.',
      'Sorting first is what makes duplicate-skipping possible.',
    ],
    problems: ['Subsets', 'Permutations', 'Combination Sum', 'Word Search', 'N-Queens'],
  },
  {
    id: 'dp-1d',
    name: 'Dynamic Programming — 1D',
    family: 'Dynamic programming',
    visual: 'dp1d',
    cue: 'Counting ways, min cost to reach the end, or a choice at every index.',
    idea: 'Define what `dp[i]` means in one sentence before writing anything. Then the recurrence usually falls out of "what were my options at i?".',
    skeleton: `dp = [0] * (n + 1)
dp[0] = base
for i in range(1, n + 1):
    dp[i] = best(dp[i-1] + cost_a, dp[i-2] + cost_b)
return dp[n]`,
    complexity: 'O(n) time, O(n) space — often reducible to O(1) by keeping two variables.',
    traps: [
      'Starting to code before stating what dp[i] means; almost every DP failure begins here.',
      'Off-by-one between dp indices and array indices.',
      'Missing the base case for an empty input.',
    ],
    problems: ['Climbing Stairs', 'House Robber', 'Coin Change', 'Longest Increasing Subsequence', 'Word Break'],
  },
  {
    id: 'dp-2d',
    name: 'Dynamic Programming — 2D & knapsack',
    family: 'Dynamic programming',
    visual: 'dp2d',
    cue: 'Two sequences, a grid, or a capacity constraint.',
    idea: 'dp[i][j] relates a prefix of one input to a prefix of the other. Grid paths, edit distance and knapsack are all the same table with different transitions.',
    skeleton: `for i in range(1, m + 1):
    for j in range(1, n + 1):
        if a[i-1] == b[j-1]:
            dp[i][j] = dp[i-1][j-1] + 1
        else:
            dp[i][j] = max(dp[i-1][j], dp[i][j-1])`,
    complexity: 'O(m*n) time and space; usually reducible to one or two rows.',
    traps: [
      'Iterating capacity forwards in 0/1 knapsack, which reuses an item — go backwards.',
      'Confusing subsequence (not contiguous) with substring (contiguous).',
    ],
    problems: ['Unique Paths', 'Longest Common Subsequence', 'Edit Distance', 'Partition Equal Subset Sum', 'Target Sum'],
  },
  {
    id: 'trie',
    name: 'Trie',
    family: 'Trees',
    visual: 'trie',
    cue: 'Prefix queries, autocomplete, word search on a board, dictionary matching.',
    idea: 'A tree keyed by character, so a prefix lookup costs the length of the prefix rather than the size of the dictionary.',
    skeleton: `class Node:
    def __init__(self):
        self.kids = {}
        self.end = False

def insert(root, word):
    node = root
    for ch in word:
        node = node.kids.setdefault(ch, Node())
    node.end = True`,
    complexity: 'O(L) per insert or lookup; O(total characters) space.',
    traps: [
      'Forgetting the terminal flag, so prefixes match as whole words.',
      'On Word Search II, not pruning exhausted branches — the trie is what makes it fast.',
    ],
    problems: ['Implement Trie', 'Word Search II', 'Design Add and Search Words', 'Replace Words', 'Longest Word in Dictionary'],
  },
  {
    id: 'bit-manipulation',
    name: 'Bit Manipulation',
    family: 'Maths & bits',
    visual: 'bits',
    cue: 'Pairs that cancel, subsets encoded as masks, or an explicit no-extra-space constraint.',
    idea: 'XOR cancels equal values and is its own inverse. `n & (n-1)` clears the lowest set bit. A bitmask represents a subset in one integer.',
    skeleton: `missing = 0
for n in nums:
    missing ^= n            # pairs cancel, the loner survives

count = 0
while n:
    n &= n - 1              # clear lowest set bit
    count += 1`,
    complexity: 'O(n) or O(number of set bits); O(1) space.',
    traps: [
      "Python's ints are unbounded — masking with 0xFFFFFFFF is needed for 32-bit behaviour.",
      'Shifting a signed value right in Java or C++ has implementation-defined behaviour.',
    ],
    problems: ['Single Number', 'Number of 1 Bits', 'Counting Bits', 'Reverse Bits', 'Sum of Two Integers'],
  },
  {
    id: 'matrix',
    name: 'Matrix (2D array)',
    family: 'Arrays & strings',
    visual: 'matrix',
    cue: 'Rotations, spirals, in-place marking, or neighbour scans on a grid.',
    idea: 'Most grid questions are index arithmetic plus a boundary discipline. Rotation is transpose then reverse; in-place marking uses the first row and column as flags.',
    skeleton: `# rotate 90 clockwise, in place
matrix[:] = [list(row) for row in zip(*matrix[::-1])]

# four-directional neighbours
for dr, dc in ((1,0), (-1,0), (0,1), (0,-1)):
    r, c = row + dr, col + dc
    if 0 <= r < R and 0 <= c < C:
        ...`,
    complexity: 'O(R*C) time; O(1) space when marking in place.',
    traps: [
      'Mixing up row and column order in the bounds check.',
      'Using a sentinel value that can legitimately appear in the input.',
    ],
    problems: ['Spiral Matrix', 'Rotate Image', 'Set Matrix Zeroes', 'Valid Sudoku', 'Game of Life'],
  },
];

export const patterns = () => PATTERNS.map(p => ({ ...p }));
export const pattern = id => PATTERNS.find(p => p.id === id) || null;

export function families() {
  const out = new Map();
  for (const p of PATTERNS) {
    if (!out.has(p.family)) out.set(p.family, []);
    out.get(p.family).push({ id: p.id, name: p.name, cue: p.cue });
  }
  return [...out.entries()].map(([family, items]) => ({ family, items }));
}
