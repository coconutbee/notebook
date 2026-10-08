import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Globe, Lock } from 'lucide-react'
import { ConflictDialog } from '../components/ConflictDialog'
import { MarkdownView } from '../components/MarkdownView'
import { TagInput } from '../components/TagInput'
import { useToast } from '../components/Toast'
import { ConflictError, errorMessage } from '../github/api'
import { toDateStr } from '../lib/date'
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts'
import type { Visibility } from '../lib/frontmatter'
import { encodeNotePath, type Note } from '../lib/notes'
import { useStore, type SaveInput } from '../store'

interface Form {
  category: string
  title: string
  date: string
  tags: string[]
  visibility: Visibility
  body: string
}

const fromNote = (n: Note): Form => ({
  category: n.category,
  title: n.meta.title,
  date: n.meta.date,
  tags: n.meta.tags,
  visibility: n.meta.visibility,
  body: n.body,
})

const toInput = (f: Form, titleSuffix = ''): SaveInput => ({
  category: f.category,
  meta: { title: f.title.trim() + titleSuffix, date: f.date, tags: f.tags, visibility: f.visibility },
  body: f.body,
})

export function NoteEdit() {
  const editPath = useParams()['*']
  const [params] = useSearchParams()
  const { notes, categories, config, status, saveNote, fetchLatest } = useStore()
  const navigate = useNavigate()
  const toast = useToast()

  const original = editPath ? (notes.find((n) => n.path === editPath) ?? null) : null
  const draftId = editPath ?? 'new'

  /** 這次編輯所根據的版本（儲存時用它的 sha 偵測衝突） */
  const [base, setBase] = useState<Note | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<ConflictError | null>(null)
  const initialized = useRef(false)

  // 初始化：等筆記載入後填入表單，並詢問是否還原草稿
  useEffect(() => {
    if (initialized.current || status === 'loading' || (editPath && !original)) return
    initialized.current = true
    const cat = params.get('cat') ?? categories[0] ?? config.categories[0]
    const initial: Form = original
      ? fromNote(original)
      : {
          category: cat,
          title: params.get('title') ?? (cat === config.diaryCategory ? '日記' : ''),
          date: params.get('date') ?? toDateStr(),
          tags: [],
          visibility: 'private',
          body: '',
        }
    const draft = loadDraft(draftId)
    if (draft && confirm(`發現 ${new Date(draft.savedAt).toLocaleString('zh-TW')} 未儲存的草稿，要還原嗎？`)) {
      setForm({ category: draft.category, ...draft.meta, body: draft.body })
      setDirty(true)
    } else {
      clearDraft(draftId)
      setForm(initial)
    }
    setBase(original)
    // 快取的版本可能不是最新的：開啟編輯時向 GitHub 確認一次
    if (original) {
      fetchLatest(original.path)
        .then((latest) => {
          if (!latest) {
            toast('這篇筆記已在別處被刪除，儲存時會重新建立。', 'warn')
            setBase(null)
          } else if (latest.sha !== original.sha) {
            setBase(latest)
            if (!dirtyRef.current) setForm(fromNote(latest))
            else toast('遠端有較新的版本；儲存時會提示衝突。', 'warn')
          }
        })
        .catch(() => {
          /* 離線時先用快取版本，儲存時仍會檢查衝突 */
        })
    }
  }, [status, original, editPath, params, categories, config, draftId, fetchLatest, toast])

  // 自動暫存草稿：避免寫入失敗或關掉頁面時遺失內容
  useEffect(() => {
    if (!form || !dirty) return
    const timer = setTimeout(() => {
      const { category, body, ...meta } = form
      saveDraft(draftId, { category, meta, body, savedAt: new Date().toISOString() })
    }, 600)
    return () => clearTimeout(timer)
  }, [form, dirty, draftId])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', handler)
    return () => removeEventListener('beforeunload', handler)
  }, [dirty])

  if (editPath && !original) {
    return (
      <div className="page">
        <p className="empty">{status === 'loading' ? '載入中…' : <>找不到這篇筆記。<Link to="/notes">回到列表</Link></>}</p>
      </div>
    )
  }
  if (!form) return <div className="page"><p className="muted loading">載入中…</p></div>

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f!, ...patch }))
    setDirty(true)
  }

  async function save(asCopy = false) {
    if (!form) return
    setBusy(true)
    try {
      const { note, warning } = await saveNote(asCopy ? null : base, toInput(form, asCopy ? '（衝突副本）' : ''))
      clearDraft(draftId)
      setDirty(false)
      toast(warning ?? '已儲存', warning ? 'warn' : 'info')
      navigate(`/note/${encodeNotePath(note.path)}`, { replace: true })
    } catch (e) {
      const { category, body, ...meta } = form
      saveDraft(draftId, { category, meta, body, savedAt: new Date().toISOString() })
      if (e instanceof ConflictError) setConflict(e)
      else toast(`儲存失敗：${errorMessage(e)}（內容已暫存為草稿）`, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function loadRemote() {
    if (!form || !conflict) return
    try {
      await navigator.clipboard.writeText(form.body)
    } catch {
      if (!confirm('無法複製到剪貼簿。載入遠端版本會取代你目前的編輯內容，確定嗎？')) return
    }
    setBusy(true)
    try {
      if (conflict.status === 422) {
        // 新增時撞名：直接開啟那篇已存在的筆記
        clearDraft(draftId)
        setDirty(false)
        await fetchLatest(conflict.path)
        navigate(`/note/${encodeNotePath(conflict.path)}`, { replace: true })
        return
      }
      const latest = await fetchLatest(conflict.path)
      setBase(latest)
      if (latest) setForm(fromNote(latest))
      setDirty(false)
      clearDraft(draftId)
      setConflict(null)
      toast(latest ? '已載入遠端版本，你剛才的內容在剪貼簿裡。' : '遠端檔案已被刪除，儲存時會重新建立。', 'warn')
    } catch (e) {
      toast(`載入失敗：${errorMessage(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    if (dirty && !confirm('放棄未儲存的修改？')) return
    clearDraft(draftId)
    setDirty(false)
    if (history.length > 1) navigate(-1)
    else navigate('/notes')
  }

  const catOptions = categories.includes(form.category) ? categories : [...categories, form.category]

  return (
    <div className="page editor-page">
      <header className="page-header">
        <button className="icon-btn" aria-label="取消" onClick={cancel}>
          <ArrowLeft size={22} />
        </button>
        <h1 className="header-title">{original ? '編輯筆記' : '新增筆記'}</h1>
        <button className="btn btn-primary" onClick={() => save()} disabled={busy || !form.title.trim()}>
          {busy ? '儲存中…' : '儲存'}
        </button>
      </header>

      <div className="form">
        <label htmlFor="title">標題</label>
        <input id="title" value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="筆記標題" />

        <div className="row">
          <div>
            <label htmlFor="category">分類</label>
            <select id="category" value={form.category} onChange={(e) => update({ category: e.target.value })}>
              {catOptions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="date">日期</label>
            <input id="date" type="date" value={form.date} onChange={(e) => e.target.value && update({ date: e.target.value })} />
          </div>
        </div>

        <label htmlFor="tags">標籤</label>
        <TagInput tags={form.tags} onChange={(tags) => update({ tags })} />

        <fieldset className="segmented">
          <legend>誰可以看</legend>
          <label>
            <input type="radio" name="vis" checked={form.visibility === 'private'} onChange={() => update({ visibility: 'private' })} />
            <Lock size={16} aria-hidden /> 私人
          </label>
          <label>
            <input type="radio" name="vis" checked={form.visibility === 'public'} onChange={() => update({ visibility: 'public' })} />
            <Globe size={16} aria-hidden /> 公開
          </label>
        </fieldset>
        {form.visibility === 'public' && (
          <p className="small hint">公開筆記會複製到公開 repo，任何人都能在網站上看到。之後改回私人會從網站移除，但公開 repo 的 git 歷史仍保有舊版本。</p>
        )}
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'edit'} onClick={() => setTab('edit')}>
          編輯
        </button>
        <button role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>
          預覽
        </button>
      </div>
      <div className={`editor-split show-${tab}`}>
        <textarea
          className="editor"
          aria-label="內容（Markdown）"
          value={form.body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder="用 Markdown 寫內容…"
        />
        <div className="preview">
          {form.body.trim() ? <MarkdownView body={form.body} /> : <p className="muted">（沒有內容）</p>}
        </div>
      </div>

      {conflict && (
        <ConflictDialog
          exists={conflict.status === 422}
          path={conflict.path}
          busy={busy}
          onReload={loadRemote}
          onSaveCopy={() => {
            setConflict(null)
            void save(true)
          }}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  )
}
