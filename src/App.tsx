import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import DossierEditor from './components/DossierEditor'
import DossierList from './components/DossierList'
import SettingsPage from './components/SettingsPage'
import SummaryPage from './components/SummaryPage'
import TemplatesPage from './components/TemplatesPage'
import { copyAll } from './lib/backup'
import { cleanOrphanFiles } from './lib/dossierOps'
import { IS_APP } from './lib/hooks'
import { localStore, setStore, store } from './lib/store'

type Tab = 'hoSo' | 'tongHop' | 'mau' | 'caiDat'

const TABS: [Tab, string][] = [
  ['hoSo', 'Hồ sơ thanh toán'],
  ['tongHop', 'Tổng hợp'],
  ['mau', 'Mẫu in'],
  ['caiDat', 'Cài đặt & sao lưu'],
]

const MODE_KEY = 'hoadon-che-do' // nhớ lựa chọn "dùng trên máy, không đăng nhập"
const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const lsSet = (k: string, v: string | null) => {
  try {
    if (v == null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {}
}

type Mode = { kind: 'checking' } | { kind: 'login' } | { kind: 'local' } | { kind: 'cloud'; user: User }

const fb = () => import('./lib/firebase') // Firebase chỉ tải khi dùng bản online

export default function App() {
  const [mode, setMode] = useState<Mode>({ kind: IS_APP ? 'local' : 'checking' })
  const [loginErr, setLoginErr] = useState('')

  useEffect(() => {
    // Xin trình duyệt không tự dọn dữ liệu của app khi ổ đầy
    navigator.storage?.persist?.().catch(() => {})
    if (IS_APP) return // bản cửa sổ (Electron): Google không cho đăng nhập trong app này -> dùng trên máy
    let unsub = () => {}
    fb().then(({ onUser, storeFor }) => {
      unsub = onUser((u) => {
        if (u) {
          setStore(storeFor(u))
          setMode({ kind: 'cloud', user: u })
        } else {
          setStore(localStore)
          setMode({ kind: lsGet(MODE_KEY) === 'local' ? 'local' : 'login' })
        }
      })
    })
    return () => unsub()
  }, [])

  async function login() {
    setLoginErr('')
    try {
      await (await fb()).dangNhapGoogle()
      lsSet(MODE_KEY, null)
    } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      if (code.includes('popup-closed') || code.includes('cancelled')) return
      setLoginErr(
        code.includes('unauthorized-domain')
          ? 'Tên miền này chưa được phép đăng nhập. Vào Firebase Console → Authentication → Settings → Authorized domains, thêm tên miền của trang.'
          : code.includes('popup-blocked')
            ? 'Trình duyệt đã chặn cửa sổ đăng nhập. Cho phép cửa sổ bật lên (popup) cho trang này rồi bấm lại.'
          : code.includes('operation-not-allowed')
            ? 'Chưa bật đăng nhập Google: Firebase Console → Authentication → Sign-in method → Google → Enable.'
            : 'Đăng nhập không được: ' + ((e as Error).message || code),
      )
    }
  }

  if (mode.kind === 'checking') return <p className="p-8 text-slate-500">Đang khởi động…</p>

  if (mode.kind === 'login') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-md space-y-4 text-center">
          <h1 className="flex items-center justify-center gap-2 text-xl font-bold text-slate-800"><img src="/icon-192.png" alt="" className="h-9 w-9" />Quản lý hóa đơn</h1>
          <p className="text-sm text-slate-600">
            Đăng nhập Google để dữ liệu được cất trên mạng: mở ở máy nào, điện thoại nào cũng thấy cùng một bộ hồ sơ. Chỉ tài khoản của anh xem
            được dữ liệu của anh.
          </p>
          <button className="btn-primary w-full justify-center py-2.5 text-base" onClick={login}>
            Đăng nhập bằng Google
          </button>
          {loginErr && <p className="rounded bg-red-50 p-2 text-left text-xs text-red-700">{loginErr}</p>}
          <button
            className="text-xs text-slate-500 hover:underline"
            onClick={() => {
              lsSet(MODE_KEY, 'local')
              setMode({ kind: 'local' })
            }}
          >
            Dùng trên máy này, không đăng nhập (dữ liệu chỉ ở máy này)
          </button>
        </div>
      </div>
    )
  }

  return (
    <Main
      key={mode.kind === 'cloud' ? mode.user.uid : 'local'}
      user={mode.kind === 'cloud' ? mode.user : null}
      onLogin={() => {
        lsSet(MODE_KEY, null)
        setMode({ kind: 'login' })
      }}
    />
  )
}

function Main({ user, onLogin }: { user: User | null; onLogin: () => void }) {
  const [tab, setTab] = useState<Tab>('hoSo')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [choChuyen, setChoChuyen] = useState(0) // số hồ sơ trên máy chưa đưa lên tài khoản
  const [chuyen, setChuyen] = useState('')
  const migratedKey = user ? `hoadon-da-chuyen-${user.uid}` : ''

  useEffect(() => {
    if (!user) {
      cleanOrphanFiles().catch(() => {}) // chỉ dọn ở bản trên máy (bản online phải tải hết file mới dọn được)
      return
    }
    if (lsGet(migratedKey)) return
    localStore.listDossiers().then((l) => setChoChuyen(l.length))
  }, [user, migratedKey])

  async function chuyenLen() {
    setChuyen('Đang đưa dữ liệu lên…')
    try {
      const r = await copyAll(localStore, store)
      lsSet(migratedKey, '1')
      setChoChuyen(0)
      setChuyen(`✓ Đã đưa lên ${r.dossiers} hồ sơ, ${r.files} file, ${r.templates} mẫu. Dữ liệu cũ trên máy vẫn giữ nguyên.`)
    } catch (e) {
      setChuyen('Lỗi: ' + (e as Error).message)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800"><img src="/favicon-32.png" alt="" className="h-7 w-7" />Quản lý hóa đơn</h1>
          <nav className="flex flex-wrap gap-1">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => {
                  setTab(k)
                  setEditingId(null)
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === k ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            {user ? (
              <>
                <TaiKhoan user={user} />
                <button className="btn !py-1 !text-xs" onClick={() => fb().then((m) => m.dangXuat())}>
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <span>💻 Dữ liệu chỉ ở máy này</span>
                {!IS_APP && (
                  <button className="btn !py-1 !text-xs" onClick={onLogin}>
                    Đăng nhập để đồng bộ
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {(choChuyen > 0 || chuyen) && (
        <div className="border-b border-blue-200 bg-blue-50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2 text-sm text-blue-900">
            {chuyen ? (
              <span>{chuyen}</span>
            ) : (
              <>
                <span>
                  Máy này còn <b>{choChuyen} hồ sơ</b> nhập từ trước (chưa đăng nhập). Đưa lên tài khoản để dùng ở mọi máy?
                </span>
                <button className="btn-primary !py-1" onClick={chuyenLen}>
                  Đưa lên tài khoản
                </button>
                <button
                  className="text-xs hover:underline"
                  onClick={() => {
                    lsSet(migratedKey, '1')
                    setChoChuyen(0)
                  }}
                >
                  Bỏ qua
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-5">
        {tab === 'hoSo' &&
          (editingId ? (
            <DossierEditor id={editingId} onClose={() => setEditingId(null)} />
          ) : (
            <DossierList onOpen={setEditingId} />
          ))}
        {tab === 'tongHop' && (
          <SummaryPage
            onOpen={(id) => {
              setTab('hoSo')
              setEditingId(id)
            }}
          />
        )}
        {tab === 'mau' && <TemplatesPage />}
        {tab === 'caiDat' && <SettingsPage />}
      </main>
    </div>
  )
}

/** Góc tài khoản: ảnh đại diện Google, tên, email (+ biểu tượng ☁ = đang lưu lên mạng). */
function TaiKhoan({ user }: { user: User }) {
  const [anhLoi, setAnhLoi] = useState(false)
  const ten = user.displayName || user.email?.split('@')[0] || 'Tài khoản'
  return (
    <span className="flex items-center gap-2" title="Đang đăng nhập — dữ liệu tự lưu lên mạng (Firebase), đồng bộ mọi máy">
      {user.photoURL && !anhLoi ? (
        // ảnh Google: tắt referrer để khỏi bị chặn tải ảnh
        <img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={() => setAnhLoi(true)} className="h-8 w-8 rounded-full border border-slate-200" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
          {ten.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}
        </span>
      )}
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-medium text-slate-800">{ten}</span>
        <span className="text-[11px] text-slate-500">☁ {user.email}</span>
      </span>
    </span>
  )
}
