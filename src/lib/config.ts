export interface AppConfig {
  /** 筆記分類，也是 notes/ 底下的資料夾名稱 */
  categories: string[]
  /** 首頁「今天的日記」使用的分類 */
  diaryCategory: string
}

export const DEFAULT_CONFIG: AppConfig = {
  categories: ['工作', '腦科學', '讀書心得', '日記'],
  diaryCategory: '日記',
}

export function parseConfig(text: string): AppConfig {
  try {
    const data = JSON.parse(text)
    const categories: string[] = Array.isArray(data.categories)
      ? data.categories.map((c: unknown) => String(c).trim()).filter((c: string) => c && !c.includes('/'))
      : []
    return {
      categories: categories.length ? categories : DEFAULT_CONFIG.categories,
      diaryCategory: typeof data.diaryCategory === 'string' ? data.diaryCategory : DEFAULT_CONFIG.diaryCategory,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export const stringifyConfig = (c: AppConfig) => JSON.stringify(c, null, 2) + '\n'

/** 分類名稱也是資料夾名稱：不能有檔名不允許的字元。回傳錯誤訊息，沒問題時回傳 null */
export function categoryError(name: string, existing: string[]): string | null {
  if (!name) return '請輸入分類名稱'
  if (/[\\/:*?"<>|#%\x00-\x1f]/.test(name)) return '分類名稱不能包含 \\ / : * ? " < > | # % 等符號'
  if (name.length > 40) return '分類名稱太長（最多 40 字）'
  if (existing.includes(name)) return '已經有這個分類了'
  return null
}
