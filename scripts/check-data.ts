// 檢查資料 repo 的筆記能被 App 正確解析，並把檔名對齊 App 的命名規則（避免第一次編輯時被搬移）
// 用法：npx vite-node scripts/check-data.ts <notebook-data 路徑> [--fix]
import { readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { buildNote, notePath } from '../src/lib/notes'

const root = process.argv[2]
const fix = process.argv.includes('--fix')
if (!root) throw new Error('請提供 notebook-data 路徑')

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))

let problems = 0
for (const file of walk(join(root, 'notes')).filter((f) => f.endsWith('.md'))) {
  const path = relative(root, file).replace(/\\/g, '/')
  const note = buildNote(path, '', readFileSync(file, 'utf8'))
  if (!note) {
    console.log(`✗ 無法解析：${path}`)
    problems++
    continue
  }
  const expected = notePath(note.category, note.meta.date, note.meta.title)
  if (expected !== path) {
    console.log(`${fix ? '→ 改名' : '✗ 檔名不一致'}：${path} → ${expected}`)
    if (fix) renameSync(file, join(root, expected))
    else problems++
  } else {
    console.log(`✓ ${path}（${note.meta.title}｜${note.meta.tags.join(', ')}｜${note.meta.visibility}）`)
  }
}
process.exitCode = problems ? 1 : 0
