import { useState } from 'react'
import { X } from 'lucide-react'

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim().replace(/^#/, '')
    if (t && !tags.includes(t)) onChange([...tags, t])
    setText('')
  }
  return (
    <div className="tag-input">
      {tags.map((t) => (
        <span key={t} className="chip">
          #{t}
          <button type="button" aria-label={`移除標籤 ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            <X size={14} />
          </button>
        </span>
      ))}
      <input
        id="tags"
        value={text}
        placeholder="輸入後按 Enter"
        enterKeyHint="done"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) {
            e.preventDefault()
            add()
          }
          if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={add}
      />
    </div>
  )
}
