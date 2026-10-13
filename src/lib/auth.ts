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

export function clearToken() {
  localStorage.removeItem(KEY)
}

// 共享 token：只能存取組織底下的 notebook-shared（同事只需要這一把）
const SHARED_KEY = 'notebook.sharedToken'

export function getSharedToken(): string | null {
  try {
    return localStorage.getItem(SHARED_KEY)
  } catch {
    return null
  }
}

export function saveSharedToken(token: string) {
  localStorage.setItem(SHARED_KEY, token)
}

export function clearSharedToken() {
  localStorage.removeItem(SHARED_KEY)
}

/** 清掉這台裝置上的 token（兩把都清）、草稿與快取的筆記內容 */
export async function logout() {
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  await cacheClear()
}
