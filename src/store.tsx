import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DATA_REPO, OWNER, PUBLIC_BRANCH, PUBLIC_REPO } from './config'
import { ConflictError, GitHub, errorMessage } from './github/api'
import { getToken } from './lib/auth'
import { cacheGet, cachePrune, cacheSet } from './lib/cache'
import { DEFAULT_CONFIG, parseConfig, stringifyConfig, type AppConfig } from './lib/config'
import { nowIso } from './lib/date'
import { stringifyNote, type NoteMeta } from './lib/frontmatter'
import { NOTE_RE, buildNote, notePath, sortNotes, type Note } from './lib/notes'
import { METRICS_RE, stringifyMonth, type DayEntry, type MonthData } from './lib/metrics'
import { toMonthFile, writeDay, type MonthFile } from './lib/metricsSync'
import { IMAGE_RE, imageMarkdown, imagePath, mimeOf, prepareImage, toRepoPath } from './lib/images'
import { hasPublic, loadPublicNotes, syncPublic, type ImageSource } from './lib/publish'

export interface SaveInput {
  category: string
  meta: NoteMeta
  body: string
}

export { DayConflictError, type MonthFile } from './lib/metricsSync'

interface Store {
  /** owner：有 token，可讀寫全部；visitor：只能看公開筆記 */
  mode: 'owner' | 'visitor'
  notes: Note[]
  categories: string[]
  /** 某分類的子分類：設定檔清單 + 筆記裡出現但不在清單上的（訪客只看得到筆記裡出現的） */
  subcategoriesOf(category: string): string[]
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
  /** 寫入 config.json（帶 sha，別處改過時丟出 ConflictError，不覆蓋） */
  saveConfig(next: AppConfig, message: string): Promise<void>
  /**
   * 分類改名：先更新 config.json，再把該分類的筆記逐篇搬到新資料夾。
   * 任何一篇失敗就停下並丟出錯誤（已搬的不會回復）；再改名一次會繼續搬剩下的
   */
  renameCategory(from: string, to: string, onProgress?: (done: number, total: number) => void): Promise<{ warning?: string }>
  /** 子分類改名（改成已存在的名稱 = 合併）：更新 config.json，再逐篇改寫筆記的 subcategory；失敗時停下，可再執行一次續做 */
  renameSubcategory(
    category: string,
    from: string,
    to: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ warning?: string }>
  /** 所有月份檔案（key = YYYY-MM） */
  metrics: Record<string, MonthFile>
  /** 所有日子的記錄合併在一起（key = YYYY-MM-DD） */
  days: MonthData
  /**
   * 儲存某一天的記錄（entry 為 null 代表刪除）。base 是開始編輯時那天的內容：
   * 檔案在別處被改過時，若別處沒動到這一天就自動合併；動到了就丟出 DayConflictError
   */
  saveDay(date: string, entry: DayEntry | null, base: DayEntry | null): Promise<void>
  /** 資料 repo 裡所有圖片：路徑 → sha */
  images: Map<string, string>
  /** 縮圖後上傳，回傳要插入筆記的 Markdown */
  uploadImage(file: File): Promise<string>
  /** 筆記裡的圖片網址 → 可以放進 <img src> 的網址 */
  imageSrc(src: string): Promise<string>
  deleteImage(path: string): Promise<void>
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
  const configRef = useRef<{ config: AppConfig; sha?: string; invalid?: boolean }>({ config: DEFAULT_CONFIG })
  const [status, setStatus] = useState<Store['status']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<Record<string, MonthFile>>({})
  const [images, setImages] = useState<Map<string, string>>(new Map())
  const imagesRef = useRef(images)
  const commitImages = useCallback((next: Map<string, string>) => {
    imagesRef.current = next
    setImages(next)
  }, [])
  const metricsRef = useRef<Record<string, MonthFile>>({})

  const commitMonth = useCallback((month: string, file: MonthFile) => {
    metricsRef.current = { ...metricsRef.current, [month]: file }
    setMetrics(metricsRef.current)
  }, [])

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
          const text = await readBlob(cfgFile.sha)
          let invalid = false
          try {
            JSON.parse(text)
          } catch {
            invalid = true
          }
          configRef.current = { config: parseConfig(text), sha: cfgFile.sha, invalid }
        } else {
          // 第一次使用：建立設定檔
          const sha = await github.data
            .putFile('config.json', stringifyConfig(DEFAULT_CONFIG), '建立設定檔 config.json')
            .catch(() => undefined)
          configRef.current = { config: DEFAULT_CONFIG, sha }
        }
        setConfig(configRef.current.config)
        commitImages(new Map(files.filter((f) => IMAGE_RE.test(f.path)).map((f) => [f.path, f.sha])))
        const noteFiles = files.filter((f) => NOTE_RE.test(f.path))
        const loaded = await mapPool(noteFiles, 6, async (f) => buildNote(f.path, f.sha, await readBlob(f.sha)))
        commit(sortNotes(loaded.filter((n): n is Note => !!n)))
        const months: Record<string, MonthFile> = {}
        await mapPool(
          files.filter((f) => METRICS_RE.test(f.path)),
          6,
          async (f) => {
            months[METRICS_RE.exec(f.path)![1]] = toMonthFile(f.path, f.sha, await readBlob(f.sha))
          },
        )
        metricsRef.current = months
        setMetrics(months)
        void cachePrune(new Set(files.map((f) => f.sha)))
      }
      setStatus('ready')
    } catch (e) {
      setError(errorMessage(e))
      setStatus('error')
    }
  }, [github, readBlob, commit, commitImages])

  useEffect(() => {
    void reload()
  }, [reload])

  const categories = useMemo(() => {
    const extra = notes.map((n) => n.category).filter((c) => !config.categories.includes(c))
    return github ? [...config.categories, ...new Set(extra)] : [...new Set(notes.map((n) => n.category))]
  }, [notes, config, github])

  const subcategoriesOf = useCallback(
    (category: string) => {
      const listed = github ? (config.subcategories[category] ?? []) : []
      const used = notes.filter((n) => n.category === category && n.meta.subcategory).map((n) => n.meta.subcategory!)
      return [...new Set([...listed, ...used])]
    },
    [notes, config, github],
  )

  const readImage = useCallback(
    async (sha: string) => {
      const cached = await cacheGet(sha)
      if (cached !== undefined) return cached
      const b64 = await need().data.getBlobBase64(sha)
      await cacheSet(sha, b64)
      return b64
    },
    [need],
  )
  const imageSource = useCallback((): ImageSource => ({ shas: imagesRef.current, read: readImage }), [readImage])

  const publish = useCallback(
    async (next: Note[]): Promise<string | undefined> => {
      try {
        await syncPublic(need().pub, next, { personal: imageSource() })
      } catch (e) {
        return `筆記已儲存，但同步到公開 repo 失敗：${errorMessage(e)}（可到「設定」重新同步）`
      }
    },
    [need, imageSource],
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

  const saveConfig = useCallback(
    async (next: AppConfig, message: string) => {
      if (configRef.current.invalid) throw new Error('config.json 格式錯誤，請先到 GitHub 修正後再按「重新載入」。')
      const text = stringifyConfig(next)
      const sha = await need()
        .data.putFile('config.json', text, message, configRef.current.sha)
        .catch((e) => {
          throw e instanceof ConflictError ? new Error('config.json 已在其他裝置或 GitHub 上被修改，請按「重新載入」後再試一次。') : e
        })
      await cacheSet(sha, text)
      configRef.current = { config: next, sha }
      setConfig(next)
    },
    [need],
  )

  const renameCategory = useCallback(
    async (from: string, to: string, onProgress?: (done: number, total: number) => void) => {
      const gh = need()
      const cur = configRef.current.config
      // 改成已存在的分類 = 合併（只移除舊名）；舊名不在設定檔裡（只存在資料夾）就把新名加進去
      const categories = cur.categories.includes(to)
        ? cur.categories.filter((c) => c !== from)
        : cur.categories.includes(from)
          ? cur.categories.map((c) => (c === from ? to : c))
          : [...cur.categories, to]
      if (categories.join('/') !== cur.categories.join('/') || cur.diaryCategory === from) {
        // 子分類清單跟著分類走；合併時兩邊的子分類都保留
        const { [from]: moved = [], ...subcategories } = cur.subcategories
        const mergedSubs = [...new Set([...(subcategories[to] ?? []), ...moved])]
        if (mergedSubs.length) subcategories[to] = mergedSubs
        await saveConfig(
          { categories, diaryCategory: cur.diaryCategory === from ? to : cur.diaryCategory, subcategories },
          `分類改名：${from} → ${to}`,
        )
      }
      const moving = notesRef.current.filter((n) => n.category === from)
      let done = 0
      let warning: string | undefined
      onProgress?.(0, moving.length)
      try {
        for (const old of moving) {
          // 內容原封不動；新路徑不帶 sha，已有同名檔時 GitHub 會拒絕（不覆蓋）
          const path = notePath(to, old.meta.date, old.meta.title)
          const sha = await gh.data.putFile(path, old.raw, `移動筆記：${old.meta.title}（${from} → ${to}）`)
          await cacheSet(sha, old.raw)
          commit(sortNotes([...notesRef.current, buildNote(path, sha, old.raw)!]))
          await gh.data.deleteFile(old.path, old.sha, `移動筆記（移除舊檔）：${old.meta.title}`)
          commit(notesRef.current.filter((n) => n.path !== old.path))
          onProgress?.(++done, moving.length)
        }
      } catch (e) {
        throw new Error(
          `已搬移 ${done}/${moving.length} 篇，在「${moving[done].meta.title}」停止：${e instanceof ConflictError ? `${e.path} 已有同名檔案或已在別處被修改` : errorMessage(e)}\n` +
            `處理好之後，再把「${from}」改名為「${to}」一次，會繼續搬剩下的筆記。`,
        )
      } finally {
        // 搬過公開筆記就同步公開分支（舊路徑移除、新路徑加入）
        if (done && hasPublic(moving)) warning = await publish(notesRef.current)
      }
      return { warning }
    },
    [need, saveConfig, commit, publish],
  )

  const renameSubcategory = useCallback(
    async (category: string, from: string, to: string, onProgress?: (done: number, total: number) => void) => {
      const gh = need()
      const cur = configRef.current.config
      const list = cur.subcategories[category] ?? []
      const next = list.includes(to)
        ? list.filter((x) => x !== from)
        : list.includes(from)
          ? list.map((x) => (x === from ? to : x))
          : [...list, to]
      if (next.join('/') !== list.join('/')) {
        await saveConfig(
          { ...cur, subcategories: { ...cur.subcategories, [category]: next } },
          `子分類改名：${category}／${from} → ${to}`,
        )
      }
      const targets = notesRef.current.filter((n) => n.category === category && n.meta.subcategory === from)
      let done = 0
      let warning: string | undefined
      onProgress?.(0, targets.length)
      try {
        for (const old of targets) {
          // 只改 subcategory 這一行；帶 sha，別處改過時 GitHub 會拒絕（不覆蓋）
          const raw = stringifyNote({ ...old.meta, subcategory: to }, old.body)
          const sha = await gh.data.putFile(old.path, raw, `子分類改名：${old.meta.title}（${from} → ${to}）`, old.sha)
          await cacheSet(sha, raw)
          commit(sortNotes([...notesRef.current.filter((n) => n.path !== old.path), buildNote(old.path, sha, raw)!]))
          onProgress?.(++done, targets.length)
        }
      } catch (e) {
        throw new Error(
          `已更新 ${done}/${targets.length} 篇，在「${targets[done].meta.title}」停止：${e instanceof ConflictError ? '這篇筆記已在其他裝置或 GitHub 上被修改' : errorMessage(e)}\n` +
            '請按「重新載入」後再改名一次，會繼續更新剩下的筆記。',
        )
      } finally {
        if (done && hasPublic(targets)) warning = await publish(notesRef.current)
      }
      return { warning }
    },
    [need, saveConfig, commit, publish],
  )

  const republish = useCallback(() => syncPublic(need().pub, notesRef.current, { personal: imageSource() }), [need, imageSource])

  const uploadImage = useCallback(
    async (file: File) => {
      const { base64, ext } = await prepareImage(file)
      const path = imagePath(ext)
      const sha = await need().data.putBase64(path, base64, `上傳圖片：${file.name}`)
      await cacheSet(sha, base64)
      commitImages(new Map(imagesRef.current).set(path, sha))
      return imageMarkdown(file.name.replace(/\.[^.]+$/, ''), path)
    },
    [need, commitImages],
  )

  const imageSrc = useCallback(
    async (src: string) => {
      const path = toRepoPath(src)
      if (!path) return src
      // 訪客：公開分支的圖片可以直接從 raw.githubusercontent.com 讀
      if (!github) return `https://raw.githubusercontent.com/${OWNER}/${PUBLIC_REPO}/${PUBLIC_BRANCH}/${path}`
      const sha = imagesRef.current.get(path)
      if (!sha) throw new Error(`找不到圖片 ${path}`)
      return `data:${mimeOf(path)};base64,${await readImage(sha)}`
    },
    [github, readImage],
  )

  const deleteImage = useCallback(
    async (path: string) => {
      const sha = imagesRef.current.get(path)
      if (!sha) return
      await need().data.deleteFile(path, sha, `刪除未使用的圖片：${path}`)
      const next = new Map(imagesRef.current)
      next.delete(path)
      commitImages(next)
    },
    [need, commitImages],
  )

  const days = useMemo(() => Object.assign({}, ...Object.values(metrics).map((m) => m.data)) as MonthData, [metrics])

  const saveDay = useCallback(
    (date: string, entry: DayEntry | null, base: DayEntry | null) => {
      const month = date.slice(0, 7)
      return writeDay(need().data, metricsRef.current[month], date, entry, base, async (file) => {
        if (file.sha) await cacheSet(file.sha, stringifyMonth(file.data))
        commitMonth(month, file)
      })
    },
    [need, commitMonth],
  )

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
    saveConfig,
    renameCategory,
    renameSubcategory,
    subcategoriesOf,
    metrics,
    days,
    saveDay,
    images,
    uploadImage,
    imageSrc,
    deleteImage,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
