import { errorMessage, type GitHub } from '../github/api'

export type Role = 'owner' | 'coworker'

const canAccess = (gh: GitHub | null) =>
  gh
    ? gh.checkAccess().then(
        () => null,
        (e: unknown) => errorMessage(e),
      )
    : Promise.resolve('沒有 token')

/**
 * 依讀得到哪些 repo 決定身分：讀得到個人資料 repo 就是擁有者（共享 repo 可有可無），
 * 只讀得到共享 repo 就是同事，都讀不到就丟錯。
 */
export async function detectRole(data: GitHub | null, shared: GitHub | null): Promise<{ role: Role; hasShared: boolean }> {
  const [dataErr, sharedErr] = await Promise.all([canAccess(data), canAccess(shared)])
  if (dataErr === null) return { role: 'owner', hasShared: sharedErr === null }
  if (sharedErr === null) return { role: 'coworker', hasShared: true }
  throw new Error(`兩把 token 都無法存取筆記資料：個人（${dataErr}）；共享（${sharedErr}）`)
}
