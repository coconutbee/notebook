import type { NoteMeta } from './frontmatter'

export interface Draft {
  category: string
  meta: NoteMeta
  body: string
  savedAt: string
}

const key = (id: string) => `notebook.draft:${id}`

export function loadDraft(id: string): Draft | null {
  try {
    const s = localStorage.getItem(key(id))
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}

export function saveDraft(id: string, draft: Draft) {
  try {
    localStorage.setItem(key(id), JSON.stringify(draft))
  } catch {
    /* 空間不足時放棄草稿，不影響編輯 */
  }
}

export function clearDraft(id: string) {
  try {
    localStorage.removeItem(key(id))
  } catch {
    /* ignore */
  }
}
