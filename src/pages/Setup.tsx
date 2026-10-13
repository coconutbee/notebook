import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { DATA_REPO, OWNER, PUBLIC_BRANCH, PUBLIC_REPO, SHARED_OWNER, SHARED_REPO } from '../config'
import { GitHub, checkTokenFormat, diagnoseNetwork, errorMessage } from '../github/api'
import { clearSharedToken, saveSharedToken, saveToken } from '../lib/auth'
import { detectRole } from '../lib/role'

const clean = (t: string) => t.replace(/\s/g, '') // 去掉複製時夾帶的空白與換行

export function Setup() {
  const [token, setToken] = useState('')
  const [sharedToken, setSharedToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const t = clean(token)
    const s = clean(sharedToken)
    if (!t && !s) return
    const formatError = (t && checkTokenFormat(t)) || (s && checkTokenFormat(s))
    if (formatError) {
      setError(formatError)
      return
    }
    setBusy(true)
    setError('')
    const fail = async (msg: string) => {
      const net = /無法連到 GitHub/.test(msg) ? `\n${await diagnoseNetwork()}` : ''
      setError(msg + net)
      setBusy(false)
    }
    let result: Awaited<ReturnType<typeof detectRole>>
    try {
      result = await detectRole(t ? new GitHub(t, OWNER, DATA_REPO) : null, s ? new GitHub(s, SHARED_OWNER, SHARED_REPO) : null)
    } catch (err) {
      return fail(
        `${errorMessage(err)}\n請確認 token 的 Repository access 有勾選對應的 repo（看不到私人 repo 時 GitHub 會回「找不到」），且 Contents 設為 Read and write。`,
      )
    }
    if (t && result.role === 'coworker') {
      return fail(`個人 token 無法存取 ${OWNER}/${DATA_REPO}。如果你是同事，請把個人 token 欄位清空，只填共享 token。`)
    }
    let keepShared = !!s
    if (s && !result.hasShared) {
      if (!confirm(`共享 token 無法存取 ${SHARED_OWNER}/${SHARED_REPO}，先只使用個人筆記嗎？（之後可再到這裡補上）`)) {
        setBusy(false)
        return
      }
      keepShared = false
    }
    if (result.role === 'owner') {
      const pubOk = await new GitHub(t, OWNER, PUBLIC_REPO).checkAccess().then(
        () => true,
        () => false,
      )
      if (!pubOk && !confirm(`個人 token 無法存取 ${OWNER}/${PUBLIC_REPO}，「公開筆記」無法發布（其他功能不受影響）。仍要繼續嗎？`)) {
        setBusy(false)
        return
      }
      saveToken(t)
    }
    if (keepShared) saveSharedToken(s)
    else clearSharedToken()
    // 重新載入讓整個 App 以新身分初始化
    location.hash = '#/'
    location.reload()
  }

  return (
    <div className="page narrow">
      <h1>設定</h1>
      <p>
        輸入 GitHub personal access token。兩把都只存在這台裝置的瀏覽器（localStorage），不會上傳到其他地方，之後可在「設定」頁登出清除。重新設定時，要用的 token 都需要再輸入一次。
      </p>
      <form onSubmit={submit} className="card form">
        <label htmlFor="token">個人 token（只有筆記本主人需要）</label>
        <input
          id="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="github_pat_…（可留空）"
        />
        <p className="small muted">
          讀寫 <code>{OWNER}/{DATA_REPO}</code>（私人筆記、日記、追蹤）與 <code>{OWNER}/{PUBLIC_REPO}</code> 的 <code>{PUBLIC_BRANCH}</code> 分支（公開筆記）。
        </p>

        <label htmlFor="shared-token">共享 token</label>
        <input
          id="shared-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={sharedToken}
          onChange={(e) => setSharedToken(e.target.value)}
          placeholder="github_pat_…（可留空）"
        />
        <p className="small muted">
          讀寫 <code>{SHARED_OWNER}/{SHARED_REPO}</code>（和同事共享的筆記）。同事只需要填這一把。
        </p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy || (!token.trim() && !sharedToken.trim())}>
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
            <strong>個人 token</strong>：Resource owner 選你自己，Repository access 選「Only select repositories」，勾選 <code>{DATA_REPO}</code> 和{' '}
            <code>{PUBLIC_REPO}</code>
          </li>
          <li>
            <strong>共享 token</strong>：Resource owner 選組織 <code>{SHARED_OWNER}</code>，只勾選 <code>{SHARED_REPO}</code>
          </li>
          <li>兩把都在 Permissions → Repository permissions → Contents 設為「Read and write」</li>
          <li>產生後複製貼到上面</li>
        </ol>
      </details>
      <p>
        <Link to="/notes">← 只看公開筆記</Link>
      </p>
    </div>
  )
}
