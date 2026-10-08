import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DATA_REPO, OWNER, PUBLIC_BRANCH, PUBLIC_REPO } from './config'
import { GitHub, errorMessage } from './github/api'
import { getToken } from './lib/auth'
import { cacheGet, cachePrune, cacheSet } from './lib/cache'
import { DEFAULT_CONFIG, parseConfig, type AppConfig } from './lib/config'
import { nowIso } from './lib/date'
import { stringifyNote, type NoteMeta } from './lib/frontmatter'
import { NOTE_RE, buildNote, notePath, sortNotes, type Note } from './lib/notes'
import { hasPublic, loadPublicNotes, syncPublic } from './lib/publish'

export interface SaveInput {
  category: string
  meta: NoteMeta
  body: string
}

interface Store {
  /** owner：有 token，可讀寫全部；visitor：只能看公開筆記 */
  mode: 'owner' | 'visitor'
  notes: Note[]
  categories: string[]
  config: AppConfig
  status: 'loading' | 'ready' | 'error'
  error: string | null
  github: { data: GitHub; pub: GitHub } | null
  reload(): Promise<void>
  /** 從 GitHub 重新讀取單一筆記；已被刪除時回傳 null */
  fetchLatest(path: string): Promise<Note | null>
  /** 儲存筆記。衝突時丟出 ConflictError；公開同步失敗只回傳 warning，不影響筆記本身 */
  saveNote(prev: Note | null, input: SaveInput): Promise<{ note: Note; warning?: string }>
  deleteNote(note: Note): Promise<{ warning?: string }>
  republish(): Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const token = getToken()
  const github = useMemo(
    () => (token ? { data: new GitHub(token, OWNER, DATA_REPO), pub: new GitHub(token, OWNER, PUBLIC_REPO, PUBLIC_BRANCH) } : null),
    [token],
  )
  const [notes, setNotes] = useState<Note[]>([])
  const notesRef = useRef<Note[]>([])
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [status, setStatus] = useState<Store['status']>('loading')
  const [error, setError] = useState<string | null>(null)

  const commit = useCallback((next: Note[]) => {
    notesRef.current = next
    setNotes(next)
  }, [])

  const need = useCallback(() => {
    if (!github) throw new Error('尚未登入')
    return github
  }, [github])

  const readBlob = useCallback(
    async (sha: string) => {
      const cached = await cacheGet(sha)
      if (cached !== undefined) return cached
      const text = await need().data.getBlob(sha)
      await cacheSet(sha, text)
      return text
    },
    [need],
  )

  const reload = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      if (!github) {
        commit(sortNotes(await loadPublicNotes()))
      } else {
        const files = await github.data.listFiles()
        const cfgFile = files.find((f) => f.path === 'config.json')
        if (cfgFile) {
          setConfig(parseConfig(await readBlob(cfgFile.sha)))
        } else {
          // 第一次使用：建立設定檔，之後直接在 GitHub 上編輯它就能新增分類
          await github.data
            .putFile('config.json', JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', '建立設定檔 config.json')
            .catch(() => {})
        }
        const noteFiles = files.filter((f) => NOTE_RE.test(f.path))
        const loaded = await mapPool(noteFiles, 6, async (f) => buildNote(f.path, f.sha, await readBlob(f.sha)))
        commit(sortNotes(loaded.filter((n): n is Note => !!n)))
        void cachePrune(new Set(files.map((f) => f.sha)))
      }
      setStatus('ready')
    } catch (e) {
      setError(errorMessage(e))
      setStatus('error')
    }
  }, [github, readBlob, commit])

  useEffect(() => {
    void reload()
  }, [reload])

  const categories = useMemo(() => {
    const extra = notes.map((n) => n.category).filter((c) => !config.categories.includes(c))
    return github ? [...config.categories, ...new Set(extra)] : [...new Set(notes.map((n) => n.category))]
  }, [notes, config, github])

  const publish = useCallback(
    async (next: Note[]): Promise<string | undefined> => {
      try {
        await syncPublic(need().pub, next)
      } catch (e) {
        return `筆記已儲存，但同步到公開 repo 失敗：${errorMessage(e)}（可到「設定」重新同步）`
      }
    },
    [need],
  )

  const fetchLatest = useCallback(
    async (path: string) => {
      const file = await need().data.getFile(path)
      if (!file) return null
      const note = buildNote(path, file.sha, file.text)
      if (note && notesRef.current.find((n) => n.path === path)?.sha !== note.sha) {
        await cacheSet(note.sha, note.raw)
        commit(sortNotes([...notesRef.current.filter((n) => n.path !== path), note]))
      }
      return note
    },
    [need, commit],
  )

  const saveNote = useCallback(
    async (prev: Note | null, { category, meta, body }: SaveInput) => {
      const gh = need()
      const m: NoteMeta = { ...meta, title: meta.title.trim() || '未命名', updated: nowIso() }
      const path = notePath(category, m.date, m.title)
      const raw = stringifyNote(m, body)
      const warnings: string[] = []
      let keepPrev = false
      let sha: string
      if (prev && prev.path === path) {
        sha = await gh.data.putFile(path, raw, `更新筆記：${m.title}`, prev.sha)
      } else {
        // 新路徑：不帶 sha，若檔案已存在 GitHub 會拒絕 → ConflictError，不會覆蓋
        sha = await gh.data.putFile(path, raw, prev ? `移動筆記：${m.title}` : `新增筆記：${m.title}`)
        if (prev) {
          try {
            await gh.data.deleteFile(prev.path, prev.sha, `移動筆記（移除舊檔）：${prev.meta.title}`)
          } catch (e) {
            keepPrev = true
            warnings.push(`新檔已建立，但舊檔 ${prev.path} 已在別處被修改，沒有刪除：${errorMessage(e)}`)
          }
        }
      }
      await cacheSet(sha, raw)
      const note = buildNote(path, sha, raw)!
      const next = sortNotes([
        ...notesRef.current.filter((n) => n.path !== path && (keepPrev || n.path !== prev?.path)),
        note,
      ])
      commit(next)
      if (hasPublic([prev, note])) {
        const w = await publish(next)
        if (w) warnings.push(w)
      }
      return { note, warning: warnings.join('\n') || undefined }
    },
    [need, commit, publish],
  )

  const deleteNote = useCallback(
    async (note: Note) => {
      await need().data.deleteFile(note.path, note.sha, `刪除筆記：${note.meta.title}`)
      const next = notesRef.current.filter((n) => n.path !== note.path)
      commit(next)
      return { warning: hasPublic([note]) ? await publish(next) : undefined }
    },
    [need, commit, publish],
  )

  const republish = useCallback(() => syncPublic(need().pub, notesRef.current), [need])

  const value: Store = {
    mode: github ? 'owner' : 'visitor',
    notes,
    categories,
    config,
    status,
    error,
    github,
    reload,
    fetchLatest,
    saveNote,
    deleteNote,
    republish,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
