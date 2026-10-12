import { Link } from 'react-router-dom'
import { Globe, Lock } from 'lucide-react'
import { encodeNotePath, excerpt, type Note } from '../lib/notes'
import { CategoryBadge, categoryStyle } from './Category'
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
  const summary = snippet || excerpt(note.body)
  return (
    <li>
      <Link to={`/note/${encodeNotePath(note.path)}`} className={`note-item ${categoryStyle(note.category).hue}`}>
        <div className="note-item-top">
          <CategoryBadge name={note.category} />
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
    </li>
  )
}
