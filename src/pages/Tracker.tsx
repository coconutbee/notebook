import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { StatusBanner } from '../components/StatusBanner'
import { useToast } from '../components/Toast'
import { TrendCharts } from '../components/TrendCharts'
import { errorMessage } from '../github/api'
import { toDateStr } from '../lib/date'
import {
  RANGE_LABEL,
  addDays,
  buildSeries,
  rangeStart,
  signedKg,
  summarize,
  totalBurned,
  type DayEntry,
  type Exercise,
  type Range,
} from '../lib/metrics'
import { DayConflictError, useStore } from '../store'

interface ExRow {
  name: string
  minutes: string
  burned: string
}
interface Form {
  weight: string
  calories: string
  exercise: ExRow[]
}
type Errors = Partial<Record<'weight' | 'calories' | `ex${number}`, string>>

const str = (n: number | undefined) => (n === undefined ? '' : String(n))
const toForm = (e: DayEntry | null): Form => ({
  weight: str(e?.weight),
  calories: str(e?.calories),
  exercise: e?.exercise?.map((x) => ({ name: x.name, minutes: str(x.minutes), burned: str(x.burned) })) ?? [],
})

function parseNum(text: string, min: number, max: number): number | undefined | 'invalid' {
  if (!text.trim()) return undefined
  const n = Number(text)
  return Number.isFinite(n) && n >= min && n <= max ? n : 'invalid'
}

function fromForm(f: Form): { entry: DayEntry; errors: Errors } {
  const errors: Errors = {}
  const entry: DayEntry = {}
  const weight = parseNum(f.weight, 20, 400)
  if (weight === 'invalid') errors.weight = '請輸入 20–400 之間的數字'
  else if (weight !== undefined) entry.weight = weight
  const calories = parseNum(f.calories, 0, 30000)
  if (calories === 'invalid') errors.calories = '請輸入 0–30000 之間的數字'
  else if (calories !== undefined) entry.calories = calories
  const exercise: Exercise[] = []
  f.exercise.forEach((row, i) => {
    if (!row.name.trim() && !row.minutes.trim() && !row.burned.trim()) return
    const minutes = parseNum(row.minutes, 0, 1440)
    const burned = parseNum(row.burned, 0, 10000)
    if (!row.name.trim()) errors[`ex${i}`] = '請填運動項目'
    else if (minutes === 'invalid' || burned === 'invalid') errors[`ex${i}`] = '時間 0–1440 分鐘、消耗 0–10000 kcal'
    else exercise.push({ name: row.name.trim(), minutes: minutes ?? 0, burned: burned ?? 0 })
  })
  if (exercise.length) entry.exercise = exercise
  return { entry, errors }
}

const describe = (e: DayEntry | null) =>
  e
    ? [
        e.weight !== undefined && `體重 ${e.weight} kg`,
        e.calories !== undefined && `攝取 ${e.calories} kcal`,
        e.exercise?.map((x) => `${x.name} ${x.minutes} 分 ${x.burned} kcal`).join('、'),
      ]
        .filter(Boolean)
        .join('；')
    : '（已刪除）'

const WEEKDAYS = '日一二三四五六'
const dateLabel = (d: string) => `${+d.slice(5, 7)} 月 ${+d.slice(8, 10)} 日（週${WEEKDAYS[new Date(`${d}T00:00:00`).getDay()]}）`

function loadRange(): Range {
  try {
    const r = localStorage.getItem('notebook.range')
    return r === 'month' || r === 'year' ? r : 'week'
  } catch {
    return 'week'
  }
}

export function Tracker() {
  const { days, metrics, status, saveDay } = useStore()
  const toast = useToast()
  const today = toDateStr()
  const [date, setDate] = useState(today)
  const [form, setForm] = useState<Form>(() => toForm(null))
  const [base, setBase] = useState<DayEntry | null>(null)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<DayConflictError | null>(null)
  const [range, setRange] = useState<Range>(loadRange)
  const dialogRef = useRef<HTMLDialogElement>(null)

  // 換日期或資料載入後，把那天的記錄帶進表單（正在編輯時不覆蓋）
  useEffect(() => {
    if (dirty) return
    const entry = days[date] ?? null
    setBase(entry)
    setForm(toForm(entry))
    setErrors({})
  }, [date, days, dirty])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', handler)
    return () => removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => {
    if (conflict) dialogRef.current?.showModal()
  }, [conflict])

  const exerciseNames = useMemo(
    () => [...new Set(Object.values(days).flatMap((d) => d.exercise?.map((e) => e.name) ?? []))],
    [days],
  )
  const points = useMemo(() => buildSeries(days, range, today), [days, range, today])
  const summary = useMemo(() => summarize(days, rangeStart(range, today), today), [days, range, today])
  const invalid = metrics[date.slice(0, 7)]?.invalid

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }
  const updateRow = (i: number, patch: Partial<ExRow>) =>
    update({ exercise: form.exercise.map((r, j) => (j === i ? { ...r, ...patch } : r)) })

  function changeDate(next: string) {
    if (!next || next === date) return
    if (dirty && !confirm('這一天的修改還沒儲存，要放棄嗎？')) return
    setDirty(false)
    setDate(next)
  }

  function pickRange(r: Range) {
    setRange(r)
    try {
      localStorage.setItem('notebook.range', r)
    } catch {
      /* ignore */
    }
  }

  async function save(baseOverride?: DayEntry | null, entryOverride?: DayEntry | null) {
    let entry: DayEntry | null
    if (entryOverride !== undefined) {
      entry = entryOverride
    } else {
      const parsed = fromForm(form)
      setErrors(parsed.errors)
      if (Object.keys(parsed.errors).length) return
      entry = parsed.entry
    }
    setBusy(true)
    try {
      await saveDay(date, entry, baseOverride !== undefined ? baseOverride : base)
      setDirty(false)
      toast(entry && Object.keys(entry).length ? '已儲存' : '已清除這天的記錄')
    } catch (e) {
      if (e instanceof DayConflictError) setConflict(e)
      else toast(`儲存失敗：${errorMessage(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  function clearDay() {
    if (confirm(`確定要清除 ${date} 的所有記錄嗎？`)) void save(undefined, null)
  }

  function closeConflict() {
    dialogRef.current?.close()
    setConflict(null)
  }

  const preview = fromForm(form).entry
  const burned = totalBurned(preview)

  return (
    <div className="page tracker">
      <header className="page-header">
        <h1>追蹤</h1>
      </header>

      <StatusBanner />

      <section className="card" aria-labelledby="day-title">
        <div className="date-nav">
          <button className="icon-btn" aria-label="前一天" onClick={() => changeDate(addDays(date, -1))}>
            <ChevronLeft size={22} />
          </button>
          <label className="date-label" id="day-title">
            <span>{date === today ? `今天・${dateLabel(date)}` : dateLabel(date)}</span>
            <input type="date" value={date} max={today} onChange={(e) => changeDate(e.target.value)} aria-label="選擇日期" />
          </label>
          <button className="icon-btn" aria-label="後一天" disabled={date >= today} onClick={() => changeDate(addDays(date, 1))}>
            <ChevronRight size={22} />
          </button>
        </div>
        {date !== today && (
          <button className="btn btn-ghost small today-btn" onClick={() => changeDate(today)}>
            回到今天
          </button>
        )}

        {invalid && (
          <p className="error" role="alert">
            {invalid}，這個月份暫時無法記錄。
          </p>
        )}

        <div className="form">
          <div className="row">
            <div>
              <label htmlFor="weight">體重（kg）</label>
              <input
                id="weight"
                inputMode="decimal"
                enterKeyHint="next"
                value={form.weight}
                onChange={(e) => update({ weight: e.target.value })}
                aria-invalid={!!errors.weight}
                aria-describedby={errors.weight ? 'weight-err' : undefined}
                placeholder="70.5"
              />
              {errors.weight && (
                <span id="weight-err" className="field-error">
                  {errors.weight}
                </span>
              )}
            </div>
            <div>
              <label htmlFor="calories">卡路里攝取（kcal）</label>
              <input
                id="calories"
                inputMode="numeric"
                enterKeyHint="next"
                value={form.calories}
                onChange={(e) => update({ calories: e.target.value })}
                aria-invalid={!!errors.calories}
                aria-describedby={errors.calories ? 'cal-err' : undefined}
                placeholder="1800"
              />
              {errors.calories && (
                <span id="cal-err" className="field-error">
                  {errors.calories}
                </span>
              )}
            </div>
          </div>

          <fieldset className="exercise">
            <legend>運動</legend>
            {form.exercise.map((row, i) => (
              <div key={i} className="exercise-item">
                <div className="exercise-row">
                  <input
                    aria-label={`第 ${i + 1} 項運動名稱`}
                    list="exercise-names"
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    placeholder="項目，例如 跑步"
                  />
                  <input
                    aria-label={`第 ${i + 1} 項運動時間（分鐘）`}
                    inputMode="numeric"
                    value={row.minutes}
                    onChange={(e) => updateRow(i, { minutes: e.target.value })}
                    placeholder="分鐘"
                  />
                  <input
                    aria-label={`第 ${i + 1} 項運動消耗（kcal）`}
                    inputMode="numeric"
                    value={row.burned}
                    onChange={(e) => updateRow(i, { burned: e.target.value })}
                    placeholder="kcal"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`刪除第 ${i + 1} 項運動`}
                    onClick={() => update({ exercise: form.exercise.filter((_, j) => j !== i) })}
                  >
                    <X size={18} />
                  </button>
                </div>
                {errors[`ex${i}`] && <span className="field-error">{errors[`ex${i}`]}</span>}
              </div>
            ))}
            <datalist id="exercise-names">
              {exerciseNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => update({ exercise: [...form.exercise, { name: '', minutes: '', burned: '' }] })}
            >
              <Plus size={18} aria-hidden /> 新增運動
            </button>
          </fieldset>

          <p className="small muted day-summary">
            運動消耗 {burned ?? 0} kcal
            {preview.calories !== undefined && `・淨攝取 ${preview.calories - (burned ?? 0)} kcal`}
          </p>

          <div className="btn-row">
            <button className="btn btn-primary save-btn" disabled={busy || !!invalid || status === 'loading'} onClick={() => save()}>
              {busy ? '儲存中…' : dirty ? '儲存' : '儲存（未修改）'}
            </button>
            {base && (
              <button className="icon-btn" aria-label="清除這天的記錄" disabled={busy || !!invalid} onClick={clearDay}>
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="trend-title">
        <div className="trend-head">
          <h2 id="trend-title">趨勢</h2>
          <div className="seg" role="tablist" aria-label="時間範圍">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <button key={r} role="tab" aria-selected={range === r} className="chip-btn" onClick={() => pickRange(r)}>
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        <dl className="stats">
          <div>
            <dt>最新體重</dt>
            <dd>{summary.latestWeight != null ? `${summary.latestWeight} kg` : '—'}</dd>
          </div>
          <div>
            <dt>體重變化</dt>
            <dd>
{summary.weightChange != null ? signedKg(summary.weightChange) : '—'}
            </dd>
          </div>
          <div>
            <dt>平均攝取</dt>
            <dd>{summary.avgIntake != null ? `${Math.round(summary.avgIntake).toLocaleString()} kcal` : '—'}</dd>
          </div>
          <div>
            <dt>平均運動消耗</dt>
            <dd>{summary.avgBurned != null ? `${Math.round(summary.avgBurned).toLocaleString()} kcal` : '—'}</dd>
          </div>
        </dl>
        <p className="small muted">
          {range === 'year' ? '近 52 週' : range === 'month' ? '近 30 天' : '近 7 天'}・共 {summary.loggedDays} 天有記錄；平均只計算有記錄的日子
        </p>

        <TrendCharts points={points} range={range} />
      </section>

      {conflict && (
        <dialog ref={dialogRef} className="dialog" onCancel={(e) => (e.preventDefault(), closeConflict())} aria-labelledby="day-conflict">
          <h2 id="day-conflict">這一天的記錄已在別處被修改</h2>
          <p className="small">
            <strong>遠端：</strong>
            {describe(conflict.remote)}
          </p>
          <p className="small">
            <strong>你的：</strong>
            {describe(fromForm(form).entry)}
          </p>
          <p className="small muted">同一個月份裡其他日子的修改不受影響。</p>
          <div className="dialog-actions">
            <button
              className="btn"
              onClick={() => {
                setBase(conflict.remote)
                setForm(toForm(conflict.remote))
                setDirty(false)
                closeConflict()
              }}
            >
              使用遠端的記錄
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const remote = conflict.remote
                closeConflict()
                void save(remote)
              }}
            >
              用我的內容取代這一天
            </button>
            <button className="btn btn-ghost" onClick={closeConflict}>
              取消
            </button>
          </div>
        </dialog>
      )}
    </div>
  )
}
