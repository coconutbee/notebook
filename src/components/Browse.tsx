import { useMemo, useState } from 'react'
import type { Note } from '../lib/notes'
import { categoryStyle } from './Category'

/** 側欄的分類清單：全部 + 各分類（圖示、顏色、篇數） */
export function CategoryList({
  notes,
  categories,
  current,
  onPick,
}: {
  notes: Note[]
  categories: string[]
  current: string | null
  onPick: (cat: string | null) => void
}) {
  const count = (c: string) => notes.filter((n) => n.category === c).length
  return (
    <nav aria-label="分類" className="browse-section">
      <h2 className="browse-title">分類</h2>
      <ul className="cat-nav">
        <li>
          <button aria-current={!current} onClick={() => onPick(null)}>
            <span className="cat-nav-name">全部筆記</span>
            <span className="cat-nav-count">{notes.length}</span>
          </button>
        </li>
        {categories.map((c) => {
          const { hue, Icon } = categoryStyle(c)
          return (
            <li key={c}>
              <button className={hue} aria-current={current === c} onClick={() => onPick(c)}>
                <span className="cat-nav-icon">
                  <Icon size={16} aria-hidden />
                </span>
                <span className="cat-nav-name">{c}</span>
                <span className="cat-nav-count">{count(c)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const TOP = 12

/**
 * 標籤分布：依篇數排序的橫條（單一系列 → 單一色、不需圖例；數字用文字色直接標示）。
 * notes 傳入目前分類內的筆記，所以切換分類時分布跟著變。
 */
export function TagBars({ notes, current, onPick }: { notes: Note[]; current: string | null; onPick: (tag: string | null) => void }) {
  const [showAll, setShowAll] = useState(false)
  const tags = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of notes) for (const t of n.meta.tags) m.set(t, (m.get(t) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [notes])
  if (!tags.length) return <p className="muted small">這裡還沒有標籤。</p>
  const max = tags[0][1]
  const shown = showAll ? tags : tags.slice(0, TOP)
  return (
    <div className="browse-section">
      <ul className="tag-bars" aria-label="標籤分布（篇數）">
        {shown.map(([t, n]) => (
          <li key={t}>
            <button
              aria-pressed={current === t}
              onClick={() => onPick(current === t ? null : t)}
              title={`#${t}：${n} 篇${current === t ? '（再按一次取消篩選）' : ''}`}
            >
              <span className="tag-bars-label">#{t}</span>
              <span className="tag-bars-track" aria-hidden>
                <span className="tag-bars-fill" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="tag-bars-count">{n}</span>
            </button>
          </li>
        ))}
      </ul>
      {tags.length > TOP && (
        <button className="btn btn-ghost small" onClick={() => setShowAll((v) => !v)}>
          {showAll ? '只顯示前 12 個' : `顯示全部 ${tags.length} 個標籤`}
        </button>
      )}
    </div>
  )
}
