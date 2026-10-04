import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import DossierEditor from './components/DossierEditor'
import DossierList from './components/DossierList'
import SettingsPage from './components/SettingsPage'
import SummaryPage from './components/SummaryPage'
import TemplatesPage from './components/TemplatesPage'
import { taiBoDocPdf } from './lib/dossierOps'
import { CHUA_DANG_NHAP, setStore } from './lib/store'

type Tab = 'hoSo' | 'tongHop' | 'mau' | 'caiDat'

const TABS: [Tab, string][] = [
  ['hoSo', 'Hồ sơ thanh toán'],
  ['tongHop', 'Tổng hợp'],
  ['mau', 'Mẫu in'],
  ['caiDat', 'Cài đặt & sao lưu'],
]

type Mode = { kind: 'checking' } | { kind: 'login' } | { kind: 'cloud'; user: User }

const fb = () => import('./lib/firebase')

export default function App() {
  const [mode, setMode] = useState<Mode>({ kind: 'checking' })
  const [loginErr, setLoginErr] = useState('')

  useEffect(() => {
    // tải sẵn bộ đọc PDF: web có cập nhật giữa chừng thì trang đang mở vẫn đọc được PDF
    taiBoDocPdf().catch(() => {})
    let unsub = () => {}
    fb().then(({ onUser, storeFor }) => {
      unsub = onUser((u) => {
        if (u) {
          setStore(storeFor(u))
          setMode({ kind: 'cloud', user: u })
        } else {
          setStore(CHUA_DANG_NHAP)
          setMode({ kind: 'login' }) // bắt buộc đăng nhập: dữ liệu luôn cất trên mạng
        }
      })
    })
    return () => unsub()
  }, [])

  async function login() {
    setLoginErr('')
    try {
      await (await fb()).dangNhapGoogle()
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
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
        </div>
        <ChanTrang />
      </div>
    )
  }

  return <Main key={mode.user.uid} user={mode.user} />
}

function Main({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('hoSo')
  const [editingId, setEditingId] = useState<string | null>(null)
  return (
    <div className="min-h-screen">
      {/* Thanh đầu trang cố định khi cuộn */}
      <div className="sticky top-0 z-40 shadow-sm">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 lg:px-6">
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
            <TaiKhoan user={user} />
            <button className="btn !py-1 !text-xs" onClick={() => fb().then((m) => m.dangXuat())}>
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      </div>

      <main className="px-4 py-5 lg:px-6">
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
      <ChanTrang />
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

function ChanTrang() {
  return <footer className="border-t border-slate-200 px-4 py-3 text-center text-xs text-slate-500 lg:px-6">© 2026 - August87 - 0982722036</footer>
}
