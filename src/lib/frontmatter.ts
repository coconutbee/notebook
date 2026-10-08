import YAML from 'yaml'

export type Visibility = 'public' | 'private'

export interface NoteMeta {
  title: string
  date: string
  tags: string[]
  visibility: Visibility
  updated?: string
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parseNote(text: string): { meta: NoteMeta; body: string } {
  const m = FM_RE.exec(text)
  let data: Record<string, unknown> = {}
  if (m) {
    try {
      data = YAML.parse(m[1]) ?? {}
    } catch {
      data = {}
    }
  }
  const date = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date ?? '')
  const tags = Array.isArray(data.tags)
    ? data.tags.map(String)
    : typeof data.tags === 'string'
      ? data.tags.split(',')
      : []
  return {
    meta: {
      title: String(data.title ?? ''),
      date,
      tags: tags.map((t) => t.trim()).filter(Boolean),
      visibility: data.visibility === 'public' ? 'public' : 'private',
      ...(data.updated ? { updated: String(data.updated) } : {}),
    },
    body: (m ? m[2] : text).replace(/^\r?\n/, ''),
  }
}

export function stringifyNote(meta: NoteMeta, body: string): string {
  const fm = YAML.stringify({
    title: meta.title,
    date: meta.date,
    tags: meta.tags,
    visibility: meta.visibility,
    updated: meta.updated,
  })
  return `---\n${fm}---\n\n${body.trim()}\n`
}
