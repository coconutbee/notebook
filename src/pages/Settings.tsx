import { useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { categoryError } from '../lib/config'
import { imageRefs } from '../lib/images'
import { DATA_REPO, OWNER, PUBLIC_BRANCH, PUBLIC_REPO } from '../config'
import { useToast } from '../components/Toast'
import { errorMessage } from '../github/api'
import { logout } from '../lib/auth'
import { cacheClear } from '../lib/cache'
import { useStore } from '../store'

function CategoryManager() {
  const { notes, categories, config, saveConfig, renameCategory } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const count = (c: string) => notes.filter((n) => n.category === c).length
  const list = config.categories

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label)
    try {
      const msg = await fn()
      if (msg) toast(msg)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  function add(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    const err = categoryError(n, categories)
    setAddError(err)
    if (err) return
    void run('新增中…', async () => {
      await saveConfig({ ...config, categories: [...list, n] }, `新增分類：${n}`)
      setName('')
      return `已新增分類「${n}」`
    })
  }

  function move(i: number, d: -1 | 1) {
    const next = [...list]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    void run('儲存中…', () => saveConfig({ ...config, categories: next }, '調整分類順序'))
  }

  function rename(from: string) {
    const to = prompt(`把「${from}」改名為：`, from)?.trim()
    if (!to || to === from) return
    const merge = categories.includes(to)
    const err = merge ? null : categoryError(to, categories)
    if (err) return toast(err, 'error')
    const n = count(from)
    const msg = merge
      ? `「${to}」已經存在，會把「${from}」的 ${n} 篇筆記併入「${to}」並移除「${from}」。確定嗎？`
      : `確定把「${from}」改名為「${to}」嗎？${n ? `\n會搬移 ${n} 篇筆記到新資料夾（每篇是一次 GitHub commit）。` : ''}`
    if (!confirm(msg)) return
    void run('改名中…', async () => {
      const { warning } = await renameCategory(from, to, (done, total) => total && setBusy(`搬移筆記 ${done}/${total}…`))
      if (warning) toast(warning, 'error')
      return `已將「${from}」改名為「${to}」`
    })
  }

  function remove(c: string) {
    if (count(c)) return toast(`「${c}」還有 ${count(c)} 篇筆記，請先把筆記移到其他分類，或用改名合併到其他分類。`, 'error')
    if (c === config.diaryCategory) return toast(`「${c}」是首頁日記使用的分類，不能刪除；可以改名。`, 'error')
    if (!confirm(`確定刪除分類「${c}」嗎？`)) return
    void run('刪除中…', async () => {
      await saveConfig({ ...config, categories: list.filter((x) => x !== c) }, `刪除分類：${c}`)
      return `已刪除分類「${c}」`
    })
  }

  // 資料夾裡有筆記但沒列在 config.json 的分類
  const extra = categories.filter((c) => !list.includes(c))

  return (
    <section className="card" aria-busy={!!busy}>
      <h2>分類</h2>
      <ul className="cat-list">
        {[...list, ...extra].map((c, i) => (
          <li key={c}>
            <span className="cat-name">
              {c}
              <span className="muted small">
                {' '}
                {count(c)} 篇{c === config.diaryCategory ? '・日記' : ''}
                {extra.includes(c) ? '・未列在設定檔' : ''}
              </span>
            </span>
            {i < list.length && (
              <>
                <button className="icon-btn" aria-label={`把「${c}」往上移`} disabled={!!busy || i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={18} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`把「${c}」往下移`}
                  disabled={!!busy || i === list.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={18} />
                </button>
              </>
            )}
            <button className="icon-btn" aria-label={`把「${c}」改名`} disabled={!!busy} onClick={() => rename(c)}>
              <Pencil size={18} />
            </button>
            {i < list.length && (
              <button className="icon-btn" aria-label={`刪除「${c}」`} disabled={!!busy} onClick={() => remove(c)}>
                <Trash2 size={18} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <form className="cat-add" onSubmit={add}>
        <label className="sr-only" htmlFor="new-cat">
          新分類名稱
        </label>
        <input
          id="new-cat"
          value={name}
          placeholder="新分類名稱"
          onChange={(e) => (setName(e.target.value), setAddError(null))}
          aria-invalid={!!addError}
          aria-describedby={addError ? 'new-cat-err' : undefined}
        />
        <button className="btn btn-primary" disabled={!!busy}>
          <Plus size={18} aria-hidden /> 新增
        </button>
      </form>
      {addError && (
        <p id="new-cat-err" className="error small">
          {addError}
        </p>
      )}
      <p className="small muted" role="status">
        {busy ?? '分類存在 notebook-data 的 config.json；改名會把筆記搬到新資料夾，只有空的分類可以刪除。'}
      </p>
    </section>
  )
}

export function Settings() {
  const { notes, reload, republish, images, deleteImage } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const publicCount = notes.filter((n) => n.meta.visibility === 'public').length
  const used = new Set(notes.flatMap((n) => imageRefs(n.body)))
  const unused = [...images.keys()].filter((p) => !used.has(p))

  function cleanImages() {
    const msg =
      `以下 ${unused.length} 張圖片沒有被任何已儲存的筆記使用：\n\n${unused.join('\n')}\n\n` +
      '注意：還沒儲存的草稿裡的圖片也算在內。刪除後仍可從 notebook-data 的 git 歷史找回。確定刪除嗎？'
    if (!confirm(msg)) return
    void run(async () => {
      for (const p of unused) await deleteImage(p)
    }, `已刪除 ${unused.length} 張未使用的圖片`)
  }

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
        </dl>
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
          <button className="btn" disabled={busy || !unused.length} onClick={cleanImages}>
            清理未使用的圖片{unused.length ? `（${unused.length} 張）` : ''}
          </button>
        </div>
        <p className="small muted">共 {images.size} 張圖片。</p>
      </section>

      <CategoryManager />

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
