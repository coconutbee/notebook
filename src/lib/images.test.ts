import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHub } from '../github/api'
import { encodeBase64 } from '../github/base64'
import { branches, fakeFetch, repos } from '../test/fakeGitHub'
import { stringifyNote } from './frontmatter'
import { imageMarkdown, imageRefs, toRepoPath } from './images'
import { buildNote } from './notes'
import { syncPublic, type ImageSource } from './publish'

const IMG = 'images/2026-10/abc.jpg'

describe('圖片路徑', () => {
  it('只認得 ../../images/ 底下的圖片', () => {
    expect(toRepoPath(`../../${IMG}`)).toBe(IMG)
    expect(toRepoPath('https://example.com/a.jpg')).toBeNull()
    expect(toRepoPath('../../notes/x.md')).toBeNull()
  })

  it('從內文找出引用的圖片', () => {
    const body = `前言\n${imageMarkdown('電路[圖]', IMG)}\n![外部](https://x.com/b.png)`
    expect(body).toContain('![電路圖](../../images/2026-10/abc.jpg)')
    expect(imageRefs(body)).toEqual([IMG])
  })
})

describe('公開同步含圖片', () => {
  const data = new GitHub('t', 'me', 'data')
  const pub = new GitHub('t', 'me', 'pub', 'public-notes')

  beforeEach(() => {
    repos.clear()
    branches.clear()
    repos.set('me/data', new Map())
    repos.set('me/pub', new Map())
    vi.stubGlobal('fetch', fakeFetch)
  })

  async function setup(visibility: 'public' | 'private') {
    const imgSha = await data.putBase64(IMG, encodeBase64('fake-jpeg'), 'img')
    const other = await data.putBase64('images/2026-10/private.jpg', encodeBase64('secret'), 'img')
    const raw = stringifyNote({ title: 'a', date: '', tags: [], visibility }, imageMarkdown('a', IMG))
    const path = 'notes/工作/a.md'
    const note = buildNote(path, await data.putFile(path, raw, 'n'), raw)!
    const images: ImageSource = {
      shas: new Map([[IMG, imgSha], ['images/2026-10/private.jpg', other]]),
      read: async (sha) => data.getBlobBase64(sha),
    }
    return { note, images }
  }

  it('只複製公開筆記用到的圖片；改回私人後移除', async () => {
    const { note, images } = await setup('public')
    await syncPublic(pub, [note], images)
    expect(repos.get('me/pub')!.get(IMG)).toBe('fake-jpeg')
    expect(repos.get('me/pub')!.has('images/2026-10/private.jpg')).toBe(false)

    await syncPublic(pub, [{ ...note, meta: { ...note.meta, visibility: 'private' } }], images)
    expect(repos.get('me/pub')!.has(IMG)).toBe(false)
  })
})
