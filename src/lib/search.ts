import type { Note } from './notes'

/** 以空白分開的關鍵字，不分大小寫 */
export const parseQuery = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)

/**
 * 每個關鍵字都要出現在標題、標籤或內文其中之一（AND）。
 * 符合時回傳內文中第一個命中處附近的片段（沒有命中內文則為空字串），不符合回傳 null。
 */
export function matchNote(note: Note, terms: string[]): string | null {
  const body = note.body.toLowerCase()
  const head = [note.meta.title, ...note.meta.tags].join(' ').toLowerCase()
  if (!terms.every((t) => head.includes(t) || body.includes(t))) return null
  const hits = terms.map((t) => body.indexOf(t)).filter((i) => i >= 0)
  if (!hits.length) return ''
  const at = Math.min(...hits)
  const start = Math.max(0, at - 30)
  const end = Math.min(note.body.length, at + 90)
  const text = note.body.slice(start, end).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '…' : '') + text + (end < note.body.length ? '…' : '')
}

/** 把文字切成 [一般, 命中, 一般, 命中, …]，奇數位置是命中的關鍵字 */
export function splitHighlight(text: string, terms: string[]): string[] {
  if (!terms.length) return [text]
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(re)
}
