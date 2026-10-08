import { clear, createStore, delMany, get, keys, set } from 'idb-keyval'

// 以 git blob sha 為 key 快取檔案內容：內容不變 sha 就不變，不用重新下載
const store = createStore('notebook', 'blobs')

export const cacheGet = (sha: string) => get<string>(sha, store).catch(() => undefined)
export const cacheSet = (sha: string, text: string) => set(sha, text, store).catch(() => {})
export const cacheClear = () => clear(store).catch(() => {})

export async function cachePrune(keep: Set<string>) {
  try {
    const all = await keys(store)
    await delMany(all.filter((k) => !keep.has(String(k))), store)
  } catch {
    /* 快取失敗不影響功能 */
  }
}
