import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DATA_REPO, OWNER, PUBLIC_BRANCH, PUBLIC_REPO, SHARED_OWNER, SHARED_REPO } from './config'
import { ConflictError, GitHub, errorMessage } from './github/api'
import { getSharedToken, getToken } from './lib/auth'
import { cacheGet, cachePrune, cacheSet } from './lib/cache'
import { DEFAULT_CONFIG, stringifyConfig, type AppConfig } from './lib/config'
import { nowIso } from './lib/date'
import { stringifyNote, type NoteMeta } from './lib/frontmatter'
import { buildNote, noteId, notePath, parseNoteId, sortNotes, type Note, type Space } from './lib/notes'
import { stringifyMonth, type DayEntry, type MonthData } from './lib/metrics'
import { writeDay, type MonthFile } from './lib/metricsSync'
import { imageMarkdown, imagePath, imageRefs, mimeOf, prepareImage, toRepoPath } from './lib/images'
import { hasPublic, loadPublicExtras, loadPublicNotes, publicPath, syncPublic, type ImageSource } from './lib/publish'
import { copyImages, loadSpace } from './lib/space'

export interface SaveInput {
  /** 存到哪個 space；和 prev.space 不同時會把筆記（與它的圖片）搬過去 */
  space: Space
  category: string
  meta: NoteMeta
  body: string
}

export { DayConflictError, type MonthFile } from './lib/metricsSync'
export type { Space } from './lib/notes'

type Progress = (done: number, total: number) => void

interface Store {
  /** owner：個人 token，讀寫全部；coworker：只有共享 token，只看共享筆記；visitor：只能看公開筆記 */
  mode: 'owner' | 'coworker' | 'visitor'
  /** 這篇筆記目前的身分能不能編輯（同事看到的個人區公開筆記是唯讀的） */
  canEdit(note: Note): boolean
  /** 可以寫入的 space（擁有者的共享區載入失敗時只有 personal） */
  spaces: Space[]
  /** 擁有者的共享區無法載入時的說明；個人區照常使用 */
  sharedError: string | null
  notes: Note[]
  /** 兩個 space 的分類聯集 */
  categories: string[]
  categoriesOf(space?: Space): string[]
  /** 某分類的子分類：設定檔清單 + 筆記裡出現但不在清單上的（訪客只看得到筆記裡出現的） */
  subcategoriesOf(category: string, space?: Space): string[]
  /** owner 為個人設定，coworker 為共享設定（日記分類等既有功能用） */
  config: AppConfig
  configOf(space: Space): AppConfig
  status: 'loading' | 'ready' | 'error'
  error: string | null
  github: { data?: GitHub; shared?: GitHub; pub?: GitHub } | null
  reload(): Promise<void>
  /** 依 noteId 從 GitHub 重新讀取單一筆記；已被刪除時回傳 null */
  fetchLatest(id: string): Promise<Note | null>
  /** 儲存筆記。衝突時丟出 ConflictError；公開同步失敗只回傳 warning，不影響筆記本身 */
  saveNote(prev: Note | null, input: SaveInput): Promise<{ note: Note; warning?: string }>
  deleteNote(note: Note): Promise<{ warning?: string }>
  republish(): Promise<void>
  /** 寫入某個 space 的 config.json（帶 sha，別處改過時提示，不覆蓋） */
  saveConfig(space: Space, next: AppConfig, message: string): Promise<void>
  /**
   * 分類改名：先更新 config.json，再把該分類的筆記逐篇搬到新資料夾。
   * 任何一篇失敗就停下並丟出錯誤（已搬的不會回復）；再改名一次會繼續搬剩下的
   */
  renameCategory(space: Space, from: string, to: string, onProgress?: Progress): Promise<{ warning?: string }>
  /** 子分類改名（改成已存在的名稱 = 合併）：更新 config.json，再逐篇改寫筆記的 subcategory；失敗時停下，可再執行一次續做 */
  renameSubcategory(space: Space, category: string, from: string, to: string, onProgress?: Progress): Promise<{ warning?: string }>
  /** 所有月份檔案（key = YYYY-MM），只有擁有者有 */
  metrics: Record<string, MonthFile>
  /** 所有日子的記錄合併在一起（key = YYYY-MM-DD） */
  days: MonthData
  /**
   * 儲存某一天的記錄（entry 為 null 代表刪除）。base 是開始編輯時那天的內容：
   * 檔案在別處被改過時，若別處沒動到這一天就自動合併；動到了就丟出 DayConflictError
   */
  saveDay(date: string, entry: DayEntry | null, base: DayEntry | null): Promise<void>
  /** 每個 space 的圖片：路徑 → sha */
  images: Record<Space, Map<string, string>>
  /** 縮圖後上傳到該 space，回傳要插入筆記的 Markdown */
  uploadImage(file: File, space: Space): Promise<string>
  /** 筆記裡的圖片網址 → 可以放進 <img src> 的網址 */
  imageSrc(src: string, space: Space): Promise<string>
  deleteImage(space: Space, path: string): Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

interface ConfigState {
  config: AppConfig
  sha?: string
  invalid?: boolean
}

const EMPTY_IMAGES: Record<Space, Map<string, string>> = { personal: new Map(), shared: new Map() }
const EMPTY_CONFIGS: Record<Space, ConfigState> = { personal: { config: DEFAULT_CONFIG }, shared: { config: DEFAULT_CONFIG } }
const SPACE_LABEL: Record<Space, string> = { personal: '個人', shared: '共享' }

export function StoreProvider({ children }: { children: ReactNode }) {
  const token = getToken()
  const sharedToken = getSharedToken()
  const github = useMemo(() => {
    if (!token && !sharedToken) return null
    return {
      // 同事只有共享 token：完全不建立個人 repo 與公開分支的連線
      data: token ? new GitHub(token, OWNER, DATA_REPO) : undefined,
      pub: token ? new GitHub(token, OWNER, PUBLIC_REPO, PUBLIC_BRANCH) : undefined,
      shared: sharedToken ? new GitHub(sharedToken, SHARED_OWNER, SHARED_REPO) : undefined,
    }
  }, [token, sharedToken])
  const mode: Store['mode'] = !github ? 'visitor' : github.data ? 'owner' : 'coworker'

  const [notes, setNotes] = useState<Note[]>([])
  const notesRef = useRef<Note[]>([])
  const [configs, setConfigs] = useState(EMPTY_CONFIGS)
  const configsRef = useRef(EMPTY_CONFIGS)
  const [status, setStatus] = useState<Store['status']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [sharedError, setSharedError] = useState<string | null>(null)
  const [sharedReady, setSharedReady] = useState(false)
  const [metrics, setMetrics] = useState<Record<string, MonthFile>>({})
  const metricsRef = useRef<Record<string, MonthFile>>({})
  const [images, setImages] = useState(EMPTY_IMAGES)
  const imagesRef = useRef(EMPTY_IMAGES)

  const commit = useCallback((next: Note[]) => {
    notesRef.current = next
    setNotes(next)
  }, [])
  const commitImages = useCallback((space: Space, next: Map<string, string>) => {
    imagesRef.current = { ...imagesRef.current, [space]: next }
    setImages(imagesRef.current)
  }, [])
  const commitConfig = useCallback((space: Space, next: ConfigState) => {
    configsRef.current = { ...configsRef.current, [space]: next }
    setConfigs(configsRef.current)
  }, [])
  const commitMonth = useCallback((month: string, file: MonthFile) => {
    metricsRef.current = { ...metricsRef.current, [month]: file }
    setMetrics(metricsRef.current)
  }, [])

  const ghOf = useCallback(
    (space: Space): GitHub => {
      const gh = space === 'shared' ? github?.shared : github?.data
      if (!gh) throw new Error(space === 'shared' ? '沒有共享 token，無法存取共享筆記' : '尚未登入')
      return gh
    },
    [github],
  )

  const readBlob = useCallback(
    async (sha: string, space: Space) => {
      const cached = await cacheGet(sha)
      if (cached !== undefined) return cached
      const text = await ghOf(space).getBlob(sha)
      await cacheSet(sha, text)
      return text
    },
    [ghOf],
  )

  const readImage = useCallback(
    async (sha: string, space: Space) => {
      const cached = await cacheGet(sha)
      if (cached !== undefined) return cached
      const b64 = await ghOf(space).getBlobBase64(sha)
      await cacheSet(sha, b64)
      return b64
    },
    [ghOf],
  )
  const imageSource = useCallback(
    (space: Space): ImageSource => ({ shas: imagesRef.current[space], read: (sha) => readImage(sha, space) }),
    [readImage],
  )

  /** 公開同步只在擁有者端執行；同事沒有公開分支的權限 */
  const republish = useCallback(async () => {
    if (!github?.pub) return
    const sources: Partial<Record<Space, ImageSource>> = { personal: imageSource('personal') }
    if (github.shared && sharedReady) sources.shared = imageSource('shared')
    // 共享區沒載入（沒有共享 token 或載入失敗）時，公開分支上的共享筆記保持原狀，不會被當成「已取消公開」刪掉
    const loaded: Space[] = sharedReady ? ['personal', 'shared'] : ['personal']
    await syncPublic(github.pub, notesRef.current, sources, loaded)
  }, [github, sharedReady, imageSource])

  const publish = useCallback(async (): Promise<string | undefined> => {
    try {
      await republish()
    } catch (e) {
      return `筆記已儲存，但同步到公開 repo 失敗：${errorMessage(e)}（可到「設定」重新同步）`
    }
  }, [republish])

  const reload = useCallback(async () => {
    setStatus('loading')
    setError(null)
    setSharedError(null)
    try {
      if (!github) {
        commit(sortNotes(await loadPublicNotes()))
      } else {
        const loaded: Note[] = []
        const shas: string[] = []
        if (github.data) {
          const s = await loadSpace(github.data, 'personal', (sha) => readBlob(sha, 'personal'))
          commitConfig('personal', { config: s.config, sha: s.configSha, invalid: s.configInvalid })
          commitImages('personal', s.images)
          metricsRef.current = s.months
          setMetrics(s.months)
          loaded.push(...s.notes)
          shas.push(...s.fileShas)
        }
        let sharedOk = false
        if (github.shared) {
          try {
            const s = await loadSpace(github.shared, 'shared', (sha) => readBlob(sha, 'shared'))
            commitConfig('shared', { config: s.config, sha: s.configSha, invalid: s.configInvalid })
            commitImages('shared', s.images)
            loaded.push(...s.notes)
            shas.push(...s.fileShas)
            sharedOk = true
          } catch (e) {
            // 擁有者：共享區壞了不影響個人區；同事：共享區就是全部，照常報錯
            if (!github.data) throw e
            setSharedError(`共享區無法載入：${errorMessage(e)}`)
          }
        }
        // 同事：也顯示主人的公開筆記（從公開分支讀，唯讀）；讀不到就略過，不影響共享筆記
        if (!github.data) loaded.push(...(await loadPublicExtras().catch(() => [])))
        setSharedReady(sharedOk)
        commit(sortNotes(loaded))
        void cachePrune(new Set(shas))
      }
      setStatus('ready')
    } catch (e) {
      setError(errorMessage(e))
      setStatus('error')
    }
  }, [github, readBlob, commit, commitImages, commitConfig])

  useEffect(() => {
    void reload()
  }, [reload])

  // 擁有者載入後補一次公開同步：同事改過的公開共享筆記會在這裡更新（沒變的檔案不會重寫）
  useEffect(() => {
    if (status === 'ready' && mode === 'owner') void republish().catch(() => {})
  }, [status, mode, republish])

  const spaces = useMemo<Space[]>(
    () => (mode === 'owner' ? (sharedReady ? ['personal', 'shared'] : ['personal']) : mode === 'coworker' ? ['shared'] : []),
    [mode, sharedReady],
  )

  const categoriesOf = useCallback(
    (space?: Space) => {
      if (mode === 'visitor') return [...new Set(notes.map((n) => n.category))]
      const list = space ? [space] : spaces
      return [
        ...new Set([
          ...list.flatMap((s) => [...configs[s].config.categories, ...notes.filter((n) => n.space === s).map((n) => n.category)]),
          // 不指定 space 時也列出其他筆記的分類（同事看到的唯讀公開筆記）
          ...(space ? [] : notes.map((n) => n.category)),
        ]),
      ]
    },
    [mode, spaces, configs, notes],
  )
  const categories = useMemo(() => categoriesOf(), [categoriesOf])

  const subcategoriesOf = useCallback(
    (category: string, space?: Space) => {
      const list = space ? [space] : spaces
      const listed = mode === 'visitor' ? [] : list.flatMap((s) => configs[s].config.subcategories[category] ?? [])
      const used = notes
        .filter((n) => n.category === category && n.meta.subcategory && (!space || n.space === space))
        .map((n) => n.meta.subcategory!)
      return [...new Set([...listed, ...used])]
    },
    [mode, spaces, configs, notes],
  )

  const fetchLatest = useCallback(
    async (id: string) => {
      const { space, path } = parseNoteId(id)
      const file = await ghOf(space).getFile(path)
      if (!file) return null
      const note = buildNote(path, file.sha, file.text, space)
      if (note && notesRef.current.find((n) => noteId(n) === id)?.sha !== note.sha) {
        await cacheSet(note.sha, note.raw)
        commit(sortNotes([...notesRef.current.filter((n) => noteId(n) !== id), note]))
      }
      return note
    },
    [ghOf, commit],
  )

  const saveNote = useCallback(
    async (prev: Note | null, { space, category, meta, body }: SaveInput) => {
      const target = ghOf(space)
      const m: NoteMeta = { ...meta, title: meta.title.trim() || '未命名', updated: nowIso() }
      const path = notePath(category, m.date, m.title)
      const raw = stringifyNote(m, body)
      const warnings: string[] = []
      let keepPrev = false
      let sha: string
      if (prev && prev.space === space && prev.path === path) {
        sha = await target.putFile(path, raw, `更新筆記：${m.title}`, prev.sha)
      } else {
        // 換 space（或新筆記的圖片先上傳到另一區後才切換）：把這篇用到、目標還沒有的圖片帶過去。
        // 只帶這篇引用的，不會連帶其他私人圖片
        const other: Space = space === 'shared' ? 'personal' : 'shared'
        const missing = imageRefs(body).filter((p) => !imagesRef.current[space].has(p))
        if (missing.length && (other === 'personal' ? github?.data : github?.shared)) {
          commitImages(space, await copyImages(target, imagesRef.current[space], missing, imageSource(other)))
        }
        // 新路徑：不帶 sha，若檔案已存在 GitHub 會拒絕 → ConflictError，不會覆蓋（原檔也不會被刪）
        const verb = !prev ? '新增' : prev.space !== space ? `移到${SPACE_LABEL[space]}區` : '移動'
        sha = await target.putFile(path, raw, `${verb}筆記：${m.title}`)
        if (prev) {
          try {
            await ghOf(prev.space).deleteFile(prev.path, prev.sha, `移動筆記（移除舊檔）：${prev.meta.title}`)
          } catch (e) {
            keepPrev = true
            warnings.push(`新檔已建立，但舊檔 ${prev.path} 已在別處被修改，沒有刪除：${errorMessage(e)}`)
          }
        }
      }
      await cacheSet(sha, raw)
      const note = buildNote(path, sha, raw, space)!
      const id = noteId(note)
      const prevId = prev ? noteId(prev) : null
      const next = sortNotes([...notesRef.current.filter((n) => noteId(n) !== id && (keepPrev || noteId(n) !== prevId)), note])
      commit(next)
      if (hasPublic([prev, note])) {
        const w = await publish()
        if (w) warnings.push(w)
      }
      return { note, warning: warnings.join('\n') || undefined }
    },
    [github, ghOf, commit, commitImages, imageSource, publish],
  )

  const deleteNote = useCallback(
    async (note: Note) => {
      await ghOf(note.space).deleteFile(note.path, note.sha, `刪除筆記：${note.meta.title}`)
      commit(notesRef.current.filter((n) => noteId(n) !== noteId(note)))
      return { warning: hasPublic([note]) ? await publish() : undefined }
    },
    [ghOf, commit, publish],
  )

  const saveConfig = useCallback(
    async (space: Space, next: AppConfig, message: string) => {
      const cur = configsRef.current[space]
      if (cur.invalid) throw new Error('config.json 格式錯誤，請先到 GitHub 修正後再按「重新載入」。')
      const text = stringifyConfig(next)
      const sha = await ghOf(space)
        .putFile('config.json', text, message, cur.sha)
        .catch((e) => {
          throw e instanceof ConflictError ? new Error('config.json 已在其他裝置或 GitHub 上被修改，請按「重新載入」後再試一次。') : e
        })
      await cacheSet(sha, text)
      commitConfig(space, { config: next, sha })
    },
    [ghOf, commitConfig],
  )

  const renameCategory = useCallback(
    async (space: Space, from: string, to: string, onProgress?: Progress) => {
      const gh = ghOf(space)
      const cur = configsRef.current[space].config
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
          space,
          { categories, diaryCategory: cur.diaryCategory === from ? to : cur.diaryCategory, subcategories },
          `分類改名：${from} → ${to}`,
        )
      }
      const moving = notesRef.current.filter((n) => n.space === space && n.category === from)
      let done = 0
      let warning: string | undefined
      onProgress?.(0, moving.length)
      try {
        for (const old of moving) {
          // 內容原封不動；新路徑不帶 sha，已有同名檔時 GitHub 會拒絕（不覆蓋）
          const path = notePath(to, old.meta.date, old.meta.title)
          const sha = await gh.putFile(path, old.raw, `移動筆記：${old.meta.title}（${from} → ${to}）`)
          await cacheSet(sha, old.raw)
          commit(sortNotes([...notesRef.current, buildNote(path, sha, old.raw, space)!]))
          await gh.deleteFile(old.path, old.sha, `移動筆記（移除舊檔）：${old.meta.title}`)
          commit(notesRef.current.filter((n) => noteId(n) !== noteId(old)))
          onProgress?.(++done, moving.length)
        }
      } catch (e) {
        throw new Error(
          `已搬移 ${done}/${moving.length} 篇，在「${moving[done]!.meta.title}」停止：${e instanceof ConflictError ? `${e.path} 已有同名檔案或已在別處被修改` : errorMessage(e)}\n` +
            `處理好之後，再把「${from}」改名為「${to}」一次，會繼續搬剩下的筆記。`,
        )
      } finally {
        // 搬過公開筆記就同步公開分支（舊路徑移除、新路徑加入）
        if (done && hasPublic(moving)) warning = await publish()
      }
      return { warning }
    },
    [ghOf, saveConfig, commit, publish],
  )

  const renameSubcategory = useCallback(
    async (space: Space, category: string, from: string, to: string, onProgress?: Progress) => {
      const gh = ghOf(space)
      const cur = configsRef.current[space].config
      const list = cur.subcategories[category] ?? []
      const next = list.includes(to)
        ? list.filter((x) => x !== from)
        : list.includes(from)
          ? list.map((x) => (x === from ? to : x))
          : [...list, to]
      if (next.join('/') !== list.join('/')) {
        await saveConfig(space, { ...cur, subcategories: { ...cur.subcategories, [category]: next } }, `子分類改名：${category}／${from} → ${to}`)
      }
      const targets = notesRef.current.filter((n) => n.space === space && n.category === category && n.meta.subcategory === from)
      let done = 0
      let warning: string | undefined
      onProgress?.(0, targets.length)
      try {
        for (const old of targets) {
          // 只改 subcategory 這一行；帶 sha，別處改過時 GitHub 會拒絕（不覆蓋）
          const raw = stringifyNote({ ...old.meta, subcategory: to }, old.body)
          const sha = await gh.putFile(old.path, raw, `子分類改名：${old.meta.title}（${from} → ${to}）`, old.sha)
          await cacheSet(sha, raw)
          commit(sortNotes([...notesRef.current.filter((n) => noteId(n) !== noteId(old)), buildNote(old.path, sha, raw, space)!]))
          onProgress?.(++done, targets.length)
        }
      } catch (e) {
        throw new Error(
          `已更新 ${done}/${targets.length} 篇，在「${targets[done]!.meta.title}」停止：${e instanceof ConflictError ? '這篇筆記已在其他裝置或 GitHub 上被修改' : errorMessage(e)}\n` +
            '請按「重新載入」後再改名一次，會繼續更新剩下的筆記。',
        )
      } finally {
        if (done && hasPublic(targets)) warning = await publish()
      }
      return { warning }
    },
    [ghOf, saveConfig, commit, publish],
  )

  const uploadImage = useCallback(
    async (file: File, space: Space) => {
      const { base64, ext } = await prepareImage(file)
      const path = imagePath(ext)
      const sha = await ghOf(space).putBase64(path, base64, `上傳圖片：${file.name}`)
      await cacheSet(sha, base64)
      commitImages(space, new Map(imagesRef.current[space]).set(path, sha))
      return imageMarkdown(file.name.replace(/\.[^.]+$/, ''), path)
    },
    [ghOf, commitImages],
  )

  const imageSrc = useCallback(
    async (src: string, space: Space) => {
      const path = toRepoPath(src)
      if (!path) return src
      // 訪客，以及同事看的個人區公開筆記：公開分支的圖片可以直接從 raw.githubusercontent.com 讀
      if (!github || (space === 'personal' && !github.data))
        return `https://raw.githubusercontent.com/${OWNER}/${PUBLIC_REPO}/${PUBLIC_BRANCH}/${publicPath(space, path)}`
      const sha = imagesRef.current[space].get(path)
      if (!sha) throw new Error(`找不到圖片 ${path}`)
      return `data:${mimeOf(path)};base64,${await readImage(sha, space)}`
    },
    [github, readImage],
  )

  const deleteImage = useCallback(
    async (space: Space, path: string) => {
      const sha = imagesRef.current[space].get(path)
      if (!sha) return
      await ghOf(space).deleteFile(path, sha, `刪除未使用的圖片：${path}`)
      const next = new Map(imagesRef.current[space])
      next.delete(path)
      commitImages(space, next)
    },
    [ghOf, commitImages],
  )

  const days = useMemo(() => Object.assign({}, ...Object.values(metrics).map((m) => m.data)) as MonthData, [metrics])

  const saveDay = useCallback(
    (date: string, entry: DayEntry | null, base: DayEntry | null) => {
      const month = date.slice(0, 7)
      return writeDay(ghOf('personal'), metricsRef.current[month], date, entry, base, async (file) => {
        if (file.sha) await cacheSet(file.sha, stringifyMonth(file.data))
        commitMonth(month, file)
      })
    },
    [ghOf, commitMonth],
  )

  const value: Store = {
    mode,
    canEdit: (note) => mode === 'owner' || (mode === 'coworker' && note.space === 'shared'),
    spaces,
    sharedError,
    notes,
    categories,
    categoriesOf,
    subcategoriesOf,
    config: configs[mode === 'coworker' ? 'shared' : 'personal'].config,
    configOf: (space) => configs[space].config,
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
