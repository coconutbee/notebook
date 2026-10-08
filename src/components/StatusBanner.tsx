import { useStore } from '../store'

export function StatusBanner() {
  const { status, error, reload } = useStore()
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
  return null
}
