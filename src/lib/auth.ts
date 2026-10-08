import { cacheClear } from './cache'

const KEY = 'notebook.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveToken(token: string) {
  localStorage.setItem(KEY, token)
}

/** 清掉這台裝置上的 token、草稿與快取的筆記內容 */
export async function logout() {
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  await cacheClear()
}
