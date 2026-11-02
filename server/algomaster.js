/**
 * The AlgoMaster 300 — the curated problem list from
 * https://algomaster.io/practice/dsa-patterns, 300 problems across 61
 * sections. Each section is tied to the pattern in the catalogue that best
 * explains it, where one exists, so a problem row can jump to its pattern.
 *
 * Titles are LeetCode titles verbatim. They are resolved against the local
 * question set at request time, so the ones we hold open in the coding tab.
 */

// group · section · pattern id (or null) · problems as [title, difficulty]
const S = (group, section, pattern, problems) => ({
  section, group, pattern,
  problems: problems.map(([title, difficulty]) => ({ title, difficulty })),
});

const SECTIONS = [
  S('Arrays & strings', 'Arrays', null, [
    ['Move Zeroes', 'Easy'], ['Majority Element', 'Easy'], ['Remove Duplicates from Sorted Array', 'Easy'],
    ['Best Time to Buy and Sell Stock', 'Easy'], ['Rotate Array', 'Medium'], ['Product of Array Except Self', 'Medium'],
    ['Best Time to Buy and Sell Stock II', 'Medium'], ['Number of Zero-Filled Subarrays', 'Medium'],
    ['Increasing Triplet Subsequence', 'Medium'], ['First Missing Positive', 'Hard'],
  ]),
  S('Arrays & strings', 'Strings', 'two-pointers', [
    ['Is Subsequence', 'Easy'], ['Valid Palindrome', 'Easy'], ['Longest Common Prefix', 'Easy'],
    ['Zigzag Conversion', 'Medium'], ['Reverse Words in a String', 'Medium'], ['Guess the Word', 'Hard'],
  ]),
  S('Arrays & strings', 'Bit Manipulation', 'bit-manipulation', [
    ['Single Number', 'Easy'], ['Number of 1 Bits', 'Easy'], ['Counting Bits', 'Easy'], ['Reverse Bits', 'Easy'],
    ['Bitwise AND of Numbers Range', 'Medium'], ['Single Number III', 'Medium'], ['Sum of Two Integers', 'Medium'],
  ]),
  S('Arrays & strings', 'Hash Tables', 'hash-map', [
    ['Design HashMap', 'Easy'], ['Maximum Number of Balloons', 'Easy'], ['Number of Good Pairs', 'Easy'],
    ['Isomorphic Strings', 'Easy'], ['Ransom Note', 'Easy'], ['Contains Duplicate II', 'Easy'],
    ['Group Anagrams', 'Medium'], ['Encode and Decode TinyURL', 'Medium'], ['Reorganize String', 'Medium'],
    ['Longest Consecutive Sequence', 'Medium'], ['Split Array into Consecutive Subsequences', 'Medium'],
    ['Number of Matching Subsequences', 'Medium'], ['Number of Good Ways to Split a String', 'Medium'],
  ]),
  S('Arrays & strings', 'Two Pointers', 'two-pointers', [
    ['Merge Sorted Array', 'Easy'], ['Two Sum II - Input Array Is Sorted', 'Medium'],
    ['Container With Most Water', 'Medium'], ['3Sum', 'Medium'], ['Trapping Rain Water', 'Hard'],
  ]),
  S('Arrays & strings', 'Prefix Sum', 'prefix-sum', [
    ['Range Sum Query - Immutable', 'Easy'], ['Subarray Sum Equals K', 'Medium'],
    ['Subarray Sums Divisible by K', 'Medium'], ['Continuous Subarray Sum', 'Medium'], ['Contiguous Array', 'Medium'],
  ]),
  S('Arrays & strings', 'Sliding Window - Fixed Size', 'sliding-window-fixed', [
    ['Maximum Average Subarray I', 'Easy'], ['Find All Anagrams in a String', 'Medium'],
    ['Permutation in String', 'Medium'], ['Maximum Sum of Distinct Subarrays With Length K', 'Medium'],
    ['Substring with Concatenation of All Words', 'Hard'],
  ]),
  S('Arrays & strings', 'Sliding Window - Dynamic Size', 'sliding-window-dynamic', [
    ['Longest Substring Without Repeating Characters', 'Medium'], ['Longest Repeating Character Replacement', 'Medium'],
    ['Minimum Size Subarray Sum', 'Medium'], ['Max Consecutive Ones III', 'Medium'], ['Minimum Window Substring', 'Hard'],
  ]),
  S('Arrays & strings', "Kadane's Algorithm", 'kadane', [
    ['Maximum Subarray', 'Medium'], ['Maximum Sum Circular Subarray', 'Medium'],
    ['Maximum Product Subarray', 'Medium'], ['Best Sightseeing Pair', 'Medium'],
  ]),
  S('Arrays & strings', 'Matrix (2D Array)', 'matrix', [
    ['Spiral Matrix', 'Medium'], ['Rotate Image', 'Medium'], ['Set Matrix Zeroes', 'Medium'],
    ['Valid Sudoku', 'Medium'], ['Game of Life', 'Medium'],
  ]),

  S('Linked lists', 'Linked List', 'linked-list', [
    ['Intersection of Two Linked Lists', 'Easy'], ['Design Linked List', 'Medium'],
    ['Remove Nth Node From End of List', 'Medium'], ['Remove Duplicates from Sorted List II', 'Medium'],
    ['Swap Nodes in Pairs', 'Medium'], ['Copy List with Random Pointer', 'Medium'], ['Partition List', 'Medium'],
    ['Rotate List', 'Medium'], ['Add Two Numbers', 'Medium'], ['Flatten a Multilevel Doubly Linked List', 'Medium'],
  ]),
  S('Linked lists', 'LinkedList In-place Reversal', 'linked-list', [
    ['Palindrome Linked List', 'Easy'], ['Reverse Linked List', 'Easy'],
    ['Reverse Linked List II', 'Medium'], ['Reverse Nodes in k-Group', 'Hard'],
  ]),
  S('Linked lists', 'Fast and Slow Pointers', 'linked-list', [
    ['Middle of the Linked List', 'Easy'], ['Happy Number', 'Easy'], ['Linked List Cycle II', 'Medium'],
  ]),

  S('Stacks & queues', 'Stacks', null, [
    ['Valid Parentheses', 'Easy'], ['Remove All Adjacent Duplicates In String', 'Easy'], ['Min Stack', 'Medium'],
    ['Remove Duplicate Letters', 'Medium'], ['Removing Stars From a String', 'Medium'],
    ['Evaluate Reverse Polish Notation', 'Medium'], ['Basic Calculator II', 'Medium'], ['Longest Valid Parentheses', 'Hard'],
  ]),
  S('Stacks & queues', 'Monotonic Stack', 'monotonic-stack', [
    ['Next Greater Element I', 'Easy'], ['Daily Temperatures', 'Medium'], ['Online Stock Span', 'Medium'],
    ['132 Pattern', 'Medium'], ['Number of Visible People in a Queue', 'Hard'], ['Largest Rectangle in Histogram', 'Hard'],
  ]),
  S('Stacks & queues', 'Queues', null, [
    ['Number of Recent Calls', 'Easy'], ['Time Needed to Buy Tickets', 'Easy'], ['Reveal Cards In Increasing Order', 'Medium'],
  ]),
  S('Stacks & queues', 'Monotonic Queue', 'monotonic-stack', [
    ['Jump Game VI', 'Medium'],
    ['Longest Continuous Subarray With Absolute Diff Less Than or Equal to Limit', 'Medium'],
    ['Sliding Window Maximum', 'Hard'], ['Max Value of Equation', 'Hard'],
  ]),

  S('Sorting & searching', 'Bucket Sort', 'heap', [
    ['Sort Characters By Frequency', 'Medium'], ['Top K Frequent Words', 'Medium'], ['Maximum Gap', 'Medium'],
  ]),
  S('Sorting & searching', 'Recursion', null, [
    ['Merge Two Sorted Lists', 'Easy'], ['Pow(x, n)', 'Medium'], ['Decode String', 'Medium'],
  ]),
  S('Sorting & searching', 'Divide and Conquer', null, [
    ['Convert Sorted List to Binary Search Tree', 'Medium'], ['Construct Quad Tree', 'Medium'], ['Maximum Binary Tree', 'Medium'],
  ]),
  S('Sorting & searching', 'Merge Sort', null, [
    ['Sort List', 'Medium'], ['Reverse Pairs', 'Hard'],
  ]),
  S('Sorting & searching', 'QuickSort / QuickSelect', 'heap', [
    ['Sort Colors', 'Medium'], ['Kth Largest Element in an Array', 'Medium'],
  ]),
  S('Sorting & searching', 'Binary Search', 'binary-search', [
    ['Search Insert Position', 'Easy'], ['Find First and Last Position of Element in Sorted Array', 'Medium'],
    ['Search in Rotated Sorted Array', 'Medium'], ['Find Peak Element', 'Medium'], ['Random Pick with Weight', 'Medium'],
    ['Koko Eating Bananas', 'Medium'], ['Find Minimum in Rotated Sorted Array', 'Medium'], ['Search a 2D Matrix', 'Medium'],
    ['Find in Mountain Array', 'Hard'], ['Median of Two Sorted Arrays', 'Hard'],
  ]),
  S('Sorting & searching', 'Backtracking', 'backtracking', [
    ['Generate Parentheses', 'Medium'], ['Permutations', 'Medium'], ['Subsets', 'Medium'], ['Combination Sum', 'Medium'],
    ['Combination Sum II', 'Medium'], ['Letter Combinations of a Phone Number', 'Medium'],
    ['Palindrome Partitioning', 'Medium'], ['N-Queens', 'Hard'],
  ]),

  S('Trees', 'Tree Traversal - Level Order', 'tree-traversal', [
    ['Binary Tree Level Order Traversal', 'Medium'], ['Binary Tree Right Side View', 'Medium'],
    ['Binary Tree Zigzag Level Order Traversal', 'Medium'], ['Populating Next Right Pointers in Each Node II', 'Medium'],
    ['Maximum Width of Binary Tree', 'Medium'],
  ]),
  S('Trees', 'Tree Traversal - Pre Order', 'tree-traversal', [
    ['Binary Tree Preorder Traversal', 'Easy'], ['Same Tree', 'Easy'], ['Symmetric Tree', 'Easy'], ['Binary Tree Paths', 'Easy'],
    ['Convert Sorted Array to Binary Search Tree', 'Easy'], ['Count Complete Tree Nodes', 'Easy'], ['Path Sum III', 'Medium'],
    ['Maximum Difference Between Node and Ancestor', 'Medium'],
    ['Construct Binary Tree from Preorder and Inorder Traversal', 'Medium'],
    ['Construct Binary Tree from Inorder and Postorder Traversal', 'Medium'], ['Serialize and Deserialize Binary Tree', 'Hard'],
  ]),
  S('Trees', 'Tree Traversal - In Order', 'tree-traversal', [
    ['Binary Tree Inorder Traversal', 'Easy'], ['Minimum Distance Between BST Nodes', 'Easy'],
    ['Minimum Absolute Difference in BST', 'Easy'], ['Validate Binary Search Tree', 'Medium'],
    ['Kth Smallest Element in a BST', 'Medium'], ['Binary Search Tree Iterator', 'Medium'],
  ]),
  S('Trees', 'Tree Traversal - Post-Order', 'tree-traversal', [
    ['Binary Tree Postorder Traversal', 'Easy'], ['Invert Binary Tree', 'Easy'], ['Diameter of Binary Tree', 'Easy'],
    ['Delete Nodes And Return Forest', 'Medium'], ['Lowest Common Ancestor of a Binary Tree', 'Medium'],
    ['Find Duplicate Subtrees', 'Medium'], ['Flatten Binary Tree to Linked List', 'Medium'],
    ['Distribute Coins in Binary Tree', 'Medium'], ['Binary Tree Maximum Path Sum', 'Hard'],
  ]),
  S('Trees', 'BST / Ordered Set', 'tree-traversal', [
    ['Trim a Binary Search Tree', 'Medium'], ['My Calendar I', 'Medium'], ['My Calendar II', 'Medium'],
    ['Stock Price Fluctuation', 'Medium'],
  ]),
  S('Trees', 'Tries', 'trie', [
    ['Implement Trie (Prefix Tree)', 'Medium'], ['Design Add and Search Words Data Structure', 'Medium'],
    ['Search Suggestions System', 'Medium'], ['Longest Word in Dictionary', 'Medium'],
    ['Maximum XOR of Two Numbers in an Array', 'Medium'], ['Word Search II', 'Hard'],
  ]),

  S('Heaps & intervals', 'Heaps', 'heap', [
    ['Furthest Building You Can Reach', 'Medium'], ['Single-Threaded CPU', 'Medium'], ['Process Tasks Using Servers', 'Medium'],
  ]),
  S('Heaps & intervals', 'Two Heaps', 'heap', [
    ['Find Median from Data Stream', 'Hard'], ['IPO', 'Hard'], ['Sliding Window Median', 'Hard'],
  ]),
  S('Heaps & intervals', 'Top K Elements', 'heap', [
    ['Kth Largest Element in a Stream', 'Easy'], ['Top K Frequent Elements', 'Medium'], ['K Closest Points to Origin', 'Medium'],
  ]),
  S('Heaps & intervals', 'Intervals', 'intervals', [
    ['Merge Intervals', 'Medium'], ['Insert Interval', 'Medium'], ['Minimum Number of Arrows to Burst Balloons', 'Medium'],
    ['Maximum Number of Events That Can Be Attended', 'Medium'], ['Non-overlapping Intervals', 'Medium'],
  ]),
  S('Heaps & intervals', 'K-Way Merge', 'heap', [
    ['Find K Pairs with Smallest Sums', 'Medium'], ['Kth Smallest Element in a Sorted Matrix', 'Medium'],
    ['Merge k Sorted Lists', 'Hard'], ['Smallest Range Covering Elements from K Lists', 'Hard'],
  ]),
  S('Heaps & intervals', 'Data Structure Design', 'hash-map', [
    ['Design Browser History', 'Medium'], ['Time Based Key-Value Store', 'Medium'], ['Snapshot Array', 'Medium'],
    ['Design Twitter', 'Medium'], ['LRU Cache', 'Medium'], ['Insert Delete GetRandom O(1)', 'Medium'],
    ['Design a Food Rating System', 'Medium'], ['Maximum Frequency Stack', 'Hard'],
  ]),
  S('Heaps & intervals', 'Greedy', null, [
    ['Jump Game II', 'Medium'], ['Minimum Add to Make Parentheses Valid', 'Medium'], ['Gas Station', 'Medium'],
    ['Task Scheduler', 'Medium'], ['Minimum Cost to Hire K Workers', 'Hard'], ['Candy', 'Hard'],
    ['Minimum Number of Refueling Stops', 'Hard'],
  ]),

  S('Graphs', 'Depth First Search (DFS)', 'graph-traversal', [
    ['Number of Islands', 'Medium'], ['Time Needed to Inform All Employees', 'Medium'],
    ['All Paths From Source to Target', 'Medium'], ['Clone Graph', 'Medium'], ['Is Graph Bipartite?', 'Medium'],
    ['All Nodes Distance K in Binary Tree', 'Medium'], ['Employee Importance', 'Medium'], ['Surrounded Regions', 'Medium'],
    ['Pacific Atlantic Water Flow', 'Medium'], ['Making A Large Island', 'Hard'],
  ]),
  S('Graphs', 'Breadth First Search (BFS)', 'graph-traversal', [
    ['Rotting Oranges', 'Medium'], ['01 Matrix', 'Medium'], ['Open the Lock', 'Medium'],
    ['Shortest Path in a Grid with Obstacles Elimination', 'Hard'], ['Bus Routes', 'Hard'], ['Word Ladder', 'Hard'],
  ]),
  S('Graphs', 'Topological Sort', 'topological-sort', [
    ['Course Schedule II', 'Medium'], ['Find Eventual Safe States', 'Medium'], ['Minimum Height Trees', 'Medium'],
    ['Sort Items by Groups Respecting Dependencies', 'Hard'],
  ]),
  S('Graphs', 'Union Find', 'graph-traversal', [
    ['Number of Provinces', 'Medium'], ['Redundant Connection', 'Medium'], ['Accounts Merge', 'Medium'],
    ['Minimize Malware Spread', 'Hard'],
  ]),
  S('Graphs', 'Minimum Spanning Tree', 'graph-traversal', [
    ['Min Cost to Connect All Points', 'Medium'],
  ]),
  S('Graphs', 'Shortest Path', 'graph-traversal', [
    ['Network Delay Time', 'Medium'], ['Cheapest Flights Within K Stops', 'Medium'],
    ['Path with Maximum Probability', 'Medium'], ['Path With Minimum Effort', 'Medium'], ['Swim in Rising Water', 'Hard'],
  ]),
  S('Graphs', 'Eulerian Circuit', 'graph-traversal', [
    ['Reconstruct Itinerary', 'Hard'], ['Cracking the Safe', 'Hard'],
  ]),

  S('Dynamic programming', '1-D DP', 'dp-1d', [
    ['Climbing Stairs', 'Easy'], ['Min Cost Climbing Stairs', 'Easy'], ['House Robber', 'Medium'], ['House Robber II', 'Medium'],
  ]),
  S('Dynamic programming', '0/1 Knapsack', 'dp-2d', [
    ['Partition Equal Subset Sum', 'Medium'], ['Target Sum', 'Medium'], ['Last Stone Weight II', 'Medium'],
  ]),
  S('Dynamic programming', 'Unbounded Knapsack', 'dp-2d', [
    ['Coin Change', 'Medium'], ['Coin Change II', 'Medium'], ['Perfect Squares', 'Medium'],
  ]),
  S('Dynamic programming', 'Longest Increasing Subsequence (LIS)', 'dp-1d', [
    ['Longest Increasing Subsequence', 'Medium'], ['Number of Longest Increasing Subsequence', 'Medium'],
    ['Russian Doll Envelopes', 'Hard'],
  ]),
  S('Dynamic programming', '2D Grid DP', 'dp-2d', [
    ['Unique Paths II', 'Medium'], ['Minimum Path Sum', 'Medium'], ['Triangle', 'Medium'],
    ['Count Square Submatrices with All Ones', 'Medium'], ['Maximum Number of Points with Cost', 'Medium'],
    ['Maximum Profit in Job Scheduling', 'Hard'], ['Burst Balloons', 'Hard'], ['Cherry Pickup', 'Hard'],
    ['Longest Increasing Path in a Matrix', 'Hard'],
  ]),
  S('Dynamic programming', 'String DP', 'dp-2d', [
    ['Longest Common Subsequence', 'Medium'], ['Longest Palindromic Subsequence', 'Medium'], ['Edit Distance', 'Medium'],
    ['Decode Ways', 'Medium'], ['Word Break', 'Medium'], ['Interleaving String', 'Medium'],
    ['Wildcard Matching', 'Hard'], ['Distinct Subsequences', 'Hard'], ['Palindrome Partitioning II', 'Hard'],
  ]),
  S('Dynamic programming', 'Tree / Graph DP', 'tree-traversal', [
    ['House Robber III', 'Medium'], ['Unique Binary Search Trees II', 'Medium'],
    ['Number of Ways to Arrive at Destination', 'Medium'], ['Binary Tree Cameras', 'Hard'], ['Sum of Distances in Tree', 'Hard'],
  ]),
  S('Dynamic programming', 'Bitmask DP', 'bit-manipulation', [
    ['Minimum Number of Work Sessions to Finish the Tasks', 'Medium'], ['Fair Distribution of Cookies', 'Medium'],
    ['Shortest Path Visiting All Nodes', 'Hard'],
  ]),
  S('Dynamic programming', 'Digit DP', null, [
    ['Count Numbers with Unique Digits', 'Medium'], ['Number of Digit One', 'Hard'], ['Numbers At Most N Given Digit Set', 'Hard'],
  ]),
  S('Dynamic programming', 'Probability DP', null, [
    ['Knight Probability in Chessboard', 'Medium'], ['Soup Servings', 'Medium'], ['New 21 Game', 'Medium'],
  ]),
  S('Dynamic programming', 'State Machine DP', 'dp-1d', [
    ['Best Time to Buy and Sell Stock with Cooldown', 'Medium'], ['Best Time to Buy and Sell Stock III', 'Hard'],
  ]),

  S('Maths & advanced', 'Maths / Geometry', null, [
    ['Palindrome Number', 'Easy'], ['Reverse Integer', 'Medium'], ['Factorial Trailing Zeroes', 'Medium'],
    ['Valid Square', 'Medium'], ['Minimum Area Rectangle II', 'Medium'], ['Max Points on a Line', 'Hard'],
  ]),
  S('Maths & advanced', 'String Matching', null, [
    ['Repeated String Match', 'Medium'], ['Shortest Palindrome', 'Hard'], ['Longest Duplicate Substring', 'Hard'],
  ]),
  S('Maths & advanced', 'Binary Indexed Tree / Segment Tree', null, [
    ['Range Sum Query - Mutable', 'Medium'], ['Count of Smaller Numbers After Self', 'Hard'],
  ]),
  S('Maths & advanced', 'Line Sweep', 'intervals', [
    ['Minimum Interval to Include Each Query', 'Hard'], ['The Skyline Problem', 'Hard'],
  ]),
];

export const sections = () => SECTIONS.map(s => ({ ...s, problems: s.problems.map(p => ({ ...p })) }));
export const problems = () => SECTIONS.flatMap(s => s.problems.map(p => ({ ...p, section: s.section, pattern: s.pattern })));
export const forPattern = id => SECTIONS.filter(s => s.pattern === id).flatMap(s => s.problems.map(p => p.title));
