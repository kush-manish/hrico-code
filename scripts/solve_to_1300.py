#!/usr/bin/env python3
"""
Solves unsolved LeetCode problems until the account hits 1,300 accepted solutions.
Uses pre-generated optimal solutions from the cache, plus LLM generation for additional problems.
"""

import os
import sys
import json
import time
import re
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(BASE_DIR)
ENV_PATH = os.path.join(BASE_DIR, '.env')
CACHE_DIR = os.path.join(BASE_DIR, '.cache', 'explain')
DETAILS_PATH = os.path.join(ROOT_DIR, 'Companies', 'Google', '.raw', 'details.json')

TARGET_AC = 1300
DELAY_BETWEEN_SUBS = 3.5  # seconds

def load_env():
    env = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    q = v[0] if v else ''
                    if q in ('"', "'") and v.endswith(q) and len(v) > 1:
                        v = v[1:-1]
                    env[k.strip()] = v.strip()
    return env

ENV = load_env()

def get_headers(referer="https://leetcode.com/problemset/all/"):
    return {
        'Content-Type': 'application/json',
        'Cookie': f"LEETCODE_SESSION={ENV['LEETCODE_SESSION']}; csrftoken={ENV['LEETCODE_CSRF']}; cf_clearance={ENV.get('LEETCODE_CF_CLEARANCE', '')}",
        'x-csrftoken': ENV['LEETCODE_CSRF'],
        'Referer': referer,
        'Origin': 'https://leetcode.com',
        'User-Agent': ENV.get('LEETCODE_UA', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'),
    }

def fetch_current_ac_slugs():
    url = 'https://leetcode.com/api/problems/all/'
    req = urllib.request.Request(url, headers=get_headers())
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    pairs = data.get('stat_status_pairs', [])
    ac_slugs = {p['stat']['question__title_slug'] for p in pairs if p.get('status') == 'ac'}
    return ac_slugs, pairs

def submit_solution(slug, question_id, code):
    url = f"https://leetcode.com/problems/{slug}/submit/"
    headers = get_headers(f"https://leetcode.com/problems/{slug}/")
    payload = json.dumps({
        'lang': 'python3',
        'question_id': str(question_id),
        'typed_code': code,
    }).encode('utf-8')

    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='replace')
        if e.code == 403:
            return {'status_msg': 'HTTP 403 (Protected/Paid)'}
        return {'status_msg': f'HTTP {e.code}'}
    except Exception as e:
        return {'status_msg': str(e)}

    sub_id = data.get('submission_id')
    if not sub_id:
        return {'status_msg': 'No submission_id'}

    check_url = f"https://leetcode.com/submissions/detail/{sub_id}/check/"
    for _ in range(20):
        time.sleep(1.5)
        try:
            check_req = urllib.request.Request(check_url, headers=headers)
            with urllib.request.urlopen(check_req, timeout=15) as c_resp:
                c_data = json.loads(c_resp.read().decode('utf-8'))
                if c_data.get('state') == 'SUCCESS':
                    return c_data
        except Exception:
            pass

    return {'status_msg': 'Timeout'}

def fetch_problem_details_leetcode(slug):
    query = """query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    title
    content
    difficulty
    isPaidOnly
    codeSnippets {
      langSlug
      code
    }
  }
}"""
    url = 'https://leetcode.com/graphql/'
    headers = get_headers(f"https://leetcode.com/problems/{slug}/")
    payload = json.dumps({'query': query, 'variables': {'titleSlug': slug}}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers=headers)
    with urllib.request.urlopen(req, timeout=25) as resp:
        d = json.loads(resp.read().decode('utf-8'))
        return d.get('data', {}).get('question')

def generate_python_solution_llm(title, content, starter_code):
    clean_content = re.sub(r'<[^>]+>', ' ', content or '')
    clean_content = re.sub(r'\s+', ' ', clean_content).strip()[:2500]

    system_prompt = (
        "You are an expert competitive programmer. "
        "Solve the given LeetCode problem in clean, optimal Python 3 matching the exact starter code class and method signature. "
        "Return ONLY the executable Python 3 code block. No explanations, no markdown comments."
    )
    user_prompt = f"Problem: {title}\nDescription: {clean_content}\nStarter code signature:\n{starter_code}\n"

    url = f"{ENV['LLM_BASE_URL']}/v1/chat/completions"
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f"Bearer {ENV['LLM_API_KEY']}",
    }
    payload = json.dumps({
        'model': ENV.get('LLM_MODEL', 'gemini-3.7-flash-low'),
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt},
        ],
        'temperature': 0.1,
        'max_tokens': 1200,
    }).encode('utf-8')

    req = urllib.request.Request(url, data=payload, headers=headers)
    with urllib.request.urlopen(req, timeout=40) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        text = res['choices'][0]['message']['content'].strip()
        m = re.search(r'```(?:python|py)?\s*(.*?)\s*```', text, re.DOTALL)
        if m:
            return m.group(1).strip()
        return text

def main():
    print("=" * 60, flush=True)
    print("LeetCode Solver: Targeting 1,300 Solved Problems", flush=True)
    print("=" * 60, flush=True)

    ac_slugs, all_pairs = fetch_current_ac_slugs()
    initial_ac = len(ac_slugs)
    current_ac = initial_ac
    print(f"Current accepted count on LeetCode: {current_ac}", flush=True)

    if current_ac >= TARGET_AC:
        print(f"Target already reached! ({current_ac} >= {TARGET_AC})", flush=True)
        return

    needed = TARGET_AC - current_ac
    print(f"Problems needed to reach {TARGET_AC}: {needed}\n", flush=True)

    # Step 1: Collect unsolved Google questions with existing cached solutions
    google_details = {}
    if os.path.exists(DETAILS_PATH):
        google_details = json.load(open(DETAILS_PATH, 'r', encoding='utf-8'))

    cached_unsolved = []
    for slug, d in google_details.items():
        if slug in ac_slugs or d.get('isPaidOnly'):
            continue
        # Verify it has Python snippet
        has_py = any(s.get('langSlug') == 'python3' for s in (d.get('codeSnippets') or []))
        if not has_py:
            continue
        p = os.path.join(CACHE_DIR, f"{slug}.explain.json")
        if os.path.exists(p):
            try:
                sol = json.load(open(p, 'r', encoding='utf-8'))
                py = sol.get('code', {}).get('python', '')
                if py and py.strip() and 'class Solution' in py:
                    cached_unsolved.append({
                        'slug': slug,
                        'title': d.get('title', slug),
                        'question_id': d.get('questionId'),
                        'code': py,
                        'source': 'cache'
                    })
            except Exception:
                pass

    print(f"Available pre-solved free questions in cache: {len(cached_unsolved)}", flush=True)

    for item in cached_unsolved:
        if current_ac >= TARGET_AC:
            break

        slug = item['slug']
        if slug in ac_slugs:
            continue

        print(f"[{current_ac + 1}/{TARGET_AC}] {item['title']} ({slug})...", end=' ', flush=True)
        res = submit_solution(slug, item['question_id'], item['code'])

        status_msg = res.get('status_msg') if res else 'Error'
        if status_msg == 'Accepted':
            current_ac += 1
            ac_slugs.add(slug)
            runtime = res.get('status_runtime', 'N/A')
            print(f"ACCEPTED ({runtime}) -> Total: {current_ac}", flush=True)
        else:
            print(f"FAILED ({status_msg})", flush=True)

        time.sleep(DELAY_BETWEEN_SUBS)

    # Step 2: If still need more to hit 1300, pick popular free problems and solve via LLM
    if current_ac < TARGET_AC:
        print(f"\nRemaining needed: {TARGET_AC - current_ac}. Fetching popular unsolved free problems...", flush=True)
        free_unsolved = [p for p in all_pairs if p.get('status') != 'ac' and not p.get('paid_only')]
        # Sort by total_acs descending (most popular/straightforward)
        free_unsolved.sort(key=lambda p: p['stat']['total_acs'], reverse=True)

        for p_stat in free_unsolved:
            if current_ac >= TARGET_AC:
                break

            slug = p_stat['stat']['question__title_slug']
            if slug in ac_slugs:
                continue

            try:
                q_details = fetch_problem_details_leetcode(slug)
                if not q_details or q_details.get('isPaidOnly'):
                    continue

                title = q_details['title']
                content = q_details['content']
                backend_id = q_details['questionId']

                starter_code = ""
                for snip in q_details.get('codeSnippets') or []:
                    if snip.get('langSlug') == 'python3':
                        starter_code = snip.get('code', '')
                        break

                if not starter_code or 'class Solution' not in starter_code:
                    continue

                print(f"[{current_ac + 1}/{TARGET_AC}] [LLM] {title} ({slug})...", end=' ', flush=True)
                code = generate_python_solution_llm(title, content, starter_code)

                res = submit_solution(slug, backend_id, code)
                status_msg = res.get('status_msg') if res else 'Error'

                if status_msg == 'Accepted':
                    current_ac += 1
                    ac_slugs.add(slug)
                    runtime = res.get('status_runtime', 'N/A')
                    print(f"ACCEPTED ({runtime}) -> Total: {current_ac}", flush=True)
                else:
                    print(f"FAILED ({status_msg})", flush=True)

                time.sleep(DELAY_BETWEEN_SUBS)

            except Exception as e:
                print(f"Error ({slug}): {e}", flush=True)
                time.sleep(2)

    print("\n" + "=" * 60, flush=True)
    print(f"Done! Final solved count on LeetCode: {current_ac} (Started at: {initial_ac})", flush=True)
    print("=" * 60, flush=True)

if __name__ == '__main__':
    main()

if __name__ == '__main__':
    main()
