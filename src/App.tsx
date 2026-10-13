import { Suspense, lazy } from 'react'
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { Nav } from './components/Nav'
import { ToastProvider } from './components/Toast'
import { Home } from './pages/Home'
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
  // 同事（coworker）也是登入狀態：可以編輯共享筆記，但沒有追蹤功能
  const signedIn = mode !== 'visitor'
  return (
    <div className={signedIn ? 'app' : 'app visitor'}>
      {signedIn ? (
        <Nav />
      ) : (
        <header className="visitor-bar">
          <Link to="/" className="nav-brand">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
              <rect x="5" y="3" width="22" height="26" rx="3" fill="var(--primary)" />
              <rect x="10" y="9" width="12" height="2" fill="var(--on-primary)" />
              <rect x="10" y="14" width="9" height="2" fill="var(--on-primary)" />
            </svg>
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
          {signedIn && (
            <>
              <Route path="/new" element={<NoteEdit key="new" />} />
              <Route path="/edit/*" element={<NoteEdit />} />
              <Route path="/settings" element={<Settings />} />
            </>
          )}
          {mode === 'owner' && (
            <Route
                path="/track"
                element={
                  <Suspense fallback={<p className="page muted loading">載入中…</p>}>
                    <Tracker />
                  </Suspense>
                }
              />
          )}
          {/* 訪客的首頁就是公開筆記列表 */}
          <Route path="/" element={signedIn ? <Home /> : <NoteList />} />
          <Route path="*" element={<Navigate to="/" replace />} />
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
