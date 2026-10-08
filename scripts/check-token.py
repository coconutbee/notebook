"""檢查 GitHub token 的權限（不會印出 token 本身）

用法：python scripts/check-token.py <存放 token 的文字檔>
"""
import json
import re
import sys
import urllib.error
import urllib.request

OWNER = 'coconutbee'
REPOS = ['notebook-data', 'notebook']

text = open(sys.argv[1], encoding='utf-8-sig').read()
m = re.search(r'github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+', text)
if not m:
    sys.exit('檔案裡找不到 github_pat_ 或 ghp_ 開頭的 token')
token = m.group(0)
print(f"token 類型：{'fine-grained' if token.startswith('github_pat_') else 'classic'}，長度 {len(token)}")
extra = len(text.strip()) - len(token)
if extra:
    print(f'注意：檔案裡除了 token 還有 {extra} 個其他字元，貼到網站時只能貼 token 本身')


def get(path):
    req = urllib.request.Request(
        'https://api.github.com' + path,
        headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json'},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r), r.headers
    except urllib.error.HTTPError as e:
        body = e.read()
        return e.code, json.loads(body) if body else {}, e.headers


status, user, headers = get('/user')
owner = user.get('login') if status == 200 else f"無法辨識（{status} {user.get('message')}）"
print(f'token 擁有者：{owner}')
if headers.get('X-OAuth-Scopes') is not None:
    print(f"classic token 的 scopes：{headers.get('X-OAuth-Scopes') or '（沒有任何 scope）'}")

status, repos, _ = get('/user/repos?per_page=100&affiliation=owner')
if status == 200:
    print(f"token 看得到的 repo：{', '.join(r['full_name'] for r in repos) or '（沒有）'}")

for name in REPOS:
    status, data, _ = get(f'/repos/{OWNER}/{name}')
    if status == 200:
        print(f"✓ {OWNER}/{name}：可存取，權限 {data.get('permissions')}")
    else:
        print(f"✗ {OWNER}/{name}：{status} {data.get('message')}")
