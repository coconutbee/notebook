import { bytesToBase64 } from '../github/base64'

/**
 * 圖片存在資料 repo 的 images/<年-月>/<亂數>.<副檔名>。
 * 筆記一律放在 notes/<分類>/ 底下（深度固定兩層），所以用 ../../images/... 引用，
 * 在 GitHub 上直接看筆記也能顯示圖片；筆記換分類也不用改連結。
 */
export const IMAGE_RE = /^images\/[^/]+\/[^/]+\.(jpe?g|png|gif|webp)$/i
const PREFIX = '../../'

/** 筆記裡的圖片網址 → repo 內路徑；不是我們的圖片（外部網址等）回傳 null */
export const toRepoPath = (src: string): string | null => {
  const path = src.startsWith(PREFIX) ? src.slice(PREFIX.length) : ''
  return IMAGE_RE.test(path) ? path : null
}

/** 內文引用到的所有圖片（repo 內路徑） */
export const imageRefs = (body: string): string[] =>
  [...body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].flatMap((m) => toRepoPath(m[1]) ?? [])

export const imageMarkdown = (alt: string, path: string) => `![${alt.replace(/[[\]]/g, '')}](${PREFIX}${path})`

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }
export const mimeOf = (path: string) => MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream'

export function imagePath(ext: string, now = new Date()): string {
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const id = now.getTime().toString(36) + Math.random().toString(36).slice(2, 6)
  return `images/${ym}/${id}.${ext}`
}

const MAX_SIDE = 1600
const KEEP_BYTES = 400_000
const MAX_GIF = 5_000_000

/** 長邊縮到 1600px 並轉成 JPEG；本來就夠小的 PNG/WebP/JPEG（例如截圖）與 GIF 保留原檔 */
export async function prepareImage(file: File): Promise<{ base64: string; ext: string }> {
  const ext = Object.keys(MIME).find((e) => MIME[e] === file.type)
  if (!ext) throw new Error(`不支援的圖片格式：${file.type || file.name}（支援 JPEG、PNG、GIF、WebP）`)
  const original = async () => ({ base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())), ext })
  if (file.type === 'image/gif') {
    if (file.size > MAX_GIF) throw new Error('GIF 超過 5 MB，請先壓縮再上傳。')
    return original()
  }
  const bmp = await createImageBitmap(file) // 會依照片的 EXIF 方向轉正
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  if (scale === 1 && file.size <= KEEP_BYTES) return original()
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // JPEG 沒有透明：透明背景變白色
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('圖片轉檔失敗')
  return { base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())), ext: 'jpg' }
}
