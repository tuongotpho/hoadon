import { useEffect, useState } from 'react'
import DossierEditor from './components/DossierEditor'
import DossierList from './components/DossierList'
import SettingsPage from './components/SettingsPage'
import SummaryPage from './components/SummaryPage'
import TemplatesPage from './components/TemplatesPage'
import { cleanOrphanFiles } from './lib/dossierOps'

type Tab = 'hoSo' | 'tongHop' | 'mau' | 'caiDat'

const TABS: [Tab, string][] = [
  ['hoSo', 'Hồ sơ thanh toán'],
  ['tongHop', 'Tổng hợp'],
  ['mau', 'Mẫu in'],
  ['caiDat', 'Cài đặt & sao lưu'],
]

export default function App() {
  const [tab, setTab] = useState<Tab>('hoSo')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    // Xin trình duyệt không tự dọn dữ liệu của app khi ổ đầy
    navigator.storage?.persist?.().catch(() => {})
    cleanOrphanFiles().catch(() => {})
  }, [])

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <h1 className="text-lg font-bold text-slate-800">🧾 Quản lý hóa đơn</h1>
          <nav className="flex gap-1">
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
        </div>
      </header>
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
