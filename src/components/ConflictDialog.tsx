import { useEffect, useRef } from 'react'

interface Props {
  /** true：要新增的檔案已存在；false：檔案在別處被修改過 */
  exists: boolean
  path: string
  busy: boolean
  onReload(): void
  onSaveCopy(): void
  onCancel(): void
}

export function ConflictDialog({ exists, path, busy, onReload, onSaveCopy, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => (e.preventDefault(), onCancel())} aria-labelledby="conflict-title">
      <h2 id="conflict-title">{exists ? '檔案已存在' : '檔案已在別處被修改'}</h2>
      <p>
        {exists
          ? '同一個分類、日期和標題的筆記已經存在。為了不覆蓋它，這次沒有儲存。'
          : '你開始編輯之後，這篇筆記在其他裝置或 GitHub 上被修改過。為了不覆蓋別處的修改，這次沒有儲存。'}
      </p>
      <p className="muted small">{path}</p>
      <div className="dialog-actions">
        <button className="btn" disabled={busy} onClick={onReload}>
          載入遠端版本（你的內容會複製到剪貼簿）
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={onSaveCopy}>
          另存為新筆記（衝突副本）
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          取消，繼續編輯
        </button>
      </div>
    </dialog>
  )
}
