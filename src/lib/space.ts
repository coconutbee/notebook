import type { GitHub } from '../github/api'
import { DEFAULT_CONFIG, parseConfig, stringifyConfig, type AppConfig } from './config'
import { IMAGE_RE } from './images'
import { METRICS_RE } from './metrics'
import { toMonthFile, type MonthFile } from './metricsSync'
import { buildNote, NOTE_RE, sortNotes, type Note, type Space } from './notes'
import type { ImageSource } from './publish'

export async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** 一個資料 repo（個人或共享）讀進來的全部內容 */
export interface SpaceData {
  config: AppConfig
  configSha?: string
  /** config.json 不是有效 JSON：這個 space 的設定拒絕寫入，避免覆蓋 */
  configInvalid: boolean
  notes: Note[]
  /** 圖片：路徑 → sha */
  images: Map<string, string>
  /** 追蹤資料，只有個人 space 有 */
  months: Record<string, MonthFile>
  /** repo 內所有檔案的 sha（清理快取用） */
  fileShas: string[]
}

export async function loadSpace(gh: GitHub, space: Space, readBlob: (sha: string) => Promise<string>): Promise<SpaceData> {
  const files = await gh.listFiles()
  const cfgFile = files.find((f) => f.path === 'config.json')
  let config = DEFAULT_CONFIG
  let configSha: string | undefined
  let configInvalid = false
  if (cfgFile) {
    const text = await readBlob(cfgFile.sha)
    try {
      JSON.parse(text)
    } catch {
      configInvalid = true
    }
    config = parseConfig(text)
    configSha = cfgFile.sha
  } else {
    // 第一次使用：建立設定檔（失敗不影響讀取）
    configSha = await gh.putFile('config.json', stringifyConfig(DEFAULT_CONFIG), '建立設定檔 config.json').catch(() => undefined)
  }
  const loaded = await mapPool(
    files.filter((f) => NOTE_RE.test(f.path)),
    6,
    async (f) => buildNote(f.path, f.sha, await readBlob(f.sha), space),
  )
  const months: Record<string, MonthFile> = {}
  if (space === 'personal') {
    await mapPool(
      files.filter((f) => METRICS_RE.test(f.path)),
      6,
      async (f) => {
        months[METRICS_RE.exec(f.path)![1]!] = toMonthFile(f.path, f.sha, await readBlob(f.sha))
      },
    )
  }
  return {
    config,
    configSha,
    configInvalid,
    notes: sortNotes(loaded.filter((n): n is Note => !!n)),
    images: new Map(files.filter((f) => IMAGE_RE.test(f.path)).map((f) => [f.path, f.sha])),
    months,
    fileShas: files.map((f) => f.sha),
  }
}

/**
 * 把筆記用到的圖片複製到另一個 repo（搬移筆記到別的 space 時用）。
 * 只複製 paths 裡、來源確實有的圖片；目標已有同路徑的檔案就跳過（不覆蓋）。回傳目標的新圖片清單。
 */
export async function copyImages(
  to: GitHub,
  toImages: Map<string, string>,
  paths: string[],
  from: ImageSource,
): Promise<Map<string, string>> {
  const next = new Map(toImages)
  for (const path of new Set(paths)) {
    const sha = from.shas.get(path)
    // 目標已有這個路徑（不論內容是否相同）就不寫：絕不覆蓋目標 repo 的檔案
    if (!sha || next.has(path)) continue
    next.set(path, await to.putBase64(path, await from.read(sha), `複製圖片：${path}`))
  }
  return next
}
