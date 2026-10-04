import { useState } from 'react'
import { fmtDate, today } from '../lib/dates'
import { nhapHoaDonCu, type KetQuaNhap } from '../lib/dossierOps'
import { formatMoney } from '../lib/numberToWords'
import { store } from '../lib/store'
import FileDrop from './FileDrop'

/**
 * Nhập nhiều hóa đơn cũ vào kho: chỉ cần số tiền + đã/chưa thanh toán.
 * Sau khi đọc xong hiện bảng kết quả, mỗi dòng có nút "Đã thanh toán".
 */
export default function NhapHoaDonCu({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [tienDo, setTienDo] = useState<{ xong: number; tong: number } | null>(null)
  const [kq, setKq] = useState<KetQuaNhap[]>([])
  const [daTt, setDaTt] = useState<Record<string, string>>({}) // dossierId -> ngày thanh toán

  async function nhap(files: File[]) {
    setTienDo({ xong: 0, tong: files.length })
    const r = await nhapHoaDonCu(files, (xong, tong) => setTienDo({ xong, tong }))
    setKq((cu) => [...cu, ...r])
    setTienDo(null)
  }

  async function datTt(id: string, ngay: string) {
    const d = await store.getDossier(id)
    if (!d) return
    await store.saveDossier({ ...d, ngayKeToanTt: ngay, updatedAt: Date.now() })
    setDaTt((m) => ({ ...m, [id]: ngay }))
  }

  const moi = kq.filter((k) => k.dossierId)
  const tong = moi.reduce((a, k) => a + k.tongTien, 0)
  const tongDaTt = moi.filter((k) => daTt[k.dossierId!]).reduce((a, k) => a + k.tongTien, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" onClick={onClose}>
          ← Danh sách
        </button>
        <h2 className="text-lg font-semibold text-slate-800">📥 Nhập hóa đơn cũ vào kho</h2>
      </div>

      <div className="card space-y-3">
        <p className="text-sm text-slate-600">
          Thả cùng lúc nhiều file hóa đơn (XML hoặc PDF hóa đơn điện tử). Mỗi hóa đơn thành một hồ sơ <b>"hóa đơn cũ"</b> — chỉ cần số tiền và tình
          trạng thanh toán, <b>không bắt buộc</b> tờ trình, nội dung hay thông tin tài khoản. File XML và PDF cùng tên được gộp làm một. Hóa đơn đã
          có trong kho (trùng ký hiệu + số + MST) sẽ được bỏ qua.
        </p>
        <FileDrop onFiles={nhap} accept=".xml,.pdf,image/*">
          {tienDo ? (
            <span className="font-medium text-blue-700">
              Đang đọc {tienDo.xong}/{tienDo.tong} hóa đơn…
            </span>
          ) : (
            <>
              <b className="text-blue-700">Kéo thả nhiều file hóa đơn vào đây</b> (hoặc bấm để chọn)
            </>
          )}
        </FileDrop>
      </div>

      {kq.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h3 className="font-semibold text-slate-800">
              Kết quả: {moi.length} hóa đơn mới · {formatMoney(tong)} đ
              {kq.some((k) => k.trung) && <span className="ml-2 text-sm font-normal text-slate-500">({kq.filter((k) => k.trung).length} bỏ qua vì đã có)</span>}
            </h3>
            <span className="text-sm text-emerald-700">Đã thanh toán: {formatMoney(tongDaTt)} đ</span>
            {moi.some((k) => !daTt[k.dossierId!]) && (
              <button
                className="btn ml-auto"
                onClick={async () => {
                  for (const k of moi) if (!daTt[k.dossierId!]) await datTt(k.dossierId!, today())
                }}
              >
                ✓ Đánh dấu TẤT CẢ đã thanh toán
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-2 py-1.5">File</th>
                <th className="px-2 py-1.5">Ký hiệu / Số</th>
                <th className="px-2 py-1.5">Ngày HĐ</th>
                <th className="px-2 py-1.5">Người bán</th>
                <th className="px-2 py-1.5 text-right">Tổng tiền</th>
                <th className="px-2 py-1.5">Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {kq.map((k, i) => (
                <tr key={i} className={`border-t border-slate-100 ${k.trung ? 'text-slate-400' : ''}`}>
                  <td className="max-w-[14rem] truncate px-2 py-1.5 text-xs" title={k.tenFile}>
                    {k.tenFile}
                    {k.loi && <div className="text-red-600">⚠ {k.loi}</div>}
                    {k.ghiChu && <div className="font-medium text-red-600">⛔ {k.ghiChu}</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    {k.kyHieu} / <b>{k.soHd || '?'}</b>
                  </td>
                  <td className="px-2 py-1.5">{fmtDate(k.ngayHd)}</td>
                  <td className="max-w-[14rem] truncate px-2 py-1.5">{k.nguoiBan}</td>
                  <td className={`px-2 py-1.5 text-right font-medium ${!k.trung && !k.tongTien ? 'text-red-600' : ''}`}>
                    {k.tongTien ? formatMoney(k.tongTien) : k.trung ? '' : 'chưa đọc được'}
                  </td>
                  <td className="px-2 py-1.5">
                    {k.trung ? (
                      <span className="text-xs">Đã có trong kho — bỏ qua</span>
                    ) : k.dossierId && daTt[k.dossierId] ? (
                      <span className="flex items-center gap-1.5">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">✓ Đã thanh toán</span>
                        <input
                          type="date"
                          className="inp !w-36 !py-0.5 text-xs"
                          value={daTt[k.dossierId]}
                          onChange={(e) => e.target.value && datTt(k.dossierId!, e.target.value)}
                          title="Ngày thanh toán (sửa nếu biết)"
                        />
                        <button className="text-xs text-slate-400 hover:text-red-600" title="Bỏ đánh dấu" onClick={() => datTt(k.dossierId!, '')}>
                          ✕
                        </button>
                      </span>
                    ) : k.dossierId ? (
                      <span className="flex items-center gap-2">
                        <button className="btn !py-0.5 text-xs" onClick={() => datTt(k.dossierId!, today())}>
                          ✓ Đã thanh toán
                        </button>
                        <button className="text-xs text-blue-600 hover:underline" onClick={() => onOpen(k.dossierId!)}>
                          mở / sửa
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Ngày thanh toán mặc định là hôm nay — sửa ở ô ngày nếu biết ngày thật. Hóa đơn chưa đọc được số tiền thì bấm "mở / sửa" để nhập tay.
          </p>
        </div>
      )}
    </div>
  )
}
