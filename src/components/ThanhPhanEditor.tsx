import { store } from '../lib/store'
import type { ThanhPhan } from '../lib/types'
import { bao, hoi } from '../lib/dialog'

interface Props {
  value: ThanhPhan[]
  onChange: (v: ThanhPhan[]) => void
  currentId: string
  goiYDonVi?: string[]
}

/** Bảng thành phần tham gia: đơn vị + số người. */
export default function ThanhPhanEditor({ value, onChange, currentId, goiYDonVi = [] }: Props) {
  const tong = value.reduce((a, t) => a + (t.soNguoi || 0), 0)
  const setRow = (i: number, patch: Partial<ThanhPhan>) => onChange(value.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  async function copyFromPrevious() {
    const prev = (await store.listDossiers()).find((d) => d.id !== currentId && d.thanhPhan.length > 0)
    if (!prev) return void bao('Chưa có hồ sơ nào trước đó có thành phần tham gia.')
    if (value.length && !(await hoi(`Thay bằng thành phần của hồ sơ "${prev.noiDung}"?`))) return
    onChange(prev.thanhPhan.map((t) => ({ ...t })))
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-3">
        <span className="text-sm text-slate-600">
          {value.length} đơn vị · tổng <b>{tong}</b> người
        </span>
        <button className="ml-auto text-xs text-blue-600 hover:underline" onClick={copyFromPrevious}>
          ↺ Lấy theo hồ sơ trước
        </button>
      </div>
      {value.length > 0 ? (
        <div className="mb-0.5 flex gap-1.5 pl-6 text-[11px] text-slate-400">
          <span className="flex-1">Đơn vị</span>
          <span className="w-[13.5rem]">Số lượng</span>
        </div>
      ) : (
        <p className="rounded bg-slate-50 p-2 text-xs text-slate-500">Chưa có đơn vị nào. Bấm "+ Thêm đơn vị" hoặc "Lấy theo hồ sơ trước".</p>
      )}
      <div className="space-y-1">
        {value.map((t, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-5 text-right text-xs text-slate-400">{i + 1}</span>
            <input className="inp" list="ds-don-vi" placeholder="Đơn vị" value={t.donVi} onChange={(e) => setRow(i, { donVi: e.target.value })} />
            <input
              className="inp w-20 text-right"
              type="number"
              min={0}
              value={t.soNguoi || ''}
              onChange={(e) => setRow(i, { soNguoi: Number(e.target.value) })}
            />
            <span className="text-xs text-slate-500">người</span>
            <button className="px-1 text-slate-400 hover:text-slate-700" onClick={() => move(i, -1)} title="Lên">↑</button>
            <button className="px-1 text-slate-400 hover:text-slate-700" onClick={() => move(i, 1)} title="Xuống">↓</button>
            <button className="px-1 text-slate-400 hover:text-red-600" onClick={() => onChange(value.filter((_, j) => j !== i))} title="Xóa">
              ✕
            </button>
          </div>
        ))}
      </div>
      <datalist id="ds-don-vi">
        {goiYDonVi.map((x) => <option key={x} value={x} />)}
      </datalist>
      <button className="mt-1.5 text-xs text-blue-600 hover:underline" onClick={() => onChange([...value, { donVi: '', soNguoi: 1 }])}>
        + Thêm đơn vị
      </button>
    </div>
  )
}
