import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

type Kind = 'info' | 'error' | 'warn'
interface Item {
  id: number
  kind: Kind
  text: string
}

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {})

export const useToast = () => useContext(Ctx)

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id))
  const show = useCallback((text: string, kind: Kind = 'info') => {
    const id = ++seq
    setItems((xs) => [...xs, { id, kind, text }])
    // 錯誤和警告要使用者自己關掉，避免沒看到
    if (kind === 'info') setTimeout(() => dismiss(id), 3000)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span>{t.text}</span>
            <button className="icon-btn" aria-label="關閉" onClick={() => dismiss(t.id)}>
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
