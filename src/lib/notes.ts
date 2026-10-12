import { parseNote, type NoteMeta } from './frontmatter'

export interface Note {
  path: string
  sha: string
  category: string
  meta: NoteMeta
  body: string
  /** 完整檔案內容（含 front matter） */
  raw: string
}

/** notes/<分類>/[<日期>-]<標題>.md，日期可省略 */
export const NOTE_RE = /^notes\/([^/]+)\/(?:(\d{4}-\d{2}-\d{2})-)?(.+)\.md$/

/** 檔名不能有的字元換成 -；真正的標題存在 front matter */
export function sanitizeTitle(title: string): string {
  return (
    title
      .trim()
      .replace(/[\\/:*?"<>|#%\x00-\x1f]/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 80) || '未命名'
  )
}

export const notePath = (category: string, date: string, title: string) =>
  `notes/${category}/${date ? `${date}-` : ''}${sanitizeTitle(title)}.md`

export function buildNote(path: string, sha: string, raw: string): Note | null {
  const m = NOTE_RE.exec(path)
  if (!m) return null
  const { meta, body } = parseNote(raw)
  meta.title ||= m[3]
  meta.date ||= m[2] ?? ''
  return { path, sha, category: m[1], meta, body, raw }
}

/** 依日期新到舊，未標日期的排最後 */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) =>
      b.meta.date.localeCompare(a.meta.date) ||
      (b.meta.updated ?? '').localeCompare(a.meta.updated ?? '') ||
      a.meta.title.localeCompare(b.meta.title),
  )
}

/** 列表用的純文字摘要：去掉程式碼、圖片和 Markdown 符號 */
export function excerpt(body: string, max = 90): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** 給路由用：每段分別編碼，保留 / */
export const encodeNotePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')
