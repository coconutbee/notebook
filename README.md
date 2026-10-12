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
```

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
