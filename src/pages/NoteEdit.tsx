import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Globe, ImagePlus, Lock, Users } from 'lucide-react'
import { ConflictDialog } from '../components/ConflictDialog'
import { MarkdownView } from '../components/MarkdownView'
import { TagInput } from '../components/TagInput'
import { useToast } from '../components/Toast'
import { ConflictError, errorMessage } from '../github/api'
import { toDateStr } from '../lib/date'
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts'
import type { Visibility } from '../lib/frontmatter'
import { encodeNotePath, noteId, type Note } from '../lib/notes'
import { useStore, type SaveInput, type Space } from '../store'

interface Form {
  space: Space
  category: string
  subcategory: string
  title: string
  date: string
  tags: string[]
  visibility: Visibility
  body: string
}

const fromNote = (n: Note): Form => ({
  space: n.space,
  category: n.category,
  subcategory: n.meta.subcategory ?? '',
  title: n.meta.title,
  date: n.meta.date,
  tags: n.meta.tags,
  visibility: n.meta.visibility,
  body: n.body,
})

const toInput = (f: Form, titleSuffix = ''): SaveInput => ({
  space: f.space,
  category: f.category,
  meta: {
    title: f.title.trim() + titleSuffix,
    date: f.date,
    tags: f.tags,
    visibility: f.visibility,
    ...(f.subcategory ? { subcategory: f.subcategory } : {}),
  },
  body: f.body,
})

// 搬移到另一個 space 前的確認（spec「搬移」一節）
const MOVE_WARNING: Record<Space, string> = {
  shared: '要把這篇筆記搬到共享區嗎？同事將能看到並編輯它。只會帶過去目前的內容，個人 repo 的舊版本不會外流。',
  personal: '要把這篇筆記搬回個人區嗎？共享 repo 的 git 歷史仍保有舊版本，同事還是看得到以前的內容。',
}

export function NoteEdit() {
  const editPath = useParams()['*']
  const [params] = useSearchParams()
  const { notes, mode, spaces, config, status, saveNote, fetchLatest, uploadImage, categoriesOf, subcategoriesOf } = useStore()
  const navigate = useNavigate()
  const toast = useToast()

  // 網址帶的是 noteId（共享筆記有 shared/ 前綴）
  const original = editPath ? (notes.find((n) => noteId(n) === editPath) ?? null) : null
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
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string | null>(null)

  // 初始化：等筆記載入後填入表單，並詢問是否還原草稿
  useEffect(() => {
    if (initialized.current || status === 'loading' || (editPath && !original)) return
    initialized.current = true
    const space: Space = params.get('space') === 'shared' && spaces.includes('shared') ? 'shared' : (spaces[0] ?? 'personal')
    const cat = params.get('cat') ?? categoriesOf(space)[0] ?? config.categories[0]!
    const initial: Form = original
      ? fromNote(original)
      : {
          space,
          category: cat,
          subcategory: params.get('sub') ?? '',
          title: params.get('title') ?? (cat === config.diaryCategory ? '日記' : ''),
          date: params.get('date') ?? toDateStr(),
          tags: [],
          visibility: 'private',
          body: '',
        }
    const draft = loadDraft(draftId)
    if (draft && confirm(`發現 ${new Date(draft.savedAt).toLocaleString('zh-TW')} 未儲存的草稿，要還原嗎？`)) {
      setForm({ ...initial, category: draft.category, subcategory: '', ...draft.meta, body: draft.body })
      setDirty(true)
    } else {
      clearDraft(draftId)
      setForm(initial)
    }
    setBase(original)
    // 快取的版本可能不是最新的：開啟編輯時向 GitHub 確認一次
    if (original) {
      fetchLatest(noteId(original))
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
  }, [status, original, editPath, params, spaces, categoriesOf, config, draftId, fetchLatest, toast])

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

  /** 逐張上傳，每張成功就插入游標位置（失敗的那張之前的都會保留） */
  async function addImages(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length || uploading) return
    let pos = editorRef.current?.selectionEnd ?? form!.body.length
    try {
      for (const [i, file] of imgs.entries()) {
        setUploading(imgs.length > 1 ? `上傳圖片 ${i + 1}/${imgs.length}…` : '上傳圖片中…')
        const md = await uploadImage(file, form!.space)
        const text = `\n${md}\n`
        const at = pos
        pos += text.length
        setForm((f) => ({ ...f!, body: f!.body.slice(0, at) + text + f!.body.slice(at) }))
        setDirty(true)
      }
    } catch (e) {
      toast(`圖片上傳失敗：${errorMessage(e)}`, 'error')
    } finally {
      setUploading(null)
    }
  }

  async function save(asCopy = false) {
    if (!form) return
    const prev = asCopy ? null : base
    if (prev && prev.space !== form.space && !confirm(MOVE_WARNING[form.space])) return
    setBusy(true)
    try {
      const { note, warning } = await saveNote(prev, toInput(form, asCopy ? '（衝突副本）' : ''))
      clearDraft(draftId)
      setDirty(false)
      toast(warning ?? '已儲存', warning ? 'warn' : 'info')
      navigate(`/note/${encodeNotePath(noteId(note))}`, { replace: true })
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
        const id = noteId({ space: form.space, path: conflict.path })
        await fetchLatest(id)
        navigate(`/note/${encodeNotePath(id)}`, { replace: true })
        return
      }
      const latest = await fetchLatest(noteId({ space: form.space, path: conflict.path }))
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

  const categories = categoriesOf(form.space)
  const catOptions = categories.includes(form.category) ? categories : [...categories, form.category]
  const subs = subcategoriesOf(form.category, form.space)
  const subOptions = !form.subcategory || subs.includes(form.subcategory) ? subs : [...subs, form.subcategory]

  return (
    <div className="page editor-page">
      <header className="page-header">
        <button className="icon-btn" aria-label="取消" onClick={cancel}>
          <ArrowLeft size={22} />
        </button>
        <h1 className="header-title">{original ? '編輯筆記' : '新增筆記'}</h1>
        <button className="btn btn-primary" onClick={() => save()} disabled={busy || !!uploading || !form.title.trim()}>
          {busy ? '儲存中…' : '儲存'}
        </button>
      </header>

      <div className="form">
        <label htmlFor="title">標題</label>
        <input id="title" value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="筆記標題" />

        <div className="row">
          <div>
            <label htmlFor="category">分類</label>
            <select
              id="category"
              value={form.category}
              onChange={(e) =>
                update({
                  category: e.target.value,
                  // 換分類時，新分類沒有這個子分類就清掉
                  subcategory: subcategoriesOf(e.target.value, form.space).includes(form.subcategory) ? form.subcategory : '',
                })
              }
            >
              {catOptions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="subcategory">子分類</label>
            <select id="subcategory" value={form.subcategory} onChange={(e) => update({ subcategory: e.target.value })}>
              <option value="">（不選）</option>
              {subOptions.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        {subOptions.length === 0 && (
          <p className="small hint">
            「{form.category}」還沒有子分類，可以到 <Link to="/settings">設定 → 分類</Link> 新增。
          </p>
        )}

        <label htmlFor="date">日期（可留空）</label>
        <input id="date" type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} />

        <label htmlFor="tags">標籤</label>
        <TagInput tags={form.tags} onChange={(tags) => update({ tags })} />

        {mode === 'owner' && spaces.length > 1 && (
          <fieldset className="segmented">
            <legend>存放位置</legend>
            <label>
              <input type="radio" name="space" checked={form.space === 'personal'} onChange={() => update({ space: 'personal' })} />
              <Lock size={16} aria-hidden /> 個人（只有我）
            </label>
            <label>
              <input type="radio" name="space" checked={form.space === 'shared'} onChange={() => update({ space: 'shared' })} />
              <Users size={16} aria-hidden /> 共享（同事可看可編輯）
            </label>
          </fieldset>
        )}
        {mode === 'owner' && (
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
        )}
        {mode === 'owner' && form.visibility === 'public' && (
          <p className="small hint">公開筆記會複製到公開分支，任何人都能在網站上看到。之後改回私人會從網站移除，但公開分支的 git 歷史仍保有舊版本。</p>
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
      <div className="editor-toolbar">
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={!!uploading}>
          <ImagePlus size={18} aria-hidden /> 插入圖片
        </button>
        <span className="muted small" role="status">
          {uploading ?? '也可以直接貼上或拖曳圖片'}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addImages([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>
      <div className={`editor-split show-${tab}`}>
        <textarea
          ref={editorRef}
          onPaste={(e) => {
            const files = [...e.clipboardData.files]
            if (files.some((f) => f.type.startsWith('image/'))) {
              e.preventDefault()
              void addImages(files)
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const files = [...e.dataTransfer.files]
            if (files.length) {
              e.preventDefault()
              void addImages(files)
            }
          }}
          className="editor"
          aria-label="內容（Markdown）"
          value={form.body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder="用 Markdown 寫內容…"
        />
        <div className="preview">
          {form.body.trim() ? <MarkdownView body={form.body} space={form.space} /> : <p className="muted">（沒有內容）</p>}
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
