import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, PenLine } from 'lucide-react'
import { NoteItem } from '../components/NoteItem'
import { StatusBanner } from '../components/StatusBanner'
import { toDateStr } from '../lib/date'
import { addDays, signedKg, summarize } from '../lib/metrics'
import { encodeNotePath } from '../lib/notes'
import { useStore } from '../store'

/** 擁有者首頁：今天的日記、近 7 天摘要、最近編輯、分類 */
export function Home() {
  const { notes, categories, config, days, status } = useStore()
  const today = toDateStr()
  const diary = notes.find((n) => n.category === config.diaryCategory && n.meta.date === today)
  const week = useMemo(() => summarize(days, addDays(today, -6), today), [days, today])
  // 有 updated 的（在網站上存過）照時間排前面，其餘照日期
  const recent = useMemo(
    () => [...notes].sort((a, b) => (b.meta.updated ?? '').localeCompare(a.meta.updated ?? '')).slice(0, 5),
    [notes],
  )
  const preview = diary?.body.replace(/\s+/g, ' ').trim().slice(0, 120)

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          {Number(today.slice(5, 7))} 月 {Number(today.slice(8))} 日
          <span className="muted small"> 星期{'日一二三四五六'[new Date().getDay()]}</span>
        </h1>
      </header>

      <StatusBanner />

      <section className="card">
        <h2>今天的{config.diaryCategory}</h2>
        {diary ? (
          <>
            <p className="diary-preview">{preview || <span className="muted">（還沒有內容）</span>}</p>
            <div className="btn-row">
              <Link className="btn" to={`/note/${encodeNotePath(diary.path)}`}>
                閱讀
              </Link>
              <Link className="btn btn-primary" to={`/edit/${encodeNotePath(diary.path)}`}>
                <PenLine size={18} aria-hidden /> 繼續寫
              </Link>
            </div>
          </>
        ) : (
          <Link className="btn btn-primary" to={`/new?cat=${encodeURIComponent(config.diaryCategory)}`}>
            <PenLine size={18} aria-hidden /> 寫今天的{config.diaryCategory}
          </Link>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>近 7 天</h2>
          <Link to="/track" className="more">
            追蹤 <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
        <dl className="stats">
          <div>
            <dt>最新體重</dt>
            <dd>{week.latestWeight != null ? `${week.latestWeight} kg` : '—'}</dd>
          </div>
          <div>
            <dt>體重變化</dt>
            <dd>{week.weightChange != null ? signedKg(week.weightChange) : '—'}</dd>
          </div>
          <div>
            <dt>平均攝取</dt>
            <dd>{week.avgIntake != null ? `${Math.round(week.avgIntake).toLocaleString()} kcal` : '—'}</dd>
          </div>
          <div>
            <dt>平均運動消耗</dt>
            <dd>{week.avgBurned != null ? `${Math.round(week.avgBurned).toLocaleString()} kcal` : '—'}</dd>
          </div>
        </dl>
        <p className="small muted">{week.loggedDays ? `共 ${week.loggedDays} 天有記錄` : '這 7 天還沒有記錄'}</p>
      </section>

      <section>
        <div className="section-head">
          <h2>最近編輯</h2>
          <Link to="/notes" className="more">
            全部筆記 <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
        {recent.length ? (
          <ul className="note-list">
            {recent.map((n) => (
              <NoteItem key={n.path} note={n} showBadge />
            ))}
          </ul>
        ) : (
          status !== 'loading' && <p className="muted">還沒有筆記。</p>
        )}
      </section>

      <section>
        <h2 className="section-head">分類</h2>
        <div className="cat-grid">
          {categories.map((c) => (
            <Link key={c} to={`/notes?cat=${encodeURIComponent(c)}`} className="cat-tile">
              <span>{c}</span>
              <span className="muted small">{notes.filter((n) => n.category === c).length} 篇</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
