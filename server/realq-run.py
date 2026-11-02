"""Runs a REALQ solution snippet on example calls and reports what it returns.

stdin:  {"imports": str, "code": str, "calls": [{"call": str, "expected": str}]}
stdout: {"results": [{"ok": bool, "actual": str, "match": bool|null, "error": str|null}]}

Each call is Python that must leave its answer in `result`. It runs in a fresh
copy of the namespace the snippet defined, so one example cannot leak state
into the next. `expected` is a Python literal; the comparison tolerates
tuple/list and set/list differences and float rounding.
"""
import ast
import io
import json
import math
import sys
import contextlib

try:  # keep a runaway call from taking the box with it (Linux only)
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
except Exception:  # noqa: BLE001
    pass

FORBIDDEN_CALLS = {"open", "exec", "eval", "compile", "getattr", "setattr", "globals", "locals", "vars",
                   "input", "breakpoint", "__import__", "exit", "quit"}


def unsafe(call):
    """A call line may only build values and invoke the snippet: no imports, dunders or I/O."""
    try:
        tree = ast.parse(call)
    except SyntaxError as e:
        return f"SyntaxError: {e.msg}"
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            return "imports are not allowed in a call"
        if isinstance(node, ast.Name) and node.id.startswith("__"):
            return "dunder names are not allowed in a call"
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            return "dunder attributes are not allowed in a call"
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_CALLS:
            return f"{node.func.id}() is not allowed in a call"
    return None


def canon(v):
    if isinstance(v, (list, tuple)):
        return [canon(x) for x in v]
    if isinstance(v, (set, frozenset)):
        return sorted((canon(x) for x in v), key=repr)
    if isinstance(v, dict):
        return {repr(k): canon(x) for k, x in v.items()}
    if isinstance(v, float):
        return round(v, 6)
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    return repr(v)


def same(a, b):
    ca, cb = canon(a), canon(b)
    if isinstance(ca, float) or isinstance(cb, float):
        try:
            return math.isclose(float(ca), float(cb), rel_tol=1e-6, abs_tol=1e-6)
        except (TypeError, ValueError):
            return False
    return ca == cb


def main():
    job = json.loads(sys.stdin.read())
    base = {"__name__": "realq"}
    out = []
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            exec(compile(job.get("imports", "") + "\n\n" + job["code"], "<snippet>", "exec"), base)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"snippet failed to load: {type(e).__name__}: {e}"}))
        return
    for c in job.get("calls", []):
        call = str(c.get("call", ""))
        res = {"ok": False, "actual": None, "match": None, "error": None}
        bad = unsafe(call)
        if bad:
            res["error"] = bad
            out.append(res)
            continue
        ns = dict(base)
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                exec(compile(call, "<call>", "exec"), ns)
            if "result" not in ns:
                raise RuntimeError("the call did not assign `result`")
            actual = ns["result"]
            res["ok"] = True
            res["actual"] = repr(canon(actual)) if not isinstance(actual, (int, float, str, bool, type(None))) else repr(actual)
            exp = c.get("expected")
            if exp not in (None, ""):
                try:
                    res["match"] = same(actual, ast.literal_eval(str(exp)))
                except (ValueError, SyntaxError):
                    res["match"] = repr(actual) == str(exp).strip()
        except Exception as e:  # noqa: BLE001
            res["error"] = f"{type(e).__name__}: {e}"
        out.append(res)
    print(json.dumps({"results": out}))


if __name__ == "__main__":
    main()
