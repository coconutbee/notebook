import { BookOpen, Brain, Briefcase, Folder, NotebookPen, type LucideIcon } from 'lucide-react'

// 預設分類固定顏色與圖示；其他分類依名稱雜湊分配（.hue-0 ~ .hue-5，見 styles.css）
const KNOWN: Record<string, [number, LucideIcon]> = {
  工作: [0, Briefcase],
  腦科學: [1, Brain],
  讀書心得: [2, BookOpen],
  日記: [3, NotebookPen],
}

export function categoryStyle(name: string): { hue: string; Icon: LucideIcon } {
  const known = KNOWN[name]
  if (known) return { hue: `hue-${known[0]}`, Icon: known[1] }
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return { hue: `hue-${h % 6}`, Icon: Folder }
}

export function CategoryBadge({ name }: { name: string }) {
  const { hue, Icon } = categoryStyle(name)
  return (
    <span className={`cat-badge ${hue}`}>
      <Icon size={13} aria-hidden />
      {name}
    </span>
  )
}
