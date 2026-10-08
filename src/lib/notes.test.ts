import { describe, expect, it } from 'vitest'
import { decodeBase64, encodeBase64, gitBlobSha } from '../github/base64'
import { parseConfig } from './config'
import { parseNote, stringifyNote } from './frontmatter'
import { buildNote, notePath, sanitizeTitle } from './notes'

describe('base64', () => {
  it('中文來回轉換不失真', () => {
    const s = '腦科學筆記 🧠\n第二行'
    expect(decodeBase64(encodeBase64(s))).toBe(s)
  })

  it('blob sha 與 git 相同', async () => {
    // echo hello | git hash-object --stdin
    expect(await gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })
})

describe('front matter', () => {
  it('寫出再讀回結果一致', () => {
    const meta = { title: '海馬迴與記憶', date: '2026-10-08', tags: ['記憶', '神經'], visibility: 'public' as const, updated: '2026-10-08T06:00:00.000Z' }
    const text = stringifyNote(meta, '# 內容\n\n正文')
    expect(text.startsWith('---\ntitle: 海馬迴與記憶\n')).toBe(true)
    const parsed = parseNote(text)
    expect(parsed.meta).toEqual(meta)
    expect(parsed.body).toBe('# 內容\n\n正文\n')
  })

  it('預設為私人，容忍缺少欄位與沒有 front matter', () => {
    expect(parseNote('只有內容').meta).toEqual({ title: '', date: '', tags: [], visibility: 'private' })
    expect(parseNote('---\ntitle: x\ntags: a, b\n---\nbody').meta.tags).toEqual(['a', 'b'])
  })

  it('壞掉的 YAML 不會讓程式崩潰', () => {
    expect(parseNote('---\ntitle: [\n---\nbody').meta.visibility).toBe('private')
  })
})

describe('檔名', () => {
  it('不合法字元換成 -', () => {
    expect(sanitizeTitle(' A/B: 測試? ')).toBe('A-B--測試-')
    expect(sanitizeTitle('   ')).toBe('未命名')
  })

  it('路徑與解析', () => {
    const p = notePath('讀書心得', '2026-10-08', '原子習慣')
    expect(p).toBe('notes/讀書心得/2026-10-08-原子習慣.md')
    const n = buildNote(p, 'abc', 'no front matter')!
    expect(n.category).toBe('讀書心得')
    expect(n.meta.title).toBe('原子習慣')
    expect(n.meta.date).toBe('2026-10-08')
    expect(buildNote('metrics/2026-10.json', 'x', '')).toBeNull()
  })
})

describe('config', () => {
  it('讀取自訂分類，壞檔用預設值', () => {
    expect(parseConfig('{"categories":["工作","旅行"]}').categories).toEqual(['工作', '旅行'])
    expect(parseConfig('not json').categories).toContain('日記')
  })
})
