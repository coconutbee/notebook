import { ConflictError, errorMessage, type GitHub } from '../github/api'
import { metricsPath, parseMonth, sameDay, stringifyMonth, withDay, type DayEntry, type MonthData } from './metrics'

export interface MonthFile {
  sha?: string
  data: MonthData
  /** 檔案不是有效 JSON 時的錯誤訊息；這個月份會拒絕寫入，避免覆蓋 */
  invalid?: string
}

/** 同一天的記錄已在別處被改成不同內容 */
export class DayConflictError extends Error {
  constructor(
    public date: string,
    public remote: DayEntry | null,
  ) {
    super(`${date} 的記錄已在其他裝置或 GitHub 上被修改`)
  }
}

export function toMonthFile(path: string, sha: string, text: string): MonthFile {
  try {
    return { sha, data: parseMonth(text) }
  } catch (e) {
    return { sha, data: {}, invalid: `${path} 格式錯誤（${errorMessage(e)}）` }
  }
}

/**
 * 寫入某一天（entry 為 null 代表刪除）。base 是開始編輯時那天的內容。
 * 月份檔在別處被改過（sha 不符）時重新讀取：別處沒動到這一天 → 自動合併後重寫；
 * 動到了 → 丟出 DayConflictError 交給使用者決定。onFile 會收到每次得知的最新檔案狀態。
 */
export async function writeDay(
  gh: GitHub,
  current: MonthFile | undefined,
  date: string,
  entry: DayEntry | null,
  base: DayEntry | null,
  onFile: (file: MonthFile) => void | Promise<void>,
): Promise<void> {
  const path = metricsPath(date.slice(0, 7))
  const write = async (file: MonthFile) => {
    if (file.invalid) throw new Error(`${file.invalid}，請先到 GitHub 修正後再記錄。`)
    const data = withDay(file.data, date, entry)
    const sha = await gh.putFile(path, stringifyMonth(data), entry ? `記錄 ${date}` : `刪除 ${date} 的記錄`, file.sha)
    await onFile({ sha, data })
  }
  try {
    await write(current ?? { data: {} })
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e
    const remote = await gh.getFile(path)
    const latest = remote ? toMonthFile(path, remote.sha, remote.text) : { data: {} }
    await onFile(latest)
    if (!sameDay(latest.data[date], base)) throw new DayConflictError(date, latest.data[date] ?? null)
    await write(latest)
  }
}
