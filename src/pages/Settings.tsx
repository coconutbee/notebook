import { Fragment, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { categoryError } from '../lib/config'
import { imageRefs } from '../lib/images'
import { DATA_REPO, OWNER, PUBLIC_BRANCH, PUBLIC_REPO, SHARED_OWNER, SHARED_REPO } from '../config'
import { useToast } from '../components/Toast'
import { errorMessage } from '../github/api'
import { logout } from '../lib/auth'
import { cacheClear } from '../lib/cache'
import { useStore, type Space } from '../store'

type Run = (label: string, fn: () => Promise<string | void>) => Promise<void>

/** 某個分類底下的子分類：新增、改名（改寫筆記的 subcategory）、排序、刪除沒有筆記的 */
function SubcategoryEditor({
  space,
  category,
  busy,
  run,
  setBusy,
}: {
  space: Space
  category: string
  busy: boolean
  run: Run
  setBusy: (s: string) => void
}) {
  const { notes: allNotes, configOf, saveConfig, renameSubcategory, subcategoriesOf } = useStore()
  const notes = allNotes.filter((n) => n.space === space)
  const config = configOf(space)
  const toast = useToast()
  const [name, setName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const list = config.subcategories[category] ?? []
  const all = subcategoriesOf(category, space)
  const count = (s: string) => notes.filter((n) => n.category === category && n.meta.subcategory === s).length
  const unassigned = notes.filter((n) => n.category === category && !n.meta.subcategory).length
  const save = (next: string[], message: string) =>
    saveConfig(space, { ...config, subcategories: { ...config.subcategories, [category]: next } }, message)

  function add(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    const err = n ? (all.includes(n) ? '已經有這個子分類了' : null) : '請輸入子分類名稱'
    setAddError(err)
    if (err) return
    void run('新增中…', async () => {
      await save([...list, n], `新增子分類：${category}／${n}`)
      setName('')
      return `已新增子分類「${n}」`
    })
  }

  function move(i: number, d: -1 | 1) {
    const next = [...list]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    void run('儲存中…', () => save(next, `調整子分類順序：${category}`))
  }

  function rename(from: string) {
    const to = prompt(`把子分類「${from}」改名為：`, from)?.trim()
    if (!to || to === from) return
    const n = count(from)
    const msg = all.includes(to)
      ? `「${to}」已經存在，會把「${from}」的 ${n} 篇筆記併入「${to}」並移除「${from}」。確定嗎？`
      : `確定把「${from}」改名為「${to}」嗎？${n ? `\n會更新 ${n} 篇筆記（每篇是一次 GitHub commit）。` : ''}`
    if (!confirm(msg)) return
    void run('改名中…', async () => {
      const { warning } = await renameSubcategory(space, category, from, to, (done, total) => total && setBusy(`更新筆記 ${done}/${total}…`))
      if (warning) toast(warning, 'error')
      return `已將「${from}」改名為「${to}」`
    })
  }

  function remove(s: string) {
    if (count(s)) return toast(`「${s}」還有 ${count(s)} 篇筆記，請先在編輯器把筆記改到其他子分類，或用改名合併。`, 'error')
    if (!confirm(`確定刪除子分類「${s}」嗎？`)) return
    void run('刪除中…', async () => {
      await save(list.filter((x) => x !== s), `刪除子分類：${category}／${s}`)
      return `已刪除子分類「${s}」`
    })
  }

  return (
    <div className="sub-editor">
      {all.length > 0 && (
        <ul className="cat-list sub-list">
          {all.map((s, i) => {
            const listed = i < list.length
            return (
              <li key={s}>
                <span className="cat-name">
                  {s}
                  <span className="muted small">
                    {' '}
                    {count(s)} 篇{listed ? '' : '・未列在設定檔'}
                  </span>
                </span>
                {listed && (
                  <>
                    <button className="icon-btn" aria-label={`把「${s}」往上移`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp size={18} />
                    </button>
                    <button className="icon-btn" aria-label={`把「${s}」往下移`} disabled={busy || i === list.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown size={18} />
                    </button>
                  </>
                )}
                <button className="icon-btn" aria-label={`把子分類「${s}」改名`} disabled={busy} onClick={() => rename(s)}>
                  <Pencil size={18} />
                </button>
                {listed && (
                  <button className="icon-btn" aria-label={`刪除子分類「${s}」`} disabled={busy} onClick={() => remove(s)}>
                    <Trash2 size={18} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="small muted sub-hint">
        {all.length ? `還沒選子分類的筆記：${unassigned} 篇（在編輯器裡選）` : '還沒有子分類。'}
      </p>
      <form className="cat-add" onSubmit={add}>
        <label className="sr-only" htmlFor={`new-sub-${category}`}>
          {category} 的新子分類名稱
        </label>
        <input
          id={`new-sub-${category}`}
          value={name}
          placeholder={`新增「${category}」的子分類`}
          onChange={(e) => (setName(e.target.value), setAddError(null))}
          aria-invalid={!!addError}
        />
        <button className="btn" disabled={busy}>
          <Plus size={18} aria-hidden /> 新增
        </button>
      </form>
      {addError && <p className="error small">{addError}</p>}
    </div>
  )
}

/** 一個 space 的分類管理（擁有者有「我的分類」與「共享分類」兩份） */
function CategoryManager({ space, title }: { space: Space; title: string }) {
  const { notes: allNotes, categoriesOf, configOf, saveConfig, renameCategory, subcategoriesOf } = useStore()
  const notes = allNotes.filter((n) => n.space === space)
  const categories = categoriesOf(space)
  const config = configOf(space)
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
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
      await saveConfig(space, { ...config, categories: [...list, n] }, `新增分類：${n}`)
      setName('')
      return `已新增分類「${n}」`
    })
  }

  function move(i: number, d: -1 | 1) {
    const next = [...list]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    void run('儲存中…', () => saveConfig(space, { ...config, categories: next }, '調整分類順序'))
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
      const { warning } = await renameCategory(space, from, to, (done, total) => total && setBusy(`搬移筆記 ${done}/${total}…`))
      if (warning) toast(warning, 'error')
      return `已將「${from}」改名為「${to}」`
    })
  }

  function remove(c: string) {
    if (count(c)) return toast(`「${c}」還有 ${count(c)} 篇筆記，請先把筆記移到其他分類，或用改名合併到其他分類。`, 'error')
    if (c === config.diaryCategory) return toast(`「${c}」是首頁日記使用的分類，不能刪除；可以改名。`, 'error')
    if (!confirm(`確定刪除分類「${c}」嗎？`)) return
    void run('刪除中…', async () => {
      await saveConfig(space, { ...config, categories: list.filter((x) => x !== c) }, `刪除分類：${c}`)
      return `已刪除分類「${c}」`
    })
  }

  // 資料夾裡有筆記但沒列在 config.json 的分類
  const extra = categories.filter((c) => !list.includes(c))

  return (
    <section className="card" aria-busy={!!busy}>
      <h2>{title}</h2>
      <ul className="cat-list">
        {[...list, ...extra].map((c, i) => (
          <li key={c}>
            <div className="cat-row">
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
            </div>
            <button className="sub-toggle" aria-expanded={open === c} onClick={() => setOpen(open === c ? null : c)}>
              <ChevronRight size={16} aria-hidden />
              子分類（{subcategoriesOf(c, space).length}）
            </button>
            {open === c && <SubcategoryEditor space={space} category={c} busy={!!busy} run={run} setBusy={setBusy} />}
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
        {busy ?? `分類與子分類存在 ${space === 'shared' ? SHARED_REPO : DATA_REPO} 的 config.json；分類改名會把筆記搬到新資料夾，子分類改名會更新筆記；只有空的分類／子分類可以刪除。`}
      </p>
    </section>
  )
}

const SPACE_REPO: Record<Space, string> = { personal: `${OWNER}/${DATA_REPO}`, shared: `${SHARED_OWNER}/${SHARED_REPO}` }

/** 某個 space 裡沒有被任何已儲存筆記引用的圖片 */
function useUnusedImages(space: Space): string[] {
  const { notes, images } = useStore()
  const used = new Set(notes.filter((n) => n.space === space).flatMap((n) => imageRefs(n.body)))
  return [...images[space].keys()].filter((p) => !used.has(p))
}

function CleanImagesButton({ space, busy, run }: { space: Space; busy: boolean; run: (fn: () => Promise<void>, done: string) => Promise<void> }) {
  const { deleteImage, spaces } = useStore()
  const unused = useUnusedImages(space)
  const label = spaces.length > 1 ? (space === 'shared' ? '共享區' : '個人區') : ''
  function clean() {
    const msg =
      `以下 ${unused.length} 張圖片沒有被任何已儲存的筆記使用：\n\n${unused.join('\n')}\n\n` +
      `注意：還沒儲存的草稿裡的圖片也算在內。刪除後仍可從 ${SPACE_REPO[space]} 的 git 歷史找回。確定刪除嗎？`
    if (!confirm(msg)) return
    void run(async () => {
      for (const p of unused) await deleteImage(space, p)
    }, `已刪除 ${unused.length} 張未使用的圖片`)
  }
  return (
    <button className="btn" disabled={busy || !unused.length} onClick={clean}>
      清理{label}未使用的圖片{unused.length ? `（${unused.length} 張）` : ''}
    </button>
  )
}

export function Settings() {
  const { notes, reload, republish, images, mode, spaces, sharedError } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const owner = mode === 'owner'
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

  const repoLink = (full: string) => (
    <a href={`https://github.com/${full}`} target="_blank" rel="noopener noreferrer">
      {full}
    </a>
  )

  return (
    <div className="page narrow">
      <h1>設定</h1>

      {spaces.map((space) => (
        <CategoryManager key={space} space={space} title={owner && space === 'shared' ? '共享分類' : owner ? '我的分類' : '分類'} />
      ))}

      <section className="card">
        <h2>資料</h2>
        <dl className="kv">
          {spaces.map((space) => (
            <Fragment key={space}>
              <dt>{space === 'shared' ? '共享資料 repo' : '私人資料 repo'}</dt>
              <dd>{repoLink(SPACE_REPO[space])}</dd>
            </Fragment>
          ))}
          {owner && (
            <>
              <dt>公開筆記</dt>
              <dd>
                <a href={`https://github.com/${OWNER}/${PUBLIC_REPO}/tree/${PUBLIC_BRANCH}`} target="_blank" rel="noopener noreferrer">
                  {OWNER}/{PUBLIC_REPO}（{PUBLIC_BRANCH} 分支）
                </a>
              </dd>
            </>
          )}
          <dt>筆記</dt>
          <dd>
            {notes.length} 篇{owner ? `（公開 ${publicCount} 篇）` : ''}
          </dd>
        </dl>
        {sharedError && <p className="small hint">{sharedError}</p>}
        <div className="btn-row">
          <button className="btn" disabled={busy} onClick={() => run(reload, '已重新載入')}>
            重新載入
          </button>
          {owner && (
            <button className="btn" disabled={busy} onClick={() => run(republish, '公開筆記已同步')}>
              重新同步公開筆記
            </button>
          )}
          <button className="btn" disabled={busy} onClick={() => run(async () => { await cacheClear(); await reload() }, '已清除快取')}>
            清除本機快取
          </button>
          {spaces.map((space) => (
            <CleanImagesButton key={space} space={space} busy={busy} run={run} />
          ))}
        </div>
        <p className="small muted">
          共 {spaces.reduce((sum, s) => sum + images[s].size, 0)} 張圖片。
        </p>
      </section>

      <section className="card">
        <h2>帳號</h2>
        <p className="small muted">
          {owner ? '你是筆記本主人。' : '你是共享筆記的協作者，只看得到共享筆記。'}Token 存在這台裝置的瀏覽器中。
        </p>
        <div className="btn-row">
          <Link className="btn" to="/setup">
            更換 token{owner && !spaces.includes('shared') ? '（加入共享 token）' : ''}
          </Link>
          <button className="btn btn-danger" onClick={signOut}>
            登出並清除這台裝置的資料
          </button>
        </div>
      </section>
    </div>
  )
}
