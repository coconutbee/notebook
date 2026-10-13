import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, GitHub } from '../github/api'
import { branches, fakeFetch, repos } from '../test/fakeGitHub'
import { stringifyNote } from './frontmatter'
import { buildNote, notePath, type Note } from './notes'
import { loadPublicNotes, syncPublic } from './publish'

const data = new GitHub('t', 'me', 'data')
const pub = new GitHub('t', 'me', 'pub', 'public-notes')

async function save(title: string, visibility: 'public' | 'private', body = '內容'): Promise<Note> {
  const meta = { title, date: '2026-10-08', tags: ['x'], visibility }
  const path = notePath('腦科學', meta.date, title)
  const raw = stringifyNote(meta, body)
  const sha = await data.putFile(path, raw, 'msg')
  return buildNote(path, sha, raw)!
}

beforeEach(() => {
  repos.clear()
  branches.clear()
  repos.set('me/data', new Map())
  repos.set('me/pub', new Map())
  vi.stubGlobal('fetch', fakeFetch)
})

describe('寫入不會默默覆蓋', () => {
  it('新增同名檔案 → ConflictError(422)', async () => {
    await save('同名', 'private')
    await expect(save('同名', 'private')).rejects.toMatchObject({ status: 422 })
  })

  it('用過期的 sha 更新 → ConflictError(409)，遠端內容不變', async () => {
    const n = await save('筆記', 'private', 'v1')
    await data.putFile(n.path, 'changed elsewhere', 'other device', n.sha)
    const err = await data.putFile(n.path, 'my edit', 'me', n.sha).catch((e) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err.status).toBe(409)
    expect(repos.get('me/data')!.get(n.path)).toBe('changed elsewhere')
  })

  it('空 repo 列出檔案回傳空陣列', async () => {
    expect(await data.listFiles()).toEqual([])
  })
})

describe('公開同步', () => {
  it('共享的公開筆記放在 shared/ 底下，私人與共享同名筆記互不覆蓋', async () => {
    const mine = await save('同名', 'public')
    const theirs = { ...mine, space: 'shared' as const }
    await syncPublic(pub, [mine, theirs], {})
    const files = repos.get('me/pub')!
    expect(files.has(mine.path)).toBe(true)
    expect(files.has(`shared/${mine.path}`)).toBe(true)
    const index = JSON.parse(files.get('index.json')!)
    expect(index.notes.map((n: { space: string }) => n.space).sort()).toEqual(['personal', 'shared'])
  })

  it('共享區沒載入時，不刪除公開分支上的共享筆記，index.json 也保留它們', async () => {
    const mine = await save('個人公開', 'public')
    const theirs = { ...(await save('共享公開', 'public')), space: 'shared' as const }
    await syncPublic(pub, [mine, theirs], {})
    await syncPublic(pub, [mine], {}, ['personal'])
    const files = repos.get('me/pub')!
    expect(files.has(`shared/${theirs.path}`)).toBe(true)
    const index = JSON.parse(files.get('index.json')!)
    expect(index.notes.map((n: { title: string }) => n.title).sort()).toEqual(['個人公開', '共享公開'])
  })

  it('訪客讀回公開筆記時還原 space', async () => {
    const mine = await save('公開', 'public')
    await syncPublic(pub, [{ ...mine, space: 'shared' }], {})
    const index = repos.get('me/pub')!.get('index.json')!
    vi.stubGlobal('fetch', async () => new Response(index, { status: 200 }))
    const [n] = await loadPublicNotes()
    expect([n!.space, n!.path]).toEqual(['shared', mine.path])
  })

  it('只有公開筆記會出現在公開 repo', async () => {
    const a = await save('公開文', 'public')
    const b = await save('私人日記', 'private')
    await syncPublic(pub, [a, b])
    const files = repos.get('me/pub')!
    expect([...files.keys()].sort()).toEqual(['README.md', 'index.json', a.path].sort())
    const index = JSON.parse(files.get('index.json')!)
    expect(index.notes.map((n: { title: string }) => n.title)).toEqual(['公開文'])
    expect(files.get('index.json')).not.toContain('私人日記')
  })

  it('改回私人後會從公開 repo 移除；沒變動時不重寫', async () => {
    const a = await save('公開文', 'public')
    await syncPublic(pub, [a])
    const fetchSpy = vi.fn(fakeFetch)
    vi.stubGlobal('fetch', fetchSpy)
    await syncPublic(pub, [a])
    expect(fetchSpy.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true)

    const priv = { ...a, meta: { ...a.meta, visibility: 'private' as const } }
    await syncPublic(pub, [priv])
    expect([...repos.get('me/pub')!.keys()].sort()).toEqual(['README.md', 'index.json'])
    expect(JSON.parse(repos.get('me/pub')!.get('index.json')!).notes).toEqual([])
  })
})
