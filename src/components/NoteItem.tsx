import { Link } from 'react-router-dom'
import { Globe, Lock } from 'lucide-react'
import { encodeNotePath, type Note } from '../lib/notes'

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

export function NoteItem({ note, showBadge }: { note: Note; showBadge: boolean }) {
  return (
    <li>
      <Link to={`/note/${encodeNotePath(note.path)}`} className="note-item">
        <div className="note-item-top">
          <span className="note-title">{note.meta.title}</span>
          <time className="muted small">{note.meta.date.slice(5).replace('-', '/')}</time>
        </div>
        <div className="note-item-meta small muted">
          <span>{note.category}</span>
          {note.meta.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
          {showBadge && <VisibilityBadge note={note} />}
        </div>
      </Link>
    </li>
  )
}
