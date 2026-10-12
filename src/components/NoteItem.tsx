import { Link } from 'react-router-dom'
import { Globe, Lock } from 'lucide-react'
import { encodeNotePath, type Note } from '../lib/notes'
import { splitHighlight } from '../lib/search'

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

/** snippet / terms：搜尋時顯示命中的片段並標亮關鍵字 */
export function NoteItem({ note, showBadge, snippet, terms = [] }: { note: Note; showBadge: boolean; snippet?: string; terms?: string[] }) {
  return (
    <li>
      <Link to={`/note/${encodeNotePath(note.path)}`} className="note-item">
        <div className="note-item-top">
          <span className="note-title">
            <Highlight text={note.meta.title} terms={terms} />
          </span>
          {note.meta.date && <time className="muted small">{note.meta.date.slice(5).replace('-', '/')}</time>}
        </div>
        <div className="note-item-meta small muted">
          <span>{note.category}</span>
          {note.meta.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
          {showBadge && <VisibilityBadge note={note} />}
        </div>
        {snippet && (
          <p className="note-snippet small">
            <Highlight text={snippet} terms={terms} />
          </p>
        )}
      </Link>
    </li>
  )
}
