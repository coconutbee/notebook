import { decodeBase64, encodeBase64 } from './base64'

const API = 'https://api.github.com'

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** 檔案已在別處被修改（sha 不符），或要新增的檔案已經存在 */
export class ConflictError extends GitHubError {
  constructor(status: number, message: string, public path: string) {
    super(status, message)
  }
}

export interface TreeFile {
  path: string
  sha: string
}

export interface RemoteFile {
  path: string
  sha: string
  text: string
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

function humanize(status: number, msg: string): string {
  if (status === 401) return 'Token 無效或已過期，請到「設定」登出後重新輸入。'
  if (status === 403 && /not accessible by personal access token/i.test(msg))
    return 'Token 沒有寫入權限：請到 GitHub 編輯 token，把 Repository permissions → Contents 設為「Read and write」。'
  if (status === 403) return `權限不足或已達 API 次數上限（${msg}）`
  if (status === 404) return '找不到 repo 或檔案，請確認 repo 名稱以及 token 是否有該 repo 的權限。'
  return `GitHub 錯誤 ${status}：${msg}`
}

export class GitHub {
  /** branch 省略時使用 repo 的預設分支 */
  constructor(
    private token: string,
    public owner: string,
    public repo: string,
    public branch?: string,
  ) {}

  private get ref() {
    return this.branch ? `?ref=${encodeURIComponent(this.branch)}` : ''
  }

  private get branchBody() {
    return this.branch ? { branch: this.branch } : {}
  }

  private async req(method: string, path: string, body?: unknown, filePath = '') {
    let res: Response
    try {
      res = await fetch(`${API}/repos/${this.owner}/${this.repo}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (e) {
      throw new GitHubError(0, `無法連到 GitHub，請檢查網路後再試一次。（${errorMessage(e)}）`)
    }
    if (res.ok) return res.status === 204 ? null : res.json()
    const msg: string = await res.json().then((j) => j.message ?? '').catch(() => res.statusText)
    // 409：sha 過期；422 + sha：要新增的檔案已存在
    if (filePath && (res.status === 409 || (res.status === 422 && /sha/i.test(msg)))) {
      throw new ConflictError(res.status, msg, filePath)
    }
    throw new GitHubError(res.status, humanize(res.status, msg))
  }

  checkAccess(): Promise<{ full_name: string; private: boolean }> {
    return this.req('GET', '')
  }

  /** 列出 repo 內所有檔案；空 repo 回傳 [] */
  async listFiles(): Promise<TreeFile[]> {
    try {
      const data = await this.req('GET', `/git/trees/${encodeURIComponent(this.branch ?? 'HEAD')}?recursive=1`)
      return (data.tree as { type: string; path: string; sha: string }[])
        .filter((t) => t.type === 'blob')
        .map(({ path, sha }) => ({ path, sha }))
    } catch (e) {
      // 空 repo（還沒有任何 commit）或分支不存在會回 409 / 404；404 時先確認 repo 本身存在
      if (e instanceof GitHubError && (e.status === 409 || e.status === 404)) {
        if (e.status === 404) await this.checkAccess()
        return []
      }
      throw e
    }
  }

  async getBlob(sha: string): Promise<string> {
    const data = await this.req('GET', `/git/blobs/${sha}`)
    return decodeBase64(data.content)
  }

  /** 讀取單一檔案；不存在回傳 null */
  async getFile(path: string): Promise<RemoteFile | null> {
    try {
      const data = await this.req('GET', `/contents/${encodePath(path)}${this.ref}`)
      return { path, sha: data.sha, text: decodeBase64(data.content) }
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null
      throw e
    }
  }

  /** 新增（不帶 sha）或更新（帶讀取時的 sha）。sha 不符時丟出 ConflictError，絕不覆蓋 */
  async putFile(path: string, text: string, message: string, sha?: string): Promise<string> {
    const data = await this.req(
      'PUT',
      `/contents/${encodePath(path)}`,
      { message, content: encodeBase64(text), ...(sha ? { sha } : {}), ...this.branchBody },
      path,
    )
    return data.content.sha
  }

  async deleteFile(path: string, sha: string, message: string): Promise<void> {
    await this.req('DELETE', `/contents/${encodePath(path)}`, { message, sha, ...this.branchBody }, path)
  }

  /** 分支不存在時建立一個獨立（orphan）分支，只含一個 README，和 main 的程式碼完全無關 */
  async ensureBranch(readme: string): Promise<void> {
    if (!this.branch) return
    try {
      await this.req('GET', `/git/ref/heads/${encodeURIComponent(this.branch)}`)
      return
    } catch (e) {
      if (!(e instanceof GitHubError && e.status === 404)) throw e
    }
    const tree = await this.req('POST', '/git/trees', {
      tree: [{ path: 'README.md', mode: '100644', type: 'blob', content: readme }],
    })
    const commit = await this.req('POST', '/git/commits', {
      message: `建立 ${this.branch} 分支`,
      tree: tree.sha,
      parents: [],
    })
    await this.req('POST', '/git/refs', { ref: `refs/heads/${this.branch}`, sha: commit.sha })
  }
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** token 只能是可見的 ASCII 字元，否則瀏覽器會拒絕送出 header（看起來像網路錯誤） */
export function checkTokenFormat(token: string): string | null {
  if (!/^[!-~]+$/.test(token)) return 'Token 含有中文、全形或其他特殊字元。請只貼上 token 本身（github_pat_ 開頭的那一串）。'
  if (!/^(github_pat_|gh[pousr]_)/.test(token)) return 'Token 格式看起來不對：fine-grained token 應以 github_pat_ 開頭。'
  return null
}

/** 連線失敗時判斷原因：連不到 GitHub，還是只有帶 token 的請求被擋 */
export async function diagnoseNetwork(): Promise<string> {
  const reachable = await fetch(`${API}/zen`, { cache: 'no-store' }).then(
    (r) => r.ok,
    () => false,
  )
  return reachable
    ? '可以連到 GitHub，但帶 token 的請求被擋下。請停用廣告阻擋等瀏覽器擴充功能，或換一個瀏覽器再試。'
    : '這個瀏覽器完全連不到 api.github.com，可能是公司網路／防火牆、VPN 或瀏覽器擴充功能擋住了。請試試手機行動網路或其他網路。'
}
