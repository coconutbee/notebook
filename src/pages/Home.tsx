import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ChevronRight, Flame, PenLine, Plus, Scale, TrendingDown, Utensils } from 'lucide-react'
import { categoryStyle } from '../components/Category'
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
  const hour = new Date().getHours()
  const greeting = hour < 5 ? '夜深了' : hour < 11 ? '早安' : hour < 14 ? '午安' : hour < 18 ? '下午好' : '晚安'
  const diaryLink = diary
    ? `/edit/${encodeNotePath(diary.path)}`
    : `/new?cat=${encodeURIComponent(config.diaryCategory)}`

  return (
    <div className="page">
      <section className="welcome">
        <p className="welcome-date">
          {Number(today.slice(5, 7))} 月 {Number(today.slice(8))} 日・星期{'日一二三四五六'[new Date().getDay()]}
        </p>
        <h1>{greeting}</h1>
        <p className="welcome-sub">
          {diary ? (preview ? `今天的${config.diaryCategory}：${preview}` : `今天的${config.diaryCategory}還沒有內容`) : `今天還沒寫${config.diaryCategory}，花幾分鐘記錄一下吧。`}
        </p>
        <div className="welcome-actions">
          <Link className="btn btn-light" to={diaryLink}>
            <PenLine size={18} aria-hidden /> {diary ? `繼續寫${config.diaryCategory}` : `寫今天的${config.diaryCategory}`}
          </Link>
          <Link className="btn btn-glass" to="/new">
            <Plus size={18} aria-hidden /> 新筆記
          </Link>
          <Link className="btn btn-glass" to="/track">
            <Activity size={18} aria-hidden /> 記錄今天
          </Link>
        </div>
      </section>

      <StatusBanner />

      <section>
        <div className="section-head">
          <h2>近 7 天</h2>
          <Link to="/track" className="more">
            追蹤 <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
        <dl className="stats stats-icons">
          <div>
            <dt>
              <Scale size={16} aria-hidden /> 最新體重
            </dt>
            <dd>{week.latestWeight != null ? `${week.latestWeight} kg` : '—'}</dd>
          </div>
          <div>
            <dt>
              <TrendingDown size={16} aria-hidden /> 體重變化
            </dt>
            <dd>{week.weightChange != null ? signedKg(week.weightChange) : '—'}</dd>
          </div>
          <div>
            <dt>
              <Utensils size={16} aria-hidden /> 平均攝取
            </dt>
            <dd>{week.avgIntake != null ? `${Math.round(week.avgIntake).toLocaleString()} kcal` : '—'}</dd>
          </div>
          <div>
            <dt>
              <Flame size={16} aria-hidden /> 平均運動消耗
            </dt>
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
        <div className="section-head">
          <h2>分類</h2>
          <Link to="/settings" className="more">
            新增／管理分類 <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="cat-grid">
          {categories.map((c) => {
            const { hue, Icon } = categoryStyle(c)
            return (
              <Link key={c} to={`/notes?cat=${encodeURIComponent(c)}`} className={`cat-tile ${hue}`}>
                <span className="cat-icon">
                  <Icon size={20} aria-hidden />
                </span>
                <span>{c}</span>
                <span className="muted small">{notes.filter((n) => n.category === c).length} 篇</span>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
