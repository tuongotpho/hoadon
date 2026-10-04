import { useEffect, useState } from 'react'
import { fmtDate } from '../lib/dates'
import { fillEmpty, readPdfInvoice, saveUpload, toAccountName } from '../lib/dossierOps'
import { parseInvoiceXml } from '../lib/invoiceXml'
import { formatMoney, moneyInWords } from '../lib/numberToWords'
import { chuKhopSo } from '../lib/rules'
import { store } from '../lib/store'
import type { Invoice, StoredFile } from '../lib/types'
import FileDrop from './FileDrop'
import MoneyInput from './MoneyInput'

interface Props {
  index: number
  inv: Invoice
  onChange: (inv: Invoice) => void
  onRemove: () => void
  canTk: boolean // hồ sơ từ 5 triệu -> cần thông tin tài khoản
}

function openFile(f: StoredFile) {
  const url = URL.createObjectURL(f.data)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export default function InvoiceCard({ index, inv, onChange, onRemove, canTk }: Props) {
  const [files, setFiles] = useState<StoredFile[]>([])
  const [showItems, setShowItems] = useState(false)

  useEffect(() => {
    Promise.all(inv.fileIds.map((id) => store.getFile(id))).then((r) => setFiles(r.filter((x): x is StoredFile => !!x)))
  }, [inv.fileIds])

  const set = <K extends keyof Invoice>(k: K, v: Invoice[K]) => onChange({ ...inv, [k]: v })

  async function addFiles(list: File[]) {
    let next = { ...inv }
    for (const f of list) {
      const stored = await saveUpload(f)
      next = { ...next, fileIds: [...next.fileIds, stored.id] }
      // up thêm XML/PDF vào hóa đơn đang nhập tay -> điền các ô còn trống
      try {
        if (/\.xml$/i.test(f.name)) next = fillEmpty(next, parseInvoiceXml(await f.text()))
        else if (/\.pdf$/i.test(f.name)) {
          const p = await readPdfInvoice(f)
          if (p) next = fillEmpty(next, p)
        }
      } catch (e) {
        alert(`${f.name}: ${(e as Error).message}`)
      }
    }
    if (!next.tenTaiKhoan && next.tenNguoiBan) next = { ...next, tenTaiKhoan: toAccountName(next.tenNguoiBan) }
    onChange(next)
  }

  async function removeFile(id: string) {
    if (!confirm('Gỡ file này khỏi hóa đơn?')) return
    await store.deleteFile(id)
    set('fileIds', inv.fileIds.filter((x) => x !== id))
  }

  const sumCheck = inv.tongTien && (inv.tienTruocThue || inv.tienThue) && Math.abs(inv.tienTruocThue + inv.tienThue - inv.tongTien) > 1

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">
          Hóa đơn {index + 1}
          {inv.soHd && <span className="ml-2 font-normal text-slate-500">số {inv.soHd} · {fmtDate(inv.ngayHd)}</span>}
        </div>
        <button className="text-xs text-red-600 hover:underline" onClick={onRemove}>
          Xóa hóa đơn
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div>
          <label className="lbl">Ký hiệu</label>
          <input className="inp" value={inv.kyHieu} onChange={(e) => set('kyHieu', e.target.value)} />
        </div>
        <div>
          <label className="lbl">Số hóa đơn</label>
          <input className="inp" value={inv.soHd} onChange={(e) => set('soHd', e.target.value)} />
        </div>
        <div>
          <label className="lbl">Ngày hóa đơn</label>
          <input type="date" className="inp" value={inv.ngayHd} onChange={(e) => set('ngayHd', e.target.value)} />
        </div>
        <div>
          <label className="lbl">MST người bán</label>
          <input className="inp" value={inv.mstNguoiBan} onChange={(e) => set('mstNguoiBan', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="lbl">Tên người bán</label>
          <input className="inp" value={inv.tenNguoiBan} onChange={(e) => set('tenNguoiBan', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="lbl">Địa chỉ người bán</label>
          <input className="inp" value={inv.diaChiNguoiBan} onChange={(e) => set('diaChiNguoiBan', e.target.value)} />
        </div>
        <div className={`col-span-full rounded-md border p-2 ${canTk ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 opacity-60'}`}>
          <div className="mb-1 text-xs font-medium text-slate-600">
            Thông tin tài khoản nơi xuất hóa đơn —{' '}
            {canTk ? <b className="text-blue-700">CÓ in vào giấy ĐNTT (HĐ từ 5 triệu)</b> : 'không in (HĐ dưới 5 triệu)'}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="col-span-2">
              <label className="lbl">Tên tài khoản (không dấu, đúng như ngân hàng)</label>
              <input className="inp" value={inv.tenTaiKhoan} onChange={(e) => set('tenTaiKhoan', e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="lbl">Số tài khoản</label>
              <input className="inp" value={inv.stkNguoiBan} onChange={(e) => set('stkNguoiBan', e.target.value)} />
            </div>
            <div>
              <label className="lbl">Ngân hàng</label>
              <input className="inp" value={inv.nganHangNguoiBan} onChange={(e) => set('nganHangNguoiBan', e.target.value)} />
            </div>
          </div>
        </div>
        <div>
          <label className="lbl">Tiền trước thuế</label>
          <MoneyInput value={inv.tienTruocThue} onChange={(n) => set('tienTruocThue', n)} />
        </div>
        <div>
          <label className="lbl">Tiền thuế</label>
          <MoneyInput value={inv.tienThue} onChange={(n) => set('tienThue', n)} />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="lbl">Tổng tiền thanh toán</label>
          <MoneyInput value={inv.tongTien} onChange={(n) => set('tongTien', n)} className="font-semibold" />
          {sumCheck ? (
            <button className="mt-0.5 text-xs text-red-600 hover:underline" onClick={() => set('tongTien', inv.tienTruocThue + inv.tienThue)}>
              ⚠ Trước thuế + thuế = {formatMoney(inv.tienTruocThue + inv.tienThue)}. Bấm để sửa.
            </button>
          ) : null}
        </div>
        <div className="col-span-full">
          <label className="lbl">Số tiền viết bằng chữ (chép nguyên văn trên hóa đơn — in vào giấy ĐNTT)</label>
          <input className="inp" value={inv.tienBangChu} onChange={(e) => set('tienBangChu', e.target.value)} placeholder={inv.tongTien ? moneyInWords(inv.tongTien) : ''} />
          {!chuKhopSo(inv) && (
            <div className="mt-0.5 text-xs text-red-600">
              ⚠ Chữ không khớp số {formatMoney(inv.tongTien)} (số đó đọc là: {moneyInWords(inv.tongTien)}). Kiểm tra lại số tiền.
            </div>
          )}
          {!inv.tienBangChu && inv.tongTien > 0 && <div className="mt-0.5 text-xs text-slate-500">Để trống thì app tự đọc số thành chữ.</div>}
        </div>
      </div>

      {inv.items.length > 0 && (
        <div className="mt-2">
          <button className="text-xs text-blue-600 hover:underline" onClick={() => setShowItems(!showItems)}>
            {showItems ? '▾' : '▸'} {inv.items.length} dòng hàng hóa / dịch vụ
          </button>
          {showItems && (
            <table className="mt-1 w-full bg-white text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-1 text-left">Tên</th>
                  <th className="px-2 py-1">ĐVT</th>
                  <th className="px-2 py-1 text-right">SL</th>
                  <th className="px-2 py-1 text-right">Đơn giá</th>
                  <th className="px-2 py-1 text-right">Thành tiền</th>
                  <th className="px-2 py-1">Thuế</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1">{it.ten}</td>
                    <td className="px-2 py-1 text-center">{it.dvt}</td>
                    <td className="px-2 py-1 text-right">{it.soLuong.toLocaleString('vi-VN')}</td>
                    <td className="px-2 py-1 text-right">{formatMoney(it.donGia)}</td>
                    <td className="px-2 py-1 text-right">{formatMoney(it.thanhTien)}</td>
                    <td className="px-2 py-1 text-center">{it.thueSuat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {files.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs">
            <button className="text-blue-700 hover:underline" onClick={() => openFile(f)} title="Mở xem">
              📎 {f.name}
            </button>
            <button className="text-slate-400 hover:text-red-600" onClick={() => removeFile(f.id)} title="Gỡ file">
              ✕
            </button>
          </span>
        ))}
        <FileDrop onFiles={addFiles} accept=".xml,.pdf,image/*" className="!p-1 !px-3 text-xs">
          + Đính kèm file (XML / PDF / ảnh)
        </FileDrop>
      </div>
    </div>
  )
}
