// 每日追蹤資料：metrics/<年-月>.json，以日期為 key，在 GitHub 上直接打開也看得懂
//
// {
//   "2026-10-08": {
//     "weight": 70.2,
//     "calories": 1850,
//     "exercise": [{ "name": "跑步", "minutes": 30, "burned": 300 }]
//   }
// }

export interface Exercise {
  name: string
  minutes: number
  burned: number
}

export interface DayEntry {
  weight?: number
  calories?: number
  exercise?: Exercise[]
}

export type MonthData = Record<string, DayEntry>

export const METRICS_RE = /^metrics\/(\d{4}-\d{2})\.json$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const metricsPath = (month: string) => `metrics/${month}.json`

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** 正規化一天的資料；沒有任何內容時回傳 null */
export function cleanDay(value: unknown): DayEntry | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  const out: DayEntry = {}
  const weight = num(o.weight)
  if (weight !== undefined) out.weight = weight
  const calories = num(o.calories)
  if (calories !== undefined) out.calories = calories
  if (Array.isArray(o.exercise)) {
    const exercise = o.exercise.flatMap((e): Exercise[] => {
      if (!e || typeof e !== 'object') return []
      const r = e as Record<string, unknown>
      const name = String(r.name ?? '').trim()
      return name ? [{ name, minutes: num(r.minutes) ?? 0, burned: num(r.burned) ?? 0 }] : []
    })
    if (exercise.length) out.exercise = exercise
  }
  return Object.keys(out).length ? out : null
}

/** 檔案格式錯誤時丟出例外：寧可不存，也不要用空資料覆蓋整個月 */
export function parseMonth(text: string): MonthData {
  const data = JSON.parse(text)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('不是 JSON 物件')
  const out: MonthData = {}
  for (const [date, value] of Object.entries(data)) {
    const day = DATE_RE.test(date) ? cleanDay(value) : null
    if (day) out[date] = day
  }
  return out
}

export function stringifyMonth(data: MonthData): string {
  const sorted: MonthData = {}
  for (const date of Object.keys(data).sort()) {
    const d = data[date]
    // 固定欄位順序，diff 比較乾淨
    sorted[date] = {
      ...(d.weight !== undefined ? { weight: d.weight } : {}),
      ...(d.calories !== undefined ? { calories: d.calories } : {}),
      ...(d.exercise?.length ? { exercise: d.exercise.map(({ name, minutes, burned }) => ({ name, minutes, burned })) } : {}),
    }
  }
  return JSON.stringify(sorted, null, 2) + '\n'
}

/** 回傳只修改了某一天的新資料；entry 為 null 代表刪除那天 */
export function withDay(data: MonthData, date: string, entry: DayEntry | null): MonthData {
  const next = { ...data }
  const clean = cleanDay(entry)
  if (clean) next[date] = clean
  else delete next[date]
  return next
}

export const sameDay = (a: DayEntry | null | undefined, b: DayEntry | null | undefined) =>
  JSON.stringify(cleanDay(a)) === JSON.stringify(cleanDay(b))

export const totalBurned = (d: DayEntry | null | undefined) => d?.exercise?.reduce((s, e) => s + e.burned, 0)

// ---------- 日期運算（用 UTC，避免時區/夏令時間誤差） ----------

const toUtc = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (date: string, n: number) => fromUtc(toUtc(date) + n * 86_400_000)
const mondayOf = (date: string) => addDays(date, -((new Date(toUtc(date)).getUTCDay() + 6) % 7))
const shortLabel = (date: string) => `${+date.slice(5, 7)}/${+date.slice(8, 10)}`

// ---------- 圖表資料 ----------

export type Range = 'week' | 'month' | 'year'

export const RANGE_LABEL: Record<Range, string> = { week: '週', month: '月', year: '年' }

export interface Point {
  /** 該點的日期（年模式為該週週一） */
  date: string
  label: string
  weight: number | null
  intake: number | null
  burned: number | null
}

/** 範圍的第一天：週 = 近 7 天，月 = 近 30 天，年 = 近 52 週（從週一開始） */
export function rangeStart(range: Range, end: string): string {
  if (range === 'week') return addDays(end, -6)
  if (range === 'month') return addDays(end, -29)
  return addDays(mondayOf(end), -7 * 51)
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

function bucket(days: MonthData, from: string, to: string, label: string): Point {
  const entries: DayEntry[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (days[d]) entries.push(days[d])
  return {
    date: from,
    label,
    weight: avg(entries.flatMap((e) => (e.weight !== undefined ? [e.weight] : []))),
    intake: avg(entries.flatMap((e) => (e.calories !== undefined ? [e.calories] : []))),
    burned: avg(entries.flatMap((e) => (e.exercise ? [totalBurned(e)!] : []))),
  }
}

/** 週、月：每天一點；年：每週一點（該週有記錄的日子平均） */
export function buildSeries(days: MonthData, range: Range, end: string): Point[] {
  const start = rangeStart(range, end)
  const points: Point[] = []
  if (range === 'year') {
    for (let w = start; w <= end; w = addDays(w, 7)) {
      const to = addDays(w, 6) < end ? addDays(w, 6) : end
      points.push(bucket(days, w, to, shortLabel(w)))
    }
  } else {
    for (let d = start; d <= end; d = addDays(d, 1)) points.push(bucket(days, d, d, shortLabel(d)))
  }
  return points
}

export interface Summary {
  loggedDays: number
  latestWeight: number | null
  weightChange: number | null
  avgIntake: number | null
  avgBurned: number | null
}

/** 範圍內的摘要（用每天的原始資料計算，不受年模式的週平均影響） */
export function summarize(days: MonthData, start: string, end: string): Summary {
  const entries: DayEntry[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) if (days[d]) entries.push(days[d])
  const weights = entries.flatMap((e) => (e.weight !== undefined ? [e.weight] : []))
  return {
    loggedDays: entries.length,
    latestWeight: weights.at(-1) ?? null,
    weightChange: weights.length >= 2 ? Math.round((weights.at(-1)! - weights[0]) * 10) / 10 : null,
    avgIntake: avg(entries.flatMap((e) => (e.calories !== undefined ? [e.calories] : []))),
    avgBurned: avg(entries.flatMap((e) => (e.exercise ? [totalBurned(e)!] : []))),
  }
}
