import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { MarkdownView } from '../components/MarkdownView'
import { VisibilityBadge } from '../components/NoteItem'
import { StatusBanner } from '../components/StatusBanner'
import { useToast } from '../components/Toast'
import { ConflictError, errorMessage } from '../github/api'
import { encodeNotePath } from '../lib/notes'
import { useStore } from '../store'

export function NoteView() {
  const path = useParams()['*'] ?? ''
  const { notes, mode, status, deleteNote } = useStore()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const note = notes.find((n) => n.path === path)

  if (!note) {
    return (
      <div className="page">
        <StatusBanner />
        {status === 'ready' && (
          <p className="empty">
            找不到這篇筆記。<Link to="/notes">回到筆記列表</Link>
          </p>
        )}
      </div>
    )
  }

  async function remove() {
    if (!note || !confirm(`確定要刪除「${note.meta.title}」嗎？（GitHub 歷史紀錄仍可找回）`)) return
    setBusy(true)
    try {
      const { warning } = await deleteNote(note)
      if (warning) toast(warning, 'warn')
      else toast('已刪除')
      navigate('/notes', { replace: true })
    } catch (e) {
      toast(
        e instanceof ConflictError ? '這篇筆記已在別處被修改，沒有刪除。請重新整理後再試。' : `刪除失敗：${errorMessage(e)}`,
        'error',
      )
      setBusy(false)
    }
  }

  return (
    <article className="page">
      <header className="page-header">
        <button className="icon-btn" aria-label="返回" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/notes'))}>
          <ArrowLeft size={22} />
        </button>
        {mode === 'owner' && (
          <div className="header-actions">
            <button className="icon-btn" aria-label="刪除" onClick={remove} disabled={busy}>
              <Trash2 size={20} />
            </button>
            <Link className="btn btn-primary" to={`/edit/${encodeNotePath(note.path)}`}>
              <Pencil size={16} aria-hidden /> 編輯
            </Link>
          </div>
        )}
      </header>
      <h1 className="note-heading">{note.meta.title}</h1>
      <div className="note-item-meta small muted">
        {note.meta.date ? <time>{note.meta.date}</time> : <span>未標日期</span>}
        <Link to={`/notes?cat=${encodeURIComponent(note.category)}`}>{note.category}</Link>
        {mode === 'owner' && <VisibilityBadge note={note} />}
      </div>
      {note.meta.tags.length > 0 && (
        <div className="tags">
          {note.meta.tags.map((t) => (
            <Link key={t} className="chip" to={`/notes?tag=${encodeURIComponent(t)}`}>
              #{t}
            </Link>
          ))}
        </div>
      )}
      <MarkdownView body={note.body} />
    </article>
  )
}
