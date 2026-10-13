import { describe, expect, it } from 'vitest'
import { parseConfig, stringifyConfig } from './config'
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
