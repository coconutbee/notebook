import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, parseConfig, stringifyConfig, subcategoryOptions } from './config'
import { parseNote, stringifyNote } from './frontmatter'

describe('子分類', () => {
  it('front matter 寫入與讀回；沒有子分類時不寫這一行', () => {
    const meta = { title: 'Git 基礎', date: '', tags: ['Git'], subcategory: 'Git', visibility: 'private' as const }
    const raw = stringifyNote(meta, '內容')
    expect(raw).toContain('subcategory: Git')
    expect(parseNote(raw).meta.subcategory).toBe('Git')
    expect(stringifyNote({ ...meta, subcategory: undefined }, '內容')).not.toContain('subcategory')
  })

  it('config.json 的子分類清單：去重、去空白；舊設定檔沒有這個欄位也能讀', () => {
    const c = parseConfig(JSON.stringify({ categories: ['工作'], subcategories: { 工作: [' Git ', 'Git', '', '儀器'], 壞的: 'x' } }))
    expect(c.subcategories).toEqual({ 工作: ['Git', '儀器'] })
    expect(parseConfig(JSON.stringify({ categories: ['工作'] })).subcategories).toEqual({})
    expect(parseConfig(stringifyConfig(c))).toEqual(c)
  })
})

describe('subcategoryOptions', () => {
  const note = (category: string, subcategory?: string) => ({ category, meta: { title: '', date: '', tags: [], visibility: 'private' as const, subcategory } })
  it('設定檔清單在前，再加上任何筆記用到的（不分 space），不重複', () => {
    const cfg = { ...DEFAULT_CONFIG, subcategories: { 工作: ['測試'] } }
    const notes = [note('工作', 'git'), note('工作', '測試'), note('工作'), note('讀書心得', '情商')]
    expect(subcategoryOptions('工作', [cfg], notes)).toEqual(['測試', 'git'])
  })
  it('同事的共享設定是空的，也能從公開筆記看到子分類', () => {
    expect(subcategoryOptions('工作', [DEFAULT_CONFIG], [note('工作', 'git')])).toEqual(['git'])
  })
})
