import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, Search, X } from 'lucide-react'
import { CategoryList, NO_SUB, SubChips, TagBars, matchSub } from '../components/Browse'
import { categoryStyle } from '../components/Category'
import { NoteItem } from '../components/NoteItem'
import { StatusBanner } from '../components/StatusBanner'
import { monthLabel } from '../lib/date'
import { noteId, type Note } from '../lib/notes'
import { matchNote, parseQuery } from '../lib/search'
import { useStore } from '../store'

const UNDATED = 'undated'

export function NoteList() {
  const { notes, categories, mode, status, reload, subcategoriesOf } = useStore()
  const [params, setParams] = useSearchParams()
  const cat = params.get('cat')
  const sub = cat ? params.get('sub') : null
  const tag = params.get('tag')
  const month = params.get('month')
  const q = params.get('q') ?? ''
  const terms = useMemo(() => parseQuery(q), [q])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'cat') next.delete('sub') // 換分類時清掉子分類
    setParams(next, { replace: true })
  }

  const months = useMemo(() => [...new Set(notes.map((n) => n.meta.date.slice(0, 7) || UNDATED))], [notes])

  const { groups, snippets } = useMemo(() => {
    const snippets = new Map<string, string>()
    const filtered = notes.filter((n) => {
      if (cat && n.category !== cat) return false
      if (!matchSub(n, sub)) return false
      if (tag && !n.meta.tags.includes(tag)) return false
      if (month && (month === UNDATED ? n.meta.date : !n.meta.date.startsWith(month))) return false
      if (!terms.length) return true
      const s = matchNote(n, terms)
      if (s) snippets.set(noteId(n), s)
      return s !== null
    })
    const map = new Map<string, Note[]>()
    for (const n of filtered) {
      const k = n.meta.date.slice(0, 7)
      map.set(k, [...(map.get(k) ?? []), n])
    }
    return { groups: [...map], snippets }
  }, [notes, cat, sub, tag, month, terms])

  const catNotes = useMemo(() => (cat ? notes.filter((n) => n.category === cat) : notes), [notes, cat])
  const subNotes = useMemo(() => catNotes.filter((n) => matchSub(n, sub)), [catNotes, sub])
  const subs = cat ? subcategoriesOf(cat) : []
  const subLabel = sub === NO_SUB ? '未分類' : sub
  const tagTitle = `標籤分布${cat ? `・${cat}${subLabel ? `／${subLabel}` : ''}` : ''}`
  const tagBars = <TagBars notes={subNotes} current={tag} onPick={(t) => setParam('tag', t)} />
  const newLink = cat
    ? `/new?cat=${encodeURIComponent(cat)}${sub && sub !== NO_SUB ? `&sub=${encodeURIComponent(sub)}` : ''}`
    : '/new'

  return (
    <div className="page page-browse">
      {mode !== 'visitor' ? (
        <header className="page-header">
          <h1>筆記</h1>
          <button className="icon-btn" aria-label="重新整理" onClick={() => reload()} disabled={status === 'loading'}>
            <RefreshCw size={20} className={status === 'loading' ? 'spin' : ''} />
          </button>
        </header>
      ) : (
        <header className="hero">
          <h1>{document.title}</h1>
          <p>{document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content}</p>
          {status === 'ready' && (
            <dl className="hero-stats">
              <div>
                <dt>公開筆記</dt>
                <dd>{notes.length}</dd>
              </div>
              <div>
                <dt>分類</dt>
                <dd>{categories.length}</dd>
              </div>
              <div>
                <dt>標籤</dt>
                <dd>{new Set(notes.flatMap((n) => n.meta.tags)).size}</dd>
              </div>
            </dl>
          )}
        </header>
      )}

      <div className="browse-layout">
      {/* 寬螢幕：左側分類清單與標籤分布；手機改用下方的分類 chips 與可展開的標籤分布 */}
      <aside className="browse">
        <CategoryList
          notes={notes}
          categories={categories}
          current={cat}
          onPick={(c) => setParam('cat', c)}
          subsOf={subcategoriesOf}
          currentSub={sub}
          onPickSub={(s) => setParam('sub', s)}
          manage={mode !== 'visitor'}
        />
        <h2 className="browse-title">{tagTitle}</h2>
        {tagBars}
      </aside>
      <div className="browse-main">

      <div className="search">
        <Search size={18} aria-hidden className="search-icon" />
        <input
          type="search"
          aria-label="搜尋標題、標籤和內文"
          placeholder="搜尋標題、標籤和內文"
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
          enterKeyHint="search"
        />
      </div>

      <div className="chips" role="tablist" aria-label="分類">
        <button role="tab" aria-selected={!cat} className="chip-btn" onClick={() => setParam('cat', null)}>
          全部
        </button>
        {categories.map((c) => {
          const { Icon } = categoryStyle(c)
          return (
          <button key={c} role="tab" aria-selected={cat === c} className="chip-btn" onClick={() => setParam('cat', c)}>
            <Icon size={15} aria-hidden />
            {c}
          </button>
          )
        })}
      </div>

      <SubChips notes={catNotes} subs={subs} current={sub} onPick={(s) => setParam('sub', s)} />

      <details className="tag-panel">
        <summary>
          {tagTitle}
          {tag && <span className="muted small">（目前：#{tag}）</span>}
        </summary>
        {tagBars}
      </details>

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
        <p className="empty">{notes.length ? (q ? `找不到「${q}」相關的筆記。` : '沒有符合條件的筆記。') : mode !== 'visitor' ? '還沒有筆記。' : '目前還沒有公開的筆記。'}</p>
      )}

      {groups.map(([ym, list]) => (
        <section key={ym}>
          <h2 className="group-title">{monthLabel(ym)}</h2>
          <ul className="note-list">
            {list.map((n) => (
              <NoteItem
                key={noteId(n)}
                note={n}
                showBadge={mode === 'owner'}
                movable={mode !== 'visitor'}
                snippet={snippets.get(noteId(n))}
                terms={terms}
              />
            ))}
          </ul>
        </section>
      ))}
      </div>
      </div>

      {mode !== 'visitor' && (
        <Link to={newLink} className="fab" aria-label="新增筆記">
          <Plus size={28} />
        </Link>
      )}
    </div>
  )
}
