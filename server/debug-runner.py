#!/usr/bin/env python3
"""Records a line-by-line trace of a LeetCode-style Python solution.

stdin:  JSON {code, meta:{name, params:[{name,type}], return:{type}}, args:[...],
              watch:["expr", ...]}
stdout: JSON {steps:[{line, event, func, locals:{}, watch:{}, out}], stdout,
              result, error, truncated}

Each step carries reprs of the frame locals, the watch expressions evaluated
in that frame, and how much stdout existed at that moment — enough for a UI
to play the execution forwards and backwards without re-running anything.
"""
import io
import json
import resource
import sys
import traceback

MAX_STEPS = 3000
MAX_REPR = 1200   # long enough for a 9x9 board or a 10x13 grid to be drawn, not cut
MAX_STDOUT = 64_000

# The traced program must not hog the box: it is interview code, not a service.
resource.setrlimit(resource.RLIMIT_CPU, (6, 6))
try:
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024,) * 2)
except (ValueError, OSError):
    pass  # some kernels refuse RLIMIT_AS; the CPU cap still holds

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


class NaryNode:
    """LeetCode's N-ary Node (val, children)."""
    def __init__(self, val=None, children=None):
        self.val = val
        self.children = children if children is not None else []
    def __repr__(self):
        return f"Node({self.val}, {len(self.children)} children)"


def build_nary(values):
    """LeetCode N-ary level order: [1,null,3,2,4,null,5,6] — null ends each child group."""
    if not values or values[0] is None:
        return None
    root = NaryNode(values[0])
    queue, i = [root], 2
    for parent in queue:
        while i < len(values) and values[i] is not None:
            child = NaryNode(values[i])
            parent.children.append(child)
            queue.append(child)
            i += 1
        i += 1
        if i > len(values):
            break
    return root


def nary_out(root):
    if root is None:
        return []
    out, queue = [root.val, None], [root]
    for node in queue:
        for c in getattr(node, 'children', None) or []:
            out.append(getattr(c, 'val', None))
            queue.append(c)
        out.append(None)
    while out and out[-1] is None:
        out.pop()
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


def build_graph(adj):
    # [[2,4],[1,3],...] -> Node(1) whose neighbours are wired as listed (1-based).
    if not adj:
        return None
    Node = NS['Node']
    nodes = [Node(i + 1) for i in range(len(adj))]
    for i, ns in enumerate(adj):
        nodes[i].neighbors = [nodes[j - 1] for j in ns if 0 < j <= len(nodes)]
    return nodes[0]


def find_node(root, val):
    stack = [root]
    while stack:
        n = stack.pop()
        if n is None:
            continue
        if n.val == val:
            return n
        stack += [n.left, n.right]
    return None


def adapt_args(args_in, params):
    types = [((p.get('type') or '').replace(' ', ''), p.get('name')) for p in params]
    out = []
    for a, (t, name) in zip(args_in, types):
        if t == 'TreeNode' and not isinstance(a, list) and out and out[0].__class__.__name__ == 'TreeNode':
            out.append(find_node(out[0], a))          # LCA: p and q are values in the tree
        elif t == 'Node' and isinstance(a, list) and all(isinstance(x, list) for x in a) and all(all(isinstance(y, int) for y in x) for x in a):
            out.append(build_graph(a))                 # clone graph: adjacency list
        else:
            out.append(convert_arg(a, t))
    # Linked-list cycle problems: "pos" says where the tail links back to.
    names = [n for _, n in types]
    if 'pos' in names and out and out[0].__class__.__name__ == 'ListNode':
        pos = out[names.index('pos')]
        if isinstance(pos, int) and pos >= 0:
            nodes, n = [], out[0]
            while n is not None and len(nodes) < 10_000:
                nodes.append(n); n = n.next
            if pos < len(nodes):
                nodes[-1].next = nodes[pos]
    return out


def build_random_list(pairs):
    Node = NS['Node']
    nodes = [Node(v) for v, _ in pairs]
    for i, (_, r) in enumerate(pairs):
        if i + 1 < len(nodes):
            nodes[i].next = nodes[i + 1]
        nodes[i].random = nodes[r] if isinstance(r, int) and 0 <= r < len(nodes) else None
    return nodes[0] if nodes else None


def adapt_by_hints(method, raw, args, src=''):
    # The solution's own type hints say what it expects: a graph Node, a
    # random-pointer list, or a TreeNode where LeetCode's runner passed a value.
    try:
        import inspect
        ps = [q for q in inspect.signature(method).parameters.values()]
    except (TypeError, ValueError):
        return args
    out = list(args)
    for i, q in enumerate(ps[:len(out)]):
        ann = str(q.annotation)
        a = raw[i] if i < len(raw) else None
        if 'TreeNode' in ann and isinstance(a, int) and out and out[0].__class__.__name__ == 'TreeNode':
            out[i] = find_node(out[0], a)
        elif 'Node' in ann and 'ListNode' not in ann and 'TreeNode' not in ann and isinstance(a, list):
            if a and all(isinstance(x, list) and len(x) == 2 and (x[1] is None or isinstance(x[1], int)) for x in a) and 'random' in src:
                out[i] = build_random_list(a)
            elif all(isinstance(x, list) and all(isinstance(y, int) for y in x) for x in a):
                out[i] = build_graph(a)
    return out


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


OBJ_IDS = {}


def oid(value):
    k = id(value)
    if k not in OBJ_IDS:
        OBJ_IDS[k] = len(OBJ_IDS) + 1
    return OBJ_IDS[k]


def snapshot(value, budget=None, seen=None, depth=0):
    # The design object's insides as plain JSON: objects become
    # {"__obj": class, "id": n, "f": {field: ...}}; repeats become {"__ref": n}.
    if budget is None:
        budget = [500]
    if seen is None:
        seen = set()
    budget[0] -= 1
    if budget[0] < 0 or depth > 40:
        return '…'
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:40]
    if isinstance(value, (list, tuple)) or value.__class__.__name__ == 'deque':
        return [snapshot(x, budget, seen, depth + 1) for x in list(value)[:40]]
    if isinstance(value, dict):
        return {'__map': [[snapshot(k, budget, seen, depth + 1), snapshot(v, budget, seen, depth + 1)] for k, v in list(value.items())[:40]]}
    if isinstance(value, (set, frozenset)):
        return {'__set': [snapshot(x, budget, seen, depth + 1) for x in list(value)[:40]]}
    if hasattr(value, '__dict__') and not callable(value):
        n = oid(value)
        if n in seen:
            return {'__ref': n}
        seen.add(n)
        return {'__obj': value.__class__.__name__, 'id': n,
                'f': {k: snapshot(v, budget, seen, depth + 1) for k, v in list(vars(value).items())[:8] if not k.startswith('__')}}
    return safe_repr(value)[:40]


def object_summary(value):
    # A user-defined object with the default repr (TrieNode, custom nodes):
    # show its class and fields briefly instead of a memory address.
    name = value.__class__.__name__
    parts = []
    for k, v in list(vars(value).items())[:5]:
        if isinstance(v, dict):
            parts.append(f'{k}={{{",".join(map(str, list(v.keys())[:8]))}}}')
        elif isinstance(v, (list, tuple, set)):
            parts.append(f'{k}=[{len(v)}]')
        elif v is None or isinstance(v, (bool, int, float, str)):
            parts.append(f'{k}={v!r}'[:24])
        else:
            parts.append(f'{k}={v.__class__.__name__}')
    return f'{name}({", ".join(parts)})@{oid(value)}'


def safe_repr(value):
    try:
        r = repr(value)
        if r.startswith('<') and ' object at 0x' in r and hasattr(value, '__dict__'):
            r = object_summary(value)
    except Exception:
        return '<unrepresentable>'
    return r[:MAX_REPR] + ('…' if len(r) > MAX_REPR else '')


NS = {}


def to_json_text(value):
    """LeetCode prints answers as JSON (true, null, [1,2]); match that."""
    try:
        return json.dumps(value, separators=(',', ':'), ensure_ascii=False)
    except (TypeError, ValueError):
        return safe_repr(value)


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
    """Runs every example case without the tracer: the local stand-in for
    LeetCode's Run when the judge is unreachable."""
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


class StopDesign(Exception):
    pass


def run_design_traced(meta, args_in, tracer, state, stdout):
    ops, argv = (list(args_in) + [[], []])[:2]
    ops, argv = list(ops or []), list(argv or [])
    cls = NS.get(meta['classname'])
    if cls is None:
        raise RuntimeError(f"No class {meta['classname']} found in your code.")
    def label(op, a):
        return f"{op}({', '.join(json.dumps(x) for x in a)})"
    out = [None]
    real_stdout = sys.stdout
    sys.stdout = stdout
    try:
        first = argv[0] if argv else []
        state['op'] = f"{meta['classname']}" + label('', first)
        # Typed constructor / method arguments (e.g. BSTIterator(root: TreeNode)) arrive as LeetCode data.
        ctypes = [q.get('type') for q in ((meta.get('constructor') or {}).get('params') or [])]
        mtypes = {m.get('name'): [q.get('type') for q in (m.get('params') or [])] for m in (meta.get('methods') or [])}
        conv = lambda vals, types: [convert_arg(v, types[k]) if k < len(types) else v for k, v in enumerate(vals)]
        built = conv(first, ctypes)
        trees = [(q.get('name') or 'root', v) for q, v in zip((meta.get('constructor') or {}).get('params') or [], built) if v.__class__.__name__ == 'TreeNode']
        if trees:
            state['roots'] = trees[:3]
            INPUT_TREES[:] = [v for _, v in trees[:3]]
        sys.settrace(tracer)
        obj = cls(*built)
        sys.settrace(None)
        state['obj'] = obj
        for i, op in enumerate(ops[1:], start=1):
            a = argv[i] if i < len(argv) else []
            fn = getattr(obj, op, None)
            if fn is None:
                raise RuntimeError(f"{meta['classname']} has no method '{op}'.")
            state['op'] = f'#{i} ' + label(op, a)
            sys.settrace(tracer)
            r = fn(*conv(a, mtypes.get(op, [])))
            sys.settrace(None)
            out.append(convert_result(r))
            state['op'] = f'#{i} ' + label(op, a) + f' → {to_json_text(convert_result(r))}'
    finally:
        sys.settrace(None)
        sys.stdout = real_stdout
    return to_json_text(out)


def main():
    payload = json.load(sys.stdin)
    if payload.get('mode') == 'run':
        json.dump(run_cases(payload), sys.stdout)
        return
    code = payload['code']
    meta = payload['meta']
    args_in = payload.get('args') or []
    watch = [w for w in (payload.get('watch') or [])[:8] if isinstance(w, str) and w.strip()]

    exec(compile(PRELUDE, '<prelude>', 'exec'), NS)

    steps = []
    stdout = io.StringIO()
    state = {'truncated': False}
    watch_code = {}
    for w in watch:
        try:
            watch_code[w] = compile(w, '<watch>', 'eval')
        except SyntaxError:
            watch_code[w] = None

    last = {'stack': None, 'tree': None}

    def short(v):
        if v is None or isinstance(v, (bool, int, float)):
            return repr(v)
        if isinstance(v, str):
            return repr(v) if len(v) <= 12 else repr(v[:10]) + '…'
        if isinstance(v, (list, tuple)) and len(v) <= 6 and all(x is None or isinstance(x, (bool, int, float, str)) for x in v):
            r = repr(list(v))
            return r if len(r) <= 30 else r[:28] + '…]'
        if isinstance(v, (list, tuple)):
            return f'[{len(v)} items]'
        if v.__class__.__name__ in ('TreeNode', 'ListNode'):
            return f'{v.__class__.__name__[0]}({getattr(v, "val", "?")})'
        return '…'

    labels = {}

    def label_of(f):
        co = f.f_code
        names = [n for n in co.co_varnames[:co.co_argcount] if n != 'self']
        return co.co_name + '(' + ', '.join(short(f.f_locals.get(n)) for n in names) + ')'

    def stack_of(frame):
        # Labels are frozen at call time: arguments the body later changes
        # must not rewrite how the call is shown.
        out, f = [], frame
        while f is not None and f.f_code.co_filename == '<solution>' and len(out) < 40:
            out.append(labels.get(id(f)) or label_of(f))
            f = f.f_back
        return out[::-1]

    def path_of(frame):
        # The tree node each frame is working on (its first TreeNode argument).
        out, f = [], frame
        while f is not None and f.f_code.co_filename == '<solution>' and len(out) < 60:
            co = f.f_code
            for n in co.co_varnames[:co.co_argcount]:
                v = f.f_locals.get(n)
                if v.__class__.__name__ == 'TreeNode':
                    out.append(getattr(v, '_qid', 0)); break
            f = f.f_back
        return out[::-1]

    def tree_of(root):
        # Level order of the input tree with stable node ids, so the UI can
        # draw it and highlight whichever node a variable points at.
        if root is None:
            return None
        out, q, seen = [], [root], set()
        while q and len(out) < 127:
            n = q.pop(0)
            if n is None or id(n) in seen:
                out.append(None); continue
            seen.add(id(n))
            out.append([safe_repr(n.val)[:12], getattr(n, '_qid', 0)])
            q.append(getattr(n, 'left', None)); q.append(getattr(n, 'right', None))
        while out and out[-1] is None:
            out.pop()
        return out

    def record(frame, event, extra=None):
        if len(steps) >= MAX_STEPS:
            state['truncated'] = True
            sys.settrace(None)
            return
        loc = {}
        for k, v in frame.f_locals.items():
            if k == 'self' or k.startswith('__') or k.startswith('.') or callable(v) or (state.get('obj') is not None and v is state.get('obj')):
                continue   # functions and classes only clutter the picture
            loc[k] = safe_repr(v)
        me = frame.f_locals.get('self')
        if me is not None and me is not state.get('obj') and me.__class__.__name__ == 'Solution' and hasattr(me, '__dict__'):
            for k, v in list(vars(me).items())[:8]:
                if not k.startswith('_') and not callable(v):
                    loc['self.' + k] = safe_repr(v)
        wvals = {}
        for w in watch:
            c = watch_code.get(w)
            if c is None:
                wvals[w] = '⚠ syntax error'
                continue
            try:
                wvals[w] = safe_repr(eval(c, frame.f_globals, frame.f_locals))
            except Exception as e:
                wvals[w] = f'⚠ {type(e).__name__}'
        step = {
            'line': frame.f_lineno,
            'event': event,
            'func': frame.f_code.co_name,
            'locals': loc,
            'watch': wvals,
            'out': min(stdout.tell(), MAX_STDOUT),
        }
        if state.get('obj') is None and state.get('tries', True):
            # A trie (any object with a `children` field) in a normal solution:
            # draw it like a design object, from the outermost frame that holds it.
            chain, f = [], frame
            while f is not None and f.f_code.co_filename == '<solution>':
                chain.append(f); f = f.f_back
            found = None
            for f in reversed(chain):
                for k, v in f.f_locals.items():
                    ch = getattr(v, 'children', None) if hasattr(v, '__dict__') and not callable(v) else None
                    if k != 'self' and (isinstance(ch, dict) or (isinstance(ch, list) and len(ch) >= 2 and not hasattr(v, 'neighbors'))):
                        found = (k, v); break
                if found:
                    break
            if found:
                snap = {'__obj': 'trie', 'id': 0, 'f': {found[0]: snapshot(found[1])}}
                if snap != last.get('obj'):
                    step['obj'] = snap; last['obj'] = snap
        if state.get('obj') is not None:
            snap = snapshot(state['obj'])
            if snap != last.get('obj'):
                step['obj'] = snap; last['obj'] = snap
        if state.get('op') != last.get('op'):
            step['op'] = state.get('op'); last['op'] = state.get('op')
        stk = stack_of(frame)
        step['depth'] = len(stk)
        # While a helper runs, keep the outermost solution frame's data visible.
        outer = {}
        if len(stk) > 1:
            f = frame
            while f.f_back is not None and f.f_back.f_code.co_filename == '<solution>':
                f = f.f_back
            if f is not frame and f.f_code is not frame.f_code:   # a function calling itself: no "outer" copy of itself
                for k, v in f.f_locals.items():
                    if k == 'self' or k.startswith('__') or k.startswith('.') or callable(v) or k in loc:
                        continue
                    outer[k] = safe_repr(v)
        if outer != last.get('outer'):
            step['outer'] = outer; last['outer'] = outer
        if stk != last['stack']:
            step['stack'] = stk; last['stack'] = stk
        roots = state.get('roots') or []
        if not roots and state.get('builds'):
            chain, f = [], frame
            while f is not None and f.f_code.co_filename == '<solution>':
                chain.append(f); f = f.f_back
            for f in reversed(chain):          # outermost frame first
                hit = next(((k, v) for k, v in f.f_locals.items() if v.__class__.__name__ == 'TreeNode'), None)
                if hit:
                    roots = [(hit[0] + ' (being built)', hit[1])]; break
        t = [[n, tree_of(r)] for n, r in roots] if roots else ([] if last.get('tree') else None)
        if t is not None and t != last['tree']:
            step['trees'] = t; last['tree'] = t
        if roots:
            pth = path_of(frame)
            if pth != last.get('path'):
                step['path'] = pth; last['path'] = pth
        if event == 'return' and roots:
            co = frame.f_code
            for n in co.co_varnames[:co.co_argcount]:
                v = frame.f_locals.get(n)
                if v.__class__.__name__ == 'TreeNode':
                    step['retnode'] = getattr(v, '_qid', 0); break
        if extra:
            step.update(extra)
        # A comprehension written on one line runs that line many times in a
        # row (Python 3.12 inlines it): keep only the latest of those steps.
        if (event == 'line' and steps and steps[-1]['event'] == 'line' and steps[-1]['line'] == step['line']
                and steps[-1].get('depth') == step.get('depth') and steps[-1].get('func') == step.get('func')
                and state.get('src', [''])[step['line'] - 1:step['line']] and any(t in state['src'][step['line'] - 1] for t in (' for ', '(for ')) and not state['src'][step['line'] - 1].lstrip().startswith(('for ', 'while '))):
            for key in ('stack', 'trees', 'path', 'outer', 'obj', 'op'):
                if key in steps[-1] and key not in step:
                    step[key] = steps[-1][key]
            steps[-1] = step
            return
        if event == 'line' and state.get('src') and step['line'] - 1 < len(state['src']) and state['src'][step['line'] - 1].lstrip().startswith('def ') and len(stk) > 0:
            # defining a nested helper is not a step worth showing, but what it
            # first recorded (stack, trees, …) must reach the next step
            state['carry'] = {k: step[k] for k in ('stack', 'trees', 'path', 'outer', 'obj', 'op') if k in step}
            return
        if state.get('carry'):
            for k, v in state.pop('carry').items():
                step.setdefault(k, v)
        steps.append(step)

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != '<solution>':
            return None   # never descend into library code
        if frame.f_code.co_name in ('<genexpr>', '<listcomp>', '<dictcomp>', '<setcomp>', '<lambda>'):
            return None   # one-line helpers: stepping through them only shows iterator noise
        if event == 'call':
            labels[id(frame)] = label_of(frame)
            return tracer
        if event == 'line':
            record(frame, 'line')
        elif event == 'return':
            record(frame, 'return', {'retval': safe_repr(arg)})
        elif event == 'exception':
            record(frame, 'exception', {'exc': safe_repr(arg[1])})
        return tracer

    error = None
    result = None
    try:
        state['src'] = code.split('\n')
        exec(compile(code, '<solution>', 'exec'), NS)
        if meta.get('classname'):
            result = run_design_traced(meta, args_in, tracer, state, stdout)
            raise StopDesign()
        codec = next((c for c in NS.values() if isinstance(c, type) and hasattr(c, 'serialize') and hasattr(c, 'deserialize')), None)
        if 'Solution' not in NS and codec is not None:
            nary = '.children' in code
            NS.setdefault('Node', NaryNode)
            root = (build_nary if nary else build_tree)(args_in[0] if args_in else [])
            # The tree drawer is binary-only: an N-ary codec is shown through its variables instead.
            state['roots'] = [('root', root)] if root is not None and not nary else []
            INPUT_TREES[:] = [root] if root is not None and not nary else []
            c = codec()
            real_stdout = sys.stdout
            sys.stdout = stdout
            sys.settrace(tracer)
            try:
                state['op'] = 'serialize(root)'
                data = c.serialize(root)
                state['op'] = f'deserialize({json.dumps(data)[:60]})'
                state['roots'] = []
                state['builds'] = not nary
                back = c.deserialize(data)
            finally:
                sys.settrace(None)
                sys.stdout = real_stdout
            result = safe_repr(nary_out(back) if nary else tree_out(back))
            raise StopDesign()
        if 'Solution' not in NS:
            raise RuntimeError('No class Solution found in your code.')
        sol = NS['Solution']()
        method = getattr(sol, meta['name'], None)
        if method is None:
            raise RuntimeError(f"Solution has no method '{meta['name']}'.")
        params = meta.get('params') or []
        call_args = adapt_args(args_in, params)
        # Intersection of two lists: LeetCode's hidden inputs say where list B joins list A.
        names = [q.get('name') for q in params]
        joined = names[:5] == ['intersectVal', 'listA', 'listB', 'skipA', 'skipB'] and len(args_in) >= 5
        # Populating Next Right Pointers: a binary tree whose nodes also have .next (None until wired).
        nexty = meta.get('name') == 'connect' and len(params) == 1 and (params[0].get('type') or '') == 'Node'
        if nexty:
            root = build_tree(args_in[0] if args_in else [])
            stack = [root]
            while stack:
                n = stack.pop()
                if n is not None:
                    n.next = None
                    stack += [n.left, n.right]
            call_args = [root]
            state['roots'] = [('root', root)] if root is not None else []
        if joined:
            ival, la, lb, sa, sb = args_in[:5]
            ha = build_list(la)
            hb = build_list(lb[:sb]) if ival else build_list(lb)
            if ival:
                shared = ha
                for _ in range(sa):
                    shared = shared.next
                if hb is None:
                    hb = shared
                else:
                    t = hb
                    while t.next:
                        t = t.next
                    t.next = shared
            call_args = [ha, hb]
        state['roots'] = [(p.get('name') or f'tree{i}', a) for i, (a, p) in enumerate(zip(call_args, params + [{}] * len(call_args))) if a.__class__.__name__ == 'TreeNode'][:3]
        INPUT_TREES[:] = [r for _, r in state['roots']]
        NODE_ANSWER[0] = any(p.get('name') in ('p', 'q') for p in params)
        state['builds'] = (meta.get('return') or {}).get('type') == 'TreeNode' and not state['roots']
        if not joined and not nexty:
            call_args = adapt_by_hints(method, args_in, call_args, code)
        # LeetCode sometimes gives extra hidden inputs (e.g. the cycle position):
        # pass only as many as the method takes.
        try:
            import inspect
            want = [q for q in inspect.signature(method).parameters.values() if q.kind in (q.POSITIONAL_ONLY, q.POSITIONAL_OR_KEYWORD)]
            if not any(q.kind == q.VAR_POSITIONAL for q in inspect.signature(method).parameters.values()):
                call_args = call_args[:len(want)]
        except (TypeError, ValueError):
            pass

        real_stdout = sys.stdout
        sys.stdout = stdout
        sys.settrace(tracer)
        try:
            result = method(*call_args)
        finally:
            sys.settrace(None)
            sys.stdout = real_stdout
        if (meta.get('return') or {}).get('type') == 'void' and call_args:
            result = call_args[(meta.get('output') or {}).get('paramindex', 0)]
        if nexty:
            # LeetCode's output: each level read along the next pointers, '#' after each level.
            out, head = [], result
            while head is not None:
                cur, head = head, None
                while cur is not None:
                    out.append(cur.val)
                    if head is None: head = cur.left or cur.right
                    cur = cur.next
                out.append('#')
            result = '[' + ','.join(str(x) for x in out) + ']'
        elif joined:
            result = f"Intersected at '{result.val}'" if result is not None else 'No intersection'
        else:
            result = safe_repr(convert_result(result)) if result is not None else 'None'
    except StopDesign:
        pass
    except Exception:
        sys.settrace(None)
        sys.stdout = sys.__stdout__
        tb = traceback.format_exc(limit=8)
        # Strip the runner's own frames; the user only wrote <solution>.
        error = '\n'.join(l for l in tb.splitlines()
                          if '<solution>' in l or not l.startswith('  File')) or tb

    json.dump({
        'steps': steps,
        'stdout': stdout.getvalue()[:MAX_STDOUT],
        'result': result,
        'error': error,
        'truncated': state['truncated'],
    }, sys.stdout)


if __name__ == '__main__':
    main()
