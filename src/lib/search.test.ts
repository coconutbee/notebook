import { describe, expect, it } from 'vitest'
import { stringifyNote } from './frontmatter'
import { buildNote } from './notes'
import { matchNote, parseQuery, splitHighlight } from './search'

const note = buildNote(
  'notes/工作/PFC.md',
  'sha',
  stringifyNote({ title: 'PFC 回授', date: '', tags: ['電源'], visibility: 'private' }, '前言。'.repeat(20) + '使用 Power Feedforward 改善。'),
)!

describe('全文搜尋', () => {
  it('標題、標籤、內文都能找到，不分大小寫', () => {
    expect(matchNote(note, parseQuery('pfc'))).toBe('')
    expect(matchNote(note, parseQuery('電源'))).toBe('')
    expect(matchNote(note, parseQuery('FEEDFORWARD'))).toContain('Power Feedforward')
  })

  it('多個關鍵字要全部符合', () => {
    expect(matchNote(note, parseQuery('pfc feedforward'))).not.toBeNull()
    expect(matchNote(note, parseQuery('pfc 不存在'))).toBeNull()
  })

  it('片段在命中處附近，前面截斷時加 …', () => {
    const s = matchNote(note, parseQuery('feedforward'))!
    expect(s.startsWith('…')).toBe(true)
    expect(s.length).toBeLessThan(130)
  })

  it('標亮：奇數位置是命中字，特殊字元不會出錯', () => {
    expect(splitHighlight('a PFC b pfc', ['pfc'])).toEqual(['a ', 'PFC', ' b ', 'pfc', ''])
    expect(splitHighlight('1+1=2', ['1+1'])).toEqual(['', '1+1', '=2'])
  })
})
