import { useEffect, useState } from 'react'
import { exportBackup, importBackup } from '../lib/backup'
import { today } from '../lib/dates'
import { downloadBlob, IS_APP, useSettings } from '../lib/hooks'
import { store } from '../lib/store'
import type { Settings } from '../lib/types'
import FileDrop from './FileDrop'
import MoneyInput from './MoneyInput'

/** Sửa danh sách lựa chọn: xóa từng mục, thêm mục mới, đổi thứ tự (mục đầu là mặc định). */
function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [moi, setMoi] = useState('')
  const add = () => {
    const v = moi.trim()
    if (v && !items.includes(v)) onChange([...items, v])
    setMoi('')
  }
  return (
    <div>
      <label className="lbl">{label}</label>
      <div className="space-y-1">
        {items.map((it, i) => (
          <div key={it} className="flex items-center gap-1.5 text-sm">
            <span className="flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1">
              {it}
              {i === 0 && <span className="ml-2 text-xs text-slate-400">(mặc định)</span>}
            </span>
            {i > 0 && (
              <button className="px-1 text-slate-400 hover:text-slate-700" title="Đưa lên đầu (làm mặc định)" onClick={() => onChange([it, ...items.filter((x) => x !== it)])}>
                ⇡
              </button>
            )}
            <button className="px-1 text-slate-400 hover:text-red-600" title="Xóa" onClick={() => onChange(items.filter((x) => x !== it))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        <input className="inp" placeholder="Thêm mới…" value={moi} onChange={(e) => setMoi(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn shrink-0" onClick={add}>
          Thêm
        </button>
      </div>
    </div>
  )
}

const FIELDS: [keyof Settings, string, string][] = [
  ['hoTen', 'Họ và tên', 'Nguyễn Văn A'],
  ['chucVu', 'Chức vụ', 'Kỹ sư'],
  ['boPhan', 'Bộ phận / phòng', 'Phòng Kỹ thuật'],
  ['donVi', 'Đơn vị', 'CÔNG TY …'],
  ['donViCapTren', 'Đơn vị cấp trên', 'TẬP ĐOÀN ĐIỆN LỰC VIỆT NAM'],
  ['diaDanh', 'Địa danh (đầu văn bản)', 'Hà Nội'],
  ['kinhGui', 'Kính gửi (tờ trình)', 'Giám đốc Công ty'],
  ['kinhGuiDntt', 'Kính gửi (đề nghị thanh toán)', 'Phòng Tài chính kế toán'],
  ['nguoiDuyet', 'Người duyệt', ''],
  ['chucVuNguoiDuyet', 'Chức vụ người duyệt', 'Giám đốc'],
]

export default function SettingsPage() {
  const saved = useSettings()
  const [s, setS] = useState<Settings>(saved)
  const [ok, setOk] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setS(saved), [saved])
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1048576).toFixed(1)} MB`)).catch(() => {})
  }, [])

  async function save() {
    await store.saveSettings(s)
    setOk(true)
    setTimeout(() => setOk(false), 1500)
  }

  async function backup() {
    setBusy(true)
    try {
      downloadBlob(await exportBackup(store), `Sao luu hoa don ${today()}.zip`)
    } finally {
      setBusy(false)
    }
  }

  async function restore(files: File[]) {
    if (!confirm('Nạp bản sao lưu? Hồ sơ trùng sẽ được thay bằng bản trong file sao lưu.')) return
    setBusy(true)
    try {
      const r = await importBackup(store, files[0])
      alert(`Đã nạp ${r.dossiers} hồ sơ, ${r.files} file hóa đơn, ${r.templates} mẫu.`)
    } catch (e) {
      alert('Không nạp được: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card space-y-4">
        <h2 className="font-semibold text-slate-800">Danh sách lựa chọn</h2>
        <ListEditor label="Người đề nghị thanh toán" items={s.dsNguoiDeNghi} onChange={(v) => setS({ ...s, dsNguoiDeNghi: v })} />
        <ListEditor
          label='Nhiệm vụ ("…trong việc ___ của Công ty")'
          items={s.dsNhiemVu}
          onChange={(v) => setS({ ...s, dsNhiemVu: v })}
        />

        <h2 className="pt-2 font-semibold text-slate-800">Quy tắc tiền</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="lbl">Ngưỡng hóa đơn</label>
            <MoneyInput value={s.nguongTien} onChange={(n) => setS({ ...s, nguongTien: n })} />
          </div>
          <div>
            <label className="lbl">Dự trù khi HĐ dưới ngưỡng</label>
            <MoneyInput value={s.duTruDuoiNguong} onChange={(n) => setS({ ...s, duTruDuoiNguong: n })} />
          </div>
          <div>
            <label className="lbl">Dự trù khi HĐ từ ngưỡng</label>
            <MoneyInput value={s.duTruTuNguong} onChange={(n) => setS({ ...s, duTruTuNguong: n })} />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          HĐ dưới ngưỡng: giấy ĐNTT không in thông tin tài khoản nơi xuất hóa đơn. Từ ngưỡng trở lên: có in.
        </p>

        <h2 className="pt-2 font-semibold text-slate-800">Ngày tháng</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Tờ trình lùi trước ngày HĐ (ngày làm việc)</label>
            <input type="number" min={0} className="inp" value={s.soNgayToTrinhTruocHd} onChange={(e) => setS({ ...s, soNgayToTrinhTruocHd: Number(e.target.value) })} />
          </div>
          <div>
            <label className="lbl">Cảnh báo khi nộp KT quá (ngày) chưa được trả</label>
            <input type="number" min={1} className="inp" value={s.canhBaoChoKtSauNgay} onChange={(e) => setS({ ...s, canhBaoChoKtSauNgay: Number(e.target.value) })} />
          </div>
        </div>

        <details>
          <summary className="cursor-pointer text-sm text-slate-600">Thông tin khác (chỉ dùng nếu mẫu Word có ô tương ứng)</summary>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {FIELDS.map(([k, label, ph]) => (
              <div key={k}>
                <label className="lbl">{label}</label>
                <input className="inp" placeholder={ph} value={s[k] as string} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
              </div>
            ))}
          </div>
        </details>

        <button className="btn-primary" onClick={save}>
          {ok ? '✓ Đã lưu' : 'Lưu cài đặt'}
        </button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-800">Sao lưu dữ liệu</h2>
        <p className="text-sm text-slate-600">
          Dữ liệu chỉ nằm trong {IS_APP ? 'app' : 'trình duyệt'} của <b>máy này</b>. Nên sao lưu định kỳ (tuần 1 lần) ra USB hoặc Google Drive. File sao lưu gồm
          toàn bộ hồ sơ, file hóa đơn và mẫu Word — nạp vào máy khác là dùng tiếp được.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={backup} disabled={busy}>
            ⬇ Tải bản sao lưu (.zip)
          </button>
        </div>
        <FileDrop onFiles={restore} accept=".zip" multiple={false}>
          Nạp lại bản sao lưu (.zip)
        </FileDrop>
        <div className="space-y-1 text-xs text-slate-500">
          <div>Dung lượng đang dùng: {usage || '—'}</div>
          <div>
            Chống trình duyệt tự dọn dữ liệu:{' '}
            {persisted == null ? '—' : persisted ? <b className="text-emerald-700">Đã bật</b> : <b className="text-amber-700">Chưa bật (càng cần sao lưu đều)</b>}
          </div>
          {!IS_APP && <div className="text-amber-700">⚠ Không dùng chế độ ẩn danh, không "Xóa dữ liệu duyệt web" của trang localhost:5180.</div>}
        </div>
      </div>
    </div>
  )
}
