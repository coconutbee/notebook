import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { DATA_REPO, OWNER, PUBLIC_BRANCH, PUBLIC_REPO } from '../config'
import { GitHub, GitHubError, checkTokenFormat, diagnoseNetwork, errorMessage } from '../github/api'
import { saveToken } from '../lib/auth'

export function Setup() {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    // 去掉複製時夾帶的空白與換行
    const t = token.replace(/\s/g, '')
    if (!t) return
    const formatError = checkTokenFormat(t)
    if (formatError) {
      setError(formatError)
      return
    }
    setBusy(true)
    setError('')
    try {
      await new GitHub(t, OWNER, DATA_REPO).checkAccess()
    } catch (err) {
      const hint = err instanceof GitHubError && err.status === 0 ? `\n${await diagnoseNetwork()}` : ''
      setError(`無法存取 ${OWNER}/${DATA_REPO}：${errorMessage(err)}${hint}`)
      setBusy(false)
      return
    }
    const pubOk = await new GitHub(t, OWNER, PUBLIC_REPO).checkAccess().then(
      () => true,
      () => false,
    )
    if (
      !pubOk &&
      !confirm(`這個 token 無法存取 ${OWNER}/${PUBLIC_REPO}，「公開筆記」無法發布（私人筆記不受影響）。仍要繼續嗎？`)
    ) {
      setBusy(false)
      return
    }
    saveToken(t)
    // 重新載入讓整個 App 以擁有者身分初始化
    location.hash = '#/'
    location.reload()
  }

  return (
    <div className="page narrow">
      <h1>設定</h1>
      <p>
        輸入 GitHub personal access token，用來讀寫私人資料 repo <code>{OWNER}/{DATA_REPO}</code>
        {' '}，以及發布公開筆記用的 <code>{OWNER}/{PUBLIC_REPO}</code>（<code>{PUBLIC_BRANCH}</code> 分支）。
      </p>
      <form onSubmit={submit} className="card form">
        <label htmlFor="token">Personal access token</label>
        <input
          id="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="github_pat_…"
        />
        <p className="small muted">
          Token 只會存在這台裝置的瀏覽器（localStorage），不會上傳到其他地方。之後可在「設定」頁登出清除。
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy || !token.trim()}>
          {busy ? '驗證中…' : '驗證並儲存'}
        </button>
      </form>
      <details className="card">
        <summary>如何建立 token？</summary>
        <ol>
          <li>
            打開 GitHub →{' '}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
              Fine-grained personal access tokens
            </a>
          </li>
          <li>
            Repository access 選「Only select repositories」，勾選 <code>{DATA_REPO}</code> 和 <code>{PUBLIC_REPO}</code>
          </li>
          <li>Permissions → Repository permissions → Contents 設為「Read and write」</li>
          <li>產生後複製貼到上面</li>
        </ol>
      </details>
      <p>
        <Link to="/notes">← 只看公開筆記</Link>
      </p>
    </div>
  )
}
