import { decodeBase64, encodeBase64, gitBlobSha } from '../github/base64'

/** 最小的記憶體版 GitHub REST API，行為對齊真實 API 的衝突規則 */
export const repos = new Map<string, Map<string, string>>()
export const branches = new Set<string>()

export async function fakeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url)
  const [, , owner, name, ...rest] = u.pathname.split('/')
  const repo = repos.get(`${owner}/${name}`)
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
  if (!repo) return json(404, { message: 'Not Found' })
  const sub = rest.join('/')
  const method = init.method ?? 'GET'
  if (sub === '') return json(200, { full_name: `${owner}/${name}`, private: true })
  // 分支：只模擬「公開 repo 的分支在第一次 POST refs 之後才存在」
  if (sub.startsWith('git/ref/heads/')) return branches.has(`${owner}/${name}`) ? json(200, {}) : json(404, { message: 'Not Found' })
  if (method === 'POST' && sub === 'git/trees') {
    for (const t of JSON.parse(String(init.body)).tree) repo.set(t.path, t.content)
    return json(201, { sha: 'tree' })
  }
  if (method === 'POST' && sub === 'git/commits') return json(201, { sha: 'commit' })
  if (method === 'POST' && sub === 'git/refs') {
    branches.add(`${owner}/${name}`)
    return json(201, {})
  }
  if (sub.startsWith('git/trees/')) {
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

