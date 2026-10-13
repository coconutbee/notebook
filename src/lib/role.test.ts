import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHub } from '../github/api'
import { fakeFetch, repos } from '../test/fakeGitHub'
import { detectRole } from './role'

const data = () => new GitHub('t', 'me', 'data')
const shared = () => new GitHub('t', 'org', 'shared')
const missing = () => new GitHub('t', 'org', 'missing')

beforeEach(() => {
  repos.clear()
  repos.set('me/data', new Map())
  repos.set('org/shared', new Map())
  vi.stubGlobal('fetch', fakeFetch)
})

describe('detectRole', () => {
  it('讀得到個人 repo 就是擁有者', async () => {
    expect(await detectRole(data(), shared())).toEqual({ role: 'owner', hasShared: true })
    expect(await detectRole(data(), null)).toEqual({ role: 'owner', hasShared: false })
  })

  it('只讀得到共享 repo 就是同事', async () => {
    expect(await detectRole(null, shared())).toEqual({ role: 'coworker', hasShared: true })
  })

  it('擁有者的共享 token 失效時仍是擁有者', async () => {
    expect(await detectRole(data(), missing())).toEqual({ role: 'owner', hasShared: false })
  })

  it('都讀不到就丟錯', async () => {
    await expect(detectRole(null, missing())).rejects.toThrow('都無法存取')
  })
})
