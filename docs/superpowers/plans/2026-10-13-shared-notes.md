# 共享筆記 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓擁有者把個別筆記放到組織底下的 `notebook-shared` repo，同事用自己的 token 只能看、編輯共享筆記，看不到 `notebook-data` 的任何內容。

**Architecture:** 筆記多一個 `space`（`personal` | `shared`），每個 space 對應一個資料 repo、一個 GitHub 物件、一份 `config.json` 和一份圖片清單。身分由「讀得到哪些 repo」決定。公開同步只在擁有者端執行，共享筆記在公開分支放 `shared/` 前綴。純邏輯放在 `src/lib/`（有測試），`store.tsx` 只負責組合與 React 狀態。

**Tech Stack:** Vite 5 + React 18 + TypeScript、vitest、`src/test/fakeGitHub.ts`（記憶體版 GitHub API，已支援多個 repo）。

**Spec:** `docs/superpowers/specs/2026-10-13-shared-notes-design.md`

## Global Constraints

- 介面文字一律繁體中文。
- 寫入衝突（409／422）時一律提示，**不可默默覆蓋**；沿用 `ConflictError`。
- 程式 repo（`coconutbee/notebook`）不得包含任何筆記資料或 token。
- token 只存 localStorage：`notebook.token`（個人）、`notebook.sharedToken`（共享）；`logout()` 現有的 `localStorage.clear()` 會一併清除。
- 共享 repo：`SHARED_OWNER`（擁有者建立的組織名稱）／`SHARED_REPO = 'notebook-shared'`，寫在 `src/config.ts`。
- 個人筆記的 `id` 等於 `path`（現有網址不變）；共享筆記的 `id` 是 `shared/` + `path`。
- 公開分支：個人 `notes/…`、`images/…`；共享 `shared/notes/…`、`shared/images/…`；`index.json` 每筆加 `space`。
- 只有擁有者能設定公開、能寫公開分支；同事沒有追蹤功能。
- 每個 task 結束時 `npx vitest run` 與 `npm run build` 都要通過。

## Review Focus

1. 共享 token 失效或被撤銷（401／403／404）：擁有者仍能正常使用個人區，只看到「共享區無法載入」提示，而不是整站錯誤。→ Task 3 測試 `loadSpace` 對 404 丟出可辨識的錯誤；Task 5 在 store 中把共享區錯誤降級為提示。
2. 個人與共享各有一篇相同 `path` 的筆記：列表、路由、編輯、刪除都不能互相蓋掉。→ Task 1 測 `noteId`／`parseNoteId`；Task 5 的 `fetchLatest`、`deleteNote` 以 `id` 比對。
3. 搬到共享時目標已有同名檔：不得覆蓋，原檔必須保留。→ Task 5 的搬移一律「不帶 sha 建立」，由現有測試「新增同名檔案 → ConflictError(422)」（`publish.test.ts`）保證；建立失敗時不執行刪除原檔。
4. 私人圖片外流：搬到共享時只複製這篇筆記引用到的圖片，公開同步只複製公開筆記引用的圖片。→ Task 3、Task 4 測試。
5. 同事身分不得呼叫公開分支或 `notebook-data`：store 在 coworker 模式下 `github.data` 與 `github.pub` 為 `undefined`。→ Task 2 測 `detectRole` 只回傳讀得到的 repo；Task 5 不建立那兩個物件。

---

### Task 1: Note 的 space 與 id

**Files:**
- Modify: `src/lib/notes.ts`
- Test: `src/lib/notes.test.ts`

**Interfaces:**
- Produces:
  - `export type Space = 'personal' | 'shared'`
  - `Note` 增加 `space: Space`
  - `buildNote(path: string, sha: string, raw: string, space: Space = 'personal'): Note | null`
  - `noteId(note: Pick<Note, 'space' | 'path'>): string`：personal → `path`；shared → `` `shared/${path}` ``
  - `parseNoteId(id: string): { space: Space; path: string }`

- [ ] **Step 1: 寫失敗的測試**（加在 `notes.test.ts`）

```ts
it('共享筆記的 id 有 shared/ 前綴，個人筆記 id 就是 path', () => {
  expect(noteId({ space: 'personal', path: 'notes/工作/a.md' })).toBe('notes/工作/a.md')
  expect(noteId({ space: 'shared', path: 'notes/工作/a.md' })).toBe('shared/notes/工作/a.md')
  expect(parseNoteId('shared/notes/工作/a.md')).toEqual({ space: 'shared', path: 'notes/工作/a.md' })
  expect(parseNoteId('notes/工作/a.md')).toEqual({ space: 'personal', path: 'notes/工作/a.md' })
  expect(buildNote('notes/工作/a.md', 's', '# x', 'shared')!.space).toBe('shared')
  expect(buildNote('notes/工作/a.md', 's', '# x')!.space).toBe('personal')
})
```

- [ ] **Step 2:** `npx vitest run src/lib/notes.test.ts` → FAIL（`noteId` 未定義）
- [ ] **Step 3:** 在 `src/lib/notes.ts` 實作上列介面。
- [ ] **Step 4:** `npx vitest run` → 全部 PASS；`npx tsc --noEmit` 會在其他檔案報 `space` 缺失處，逐一補上 `'personal'`（`loadPublicNotes` 先暫填 `'personal'`，Task 4 改正）。
- [ ] **Step 5:** commit `筆記加入 space 與 id（個人／共享）`

### Task 2: 設定、token 與身分判斷

**Files:**
- Modify: `src/config.ts`、`src/lib/auth.ts`
- Create: `src/lib/role.ts`
- Test: `src/lib/role.test.ts`

**Interfaces:**
- Produces:
  - `src/config.ts`：`export const SHARED_OWNER = '<組織名稱>'`（Task 7 前由擁有者提供，先填 `'coconutbee-notes'` 並在 README 註明要改）、`export const SHARED_REPO = 'notebook-shared'`
  - `src/lib/auth.ts`：`getSharedToken(): string | null`、`saveSharedToken(token: string): void`、`clearSharedToken(): void`（key `notebook.sharedToken`）
  - `src/lib/role.ts`：
    - `export type Role = 'owner' | 'coworker'`
    - `export async function detectRole(data: GitHub | null, shared: GitHub | null): Promise<{ role: Role; hasShared: boolean }>`
    - 規則：`data?.checkAccess()` 成功 → `owner`（`hasShared` 為 `shared?.checkAccess()` 是否成功）；否則 `shared?.checkAccess()` 成功 → `coworker`；都失敗 → 丟出 `Error('兩把 token 都無法存取筆記資料：…')`，訊息含原始錯誤。

- [ ] **Step 1: 寫失敗的測試**（`role.test.ts`，用 `fakeFetch`，repos 設 `me/data`、`org/shared`）

```ts
it('讀得到個人 repo 就是擁有者', async () => {
  expect(await detectRole(new GitHub('t', 'me', 'data'), new GitHub('t', 'org', 'shared'))).toEqual({ role: 'owner', hasShared: true })
  expect(await detectRole(new GitHub('t', 'me', 'data'), null)).toEqual({ role: 'owner', hasShared: false })
})
it('只讀得到共享 repo 就是同事', async () => {
  expect(await detectRole(null, new GitHub('t', 'org', 'shared'))).toEqual({ role: 'coworker', hasShared: true })
})
it('擁有者的共享 token 失效時仍是擁有者', async () => {
  expect(await detectRole(new GitHub('t', 'me', 'data'), new GitHub('t', 'org', 'missing'))).toEqual({ role: 'owner', hasShared: false })
})
it('都讀不到就丟錯', async () => {
  await expect(detectRole(null, new GitHub('t', 'org', 'missing'))).rejects.toThrow('都無法存取')
})
```

- [ ] **Step 2:** `npx vitest run src/lib/role.test.ts` → FAIL
- [ ] **Step 3:** 實作上列介面。
- [ ] **Step 4:** `npx vitest run` → PASS
- [ ] **Step 5:** commit `共享 token 與身分判斷`

### Task 3: 讀取一個 space、在 space 之間複製圖片

把 `store.tsx` 的 `reload` 中「列檔、讀 config、讀筆記、讀圖片清單、讀 metrics」抽成可測試的函式，並新增搬移時的圖片複製。

**Files:**
- Create: `src/lib/space.ts`
- Test: `src/lib/space.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Space`、`buildNote(..., space)`；現有 `parseConfig`、`stringifyConfig`、`DEFAULT_CONFIG`、`IMAGE_RE`、`NOTE_RE`、`METRICS_RE`、`toMonthFile`、`imageRefs`、`ImageSource`（`src/lib/publish.ts`）
- Produces:
  - `export interface SpaceData { config: AppConfig; configSha?: string; configInvalid: boolean; notes: Note[]; images: Map<string, string>; months: Record<string, MonthFile> }`
  - `export async function loadSpace(gh: GitHub, space: Space, readBlob: (sha: string) => Promise<string>): Promise<SpaceData>`：沒有 `config.json` 時以 `stringifyConfig(DEFAULT_CONFIG)` 建立（失敗忽略，同現有行為）；`months` 只在 `space === 'personal'` 時讀取，否則 `{}`；`readBlob` 並行上限 6（沿用 store 的 `mapPool`，一併搬進此檔並 export）。
  - `export async function copyImages(to: GitHub, toImages: Map<string, string>, paths: string[], from: ImageSource): Promise<Map<string, string>>`：對每個 `paths` 中存在於 `from.shas` 的圖片，若 `toImages.get(path) === from.shas.get(path)` 則跳過，否則 `to.putBase64(path, await from.read(sha), '複製圖片：' + path, toImages.get(path))`；回傳更新後的新 Map（不修改傳入的 Map）。

- [ ] **Step 1: 寫失敗的測試**

```ts
it('loadSpace 讀出筆記並標上 space；共享 space 不讀 metrics', async () => {
  // org/shared 放一篇筆記與 metrics/2026-10.json
  const s = await loadSpace(new GitHub('t', 'org', 'shared'), 'shared', (sha) => sharedGh.getBlob(sha))
  expect(s.notes.map((n) => n.space)).toEqual(['shared'])
  expect(s.months).toEqual({})
})
it('repo 不存在時丟出 GitHubError 404', async () => {
  await expect(loadSpace(new GitHub('t', 'org', 'missing'), 'shared', async () => '')).rejects.toMatchObject({ status: 404 })
})
it('copyImages 只複製指定的圖片，同 sha 的跳過', async () => {
  // me/data 有 images/2026-10/a.jpg 與 images/2026-10/private.jpg
  const next = await copyImages(sharedGh, new Map(), ['images/2026-10/a.jpg'], dataSource)
  expect(repos.get('org/shared')!.has('images/2026-10/a.jpg')).toBe(true)
  expect(repos.get('org/shared')!.has('images/2026-10/private.jpg')).toBe(false)
  const spy = vi.fn(fakeFetch); vi.stubGlobal('fetch', spy)
  await copyImages(sharedGh, next, ['images/2026-10/a.jpg'], dataSource)
  expect(spy.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true)
})
```

- [ ] **Step 2:** `npx vitest run src/lib/space.test.ts` → FAIL
- [ ] **Step 3:** 實作 `src/lib/space.ts`。
- [ ] **Step 4:** `npx vitest run` → PASS
- [ ] **Step 5:** commit `抽出 space 讀取與跨 repo 圖片複製`

### Task 4: 公開同步支援兩個 space

**Files:**
- Modify: `src/lib/publish.ts`
- Test: `src/lib/publish.test.ts`、`src/lib/images.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Space`、`buildNote(..., space)`
- Produces:
  - `export const publicPath = (space: Space, path: string) => (space === 'shared' ? `shared/${path}` : path)`
  - `syncPublic(pub: GitHub, notes: Note[], images?: Partial<Record<Space, ImageSource>>): Promise<void>`：筆記與圖片寫到 `publicPath(...)`；刪除範圍擴大到 `shared/notes/`、`shared/images/`（`images/` 與 `shared/images/` 只在對應 space 的 `ImageSource` 有傳入時才刪，沿用現有保護）。
  - `PublicEntry` 增加 `space: Space`；`loadPublicNotes()` 以 `buildNote(e.path, '', '', e.space ?? 'personal')` 還原。

- [ ] **Step 1: 寫失敗的測試**（`publish.test.ts`）

```ts
it('共享的公開筆記放在 shared/ 底下，私人與共享同名筆記互不覆蓋', async () => {
  const mine = { ...(await save('同名', 'public')), space: 'personal' as const }
  const theirs = { ...mine, space: 'shared' as const }
  await syncPublic(pub, [mine, theirs], {})
  const files = repos.get('me/pub')!
  expect(files.has(mine.path)).toBe(true)
  expect(files.has(`shared/${mine.path}`)).toBe(true)
  const index = JSON.parse(files.get('index.json')!)
  expect(index.notes.map((n: { space: string }) => n.space).sort()).toEqual(['personal', 'shared'])
})
```

在 `images.test.ts` 的「公開同步含圖片」改用 `{ personal: images }` 呼叫，並新增：共享筆記引用的圖片寫在 `shared/images/2026-10/abc.jpg`。

- [ ] **Step 2:** `npx vitest run src/lib/publish.test.ts src/lib/images.test.ts` → FAIL
- [ ] **Step 3:** 實作上列介面。
- [ ] **Step 4:** `npx vitest run` → PASS
- [ ] **Step 5:** commit `公開同步支援共享筆記（shared/ 前綴）`

### Task 5: store 改成多個 space

**Files:**
- Modify: `src/store.tsx`（`reload` 改呼叫 `loadSpace`，移除被搬走的 `mapPool`）

**Interfaces:**
- Consumes: Task 1–4 全部介面
- Produces（`Store` 介面的變更，其餘不變）：
  - `mode: 'owner' | 'coworker' | 'visitor'`
  - `github: { data?: GitHub; shared?: GitHub; pub?: GitHub } | null`
  - `spaces: Space[]`：可寫入的 space（owner：`['personal']` 或 `['personal', 'shared']`；coworker：`['shared']`）
  - `sharedError: string | null`：擁有者的共享區載入失敗訊息
  - `config: AppConfig`：owner 為個人 config，coworker 為共享 config（給日記等既有程式碼用）
  - `configOf(space: Space): AppConfig`
  - `categoriesOf(space?: Space): string[]`：不帶 space 為兩邊聯集；現有 `categories` 保留為 `categoriesOf()`
  - `subcategoriesOf(category: string, space?: Space): string[]`
  - `saveConfig(space: Space, next: AppConfig, message: string): Promise<void>`
  - `renameCategory(space: Space, from, to, onProgress?)`、`renameSubcategory(space: Space, category, from, to, onProgress?)`
  - `SaveInput` 增加 `space: Space`；`saveNote(prev, input)`：`prev.space !== input.space` 時先 `copyImages` 到目標、不帶 sha 建立、再刪原 repo 的檔（沿用現有「移動筆記」的警告處理）
  - `fetchLatest(id: string)`、`deleteNote(note)`：以 `noteId` 比對與定位 repo
  - `images: Record<Space, Map<string, string>>`；`uploadImage(file: File, space: Space)`；`imageSrc(src: string, space: Space)`（訪客：`raw.githubusercontent.com/.../public-notes/${publicPath(space, path)}`）；`deleteImage(space: Space, path: string)`
  - 擁有者載入完成後呼叫一次 `republish()`（`syncPublic` 只在 sha 不同時寫入），失敗只設 `sharedError` 以外的提示，不影響載入
  - 共享區載入失敗（owner）：`sharedError` 設為 `'共享區無法載入：' + errorMessage(e)`，個人區照常；coworker 載入失敗則 `status = 'error'`

- [ ] **Step 1:** 依上列介面修改 `store.tsx`；`StatusBanner` 在 `sharedError` 時顯示一行提示。
- [ ] **Step 2:** `npx tsc --noEmit` → 列出所有呼叫端錯誤；只做最小修正讓型別通過（呼叫端傳 `'personal'` 或 `note.space`），介面調整留給 Task 6。
- [ ] **Step 3:** `npx vitest run` → PASS；`npm run build` → 成功
- [ ] **Step 4:** commit `store 支援個人與共享兩個 space`

### Task 6: 介面：登入、編輯器、列表、設定、導覽

**Files:**
- Modify: `src/pages/Setup.tsx`、`src/pages/NoteEdit.tsx`、`src/components/NoteItem.tsx`、`src/components/MarkdownView.tsx`、`src/pages/NoteView.tsx`、`src/pages/Settings.tsx`、`src/pages/Home.tsx`、`src/components/Nav.tsx`、`src/App.tsx`、`src/styles.css`

**Interfaces:**
- Consumes: Task 2 `detectRole`、`saveSharedToken`；Task 5 的 store 介面

需求（逐項對照 spec 的「介面」表）：
- **Setup**：
  - 兩個欄位：「個人 token（只有你自己需要）」、「共享 token」。至少填一個。
  - 儲存前用 `detectRole` 檢查；錯誤訊息沿用現有的 `checkTokenFormat`／`diagnoseNetwork` 流程。
  - 同事只填共享 token 即可登入。
- **NoteEdit**：
  - owner 且 `spaces.length > 1` 時顯示 segmented「存放位置：個人／共享」，預設 `prev?.space ?? 'personal'`；從 `?space=shared` 帶入。
  - 切換後送出時跳 `confirm`，文字照 spec「搬移」一節的兩句。
  - 分類選單改用 `categoriesOf(form.space)`。
  - coworker 不顯示「誰可以看」區塊，`visibility` 保留原值。
  - 上傳圖片用 `uploadImage(file, form.space)`；預覽 `MarkdownView` 傳 `space`。
- **MarkdownView**：新增 prop `space: Space`，轉給 `imageSrc(src, space)`；NoteView 傳 `note.space`。
- **NoteItem**：owner 時在分類徽章旁顯示「共享」小徽章（`space === 'shared'`）；`MoveSelect` 只列 `categoriesOf(note.space)`；連結用 `noteId(note)`。
- **路由**：`/note/*`、`/edit/*` 的參數改用 `parseNoteId` 找筆記；`encodeNotePath(noteId(note))` 產生網址。
- **Nav／App**：coworker 不顯示「追蹤」，`/track` 路由只在 owner 註冊。
- **Home**：coworker 只顯示「最近編輯」與「分類」兩個區塊，沒有歡迎卡上的日記與追蹤按鈕、沒有近 7 天統計。
- **Settings**：
  - owner 顯示「我的分類」與「共享分類」兩個 `CategoryManager`（各自帶 `space`），以及共享 token 的設定或更換。
  - coworker 只顯示「共享分類」與登出。
  - 清理未使用圖片依 space 分開。

- [ ] **Step 1:** 依上列需求修改各檔。
- [ ] **Step 2:** `npx tsc --noEmit`、`npx vitest run`、`npm run build` → 全部通過
- [ ] **Step 3:** 手動檢查清單（請擁有者在瀏覽器確認，不使用無頭瀏覽器）：
  - 只填個人 token：行為和現在完全相同。
  - 兩把都填：筆記能在個人／共享之間搬，搬過去的圖片能正常顯示。
  - 用只填共享 token 的瀏覽器（無痕視窗）登入：
    - 看不到私人筆記和追蹤分頁。
    - 能新增、編輯共享筆記。
- [ ] **Step 4:** commit `共享筆記介面：存放位置、身分、設定`

### Task 7: 說明文件與部署

**Files:**
- Modify: `README.md`、`src/config.ts`（填入擁有者提供的實際組織名稱）

- [ ] **Step 1:** README 新增「和同事共享筆記」一節：
  - 建立組織、在組織設定允許 fine-grained token（Settings → Personal access tokens → 允許）。
  - 建立私人 repo `notebook-shared` 並邀請同事。
  - 擁有者與同事各自建立共享 token：Resource owner 選組織、只選 `notebook-shared`、Contents 設 Read and write。
  - 隱私說明：搬到共享後，共享 repo 的 git 歷史無法收回。
- [ ] **Step 2:** `npx vitest run`、`npm run build` → 通過
- [ ] **Step 3:** commit `README：和同事共享筆記的設定步驟`，`git push`，確認 Actions 部署成功（`notebook-workflow` 外掛會通知）。
