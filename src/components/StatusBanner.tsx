import { useStore } from '../store'

export function StatusBanner() {
  const { status, error, sharedError, reload } = useStore()
  if (status === 'loading') return <p className="muted loading">載入中…</p>
  if (status === 'error')
    return (
      <div className="banner-error" role="alert">
        <p>{error}</p>
        <button className="btn" onClick={() => reload()}>
          重試
        </button>
      </div>
    )
  // 擁有者的共享區載入失敗：個人區照常，只提示一行
  if (sharedError) return <p className="small hint" role="status">{sharedError}（可到「設定」檢查共享 token）</p>
  return null
}
