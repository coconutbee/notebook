import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHub } from '../github/api'
import { encodeBase64 } from '../github/base64'
import { fakeFetch, repos } from '../test/fakeGitHub'
import { stringifyNote } from './frontmatter'
import type { ImageSource } from './publish'
import { copyImages, loadSpace } from './space'

const data = new GitHub('t', 'me', 'data')
const shared = new GitHub('t', 'org', 'shared')
const IMG = 'images/2026-10/a.jpg'
const PRIVATE_IMG = 'images/2026-10/private.jpg'

beforeEach(() => {
  repos.clear()
  repos.set('me/data', new Map())
  repos.set('org/shared', new Map())
  vi.stubGlobal('fetch', fakeFetch)
})

describe('loadSpace', () => {
  it('讀出筆記並標上 space；共享 space 不讀 metrics', async () => {
    const files = repos.get('org/shared')!
    files.set('notes/工作/a.md', stringifyNote({ title: 'a', date: '', tags: [], visibility: 'private' }, '內容'))
    files.set('metrics/2026-10.json', '{}')
    files.set(IMG, 'x')
    const s = await loadSpace(shared, 'shared', (sha) => shared.getBlob(sha))
    expect(s.notes.map((n) => [n.space, n.path])).toEqual([['shared', 'notes/工作/a.md']])
    expect(s.months).toEqual({})
    expect([...s.images.keys()]).toEqual([IMG])
    // 沒有 config.json 時會建立
    expect(files.has('config.json')).toBe(true)
  })

  it('個人 space 讀 metrics', async () => {
    repos.get('me/data')!.set('metrics/2026-10.json', JSON.stringify({ '2026-10-01': { weight: 70 } }))
    const s = await loadSpace(data, 'personal', (sha) => data.getBlob(sha))
    expect(Object.keys(s.months)).toEqual(['2026-10'])
  })

  it('repo 不存在時丟出 404', async () => {
    await expect(loadSpace(new GitHub('t', 'org', 'missing'), 'shared', async () => '')).rejects.toMatchObject({ status: 404 })
  })
})

describe('copyImages', () => {
  async function source(): Promise<ImageSource> {
    const a = await data.putBase64(IMG, encodeBase64('fake-jpeg'), 'img')
    const b = await data.putBase64(PRIVATE_IMG, encodeBase64('secret'), 'img')
    return { shas: new Map([[IMG, a], [PRIVATE_IMG, b]]), read: (sha) => data.getBlobBase64(sha) }
  }

  it('只複製指定的圖片，不修改傳入的 Map', async () => {
    const before = new Map<string, string>()
    const next = await copyImages(shared, before, [IMG], await source())
    expect(repos.get('org/shared')!.get(IMG)).toBe('fake-jpeg')
    expect(repos.get('org/shared')!.has(PRIVATE_IMG)).toBe(false)
    expect(next.has(IMG)).toBe(true)
    expect(before.size).toBe(0)
  })

  it('目標已有同路徑但內容不同的圖片時不覆蓋', async () => {
    repos.get('org/shared')!.set(IMG, 'theirs')
    const existing = new Map([[IMG, 'other-sha']])
    const next = await copyImages(shared, existing, [IMG], await source())
    expect(repos.get('org/shared')!.get(IMG)).toBe('theirs')
    expect(next.get(IMG)).toBe('other-sha')
  })

  it('目標已有相同內容就不再寫入', async () => {
    const src = await source()
    const next = await copyImages(shared, new Map(), [IMG], src)
    const spy = vi.fn(fakeFetch)
    vi.stubGlobal('fetch', spy)
    await copyImages(shared, next, [IMG], src)
    expect(spy.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true)
  })
})
