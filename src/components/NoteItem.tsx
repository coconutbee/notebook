import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderInput, Globe, Lock } from 'lucide-react'
import { ConflictError, errorMessage } from '../github/api'
import { encodeNotePath, excerpt, type Note } from '../lib/notes'
import { splitHighlight } from '../lib/search'
import { useStore } from '../store'
import { CategoryBadge, categoryStyle } from './Category'
import { useToast } from './Toast'

export function VisibilityBadge({ note }: { note: Note }) {
  return note.meta.visibility === 'public' ? (
    <span className="badge badge-public">
      <Globe size={12} aria-hidden /> 公開
    </span>
  ) : (
    <span className="badge">
      <Lock size={12} aria-hidden /> 私人
    </span>
  )
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return <>{splitHighlight(text, terms).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>
}

const SEP = '\u0000'

/** 一個下拉選單同時選分類與子分類，選了就直接儲存（一次 commit） */
function MoveSelect({ note }: { note: Note }) {
  const { categories, subcategoriesOf, saveNote } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const current = note.category + SEP + (note.meta.subcategory ?? '')
  const cats = categories.includes(note.category) ? categories : [...categories, note.category]

  async function move(value: string) {
    const [category, sub] = value.split(SEP)
    setBusy(true)
    try {
      const { warning } = await saveNote(note, {
        space: note.space,
        category,
        meta: { ...note.meta, subcategory: sub || undefined },
        body: note.body,
      })
      toast(warning ?? `「${note.meta.title}」已移到 ${category}${sub ? `／${sub}` : ''}`, warning ? 'warn' : 'info')
    } catch (e) {
      toast(
        e instanceof ConflictError
          ? e.status === 422
            ? `「${category}」已經有同名的筆記，沒有移動。`
            : '這篇筆記已在其他裝置或 GitHub 上被修改，沒有移動。請重新整理後再試。'
          : `移動失敗：${errorMessage(e)}`,
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="note-move" aria-busy={busy}>
      <FolderInput size={16} aria-hidden />
      <span className="sr-only">把「{note.meta.title}」移到</span>
      <select value={current} disabled={busy} onChange={(e) => void move(e.target.value)}>
        {cats.map((c) => {
          const subs = subcategoriesOf(c)
          const curSub = c === note.category ? note.meta.subcategory : undefined
          const all = curSub && !subs.includes(curSub) ? [...subs, curSub] : subs
          return (
            <optgroup key={c} label={c}>
              <option value={c + SEP}>{all.length ? `${c}（未分類）` : c}</option>
              {all.map((s) => (
                <option key={s} value={c + SEP + s}>
                  {c}／{s}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
      {busy && <span className="small">移動中…</span>}
    </label>
  )
}

/** snippet / terms：搜尋時顯示命中的片段並標亮關鍵字；movable：擁有者可直接在卡片上換分類／子分類 */
export function NoteItem({
  note,
  showBadge,
  snippet,
  terms = [],
  movable = false,
}: {
  note: Note
  showBadge: boolean
  snippet?: string
  terms?: string[]
  movable?: boolean
}) {
  const summary = snippet || excerpt(note.body)
  return (
    <li className={`note-card ${categoryStyle(note.category).hue}`}>
      <Link to={`/note/${encodeNotePath(note.path)}`} className="note-item">
        <div className="note-item-top">
          <CategoryBadge name={note.category} sub={note.meta.subcategory} />
          {note.meta.date && <time className="muted small">{note.meta.date.slice(5).replace('-', '/')}</time>}
        </div>
        <span className="note-title">
          <Highlight text={note.meta.title} terms={terms} />
        </span>
        {summary && (
          <p className="note-snippet small">
            <Highlight text={summary} terms={terms} />
          </p>
        )}
        {(note.meta.tags.length > 0 || showBadge) && (
          <div className="note-item-meta small muted">
            {note.meta.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
            {showBadge && <VisibilityBadge note={note} />}
          </div>
        )}
      </Link>
      {movable && <MoveSelect note={note} />}
    </li>
  )
}
