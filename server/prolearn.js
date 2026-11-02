/**
 * Pro-Learn: a Confluence-style curriculum covering the topics in
 * algo.monster's syllabus (https://algo.monster/problems/interview-process).
 *
 * Only the table of contents is taken from there — the titles of the topics a
 * Google-style loop expects you to know. Every article body is written here on
 * demand by the model, in this app's own voice, and cached on disk so each is
 * written once and then read forever.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FileStore } from './cache/fileStore.js';
import { llm } from './llm/client.js';
import { UpstreamError } from './errors.js';
import { resolveTitles, question } from './questions.js';
import { idiomsIn } from './toolkit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new FileStore(process.env.PROLEARN_CACHE_DIR || path.join(__dirname, '../.cache/prolearn'));
const SCHEMA = 2;

const G = (group, articles) => ({ group, articles: articles.map(([slug, title]) => ({ slug, title })) });
const C = (chapter, groups) => ({ chapter, groups });

const CHAPTERS = [
  C("Getting Started", [
    G("Overview", [["stats", "Patterns"], ["roadmap", "Roadmap"], ["interview-process", "Interview Process"], ["getting_started", "How to Study"], ["interview-psychology", "The Mindset"], ["math-basics", "Math Basics"], ["runtime_summary", "Runtime to Algo Cheat Sheet"], ["keyword_to_algo", "Keyword to Algo Cheat Sheet"]]),
    G("Quick DSA Review", [["basic_dsa", "Basic Data Structures and Algorithms"], ["stack_intro", "Stack Intro"], ["queue_intro", "Queue Intro"], ["hashmap_intro", "Hashmap Intro"], ["data_structures_by_language", "Data Structures by Language"]]),
    G("Basic Algorithms", [["sorting_intro", "Intro to Sorting"], ["advanced_sorting", "Advanced Sorting Algorithms - Merge Sort | Quick Sort"], ["sorting_summary", "Sorting Summary"], ["custom_comparator_sort", "Built-in Sort with Custom Comparator"]]),
    G("Simulation", [["simulation_intro", "Simulation Coding Problems: Introduction and Strategies"], ["spiral_matrix", "Spiral Matrix"], ["rotate_image", "Rotate Image (Matrix Rotation In Place)"], ["game_of_life", "Game of Life (In-Place State Encoding)"]]),
    G("Google Coding Round", [["complexity_analysis", "Big-O and Complexity Analysis (Amortised, Recursion, Space)"], ["google_coding_rubric", "How Google Scores the Coding Round"], ["testing_your_code", "Testing Your Code: Edge Cases and Dry Runs"], ["clarifying_questions", "Clarifying Questions and Stating Assumptions"], ["follow_up_optimisation", "Handling Follow-ups: Scale, Streams and Memory Limits"]]),
  ]),
  C("Arrays & Hashing", [
    G("Hashing Patterns", [["hashing_patterns", "Hash Map and Set Patterns"], ["two_sum", "Two Sum (Complement Lookup)"], ["group_anagrams", "Group Anagrams (Canonical Keys)"], ["top_k_frequent", "Top K Frequent Elements (Bucket Sort)"], ["longest_consecutive_sequence", "Longest Consecutive Sequence"], ["subarray_sum_divisible_k", "Prefix Sum + Hash Map: Subarray Sums Divisible by K"], ["contiguous_array", "Contiguous Array (Balance Trick)"]]),
    G("In-Place Array Tricks", [["kadane", "Kadane's Algorithm (Maximum Subarray)"], ["dutch_national_flag", "Dutch National Flag (Sort Colors)"], ["cyclic_sort", "Cyclic Sort (Missing / Duplicate Number)"], ["first_missing_positive", "First Missing Positive"], ["boyer_moore_majority", "Boyer-Moore Majority Vote"], ["next_permutation", "Next Permutation"], ["difference_array", "Difference Array (Range Updates)"], ["prefix_sum_2d", "2D Prefix Sum (Range Sum Query 2D)"]]),
    G("Randomised", [["fisher_yates", "Fisher-Yates Shuffle"], ["reservoir_sampling", "Reservoir Sampling"], ["random_pick_with_weight", "Random Pick with Weight"], ["insert_delete_getrandom", "Insert Delete GetRandom O(1)"]]),
  ]),
  C("Strings", [
    G("Core", [["string_basics", "String Manipulation Essentials"], ["palindrome_expand_center", "Longest Palindromic Substring (Expand Around Centre)"], ["string_compression", "String Compression and Run-Length Encoding"], ["encode_decode_strings", "Encode and Decode Strings"]]),
    G("Pattern Matching", [["kmp", "KMP Algorithm (Prefix Function)"], ["rabin_karp", "Rabin-Karp and Rolling Hash"], ["z_algorithm", "Z-Algorithm"], ["manacher", "Manacher's Algorithm"], ["repeated_dna_sequences", "Repeated DNA Sequences"], ["longest_duplicate_substring", "Longest Duplicate Substring (Binary Search + Hash)"]]),
  ]),
  C("Linked List", [
    G("Fundamentals", [["linked_list_intro", "Linked List Intro and Dummy Nodes"], ["reverse_linked_list", "Reverse a Linked List (Iterative and Recursive)"], ["reverse_nodes_k_group", "Reverse Nodes in k-Group"], ["merge_two_sorted_lists", "Merge Two Sorted Lists"], ["reorder_list", "Reorder List"], ["add_two_numbers", "Add Two Numbers"]]),
    G("Advanced", [["copy_list_random_pointer", "Copy List with Random Pointer"], ["linked_list_cycle_ii", "Linked List Cycle II (Find the Entry)"], ["intersection_of_lists", "Intersection of Two Linked Lists"], ["sort_list", "Sort List (Merge Sort on a List)"]]),
  ]),
  C("Stack & Monotonic", [
    G("Stack", [["min_stack", "Min Stack"], ["valid_parentheses", "Valid Parentheses"], ["evaluate_rpn", "Evaluate Reverse Polish Notation"], ["decode_string", "Decode String"], ["asteroid_collision", "Asteroid Collision"], ["simplify_path", "Simplify Path"], ["basic_calculator", "Basic Calculator"], ["basic_calculator_ii", "Basic Calculator II"]]),
    G("Monotonic Stack", [["mono_stack_intro", "Monotonic Stack Intro"], ["next_greater_element_i", "Next Greater Element I"], ["daily_temperatures", "Daily Temperatures"], ["next_greater_element_ii", "Next Greater Element II"], ["online_stock_span", "Online Stock Span"], ["remove_k_digits", "Remove K Digits"], ["remove_duplicate_letters", "Remove Duplicate Letters (Smallest Subsequence)"], ["trapping_rain_water", "Trapping Rain Water"], ["sum_of_subarray_minimums", "Sum of Subarray Minimums (Contribution Technique)"], ["largest_rectangle_in_histogram", "Largest Rectangle in Histogram"], ["maximal_rectangle", "Maximal Rectangle"], ["pattern_132", "132 Pattern"], ["car_fleet", "Car Fleet"]]),
    G("Monotonic Queue / Deque", [["mono_queue_intro", "Monotonic Queue (Deque) Intro"], ["sliding_window_maximum", "Sliding Window Maximum"], ["shortest_subarray_sum_at_least_k", "Shortest Subarray with Sum at Least K"], ["constrained_subsequence_sum", "Constrained Subsequence Sum (DP + Deque)"], ["longest_subarray_abs_diff_limit", "Longest Subarray with Absolute Diff ≤ Limit"]]),
  ]),
  C("Binary Search", [
    G("Basics", [["binary_search_intro", "Binary Search Intro"], ["binary_search_boundary", "First True"]]),
    G("Sorted Array", [["binary-search-monotonic", "Monotonic Function"], ["binary_search_first_element_not_smaller_than_target", "First Element Not Smaller Than Target"], ["binary_search_duplicates", "First Occurrence"], ["sqrt", "Square Root Estimation"]]),
    G("Implicitly Sorted Array", [["min_in_rotated_sorted_array", "Minimum in Rotated Sorted Array"], ["peak_of_mountain_array", "Peak of Mountain Array"]]),
    G("Advanced", [["newspapers_split", "Newspapers"], ["binary_search_on_answer", "Binary Search on the Answer"], ["koko_eating_bananas", "Koko Eating Bananas"], ["capacity_to_ship_packages", "Capacity To Ship Packages Within D Days"], ["search_in_rotated_sorted_array", "Search in Rotated Sorted Array"], ["median_of_two_sorted_arrays", "Median of Two Sorted Arrays"], ["kth_smallest_pair_distance", "Find K-th Smallest Pair Distance"], ["search_2d_matrix", "Search a 2D Matrix"], ["binary_search_real_numbers", "Binary Search on Real Numbers (Precision)"]]),
    G("Speedrun", [["binary-search-speedrun", "Binary Search Speedrun"]]),
  ]),
  C("Two Pointers", [
    G("Intro", [["two_pointers_intro", "Two Pointers Introduction"]]),
    G("Core Concepts", [["two_pointers_invariants", "Understanding Invariants"], ["common_invariant_shapes", "Common Invariant Shapes"]]),
    G("Same Direction", [["same_direction_family_map", "Same Direction Family Map"], ["remove_duplicates", "Remove Duplicates"], ["middle_of_linked_list", "Middle of a Linked List"], ["move_zeros", "Move Zeros"], ["remove_nth_from_end", "Remove N-th Node from End of Linked List"]]),
    G("Opposite Direction", [["opposite_direction_family_map", "Opposite Direction Family Map"], ["two_sum_sorted", "Two Sum Sorted"], ["valid_palindrome", "Valid Palindrome"], ["container_with_most_water", "Container With Most Water"]]),
    G("Sliding Window", [["sliding_window_family_map", "Sliding Window Family Map"], ["subarray_sum_fixed", "Subarray Sum - Fixed"], ["find_all_anagrams", "Find All Anagrams in a String"], ["subarray_sum_longest", "Sliding Window - Longest"], ["longest_substring_without_repeating_characters", "Longest Substring without Repeating Characters"], ["subarray_sum_shortest", "Sliding Window - Shortest"], ["least_consecutive_cards_to_match", "Least Consecutive Cards to Match"]]),
    G("Prefix Sum", [["prefix_sum_intro", "Introduction"], ["subarray_sum", "Subarray Sum Equals Target"], ["range_sum_query_immutable", "Range Sum Query - Immutable"], ["product_of_array_except_self", "Product of Array Except Self"]]),
    G("Cycle Finding", [["fast_slow_family_map", "Fast and Slow Family Map"], ["linked_list_cycle", "Linked List Cycle"]]),
    G("Decision Making", [["two_pointers_decision_rule", "Two Pointers Decision Rule"]]),
    G("Advanced", [["minimum_window_substring", "Minimum Window Substring"], ["get_maximum_score", "Teleporter Arrays"], ["two_pointers_synthesis", "Two Pointers Synthesis"], ["three_sum", "3Sum and kSum"], ["longest_repeating_character_replacement", "Longest Repeating Character Replacement"], ["subarrays_with_k_distinct", "Subarrays with K Different Integers (Exactly K = AtMost K − AtMost K−1)"], ["max_consecutive_ones_iii", "Max Consecutive Ones III"], ["sliding_window_median", "Sliding Window Median"]]),
    G("Speedrun", [["two-pointers-speedrun", "Two Pointers Speedrun"], ["two-pointers-monster-breakdown", "Monster Breakdown | Two Pointers"]]),
  ]),
  C("Depth First Search", [
    G("Introduction", [["recursion_intro", "Recursion Intro"], ["tree_intro", "Trees"], ["dfs_intro", "DFS Intro"]]),
    G("DFS on Tree", [["dfs_on_trees_intro", "Intro"], ["tree_max_depth", "Max Depth of A Tree"], ["visible_tree_node", "Visible Tree Node"], ["balanced_binary_tree", "Balanced Binary Tree"], ["subtree_of_another_tree", "Subtree of Another Tree"], ["invert_binary_tree", "Invert Binary Tree"]]),
    G("Binary Search Tree", [["bst_intro", "Binary Search Tree Intro"], ["valid_bst", "Valid Binary Search Tree"], ["insert_into_bst", "Insert Into BST"], ["lowest_common_ancestor_on_bst", "Lowest Common Ancestor of a Binary Search Tree"]]),
    G("Advanced", [["construct-binary-tree-from-preorder-and-inorder-traversal", "Reconstruct Binary Tree from Preorder and Inorder Traversal"], ["serializing_tree", "Serializing and Deserializing Binary Tree"], ["lowest_common_ancestor", "Lowest Common Ancestor"], ["diameter_of_binary_tree", "Diameter of Binary Tree (Return One, Track Another)"], ["binary_tree_max_path_sum", "Binary Tree Maximum Path Sum"], ["path_sum_iii", "Path Sum III (Prefix Sum on a Tree)"], ["kth_smallest_in_bst", "Kth Smallest Element in a BST"], ["vertical_order_traversal", "Vertical Order Traversal"], ["all_nodes_distance_k", "All Nodes Distance K (Tree to Graph)"], ["count_complete_tree_nodes", "Count Complete Tree Nodes"], ["flatten_binary_tree", "Flatten Binary Tree to Linked List"], ["binary_lifting", "Binary Lifting (Kth Ancestor, LCA in O(log n))"]]),
    G("N-ary Trees & Rerooting", [["nary_tree", "N-ary Trees and Parent Arrays"], ["rerooting_dp", "Rerooting: Sum of Distances in Tree"], ["tree_diameter_general", "Tree Diameter (Two BFS)"]]),
  ]),
  C("Backtracking", [
    G("Combinatorial Search", [["dfs_with_states", "DFS with States"], ["backtracking", "Backtracking 1"], ["letter_combinations_of_phone_number", "Generate All Phone Number Combinations"]]),
    G("Pruning", [["backtracking_pruning", "Backtracking 1 - Pruning"], ["palindrome_partitioning", "Partition a String Into Palindromes"]]),
    G("Additional States", [["backtracking-additional-states", "Backtracking 1 - Additional States"], ["generate_parentheses", "Generate All Valid Parentheses"], ["permutations", "General All Permutations"]]),
    G("Aggregation and Memoization", [["backtracking-aggregation", "Backtracking 2 - Aggregation"], ["memoization_intro", "Memoization"], ["word_break", "Word Break"], ["decode_ways", "Num Ways to Decode a Message"], ["coin-change-backtracking", "Min Coins to Make Change"]]),
    G("Dedup", [["deduplication", "Deduplication"], ["combination_sum", "Combination Sum"]]),
    G("Additional Practices", [["subsets_backtracking", "Subsets"], ["n_queens", "N-Queens"], ["sudoku_solver", "Sudoku Solver"], ["word_search", "Word Search (Grid Backtracking)"], ["combinations", "Combinations (n choose k)"], ["restore_ip_addresses", "Restore IP Addresses"], ["expression_add_operators", "Expression Add Operators"], ["matchsticks_to_square", "Matchsticks to Square / Partition to K Equal Subsets"]]),
    G("Speedrun", [["backtracking-speedrun", "Backtracking Speedrun"]]),
  ]),
  C("Breadth First Search", [
    G("Introduction", [["bfs_intro", "BFS Intro"]]),
    G("BFS on Tree", [["binary_tree_level_order_traversal", "Binary Tree Level Order Traversal"], ["binary_tree_zig_zag_traversal", "Binary Tree ZigZag Level Order Traversal"], ["binary_tree_right_side_view", "Binary Tree Right Side View"], ["binary_tree_min_depth", "Binary Tree Min Depth"]]),
    G("BFS Variants", [["multi_source_bfs", "Multi-Source BFS (Rotting Oranges)"], ["zero_one_bfs", "0-1 BFS with a Deque"], ["bidirectional_bfs", "Bidirectional BFS"], ["bfs_with_state", "BFS with Extra State (Keys, Obstacles Eliminated)"], ["shortest_path_obstacles_elimination", "Shortest Path in a Grid with Obstacles Elimination"]]),
  ]),
  C("Graph", [
    G("Introduction", [["graph_intro", "Graph Intro"], ["graph_bfs", "BFS on Graphs"], ["graph_dfs", "DFS on Graph"], ["graph_bfs_vs_dfs", "BFS vs DFS"]]),
    G("Vanilla BFS", [["shortest_path_unweight", "Shortest Path"], ["clone_graph", "Clone Graph"]]),
    G("Matrix as Graph", [["matrix_as_graph", "Matrix as Graph"], ["flood_fill", "Flood Fill"], ["number_of_islands", "Number of Islands"], ["knight_shortest_path", "Knight Minimum Moves"], ["walls_and_gates", "Walls and Gates / Zombie in Matrix"], ["pacific_atlantic_water_flow", "Pacific Atlantic Water Flow"]]),
    G("Implicit Graph", [["word_ladder", "Word Ladder"], ["open_the_lock", "Open the Lock"], ["sliding_puzzle", "Sliding Puzzle"]]),
    G("Directed Graph / Topological Sort", [["topo_intro", "Topological Sort Intro"], ["task_scheduling", "Task Scheduling"], ["sequence_reconstruction", "Reconstructing Sequence"], ["task_scheduling_2", "Task Scheduling 2"], ["alien_dictionary", "Alien Dictionary"], ["course_schedule", "Course Schedule"]]),
    G("Weighted Graph", [["dijkstra_intro", "Dijkstra&#x27;s Algorithm | Shortest Path in a Weighted Graph"], ["network_delay_time", "Network Delay Time"], ["path_with_minimum_effort", "Path With Minimum Effort"], ["swim_in_rising_water", "Swim in Rising Water"], ["bellman_ford", "Bellman-Ford and Cheapest Flights Within K Stops"], ["floyd_warshall", "Floyd-Warshall (All-Pairs Shortest Path)"], ["a_star_search", "A* Search"]]),
    G("Minimum Spanning Tree", [["mst_intro", "Introduction to Minimum Spanning Tree"], ["mst_forest", "Minimum Spanning Tree | Forests"], ["kruskal_prim", "Kruskal vs Prim"], ["min_cost_connect_points", "Min Cost to Connect All Points"]]),
    G("Advanced Graph", [["cycle_detection", "Cycle Detection (Directed: Colours, Undirected: DSU)"], ["bipartite_graph", "Bipartite Check (Is Graph Bipartite, Possible Bipartition)"], ["tarjan_bridges", "Bridges and Articulation Points (Tarjan)"], ["strongly_connected_components", "Strongly Connected Components (Kosaraju / Tarjan)"], ["eulerian_path", "Eulerian Path (Reconstruct Itinerary, Hierholzer)"], ["evaluate_division", "Evaluate Division (Weighted Graph Queries)"], ["graph_valid_tree", "Graph Valid Tree"], ["critical_connections", "Critical Connections in a Network"]]),
    G("Speedrun", [["graph-speedrun", "Graph Speedrun - Part 1"], ["graph-speedrun2", "Graph Speedrun - Part 2"]]),
  ]),
  C("Priority Queue / Heap", [
    G("Introduction", [["heap_intro", "Heap Intro"]]),
    G("Top K", [["k_closest_points", "K Closest points"], ["merge_k_sorted_lists", "Merge K Sorted Lists"], ["kth_largest_element_in_an_array", "Kth Largest Element in an Array"], ["kth_smallest_element_in_a_sorted_matrix", "Kth Smallest Element in a Sorted Matrix"]]),
    G("Moving Best", [["reorganize_string", "Reorganize String"], ["ugly_number_ii", "Ugly Number"]]),
    G("Multiple Heaps", [["median_of_data_stream", "Median of Data Stream"], ["two_heaps_pattern", "Two Heaps Pattern"]]),
    G("K-way Merge & Scheduling", [["k_way_merge", "K-way Merge Pattern"], ["find_k_pairs_smallest_sums", "Find K Pairs with Smallest Sums"], ["smallest_range_k_lists", "Smallest Range Covering Elements from K Lists"], ["single_threaded_cpu", "Single-Threaded CPU (Event Simulation with Heaps)"], ["lazy_deletion_heap", "Lazy Deletion in Heaps"], ["top_k_frequent_words", "Top K Frequent Words"]]),
  ]),
  C("Dynamic Prog.", [
    G("Introduction", [["dynamic_programming_intro", "Dynamic Programming Intro"]]),
    G("Warmup", [["climbing_stairs", "Climbing Stairs"], ["nth_tribonacci_number", "N-th Tribonacci Number"]]),
    G("Constant Transition", [["dp_constant_transition_intro", "Constant Transition DP Introduction"], ["house_robber", "House Robber"], ["min_cost_climbing_stairs", "Min Cost Climbing Stairs"], ["minimum_cost_for_tickets", "Minimum Cost For Tickets"]]),
    G("Grid", [["dp_grid_intro", "Grid DP Introduction"], ["robot_unique_path", "Unique Paths"], ["unique_paths_ii", "Unique Paths with Obstacles"], ["minimal_path_sum", "Minimum Path Sum"], ["maximal_square", "Maximal Square"], ["triangle", "Triangle"], ["dungeon_game", "Dungeon Game"]]),
    G("Dual-Sequence", [["dp_two_sequence_intro", "Dual-Sequence DP Introduction"], ["longest_common_subsequence", "Longest Common Subsequence"], ["edit_distance", "Edit Distance"], ["delete_string", "Delete String"], ["distinct_subsequences", "Distinct Subsequences"], ["shortest_common_supersequence", "Shortest Common Supersequence"]]),
    G("Non-constant Transition", [["dp_non_constant_transition_intro", "Non-constant Transition DP Introduction"], ["longest_increasing_subsequence", "Longest Increasing Subsequence"], ["partition_array_for_maximum_sum", "Partition Array for Maximum Sum"], ["largest_divisible_subset", "Largest Divisible Subset"], ["divisor_game", "Divisor Game"]]),
    G("Knapsack, Weight-Only", [["dp_knapsack_intro", "Knapsack DP Introduction"], ["knapsack_weight_only", "Weight-Only knapsack"], ["partition_equal_subset_sum", "Partition Equal Subset Sum"], ["target_sum", "Target Sum"], ["dp_knapsack_unbounded", "Unbounded Knapsack Introduction"], ["coin_change_ii", "Coin Change II"], ["coin_change", "Coin Change, Optimization"], ["perfect_squares", "Perfect Squares"]]),
    G("Knapsack, Weight+Value", [["dp_knapsack_01", "0/1 Knapsack Introduction"], ["knapsack_intro", "0/1 Knapsack Practice Problem"], ["dp_knapsack_bounded", "Bounded Knapsack Introduction"], ["bounded_knapsack", "Bounded Knapsack"]]),
    G("Interval", [["dp_interval_intro", "Interval DP Intro"], ["palindromic_substrings", "Palindromic Substrings"], ["coin_game", "Coin Game"], ["longest_palindromic_subsequence", "Longest Palindromic Subsequence"], ["burst_balloons", "Burst Balloons"], ["minimum_cost_cut_stick", "Minimum Cost to Cut a Stick"], ["palindrome_partitioning_ii", "Palindrome Partitioning II"]]),
    G("State Machine", [["dp_state_machine_intro", "State Machine DP Introduction"], ["stock_cooldown", "Best Time to Buy and Sell Stock with Cooldown"], ["stock_k_transactions", "Best Time to Buy and Sell Stock IV"], ["paint_house", "Paint House I and II"], ["maximum_product_subarray", "Maximum Product Subarray"]]),
    G("String DP", [["regular_expression_matching", "Regular Expression Matching"], ["wildcard_matching", "Wildcard Matching"], ["interleaving_string", "Interleaving String"], ["word_break_ii", "Word Break II"]]),
    G("Digit & Probability DP", [["digit_dp", "Digit DP Introduction"], ["count_numbers_unique_digits", "Count Numbers with Unique Digits"], ["knight_probability", "Knight Probability in Chessboard"], ["new_21_game", "New 21 Game"]]),
    G("DP Optimisations", [["dp_space_optimisation", "Rolling Arrays and Space Optimisation"], ["lis_patience", "LIS in O(n log n) (Patience Sorting)"], ["russian_doll_envelopes", "Russian Doll Envelopes"], ["dp_on_sorted_intervals", "Weighted Interval Scheduling (DP + Binary Search)"]]),
    G("Topological Sort", [["dp_topological_sort_intro", "Topological Sort DP Introduction"], ["longest_increasing_path_in_a_matrix", "Longest Increasing Path in a Matrix"], ["longest_string_chain", "Longest String Chain"]]),
    G("Trees", [["tree_dp_intro", "Tree DP Introduction"], ["house_robber_iii", "House Robber III"]]),
    G("Bitmask", [["bitmask_intro", "Bitmask Introduction"], ["bitmask_dp", "Bitmask DP"], ["min_cost_to_visit_every_node", "Minimum Cost to Visit Every Node"]]),
    G("Additional Practices", [["dp-list", "DP Practice List"]]),
  ]),
  C("Adv. Data Structures", [
    G("Disjoint Set Union | Union Find", [["dsu_intro", "DSU/Union Find Fundamentals"], ["dsu_optimizations", "DSU Optimizations: Path Compression and Union by Rank"], ["dsu_problem_intro", "DSU Introductory Problem"], ["dsu_set_size", "Size of Connected Components"], ["dsu_account_merge", "Merge User Accounts"], ["number_of_connected_components", "Number of Connected Components"], ["umbristan", "Umbristan |  Reverse Union Find"]]),
    G("Trie", [["trie_intro", "Trie Introduction"], ["autocomplete", "Autocomplete"], ["prefix_count", "Prefix Count"], ["design_add_and_search_words_data_structure", "Add and Search Words Data Structure"], ["word_search_ii", "Word Search II"]]),
    G("Data Structure Design", [["lru_cache", "LRU Cache"], ["all_o_one", "All O`one Data Structure"], ["max_stack", "Max Stack"], ["design_circular_queue", "Design Circular Queue"]]),
    G("Segment Tree", [["segment_tree_intro", "Segment Tree Intro"], ["range_max", "Range max"], ["range_sum_query_mutable", "Range Sum Query - Mutable"], ["lazy_propagation", "Segment Tree with Lazy Propagation"], ["my_calendar", "My Calendar I, II, III"]]),
    G("Fenwick Tree", [["fenwick_tree_intro", "Fenwick Tree (Binary Indexed Tree) Intro"], ["fenwick_count_inversions", "Counting with a Fenwick Tree (Smaller After Self)"], ["fenwick_2d", "2D Fenwick Tree"]]),
    G("Ordered Sets & Sparse Tables", [["ordered_set", "Ordered Set / TreeMap (SortedList, bisect)"], ["contains_duplicate_iii", "Contains Duplicate III (Buckets or Ordered Set)"], ["sparse_table", "Sparse Table (Range Minimum Query)"], ["sqrt_decomposition", "Square Root Decomposition"]]),
  ]),
  C("More Techniques", [
    G("Interval", [["interval_pattern_intro", "Intervals"], ["merge_intervals", "Merge Intervals"], ["insert_interval", "Insert Interval"], ["meeting_rooms", "Meeting Rooms"], ["meeting_rooms_ii", "Meeting Rooms II"], ["non_overlapping_intervals", "Non-overlapping Intervals"], ["minimum_number_of_arrows_to_burst_balloons", "Minimum Number of Arrows to Burst Balloons"], ["partition_labels", "Partition Labels"]]),
    G("Divide and Conquer", [["divide_and_conquer_intro", "Divide and Conquer Intro"], ["skyline_problem", "The Skyline Problem"], ["count_of_smaller_numbers_after_self", "Count of Smaller Numbers After Self"], ["quickselect", "Quickselect (Kth Element in Average O(n))"], ["merge_sort_inversions", "Counting Inversions with Merge Sort"], ["reverse_pairs", "Reverse Pairs"]]),
    G("Line Sweep", [["line_sweep_intro", "Line-Sweep Introduction"], ["rectangle_area_ii", "Union Area of Rectangles"], ["car_pooling", "Car Pooling (Events Sweep)"], ["employee_free_time", "Employee Free Time"]]),
    G("Tree Traversal without Recursion", [["iterative_traversals", "Iterative Preorder, Inorder and Postorder"], ["bst_iterator", "BST Iterator (Controlled Inorder)"], ["morris_traversal", "Morris Traversal (O(1) Space)"], ["closest_bst_values_ii", "Closest BST Values II"]]),
    G("Matrix", [["sparse_matrix_multiplication", "Sparse Matrix Multiplication"], ["search_2d_matrix_ii", "Search a 2D Matrix II (Staircase Search)"]]),
    G("Design", [["design_hit_counter", "Design Hit Counter"], ["time_based_kv_store", "Time Based Key-Value Store"], ["lfu_cache", "LFU Cache"], ["design_twitter", "Design Twitter (Merge K Feeds)"], ["snapshot_array", "Snapshot Array"], ["iterator_design", "Iterator Design (Flatten Nested List, Peeking Iterator)"]]),
  ]),
  C("Greedy", [
    G("Core", [["greedy_intro", "Greedy Introduction"], ["exchange_argument", "Proving Greedy: Exchange Argument"], ["gas_station", "Gas Station"], ["jump_game", "Jump Game I and II"], ["task_scheduler", "Task Scheduler"], ["candy", "Candy (Two-Pass Greedy)"], ["boats_to_save_people", "Boats to Save People"], ["hand_of_straights", "Hand of Straights"], ["ipo", "IPO (Greedy + Heap)"], ["course_schedule_iii", "Course Schedule III (Regret Heap)"]]),
  ]),
  C("Math & Bits", [
    G("Bit Manipulation", [["bit_manipulation_intro", "Bit Manipulation Basics"], ["single_number", "Single Number (XOR Tricks)"], ["counting_bits", "Counting Bits and Brian Kernighan"], ["subsets_bitmask", "Enumerating Subsets with Bitmasks"], ["maximum_xor", "Maximum XOR of Two Numbers (Bitwise Trie)"]]),
    G("Number Theory", [["prime_sieve_intro", "Prime Sieve Intro"], ["nth_prime", "N-th prime"], ["gcd_lcm", "GCD, LCM and Euclid"], ["modular_arithmetic", "Modular Arithmetic and Fast Power"], ["combinatorics", "Combinatorics: nCr, Pascal and Modular Inverse"], ["pow_x_n", "Pow(x, n) (Binary Exponentiation)"]]),
    G("Geometry & Misc", [["geometry_basics", "Geometry Basics: Cross Product, Distance, Collinearity"], ["max_points_on_line", "Max Points on a Line"], ["rectangle_overlap", "Rectangle Overlap and Area"], ["integer_overflow", "Integer Overflow, Reverse Integer and atoi"]]),
  ]),
];

const INDEX = new Map();
for (const c of CHAPTERS) {
  for (const g of c.groups) {
    for (const a of g.articles) INDEX.set(a.slug, { ...a, chapter: c.chapter, group: g.group });
  }
}

/** Reading order, so an article can offer "next" without the client knowing the tree. */
const ORDER = [...INDEX.keys()];

/**
 * Which topics are practice problems (built by scripts/build-prolearn-problems.mjs
 * from algo.monster's pages): { slug: { problem, algomonster, lc } }. Missing
 * or broken, the handbook simply shows no highlights.
 */
const PROBLEMS = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data/prolearn-problems.json'), 'utf8')); } catch { return {}; }
})();
const probOf = slug => {
  const p = PROBLEMS[slug];
  return p?.problem ? { am: p.algomonster === true, lc: p.lc ? { slug: p.lc.slug, id: p.lc.id, difficulty: p.lc.difficulty, paid: p.lc.paid } : null } : undefined;
};

export function outline() {
  return CHAPTERS.map(c => ({
    chapter: c.chapter,
    groups: c.groups.map(g => ({ group: g.group, articles: g.articles.map(a => ({ ...a, prob: probOf(a.slug) })) })),
    count: c.groups.reduce((n, g) => n + g.articles.length, 0),
  }));
}

export function articleMeta(slug) {
  return INDEX.get(slug) || null;
}

// The warm script writes from another process, so a short TTL rather than
// relying only on article() to drop it.
let writtenMemo = null;
export async function writtenSlugs() {
  if (writtenMemo && Date.now() - writtenMemo.at < 60_000) return writtenMemo.slugs;
  const keys = await store.keys();
  writtenMemo = { at: Date.now(), slugs: keys.filter(k => INDEX.has(k)) };
  return writtenMemo.slugs;
}

/**
 * Question slug -> the topics that teach it, built by reading back every page
 * that has been written. Cached, since it costs a full pass over the store;
 * article() drops the cache whenever a page changes.
 */
let topicsByQuestion = null;

export async function questionTopics() {
  if (topicsByQuestion) return topicsByQuestion;
  const map = new Map();
  for (const slug of await writtenSlugs()) {
    const doc = await store.get(slug);
    if (doc?.schema !== SCHEMA) continue;
    const meta = INDEX.get(slug);
    // Process pages cite problems as passing examples; they teach no pattern.
    if (meta.chapter === 'Getting Started' && meta.group === 'Overview') continue;
    for (const [rank, hit] of resolveTitles(doc.problems).entries()) {
      if (!hit.available) continue;
      if (!map.has(hit.slug)) map.set(hit.slug, []);
      map.get(hit.slug).push({ slug, title: meta.title, chapter: meta.chapter, group: meta.group, rank });
    }
  }
  // A topic that lists a problem first is teaching it; later entries are drill.
  for (const list of map.values()) list.sort((a, b) => a.rank - b.rank);
  topicsByQuestion = map;
  return map;
}

/**
 * The raw problem statements for a topic's practice set, with nothing that
 * gives the answer away: no code, no recipe, no trace. Only pages that have
 * already been written have a problem list; a topic not written yet gets an
 * empty set rather than a slow LLM call.
 */
export async function practice(slug) {
  const meta = INDEX.get(slug);
  if (!meta) return null;
  const doc = await store.get(slug);
  const titles = doc?.schema === SCHEMA ? doc.problems : [];
  const problems = resolveTitles(titles).map(p => {
    if (!p.available) return p;
    const q = question(p.slug);
    if (!q) return { ...p, available: false, slug: null };
    return {
      title: q.title, slug: q.slug, id: q.id, difficulty: q.difficulty, available: true,
      topicTags: q.topicTags, content: q.content, exampleTestcases: q.exampleTestcases,
    };
  });
  return { slug, title: meta.title, chapter: meta.chapter, group: meta.group, written: Boolean(doc), problems };
}

/** The topics that teach a given question, best match first. */
export async function topicsFor(questionSlug) {
  const hit = (await questionTopics()).get(questionSlug) || [];
  return hit.map(({ rank, ...t }) => t);
}

/**
 * Two models, two jobs. The strong model writes the page as prose, which is
 * what it is good at and what it insists on doing whatever the prompt says;
 * a cheap fast model then folds that prose into the strict shape the page
 * renderer needs. Asking one model for depth and rigid JSON at once gets
 * neither.
 */
const AUTHOR_MODEL = process.env.PROLEARN_AUTHOR_MODEL || 'claude-opus-5';
const SHAPER_MODEL = process.env.PROLEARN_SHAPER_MODEL || 'gemini-3.7-flash-medium';

const AUTHOR_SYSTEM = `You are a staff engineer at Google who writes the internal DSA handbook.
You write one reference page per topic for an engineer preparing for a Google coding interview.
Be concrete, technical and dense. No filler, no motivational padding, no "in this article we will".
Never mention any website, course, subscription or paywall. This is your own writing.
Assume the reader can already code; teach them the idea, the judgement and the failure modes.`;

const authorPrompt = meta => `Write the handbook page for "${meta.title}".
It belongs to the chapter "${meta.chapter}", section "${meta.group}".

Use exactly these markdown headings, in this order, and put real content under every one:

## Summary
Two or three sentences: what this topic is and when it matters.

## Cue
One or two sentences: the signal in a problem statement that should make you reach for this.

## Explanation
Four to six "### " subsections. Each is a distinct idea, two or three solid paragraphs,
building from the core mechanism to the judgement calls. Explain why it works, not just what it does.

## Code
One fenced code block, python unless another language is obviously right.
The canonical implementation: complete, runnable, idiomatic, no ellipses. Add a one-line caption above it.

## Walkthrough
State a small concrete input, then a numbered trace of six to ten steps.
Each step says what happened and the state after it.

## Complexity
Time, space, and two sentences on why.

## Variants
Three to five named variants; for each, what changes from the canonical form.

## Traps
Four to six mistakes that actually cost people offers.

## Interview
Four to six lines, in order, of what to say out loud when this comes up.

## Problems
Four to eight real LeetCode problem titles, exact titles, most instructive first, one per line.`;

const SHAPER_SYSTEM = `You convert a finished handbook page into JSON for a renderer.
You are a formatter, not an author: never shorten, summarise, rewrite or invent. Move the
author's words across verbatim, minus the markdown syntax itself.
Return STRICT JSON only, no prose outside the object, exactly this shape:
{
  "summary": "the Summary section",
  "cue": "the Cue section",
  "sections": [ { "heading": "the ### subsection title", "body": "its full text, paragraphs separated by \\n\\n" } ],
  "code": { "lang": "python", "caption": "the caption line", "source": "the code, exactly as written" },
  "walkthrough": { "input": "the concrete input", "steps": ["one string per numbered step"] },
  "complexity": { "time": "...", "space": "...", "why": "..." },
  "variants": [ { "name": "...", "change": "..." } ],
  "traps": ["one string per trap"],
  "interview": ["one string per line"],
  "problems": ["one exact LeetCode title per entry"]
}
Every Explanation subsection becomes one entry in "sections", with its body complete and unabridged.
Strip markdown emphasis and list markers from prose, keep the code block's characters untouched.`;

function normalise(raw, meta) {
  const str = (v, max = 12000) => String(v ?? '').trim().slice(0, max);
  const arr = (v, n, f = str) => (Array.isArray(v) ? v : []).slice(0, n).map(f).filter(Boolean);
  const doc = {
    schema: SCHEMA,
    slug: meta.slug,
    title: meta.title,
    chapter: meta.chapter,
    group: meta.group,
    summary: str(raw.summary, 2000),
    cue: str(raw.cue, 1000),
    sections: arr(raw.sections, 10, s => ({ heading: str(s?.heading, 200), body: str(s?.body) }))
      .filter(s => s.heading && s.body),
    code: {
      lang: str(raw.code?.lang, 20) || 'python',
      caption: str(raw.code?.caption, 400),
      source: str(raw.code?.source, 12000),
    },
    walkthrough: {
      input: str(raw.walkthrough?.input, 800),
      steps: arr(raw.walkthrough?.steps, 20, s => str(s, 1200)),
    },
    complexity: {
      time: str(raw.complexity?.time, 300),
      space: str(raw.complexity?.space, 300),
      why: str(raw.complexity?.why, 1500),
    },
    variants: arr(raw.variants, 8, v => ({ name: str(v?.name, 200), change: str(v?.change, 1500) }))
      .filter(v => v.name),
    traps: arr(raw.traps, 8, t => str(t, 1200)),
    interview: arr(raw.interview, 8, t => str(t, 1200)),
    problems: arr(raw.problems, 10, t => str(t, 160)),
    generatedAt: Date.now(),
  };
  // A page missing its spine was shaped from a truncated or off-format draft;
  // rejecting it here makes chatJson retry rather than cache the wreckage.
  if (!doc.summary || doc.sections.length < 3 || !doc.code.source) {
    throw new Error(`incomplete page: ${doc.sections.length} sections, ${doc.summary.length} summary chars`);
  }
  return doc;
}

/**
 * The article for a topic. Served from disk when it has been written before;
 * otherwise generated, stored and returned. `problems` is resolved against the
 * local question set on every read, so links stay right as the set changes.
 */
export async function article(slug, { model, refresh = false } = {}) {
  const meta = INDEX.get(slug);
  if (!meta) return null;

  let doc = refresh ? null : await store.get(slug);
  if (doc?.schema !== SCHEMA) doc = null;

  if (!doc) {
    const draft = await llm.chat({
      where: 'prolearn/author',
      model: model || AUTHOR_MODEL,
      temperature: 0.4,
      maxTokens: 16000,
      timeoutMs: 300_000,
      messages: [
        { role: 'system', content: AUTHOR_SYSTEM },
        { role: 'user', content: authorPrompt(meta) },
      ],
    });
    if (draft.length < 800) throw new UpstreamError('the model returned an empty handbook page', 502);

    doc = await llm.chatJson({
      where: 'prolearn/shape',
      model: SHAPER_MODEL,
      temperature: 0,
      maxTokens: 16000,
      timeoutMs: 300_000,
      parse: raw => normalise(raw, meta),
      messages: [
        { role: 'system', content: SHAPER_SYSTEM },
        { role: 'user', content: `Convert this handbook page on "${meta.title}" to JSON.\n\n${draft}` },
      ],
    });
    await store.set(slug, doc);
    topicsByQuestion = null;
    writtenMemo = null;
  }

  const i = ORDER.indexOf(slug);
  const at = j => (INDEX.get(ORDER[j]) ? { slug: ORDER[j], title: INDEX.get(ORDER[j]).title } : null);
  return {
    ...doc,
    problems: resolveTitles(doc.problems),
    // Derived on read, so the catalogue can grow without rewriting pages.
    toolkit: idiomsIn(doc.code?.source),
    prev: i > 0 ? at(i - 1) : null,
    next: i >= 0 && i < ORDER.length - 1 ? at(i + 1) : null,
  };
}
