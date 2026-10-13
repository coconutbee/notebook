# DCSBU-V 學習筆記

個人筆記與健康追蹤網站：純靜態前端（Vite + React + TypeScript），部署在 GitHub Pages，沒有後端伺服器。資料透過 GitHub REST API 存在私人 repo。

網站：<https://coconutbee.github.io/notebook/>

## 功能

- **筆記**：分類（可在「設定」新增、改名、排序、刪除空分類）、Markdown 編輯與預覽、標籤、依分類和月份瀏覽、全文搜尋（標題、標籤、內文）
- **公開／私人**：每篇筆記可設為公開。訪客（沒有 token）只看得到公開筆記
- **追蹤**（只有登入後看得到）：每日體重、卡路里攝取、運動，以及週／月／年趨勢圖
- **首頁**：今天的日記、近 7 天體重與卡路里摘要、最近編輯、分類
- **不會默默覆蓋**：檔案在其他裝置或 GitHub 上被改過時，會跳出提示讓你選擇怎麼處理。存檔失敗時內容會保留成草稿

## Repo 與分支

| 位置 | 公開？ | 內容 | 誰會寫入 |
| --- | --- | --- | --- |
| `notebook` 的 `main` 分支 | 公開 | 網站程式碼，**不含任何筆記或 token** | 你（git push）。push 後自動部署 |
| `notebook` 的 `public-notes` 分支 | 公開 | 公開筆記的副本與 `index.json`，給訪客讀取 | 網站自動同步，**請不要手動編輯** |
| `notebook-data` | **私人** | 所有原始資料（見下方） | 網站，或你直接在 GitHub 上編輯 |

`public-notes` 是獨立的 orphan 分支，跟 `main` 沒有共同歷史，也不會觸發部署。

> ⚠️ 公開筆記改回私人後，會從 `public-notes` 移除，但舊版本仍然留在該分支的 git 歷史裡。不想公開的內容，一開始就不要設為公開。

帳號與 repo 名稱設定在 `src/config.ts`。網站名稱改 `index.html` 的 `<title>` 即可（頁面左上角也會跟著變）。

### 資料格式（notebook-data）

```
config.json                       分類設定：{ "categories": [...], "diaryCategory": "日記" }
notes/<分類>/<日期>-<標題>.md     筆記；日期可省略，例如 notes/工作/Git-基礎觀念.md
metrics/<年-月>.json              追蹤記錄，以日期為 key
images/<年-月>/<亂數>.jpg         筆記裡的圖片
```

圖片在編輯器用「插入圖片」、貼上或拖曳上傳。上傳前會自動縮到長邊 1600px 的 JPEG；本來就小的截圖和 GIF 會保留原檔。筆記裡的寫法是 `![說明](../../images/2026-10/xxxx.jpg)`，在 GitHub 上直接看筆記也能顯示。公開筆記用到的圖片會一起同步到 `public-notes`。沒有任何筆記使用的圖片不會自動刪除，可以到「設定 → 清理未使用的圖片」手動清理。

筆記開頭是 YAML front matter：

```markdown
---
title: 三相電 Y 接與 Δ 接
date: 2026-10-08
tags: [電源]
visibility: private   # 或 public
updated: 2026-10-08T12:00:00.000Z
---
內文（Markdown）
```

追蹤檔範例：

```json
{
  "2026-10-08": {
    "weight": 70.2,
    "calories": 1850,
    "exercise": [{ "name": "跑步", "minutes": 30, "burned": 300 }]
  }
}
```

這些檔案都可以直接在 GitHub 上閱讀和編輯。在 GitHub 上改完之後，到網站「設定」按「重新載入」。

## 本機執行

需要 Node.js 20 以上。

```bash
npm install
npm run dev      # 開啟 http://localhost:5173/notebook/
npm test         # 單元測試
npm run build    # 型別檢查並產生 dist/
```

本機版本一樣是讀寫真正的 GitHub repo，用法跟網站相同。

## 部署

`.github/workflows/deploy.yml` 會在 push 到 `main` 時自動執行測試、build，然後部署到 GitHub Pages。

第一次設定（只需做一次）：

1. GitHub 上的 `notebook` repo → **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**
2. push 到 `main`，到 **Actions** 分頁確認流程成功
3. 約 1–2 分鐘後網站更新。如果瀏覽器還是顯示舊版，按 Ctrl+F5 強制重新整理

## 建立 Token

網站使用 fine-grained personal access token，只存在你自己瀏覽器的 localStorage 裡，不會上傳到任何地方。

1. GitHub → 右上角頭像 → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. **Expiration**：自己決定。過期後網站會要求重新輸入
3. **Repository access** → **Only select repositories** → 勾選 `notebook-data` 和 `notebook`
4. **Repository permissions** → **Contents** 設為 **Read and write**（Metadata 會自動變成 Read-only）
5. 產生後複製 token（`github_pat_` 開頭），貼到網站的設定畫面

注意事項：

- Token 等同密碼：不要貼到聊天、不要存進任何 repo
- 換裝置要重新輸入。「設定 → 登出」會清除這台裝置上的 token、快取和草稿
- 常見錯誤：
  - 「找不到 repo」：token 沒有勾選該 repo
  - 「沒有寫入權限」：Contents 不是 Read and write
- 懷疑 token 外洩：到 GitHub 刪除它（Revoke），再建立新的

## 和同事共享筆記

同事可以看、可以編輯你標成「共享」的筆記，但完全看不到你的私人筆記、日記和追蹤記錄。做法是把共享筆記放在另一個 repo：GitHub 的權限以整個 repo 為單位，所以同事只會被加進共享 repo。

| 位置 | 誰能存取 | 內容 |
| --- | --- | --- |
| `coconutbee/notebook-data` | 只有你 | 私人筆記、日記、追蹤、它們的圖片 |
| `<組織>/notebook-shared` | 你＋同事 | 共享筆記、它們的圖片、共享分類 |

**一次性設定（你）**

1. GitHub 右上角 **＋ → New organization** → 選 Free，建立組織（例如 `coconutbee-notes`）。
2. 組織的 **Settings → Personal access tokens → Settings**：允許 fine-grained personal access tokens（可選擇是否需要審核）。
3. 在組織底下建立**私人** repo `notebook-shared`（勾選 Add a README，讓 repo 不是空的）。
4. 組織的 **People → Invite member** 邀請同事；在 repo 的 **Settings → Collaborators and teams** 給同事 **Write** 權限。
5. 把 `src/config.ts` 的 `SHARED_OWNER` 改成你的組織名稱，push 後自動部署。

**建立共享 token（你和每位同事各自做）**

- GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
- **Resource owner** 選組織（不是自己的帳號）
- **Repository access** 只選 `notebook-shared`
- **Contents** 設為 **Read and write**

fine-grained token 只能屬於一個擁有者，所以你需要兩把 token：個人 token（`notebook-data`＋`notebook`）和共享 token。同事只需要共享 token。

**使用方式**

- **你**：在網站設定畫面填兩把 token。編輯器多一個「存放位置：個人／共享」，切換後儲存，就會把筆記和它用到的圖片搬過去。
- **同事**：只填共享 token。看得到也能編輯所有共享筆記，沒有追蹤功能，也不能把筆記設成公開。

**隱私注意**

- 筆記搬到共享後，再搬回個人，共享 repo 的 git 歷史仍保有舊版本，同事還是看得到以前的內容。不確定的內容先不要放進共享。
- 共享筆記設為公開時，會放在公開分支的 `shared/` 底下。
- 同事改了已公開的共享筆記之後，你下次打開網站時會自動更新公開版本。

## 備份資料

所有資料都在 `notebook-data` 這個 git repo 裡，每次存檔都是一個 commit，本身就有完整的版本歷史。

- **完整備份**（含歷史）：
  ```bash
  git clone https://github.com/coconutbee/notebook-data.git
  # 之後定期更新
  cd notebook-data && git pull
  ```
- **單次下載**：GitHub 上的 `notebook-data` → **Code → Download ZIP**
- **找回舊版本**：在 GitHub 上打開檔案 → **History**，可以看到並複製任何一個舊版本
- **還原**：把備份的檔案 push 回 `notebook-data`，再到網站「設定」按「清除本機快取」

`public-notes` 分支只是公開筆記的副本，可以隨時用「設定 → 重新同步公開筆記」重新產生，不需要備份。
