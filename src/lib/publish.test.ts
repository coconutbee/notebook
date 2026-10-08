import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, GitHub } from '../github/api'
import { decodeBase64, encodeBase64, gitBlobSha } from '../github/base64'
import { stringifyNote } from './frontmatter'
import { buildNote, notePath, type Note } from './notes'
import { syncPublic } from './publish'

/** 最小的記憶體版 GitHub REST API，行為對齊真實 API 的衝突規則 */
const repos = new Map<string, Map<string, string>>()

async function fakeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url)
  const [, , owner, name, ...rest] = u.pathname.split('/')
  const repo = repos.get(`${owner}/${name}`)
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
  if (!repo) return json(404, { message: 'Not Found' })
  const sub = rest.join('/')
  const method = init.method ?? 'GET'
  if (sub === '') return json(200, { full_name: `${owner}/${name}`, private: true })
  if (sub === 'git/trees/HEAD') {
    if (!repo.size) return json(409, { message: 'Git Repository is empty.' })
    const tree = await Promise.all([...repo].map(async ([path, text]) => ({ type: 'blob', path, sha: await gitBlobSha(text) })))
    return json(200, { tree })
  }
  if (sub.startsWith('git/blobs/')) {
    for (const text of repo.values()) if ((await gitBlobSha(text)) === rest[2]) return json(200, { content: encodeBase64(text) })
    return json(404, { message: 'Not Found' })
  }
  const path = decodeURIComponent(sub.replace(/^contents\//, ''))
  const current = repo.get(path)
  const currentSha = current === undefined ? undefined : await gitBlobSha(current)
  const body = init.body ? JSON.parse(String(init.body)) : {}
  if (method === 'GET') return current === undefined ? json(404, { message: 'Not Found' }) : json(200, { sha: currentSha, content: encodeBase64(current) })
  if (method === 'PUT') {
    if (current !== undefined && !body.sha) return json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' })
    if (current !== undefined && body.sha !== currentSha) return json(409, { message: 'is at x but expected y' })
    const text = decodeBase64(body.content)
    repo.set(path, text)
    return json(200, { content: { sha: await gitBlobSha(text) } })
  }
  if (method === 'DELETE') {
    if (current === undefined) return json(404, { message: 'Not Found' })
    if (body.sha !== currentSha) return json(409, { message: 'sha mismatch' })
    repo.delete(path)
    return json(200, {})
  }
  return json(400, { message: 'unsupported' })
}

const data = new GitHub('t', 'me', 'data')
const pub = new GitHub('t', 'me', 'pub')

async function save(title: string, visibility: 'public' | 'private', body = '內容'): Promise<Note> {
  const meta = { title, date: '2026-10-08', tags: ['x'], visibility }
  const path = notePath('腦科學', meta.date, title)
  const raw = stringifyNote(meta, body)
  const sha = await data.putFile(path, raw, 'msg')
  return buildNote(path, sha, raw)!
}

beforeEach(() => {
  repos.clear()
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
  it('只有公開筆記會出現在公開 repo', async () => {
    const a = await save('公開文', 'public')
    const b = await save('私人日記', 'private')
    await syncPublic(pub, [a, b])
    const files = repos.get('me/pub')!
    expect([...files.keys()].sort()).toEqual(['index.json', a.path])
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
    expect([...repos.get('me/pub')!.keys()]).toEqual(['index.json'])
    expect(JSON.parse(repos.get('me/pub')!.get('index.json')!).notes).toEqual([])
  })
})
