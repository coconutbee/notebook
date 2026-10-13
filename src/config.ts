// 換成你自己的帳號與 repo 名稱即可（這些不是機密）
export const OWNER = 'coconutbee'
/** 私人資料 repo：所有筆記與追蹤資料 */
export const DATA_REPO = 'notebook-data'
/**
 * 公開筆記放在程式 repo 的獨立分支（不是 main），由 App 自動同步。
 * main 分支只有程式碼，部署也只看 main。
 */
export const PUBLIC_REPO = 'notebook'
export const PUBLIC_BRANCH = 'public-notes'
/**
 * 與同事共享的筆記：放在 GitHub 組織底下（fine-grained token 只能屬於一個擁有者，
 * 同事的 token 才能只碰這個 repo）。換成你建立的組織名稱。
 */
export const SHARED_OWNER = 'notebook-shared'
export const SHARED_REPO = 'notebook-shared'
