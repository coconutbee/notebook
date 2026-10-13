import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings2 } from 'lucide-react'
import type { Note } from '../lib/notes'
import { categoryStyle } from './Category'

/** 子分類篩選值：沒選子分類的筆記 */
export const NO_SUB = '_none'

export const matchSub = (n: Note, sub: string | null) => !sub || (sub === NO_SUB ? !n.meta.subcategory : n.meta.subcategory === sub)

/** [篩選值, 顯示名稱, 篇數]；有沒選子分類的筆記時最後加一列「未分類」 */
function subRows(notes: Note[], subs: string[]): [string, string, number][] {
  const rows: [string, string, number][] = subs.map((s) => [s, s, notes.filter((n) => n.meta.subcategory === s).length])
  const none = notes.filter((n) => !n.meta.subcategory).length
  if (none) rows.push([NO_SUB, '未分類', none])
  return rows
}

/** 側欄的分類清單：全部 + 各分類（圖示、顏色、篇數）；選中的分類展開子分類 */
export function CategoryList({
  notes,
  categories,
  current,
  onPick,
  subsOf,
  currentSub,
  onPickSub,
  manage,
}: {
  notes: Note[]
  categories: string[]
  current: string | null
  onPick: (cat: string | null) => void
  subsOf: (cat: string) => string[]
  currentSub: string | null
  onPickSub: (sub: string | null) => void
  /** 擁有者才顯示「管理分類」連結 */
  manage: boolean
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
          const subs = current === c ? subsOf(c) : []
          return (
            <li key={c}>
              <button className={hue} aria-current={current === c && !currentSub} onClick={() => onPick(c)}>
                <span className="cat-nav-icon">
                  <Icon size={16} aria-hidden />
                </span>
                <span className="cat-nav-name">{c}</span>
                <span className="cat-nav-count">{count(c)}</span>
              </button>
              {subs.length > 0 && (
                <ul className="sub-nav" aria-label={`${c} 的子分類`}>
                  {subRows(
                    notes.filter((n) => n.category === c),
                    subs,
                  ).map(([value, label, n]) => (
                    <li key={value}>
                      <button aria-current={currentSub === value} onClick={() => onPickSub(currentSub === value ? null : value)}>
                        <span className="cat-nav-name">{label}</span>
                        <span className="cat-nav-count">{n}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {manage && (
        <Link to="/settings" className="browse-manage">
          <Settings2 size={15} aria-hidden /> 管理分類與子分類
        </Link>
      )}
    </nav>
  )
}

/** 手機版：選了分類後的子分類 chips */
export function SubChips({ notes, subs, current, onPick }: { notes: Note[]; subs: string[]; current: string | null; onPick: (s: string | null) => void }) {
  if (!subs.length) return null
  return (
    <div className="chips sub-chips" role="tablist" aria-label="子分類">
      <button role="tab" aria-selected={!current} className="chip-btn" onClick={() => onPick(null)}>
        全部
      </button>
      {subRows(notes, subs).map(([value, label, n]) => (
        <button key={value} role="tab" aria-selected={current === value} className="chip-btn" onClick={() => onPick(value)}>
          {label} <span className="chip-count">{n}</span>
        </button>
      ))}
    </div>
  )
}

const TOP = 12

/**
 * 標籤分布：依篇數排序的橫條（單一系列 → 單一色、不需圖例；數字用文字色直接標示）。
 * notes 傳入目前分類／子分類內的筆記，所以切換時分布跟著變。
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
