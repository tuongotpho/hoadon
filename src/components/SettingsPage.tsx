import { useEffect, useState } from 'react'
import { exportBackup, importBackup } from '../lib/backup'
import { today } from '../lib/dates'
import { downloadBlob, useSettings } from '../lib/hooks'
import { store, type DongNhatKyAI, type PhienAI } from '../lib/store'
import type { Settings } from '../lib/types'
import FileDrop from './FileDrop'
import MoneyInput from './MoneyInput'
import { TU_KHOA_CAM_MAC_DINH } from '../lib/hangCam'
import { bao, hoi } from '../lib/dialog'


/** Sửa danh sách lựa chọn: xóa từng mục, thêm mục mới, đổi thứ tự (mục đầu là mặc định). */
function ListEditor({ label, items, onChange, gon = false }: { label: string; items: string[]; onChange: (v: string[]) => void; gon?: boolean }) {
  const [moi, setMoi] = useState('')
  const add = () => {
    const v = moi.trim()
    if (v && !items.includes(v)) onChange([...items, v])
    setMoi('')
  }
  return (
    <div>
      <label className="lbl">{label}</label>
      {gon ? (
        <div className="flex flex-wrap gap-1">
          {items.map((it) => (
            <span key={it} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">
              {it}
              <button className="text-red-400 hover:text-red-700" title="Bỏ từ này" onClick={() => onChange(items.filter((x) => x !== it))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
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
      )}
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
  const [busy, setBusy] = useState(false)

  useEffect(() => setS(saved), [saved])

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
    if (!(await hoi('Nạp bản sao lưu? Hồ sơ trùng sẽ được thay bằng bản trong file sao lưu.'))) return
    setBusy(true)
    try {
      const r = await importBackup(store, files[0])
      void bao(`Đã nạp ${r.dossiers} hồ sơ, ${r.files} file hóa đơn, ${r.templates} mẫu.`)
    } catch (e) {
      void bao('Không nạp được: ' + (e as Error).message)
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

        <h2 className="pt-2 font-semibold text-slate-800">Hàng cấm trên hóa đơn</h2>
        <p className="text-xs text-slate-500">
          Tên hàng có các từ này (rượu, bia, nhãn hiệu…) thì app cảnh báo ngay khi đọc hóa đơn và bắt xác nhận trước khi xuất Word. So theo
          từ trọn vẹn, giữ dấu: "bia" không khớp "bìa".
        </p>
        <ListEditor gon label="Từ khóa cấm" items={s.tuKhoaCam} onChange={(v) => setS({ ...s, tuKhoaCam: v })} />
        <button className="text-xs text-blue-600 hover:underline" onClick={() => setS({ ...s, tuKhoaCam: TU_KHOA_CAM_MAC_DINH })}>
          ↺ Khôi phục danh sách mặc định ({TU_KHOA_CAM_MAC_DINH.length} từ)
        </button>

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
        <h2 className="font-semibold text-slate-800">Lưu trữ &amp; sao lưu</h2>
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          ☁ <b>Đang tự động lưu lên mạng</b> (Firebase) theo tài khoản đang đăng nhập — mỗi lần sửa là lưu ngay, không cần bấm gì. Hồ sơ ở
          Firestore, file hóa đơn ở kho riêng. App chỉ chạy khi có mạng (không lưu bản nháp trên máy). Đăng nhập cùng tài khoản ở máy khác là thấy đủ.
        </div>
        <p className="text-sm text-slate-600">
          Muốn giữ thêm một bản riêng (phòng khi lỡ xóa nhầm), tải bản sao lưu về máy. File gồm toàn bộ hồ sơ, file hóa đơn và mẫu Word — nạp vào
          tài khoản khác là dùng tiếp được.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={backup} disabled={busy}>
            {busy ? 'Đang chuẩn bị…' : '⬇ Tải bản sao lưu (.zip)'}
          </button>
        </div>
        <FileDrop onFiles={restore} accept=".zip" multiple={false}>
          Nạp lại bản sao lưu (.zip) — vào tài khoản đang đăng nhập
        </FileDrop>
      </div>

      <KetNoiAI />
    </div>
  )
}

// Máy chủ MCP chạy trên Vercel (Firebase Hosting không chạy được máy chủ) — mcp/web.ts, api/mcp.ts
const DIA_CHI_MCP = 'https://hoadon-npsc.vercel.app/mcp'
const LENH_MCP = `claude mcp add --transport http hoadon ${DIA_CHI_MCP}`
const gio = (ms: number) => (ms ? new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '')

/** AI (Claude Code, Claude Desktop, claude.ai…) kết nối vào hồ sơ qua MCP: lệnh kết nối, máy đang có quyền, nhật ký AI ghi/xoá */
function KetNoiAI() {
  const [phien, setPhien] = useState<PhienAI[] | null>(null)
  const [nhatKy, setNhatKy] = useState<DongNhatKyAI[]>([])
  const [loi, setLoi] = useState('')
  const [daChep, setDaChep] = useState(false)
  const tai = () => {
    store.listPhienAI().then(setPhien).catch((e) => setLoi((e as Error).message))
    store.listNhatKyAI(15).then(setNhatKy).catch(() => undefined)
  }
  useEffect(tai, [])

  async function thuHoi(p: PhienAI) {
    if (!(await hoi(`Thu hồi quyền của "${p.tenMay}"? AI trên máy đó sẽ không đọc/sửa hồ sơ được nữa (muốn dùng lại thì kết nối lại).`, { okLabel: 'Thu hồi', nguyHiem: true }))) return
    try {
      await store.thuHoiPhienAI(p.id)
      tai()
    } catch (e) {
      setLoi((e as Error).message)
    }
  }

  return (
    <div className="card space-y-3 lg:col-span-2">
      <h2 className="font-semibold text-slate-800">🤖 Kết nối AI (Claude Code, Claude Desktop, claude.ai…)</h2>
      <p className="text-sm text-slate-600">
        Cho AI hỏi và sửa hồ sơ bằng lời: <i>"tháng 9 còn bao nhiêu tiền chưa được thanh toán?"</i>, <i>"hồ sơ nào đang có cảnh báo?"</i>,{' '}
        <i>"đánh dấu hồ sơ HĐ 45 đã nộp kế toán hôm nay"</i>. AI dùng đúng cách tính của app và làm bằng quyền tài khoản Google của anh — chỉ thấy
        hồ sơ của anh.
      </p>
      <div>
        <p className="text-xs text-slate-500">Gõ một lần trong PowerShell trên máy cần dùng (lần đầu trình duyệt sẽ mở trang đăng nhập Google để cho phép):</p>
        <button
          className="mt-1 w-full break-all rounded-lg bg-slate-100 px-3 py-2 text-left font-mono text-xs hover:bg-slate-200"
          title="Bấm để chép"
          onClick={() => void navigator.clipboard?.writeText(LENH_MCP).then(() => setDaChep(true))}
        >
          {LENH_MCP}
        </button>
        <p className="mt-1 text-xs text-slate-500">
          {daChep ? <span className="text-emerald-700">✓ Đã chép lệnh. </span> : null}
          Claude Desktop / claude.ai: thêm "custom connector" với địa chỉ <span className="font-mono">{DIA_CHI_MCP}</span>
        </p>
      </div>
      {loi && <p className="text-xs text-red-700">⚠️ {loi}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-slate-700">Máy đang có quyền</p>
          {phien === null ? (
            <p className="text-xs text-slate-400">Đang tải…</p>
          ) : phien.length === 0 ? (
            <p className="text-xs text-slate-400">Chưa có máy nào.</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {phien.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.tenMay}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {p.noiNhan} · {gio(p.taoLuc)}
                    </span>
                  </span>
                  <button className="shrink-0 rounded-full border border-red-300 px-2.5 py-0.5 text-xs text-red-700 hover:bg-red-50" onClick={() => void thuHoi(p)}>
                    Thu hồi
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">AI đã sửa / xoá gần đây</p>
          {nhatKy.length === 0 ? (
            <p className="text-xs text-slate-400">Chưa có.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {nhatKy.map((d) => (
                <li key={d.id} className={`text-xs ${d.congCu === 'xoa_ho_so' ? 'text-red-700' : 'text-slate-600'}`}>
                  <span className="text-slate-400">
                    {gio(d.luc)} · {d.tenMay}:
                  </span>{' '}
                  {d.moTa}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
