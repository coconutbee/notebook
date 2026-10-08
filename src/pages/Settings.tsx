import { useState } from 'react'
import { DATA_REPO, OWNER, PUBLIC_BRANCH, PUBLIC_REPO } from '../config'
import { useToast } from '../components/Toast'
import { errorMessage } from '../github/api'
import { logout } from '../lib/auth'
import { cacheClear } from '../lib/cache'
import { useStore } from '../store'

export function Settings() {
  const { notes, categories, reload, republish } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const publicCount = notes.filter((n) => n.meta.visibility === 'public').length

  async function run(fn: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await fn()
      toast(done)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (!confirm('登出會清除這台裝置上的 token、快取的筆記和未儲存的草稿。確定要登出嗎？')) return
    await logout()
    location.hash = '#/'
    location.reload()
  }

  const repoLink = (repo: string) => (
    <a href={`https://github.com/${OWNER}/${repo}`} target="_blank" rel="noopener noreferrer">
      {OWNER}/{repo}
    </a>
  )

  return (
    <div className="page narrow">
      <h1>設定</h1>

      <section className="card">
        <h2>資料</h2>
        <dl className="kv">
          <dt>私人資料 repo</dt>
          <dd>{repoLink(DATA_REPO)}</dd>
          <dt>公開筆記</dt>
          <dd>
            <a href={`https://github.com/${OWNER}/${PUBLIC_REPO}/tree/${PUBLIC_BRANCH}`} target="_blank" rel="noopener noreferrer">
              {OWNER}/{PUBLIC_REPO}（{PUBLIC_BRANCH} 分支）
            </a>
          </dd>
          <dt>筆記</dt>
          <dd>
            {notes.length} 篇（公開 {publicCount} 篇）
          </dd>
          <dt>分類</dt>
          <dd>{categories.join('、')}</dd>
        </dl>
        <p className="small muted">
          要新增分類，請在 GitHub 上編輯 {DATA_REPO} 的 <code>config.json</code>，再按「重新載入」。
        </p>
        <div className="btn-row">
          <button className="btn" disabled={busy} onClick={() => run(reload, '已重新載入')}>
            重新載入
          </button>
          <button className="btn" disabled={busy} onClick={() => run(republish, '公開筆記已同步')}>
            重新同步公開筆記
          </button>
          <button className="btn" disabled={busy} onClick={() => run(async () => { await cacheClear(); await reload() }, '已清除快取')}>
            清除本機快取
          </button>
        </div>
      </section>

      <section className="card">
        <h2>帳號</h2>
        <p className="small muted">Token 存在這台裝置的瀏覽器中。</p>
        <button className="btn btn-danger" onClick={signOut}>
          登出並清除這台裝置的資料
        </button>
      </section>
    </div>
  )
}
