import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHub } from '../github/api'
import { fakeFetch, repos } from '../test/fakeGitHub'
import { parseMonth, stringifyMonth } from './metrics'
import { DayConflictError, writeDay, type MonthFile } from './metricsSync'

const gh = new GitHub('t', 'me', 'data')
const PATH = 'metrics/2026-10.json'
const file = () => repos.get('me/data')!.get(PATH)
const remoteWrite = (text: string) => repos.get('me/data')!.set(PATH, text)

/** 模擬「這台裝置」：記住最後一次看到的檔案狀態 */
async function save(state: { file?: MonthFile }, date: string, entry: object | null, base: object | null) {
  await writeDay(gh, state.file, date, entry, base, (f) => {
    state.file = f
  })
}

beforeEach(() => {
  repos.clear()
  repos.set('me/data', new Map())
  vi.stubGlobal('fetch', fakeFetch)
})

describe('writeDay', () => {
  it('第一次記錄會建立月份檔', async () => {
    const me: { file?: MonthFile } = {}
    await save(me, '2026-10-08', { weight: 70 }, null)
    expect(parseMonth(file()!)).toEqual({ '2026-10-08': { weight: 70 } })
    expect(me.file?.sha).toBeTruthy()
  })

  it('別的裝置改了其他天 → 自動合併，兩邊的資料都保留', async () => {
    const me: { file?: MonthFile } = {}
    await save(me, '2026-10-01', { weight: 71 }, null)
    // 另一台裝置在同一個月份檔加了 10/02
    remoteWrite(stringifyMonth({ ...parseMonth(file()!), '2026-10-02': { calories: 1900 } }))

    await save(me, '2026-10-08', { weight: 70 }, null)
    expect(parseMonth(file()!)).toEqual({
      '2026-10-01': { weight: 71 },
      '2026-10-02': { calories: 1900 },
      '2026-10-08': { weight: 70 },
    })
  })

  it('別的裝置改了同一天 → DayConflictError，遠端內容不被覆蓋', async () => {
    const me: { file?: MonthFile } = {}
    await save(me, '2026-10-08', { weight: 70 }, null)
    remoteWrite(stringifyMonth({ '2026-10-08': { weight: 69.5 } }))

    const err = await save(me, '2026-10-08', { weight: 70.4 }, { weight: 70 }).catch((e) => e)
    expect(err).toBeInstanceOf(DayConflictError)
    expect(err.remote).toEqual({ weight: 69.5 })
    expect(parseMonth(file()!)).toEqual({ '2026-10-08': { weight: 69.5 } })

    // 使用者選擇「用我的內容取代這一天」：以遠端內容作為 base 再存一次
    await save(me, '2026-10-08', { weight: 70.4 }, err.remote)
    expect(parseMonth(file()!)).toEqual({ '2026-10-08': { weight: 70.4 } })
  })

  it('還沒載入過但檔案已存在（422）也會合併而不是覆蓋', async () => {
    remoteWrite(stringifyMonth({ '2026-10-01': { weight: 71 } }))
    await save({}, '2026-10-08', { weight: 70 }, null)
    expect(Object.keys(parseMonth(file()!))).toEqual(['2026-10-01', '2026-10-08'])
  })

  it('月份檔格式錯誤時拒絕寫入', async () => {
    remoteWrite('{ broken')
    const err = await save({}, '2026-10-08', { weight: 70 }, null).catch((e) => e)
    expect(err.message).toContain('格式錯誤')
    expect(file()).toBe('{ broken')
  })

  it('刪除一天', async () => {
    const me: { file?: MonthFile } = {}
    await save(me, '2026-10-08', { weight: 70 }, null)
    await save(me, '2026-10-08', null, { weight: 70 })
    expect(parseMonth(file()!)).toEqual({})
  })
})
