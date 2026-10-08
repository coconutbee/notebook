# 筆記本

個人筆記與健康追蹤網站：純靜態前端（Vite + React + TypeScript），部署在 GitHub Pages，資料透過 GitHub REST API 存在私人 repo。

> 完整說明（部署、建立 token、備份）會在第 3 階段補齊。

## 本機執行

需要 Node.js 20 以上。

```bash
npm install
npm run dev      # 開啟 http://localhost:5173/notebook/
npm test         # 單元測試
npm run build    # 產生 dist/
```

## 三個 repo

| Repo | 公開？ | 內容 |
| --- | --- | --- |
| `notebook` | 公開 | 只有程式碼，不含任何資料或 token |
| `notebook-data` | **私人** | 所有筆記 `notes/<分類>/<日期>-<標題>.md`、追蹤 `metrics/<年-月>.json`、`config.json` |
| `notebook-public` | 公開 | App 自動同步的「公開筆記」副本與 `index.json`，請不要手動編輯 |

帳號與 repo 名稱設定在 `src/config.ts`。
