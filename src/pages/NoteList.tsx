import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, X } from 'lucide-react'
import { NoteItem } from '../components/NoteItem'
import { StatusBanner } from '../components/StatusBanner'
import { monthLabel } from '../lib/date'
import type { Note } from '../lib/notes'
import { useStore } from '../store'

const UNDATED = 'undated'

export function NoteList() {
  const { notes, categories, mode, status, reload } = useStore()
  const [params, setParams] = useSearchParams()
  const cat = params.get('cat')
  const tag = params.get('tag')
  const month = params.get('month')

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const months = useMemo(() => [...new Set(notes.map((n) => n.meta.date.slice(0, 7) || UNDATED))], [notes])

  const groups = useMemo(() => {
    const filtered = notes.filter(
      (n) =>
        (!cat || n.category === cat) &&
        (!tag || n.meta.tags.includes(tag)) &&
        (!month || (month === UNDATED ? !n.meta.date : n.meta.date.startsWith(month))),
    )
    const map = new Map<string, Note[]>()
    for (const n of filtered) {
      const k = n.meta.date.slice(0, 7)
      map.set(k, [...(map.get(k) ?? []), n])
    }
    return [...map]
  }, [notes, cat, tag, month])

  return (
    <div className="page">
      <header className="page-header">
        <h1>{mode === 'owner' ? '筆記' : '公開筆記'}</h1>
        <button className="icon-btn" aria-label="重新整理" onClick={() => reload()} disabled={status === 'loading'}>
          <RefreshCw size={20} className={status === 'loading' ? 'spin' : ''} />
        </button>
      </header>

      <div className="chips" role="tablist" aria-label="分類">
        <button role="tab" aria-selected={!cat} className="chip-btn" onClick={() => setParam('cat', null)}>
          全部
        </button>
        {categories.map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} className="chip-btn" onClick={() => setParam('cat', c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="filters">
        <label className="sr-only" htmlFor="month">
          月份
        </label>
        <select id="month" value={month ?? ''} onChange={(e) => setParam('month', e.target.value || null)}>
          <option value="">所有月份</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m === UNDATED ? '' : m)}
            </option>
          ))}
        </select>
        {tag && (
          <span className="chip">
            #{tag}
            <button aria-label="清除標籤篩選" onClick={() => setParam('tag', null)}>
              <X size={14} />
            </button>
          </span>
        )}
      </div>

      <StatusBanner />

      {status !== 'loading' && groups.length === 0 && (
        <p className="empty">{notes.length ? '沒有符合條件的筆記。' : mode === 'owner' ? '還沒有筆記。' : '目前還沒有公開的筆記。'}</p>
      )}

      {groups.map(([ym, list]) => (
        <section key={ym}>
          <h2 className="group-title">{monthLabel(ym)}</h2>
          <ul className="note-list">
            {list.map((n) => (
              <NoteItem key={n.path} note={n} showBadge={mode === 'owner'} />
            ))}
          </ul>
        </section>
      ))}

      {mode === 'owner' && (
        <Link to={cat ? `/new?cat=${encodeURIComponent(cat)}` : '/new'} className="fab" aria-label="新增筆記">
          <Plus size={28} />
        </Link>
      )}
    </div>
  )
}
