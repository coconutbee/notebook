import { gitBlobSha } from '../github/base64'
import type { GitHub } from '../github/api'
import { OWNER, PUBLIC_BRANCH, PUBLIC_REPO } from '../config'
import { imageRefs } from './images'
import { buildNote, sortNotes, type Note, type Space } from './notes'

interface PublicEntry {
  /** 舊版 index.json 沒有這個欄位：視為個人 */
  space?: Space
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

export interface ImageSource {
  /** 資料 repo 裡所有圖片：路徑 → sha */
  shas: Map<string, string>
  read(sha: string): Promise<string>
}

/** 公開分支上的路徑：共享筆記與它的圖片放在 shared/ 底下，筆記裡的 ../../images/ 相對路徑仍然正確 */
export const publicPath = (space: Space, path: string) => (space === 'shared' ? `shared/${path}` : path)

const SPACES: Space[] = ['personal', 'shared']

/**
 * 讓公開分支剛好等於「所有 visibility: public 的筆記」（個人與共享）：
 * 缺的補上、內容不同的更新、不該公開的刪除，最後更新 index.json。
 * 資料 repo 與公開分支的同一份內容 blob sha 相同，所以沒變的檔案不會重寫。
 * 公開筆記引用到的圖片一併複製；某個 space 有傳入 images 時，才清掉該 space 不再被引用的圖片。
 */
export async function syncPublic(pub: GitHub, notes: Note[], images: Partial<Record<Space, ImageSource>> = {}): Promise<void> {
  const desired = sortNotes(notes.filter((n) => n.meta.visibility === 'public'))
  await pub.ensureBranch(PUBLIC_README)
  const existing = new Map((await pub.listFiles()).map((f) => [f.path, f.sha]))
  const wanted = new Set(desired.map((n) => publicPath(n.space, n.path)))
  // 公開路徑 → [space, repo 內路徑]
  const wantedImages = new Map<string, [Space, string]>()
  for (const n of desired) {
    for (const p of imageRefs(n.body)) if (images[n.space]?.shas.has(p)) wantedImages.set(publicPath(n.space, p), [n.space, p])
  }

  // GitHub 不允許同一分支同時寫入，所以逐一進行
  for (const n of desired) {
    const path = publicPath(n.space, n.path)
    const sha = existing.get(path)
    if (sha !== n.sha) await pub.putFile(path, n.raw, `發布：${n.meta.title}`, sha)
  }
  for (const [path, [space, repoPath]] of wantedImages) {
    const src = images[space]!
    const sha = src.shas.get(repoPath)!
    if (existing.get(path) !== sha) await pub.putBase64(path, await src.read(sha), `發布圖片：${path}`, existing.get(path))
  }
  for (const [path, sha] of existing) {
    const isNote = SPACES.some((s) => path.startsWith(publicPath(s, 'notes/')))
    const imageSpace = SPACES.find((s) => path.startsWith(publicPath(s, 'images/')))
    const stale = isNote ? !wanted.has(path) : imageSpace !== undefined && !!images[imageSpace] && !wantedImages.has(path)
    if (stale) await pub.deleteFile(path, sha, `取消發布：${path}`)
  }

  const entries: PublicEntry[] = desired.map((n) => ({
    space: n.space,
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
    const n = buildNote(e.path, '', '', e.space ?? 'personal')
    if (!n) return []
    return [{ ...n, meta: { title: e.title, date: e.date, tags: e.tags, subcategory: e.subcategory, updated: e.updated, visibility: 'public' as const }, body: e.body }]
  })
}
