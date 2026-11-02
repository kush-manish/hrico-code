"""Browser mirror of server/debug-runner.py's non-traced run path (run_cases).

Loaded into a Pyodide worker so "Run" can execute Python entirely client-side
for plain (non-design) questions — no server round trip, no LeetCode judge.
This is a trimmed copy of the same conversion/dispatch logic the server uses
(build_list/build_tree/convert_arg/convert_result/run_one/run_cases) so the
two paths behave identically; the step tracer and the CLI-only resource
limits are not needed here and are left out.
"""
import io
import json
import sys
import traceback

PRELUDE = '''
import collections, itertools, heapq, bisect, math, functools, string, re, operator
from collections import defaultdict, deque, Counter, OrderedDict
from functools import lru_cache, cache
from typing import List, Dict, Tuple, Optional, Set, Any
# LeetCode's Python runner pre-imports these; official solutions rely on it.
from heapq import heappush, heappop, heapify, heappushpop, heapreplace, nlargest, nsmallest
from bisect import bisect_left, bisect_right, insort, insort_left, insort_right
from math import inf, gcd, sqrt, ceil, floor, log, log2, comb, factorial, isqrt

class ListNode:
    _n = 0
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next
        ListNode._n += 1
        self._qid = ListNode._n
    def __repr__(self):
        seen, out, node = set(), [], self
        while node and id(node) not in seen and len(out) < 30:
            seen.add(id(node)); out.append(f'{node.val}#{getattr(node, "_qid", 0)}'); node = node.next
        tail = ''
        if node is not None:
            tail = f' ^{getattr(node, "_qid", 0)}' if id(node) in seen else ' ...'
        return 'ListNode(' + ' -> '.join(out) + tail + ')'

class TreeNode:
    _n = 0
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right
        TreeNode._n += 1
        self._qid = TreeNode._n
    def __repr__(self):
        return f'TreeNode({self.val}#{getattr(self, "_qid", 0)})'

class Node:
    def __init__(self, val=0, neighbors=None, children=None, next=None,
                 left=None, right=None, random=None):
        self.val, self.next, self.random = val, next, random
        self.left, self.right = left, right
        self.neighbors = neighbors if neighbors is not None else []
        self.children = children if children is not None else []
        Node._n = getattr(Node, '_n', 0) + 1
        self._qid = 100000 + Node._n
    def __repr__(self):
        if self.random is not None or self.next is not None:
            seen, out, n = set(), [], self
            while n is not None and id(n) not in seen and len(out) < 20:
                seen.add(id(n)); out.append(f'{n.val}#{getattr(n, "_qid", 0)}'); n = n.next
            return 'ListNode(' + ' -> '.join(out) + (' ...' if n else '') + ')'
        if self.neighbors:
            return f'Node({self.val} -> {[getattr(n, "val", "?") for n in self.neighbors]})'
        return f'Node({self.val})'
'''

NS = {}


def build_list(values):
    head = cur = None
    for v in values or []:
        node = NS['ListNode'](v)
        if head is None:
            head = cur = node
        else:
            cur.next = node
            cur = node
    return head


def build_tree(values):
    values = list(values or [])
    if not values or values[0] is None:
        return None
    TreeNode = NS['TreeNode']
    root = TreeNode(values[0])
    queue, i = [root], 1
    while queue and i < len(values):
        node = queue.pop(0)
        if i < len(values):
            v = values[i]; i += 1
            if v is not None:
                node.left = TreeNode(v); queue.append(node.left)
        if i < len(values):
            v = values[i]; i += 1
            if v is not None:
                node.right = TreeNode(v); queue.append(node.right)
    return root


def list_out(head):
    out, seen = [], set()
    while head and id(head) not in seen and len(out) < 10_000:
        seen.add(id(head)); out.append(head.val); head = head.next
    return out


def tree_out(root):
    if root is None:
        return []
    out, queue = [], [root]
    while queue:
        n = queue.pop(0)
        if n is None:
            out.append(None); continue
        out.append(n.val); queue.append(n.left); queue.append(n.right)
    while out and out[-1] is None:
        out.pop()
    return out


def convert_arg(value, type_name):
    t = (type_name or '').replace(' ', '')
    if t == 'ListNode':
        return build_list(value)
    if t == 'ListNode[]':
        return [build_list(v) for v in (value or [])]
    if t == 'TreeNode':
        return build_tree(value)
    return value


INPUT_TREES = []
NODE_ANSWER = [False]   # problems like LCA return one node of the input tree


def in_input_tree(node):
    for root in INPUT_TREES:
        stack = [root]
        while stack:
            n = stack.pop()
            if n is None:
                continue
            if n is node:
                return True
            stack += [n.left, n.right]
    return False


def convert_result(value):
    if isinstance(value, list) and value and all(x is None or x.__class__.__name__ in ('TreeNode', 'ListNode') for x in value) and any(x is not None for x in value):
        return [None if x is None else (tree_out(x) if x.__class__.__name__ == 'TreeNode' else list_out(x)) for x in value]
    if value.__class__.__name__ == 'ListNode':
        return list_out(value)
    if value.__class__.__name__ == 'TreeNode':
        if in_input_tree(value) and (NODE_ANSWER[0] or not any(value is r for r in INPUT_TREES)):
            return value.val          # e.g. lowest common ancestor: LeetCode prints the node's value
        return tree_out(value)
    if value.__class__.__name__ == 'Node' and hasattr(value, 'random') and (value.next is not None or value.random is not None or True) and not getattr(value, 'neighbors', None):
        nodes, n, seen = [], value, set()
        while n is not None and id(n) not in seen and len(nodes) < 1000:
            seen.add(id(n)); nodes.append(n); n = n.next
        idx = {id(x): k for k, x in enumerate(nodes)}
        return [[x.val, idx.get(id(x.random)) if x.random is not None else None] for x in nodes]
    return value


def to_json_text(value):
    """LeetCode prints answers as JSON (true, null, [1,2]); match that."""
    try:
        return json.dumps(value, separators=(',', ':'), ensure_ascii=False)
    except (TypeError, ValueError):
        return repr(value)


def clean_tb():
    tb = traceback.format_exc(limit=8)
    return '\n'.join(l for l in tb.splitlines()
                     if '<solution>' in l or not l.startswith('  File')) or tb


def run_one(meta, args):
    """One example case, untraced. Returns the answer as JSON text."""
    if meta.get('classname'):
        # Design problem: args is [operations, arguments]; the first operation
        # constructs the object and answers null, like LeetCode's output.
        ops, argv = (list(args) + [[], []])[:2]
        cls = NS.get(meta['classname'])
        if cls is None:
            raise RuntimeError(f"No class {meta['classname']} found in your code.")
        ops, argv = list(ops or []), list(argv or [])
        obj = cls(*(argv[0] if argv else []))
        out = [None]
        for i, op in enumerate(ops[1:], start=1):
            fn = getattr(obj, op, None)
            if fn is None:
                raise RuntimeError(f"{meta['classname']} has no method '{op}'.")
            a = argv[i] if i < len(argv) else []
            out.append(convert_result(fn(*a)))
        return to_json_text(out)
    if 'Solution' not in NS:
        raise RuntimeError('No class Solution found in your code.')
    method = getattr(NS['Solution'](), meta['name'], None)
    if method is None:
        raise RuntimeError(f"Solution has no method '{meta['name']}'.")
    params = meta.get('params') or []
    call_args = [convert_arg(a, p.get('type')) for a, p in zip(args, params)]
    result = method(*call_args)
    if (meta.get('return') or {}).get('type') == 'void' and call_args:
        result = call_args[(meta.get('output') or {}).get('paramindex', 0)]
    return to_json_text(convert_result(result))


def run_cases(payload):
    """Runs every example case without the tracer, exactly like the server's
    /api/run-local, but here in the browser's own Python runtime."""
    code = payload['code']
    meta = payload['meta']
    cases = payload.get('cases') or []
    exec(compile(PRELUDE, '<prelude>', 'exec'), NS)
    real_stdout = sys.stdout
    sys.stdout = io.StringIO()   # a module-level print must not corrupt our JSON
    try:
        exec(compile(code, '<solution>', 'exec'), NS)
    except Exception:
        return {'cases': [], 'error': clean_tb()}
    finally:
        sys.stdout = real_stdout
    out = []
    for args in cases[:10]:
        buf = io.StringIO()
        row = {'output': None, 'stdout': '', 'error': None}
        sys.stdout = buf
        try:
            row['output'] = run_one(meta, args)
        except Exception:
            row['error'] = clean_tb()
        finally:
            sys.stdout = real_stdout
        row['stdout'] = buf.getvalue()[:8000]
        out.append(row)
    return {'cases': out, 'error': None}
