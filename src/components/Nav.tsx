import { NavLink } from 'react-router-dom'
import { Activity, House, NotebookPen, Settings } from 'lucide-react'

const items = [
  { to: '/', label: '首頁', icon: House, end: true },
  { to: '/notes', label: '筆記', icon: NotebookPen, end: false },
  { to: '/track', label: '追蹤', icon: Activity, end: false },
  { to: '/settings', label: '設定', icon: Settings, end: false },
]

/** 手機：底部分頁列；桌機：左側欄（由 CSS 切換） */
export function Nav() {
  return (
    <nav className="nav" aria-label="主要導覽">
      <div className="nav-brand">筆記本</div>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="nav-item">
          <Icon size={22} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
