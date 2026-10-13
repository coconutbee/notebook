import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore, type Space } from '../store'

/** 私人 repo 的圖片要帶 token 讀取，所以先取得內容再顯示 */
function NoteImage({ src = '', alt = '', space }: { src?: string; alt?: string; space: Space }) {
  const { imageSrc } = useStore()
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setFailed(false)
    imageSrc(src, space).then(
      (u) => live && setUrl(u),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [src, space, imageSrc])
  if (failed) return <span className="img-note muted small">（圖片無法載入{alt ? `：${alt}` : ''}）</span>
  if (!url) return <span className="img-note muted small">圖片載入中…</span>
  return <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />
}

// react-markdown 預設不渲染原始 HTML，避免 XSS 偷走 localStorage 裡的 token
/** space：筆記所在的 repo，圖片從同一個 repo 讀 */
export function MarkdownView({ body, space = 'personal' }: { body: string; space?: Space }) {
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          img: ({ src, alt }) => <NoteImage src={typeof src === 'string' ? src : ''} alt={alt} space={space} />,
        }}
      >
        {body}
      </Markdown>
    </div>
  )
}
