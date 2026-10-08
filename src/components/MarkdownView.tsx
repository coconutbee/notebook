import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// react-markdown 預設不渲染原始 HTML，避免 XSS 偷走 localStorage 裡的 token
export function MarkdownView({ body }: { body: string }) {
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
      >
        {body}
      </Markdown>
    </div>
  )
}
