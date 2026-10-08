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
