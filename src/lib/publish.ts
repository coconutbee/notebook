import { gitBlobSha } from '../github/base64'
import type { GitHub } from '../github/api'
import { OWNER, PUBLIC_BRANCH, PUBLIC_REPO } from '../config'
import { imageRefs } from './images'
import { buildNote, sortNotes, type Note } from './notes'

interface PublicEntry {
  path: string
  title: string
  date: string
  tags: string[]
  subcategory?: string
  updated?: string
  body: string
}

const PUBLIC_README = `# 公開筆記

這個分支由筆記本 App 自動產生，只包含標記為「公開」的筆記副本與 index.json。
請不要手動編輯；原始筆記在私人 repo。
`

export const hasPublic = (notes: (Note | null | undefined)[]) => notes.some((n) => n?.meta.visibility === 'public')

/**
 * 讓公開 repo 剛好等於「所有 visibility: public 的筆記」：
 * 缺的補上、內容不同的更新、不該公開的刪除，最後更新 index.json。
 * 私人 repo 與公開 repo 的同一份內容 blob sha 相同，所以沒變的檔案不會重寫。
 */
export interface ImageSource {
  /** 資料 repo 裡所有圖片：路徑 → sha */
  shas: Map<string, string>
  read(sha: string): Promise<string>
}

/** 公開筆記引用到的圖片也一併複製；不再被公開筆記引用的圖片會從公開分支移除 */
export async function syncPublic(pub: GitHub, notes: Note[], images?: ImageSource): Promise<void> {
  const desired = sortNotes(notes.filter((n) => n.meta.visibility === 'public'))
  await pub.ensureBranch(PUBLIC_README)
  const existing = new Map((await pub.listFiles()).map((f) => [f.path, f.sha]))
  const wanted = new Set(desired.map((n) => n.path))
  const wantedImages = new Set(desired.flatMap((n) => imageRefs(n.body)).filter((p) => images?.shas.has(p)))

  // GitHub 不允許同一分支同時寫入，所以逐一進行
  for (const n of desired) {
    const sha = existing.get(n.path)
    if (sha !== n.sha) await pub.putFile(n.path, n.raw, `發布：${n.meta.title}`, sha)
  }
  for (const path of wantedImages) {
    const sha = images!.shas.get(path)!
    if (existing.get(path) !== sha) await pub.putBase64(path, await images!.read(sha), `發布圖片：${path}`, existing.get(path))
  }
  for (const [path, sha] of existing) {
    if ((path.startsWith('notes/') && !wanted.has(path)) || (images && path.startsWith('images/') && !wantedImages.has(path)))
      await pub.deleteFile(path, sha, `取消發布：${path}`)
  }

  const entries: PublicEntry[] = desired.map((n) => ({
    path: n.path,
    title: n.meta.title,
    date: n.meta.date,
    tags: n.meta.tags,
    subcategory: n.meta.subcategory,
    updated: n.meta.updated,
    body: n.body,
  }))
  const index = JSON.stringify({ notes: entries }, null, 2) + '\n'
  const indexSha = existing.get('index.json')
  if (indexSha !== (await gitBlobSha(index))) await pub.putFile('index.json', index, '更新公開筆記索引', indexSha)
}

/** 訪客模式：不需要 token，從公開 repo 讀 index.json */
export async function loadPublicNotes(): Promise<Note[]> {
  const res = await fetch(`https://raw.githubusercontent.com/${OWNER}/${PUBLIC_REPO}/${PUBLIC_BRANCH}/index.json`, {
    cache: 'no-cache',
  })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`無法載入公開筆記（${res.status}）`)
  const data: { notes: PublicEntry[] } = await res.json()
  return data.notes.flatMap((e) => {
    const n = buildNote(e.path, '', '')
    if (!n) return []
    return [{ ...n, meta: { title: e.title, date: e.date, tags: e.tags, subcategory: e.subcategory, updated: e.updated, visibility: 'public' as const }, body: e.body }]
  })
}
