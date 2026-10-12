import { describe, expect, it } from 'vitest'
import { buildSeries, parseMonth, rangeStart, sameDay, stringifyMonth, summarize, withDay, type MonthData } from './metrics'

const sample: MonthData = {
  '2026-10-08': { weight: 70.2, calories: 1850, exercise: [{ name: '跑步', minutes: 30, burned: 300 }] },
  '2026-10-06': { weight: 70.8 },
}

describe('檔案格式', () => {
  it('依日期排序、固定欄位順序，讀回不變', () => {
    const text = stringifyMonth(sample)
    expect(text.indexOf('2026-10-06')).toBeLessThan(text.indexOf('2026-10-08'))
    expect(text).toContain('"exercise": [')
    expect(parseMonth(text)).toEqual(sample)
  })

  it('壞掉的 JSON 會丟例外，避免用空資料覆蓋', () => {
    expect(() => parseMonth('{oops')).toThrow()
    expect(() => parseMonth('[]')).toThrow()
  })

  it('忽略無效欄位與空的運動', () => {
    expect(parseMonth('{"2026-10-01":{"weight":"70.5","exercise":[{"name":" "}]},"note":1}')).toEqual({
      '2026-10-01': { weight: 70.5 },
    })
  })
})

describe('修改單日', () => {
  it('只動那一天，其他天保留；空資料代表刪除', () => {
    const next = withDay(sample, '2026-10-07', { calories: 2000 })
    expect(Object.keys(next).sort()).toEqual(['2026-10-06', '2026-10-07', '2026-10-08'])
    expect(withDay(next, '2026-10-07', {})).not.toHaveProperty('2026-10-07')
    expect(sample).not.toHaveProperty('2026-10-07')
  })

  it('比較時忽略欄位順序與空值', () => {
    expect(sameDay({ calories: 1, weight: 2 }, { weight: 2, calories: 1 })).toBe(true)
    expect(sameDay(undefined, {})).toBe(true)
    expect(sameDay({ weight: 1 }, { weight: 2 })).toBe(false)
  })
})

describe('圖表資料', () => {
  it('週：7 個點，沒記錄的日子為 null', () => {
    const pts = buildSeries(sample, 'week', '2026-10-08')
    expect(pts).toHaveLength(7)
    expect(pts[0].date).toBe('2026-10-02')
    expect(pts.at(-1)).toMatchObject({ label: '10/8', weight: 70.2, intake: 1850, burned: 300 })
    expect(pts[1].weight).toBeNull()
  })

  it('月：30 個點；跨月份正確', () => {
    const pts = buildSeries(sample, 'month', '2026-10-08')
    expect(pts).toHaveLength(30)
    expect(pts[0].date).toBe('2026-09-09')
  })

  it('年：52 週、從週一開始，每週取平均', () => {
    const pts = buildSeries(sample, 'year', '2026-10-08') // 2026-10-08 是週四
    expect(pts).toHaveLength(52)
    expect(pts.at(-1)).toMatchObject({ date: '2026-10-05', weight: 70.5 })
    expect(rangeStart('year', '2026-10-08')).toBe('2025-10-13')
  })

  it('摘要：最新體重、變化、平均', () => {
    expect(summarize(sample, '2026-10-02', '2026-10-08')).toEqual({
      loggedDays: 2,
      latestWeight: 70.2,
      weightChange: -0.6,
      avgIntake: 1850,
      avgBurned: 300,
    })
  })
})
