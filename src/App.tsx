import { Suspense, lazy } from 'react'
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { Nav } from './components/Nav'
import { ToastProvider } from './components/Toast'
import { NoteEdit } from './pages/NoteEdit'
import { NoteList } from './pages/NoteList'
import { NoteView } from './pages/NoteView'
import { Settings } from './pages/Settings'
import { Setup } from './pages/Setup'
import { StoreProvider, useStore } from './store'

// 圖表套件較大，只有打開「追蹤」時才下載
const Tracker = lazy(() => import('./pages/Tracker').then((m) => ({ default: m.Tracker })))

function Shell() {
  const { mode } = useStore()
  const owner = mode === 'owner'
  return (
    <div className={owner ? 'app' : 'app visitor'}>
      {owner ? (
        <Nav />
      ) : (
        <header className="visitor-bar">
          <Link to="/notes" className="nav-brand">
            {document.title}
          </Link>
          <Link to="/setup" className="btn btn-ghost">
            登入
          </Link>
        </header>
      )}
      <main className="main">
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/notes" element={<NoteList />} />
          <Route path="/note/*" element={<NoteView />} />
          {owner && (
            <>
              <Route path="/new" element={<NoteEdit key="new" />} />
              <Route path="/edit/*" element={<NoteEdit />} />
              <Route
                path="/track"
                element={
                  <Suspense fallback={<p className="page muted loading">載入中…</p>}>
                    <Tracker />
                  </Suspense>
                }
              />
              <Route path="/settings" element={<Settings />} />
            </>
          )}
          {/* 首頁在第 3 階段完成，先導向筆記列表 */}
          <Route path="*" element={<Navigate to="/notes" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <StoreProvider>
          <Shell />
        </StoreProvider>
      </ToastProvider>
    </HashRouter>
  )
}
