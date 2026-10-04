import { useEffect, useMemo, useState } from 'react'
import { fmtDate, today } from '../lib/dates'
import { useSettings } from '../lib/hooks'
import { store } from '../lib/store'
import { apDungNgay, KHONG_DOI, TRUONG_NGAY, xemTruocNgay, type CachDat, type ThayDoiNgay } from '../lib/suaHangLoat'
import type { Dossier } from '../lib/types'

/** Hộp sửa ngày cho nhiều hồ sơ đã tick chọn: mỗi loại ngày chọn giữ nguyên / đặt ngày / theo ngày HĐ / xóa. */
export default function SuaNgayHangLoat({ ids, onClose, onXong }: { ids: string[]; onClose: () => void; onXong?: () => void }) {
  const settings = useSettings()
  const [list, setList] = useState<Dossier[]>([])
  const [td, setTd] = useState<ThayDoiNgay>(KHONG_DOI)
  const [dangLuu, setDangLuu] = useState('')

  useEffect(() => {
    store.listDossiers().then((all) => setList(all.filter((d) => ids.includes(d.id))))
  }, [ids])

  const xem = useMemo(() => xemTruocNgay(list, td, settings), [list, td, settings])

  function datCach(k: keyof ThayDoiNgay, c: CachDat) {
    setTd((cu) => ({ ...cu, [k]: c }))
  }

  async function apDung() {
    let n = 0
    for (const d of list) {
      const moi = apDungNgay(d, td, settings)
      if (TRUONG_NGAY.some(([k]) => moi[k] !== d[k])) {
        setDangLuu(`Đang lưu ${++n}/${xem.doi}…`)
        await store.saveDossier({ ...moi, updatedAt: Date.now() })
      }
    }
    setDangLuu('')
    onXong?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-lg font-semibold text-slate-800">📅 Sửa ngày cho {ids.length} hồ sơ đã chọn</h3>
        <p className="mb-3 text-xs text-slate-500">
          Mục nào để "Giữ nguyên" thì không đổi. "Theo ngày HĐ" tính riêng cho từng hồ sơ: tờ trình lùi {settings.soNgayToTrinhTruocHd} ngày làm
          việc trước ngày hóa đơn, các ngày khác bằng ngày hóa đơn.
        </p>
        <div className="space-y-2">
          {TRUONG_NGAY.map(([k, nhan]) => {
            const c = td[k]
            return (
              <div key={k} className="grid grid-cols-[11rem_1fr] items-center gap-2 md:grid-cols-[13rem_12rem_1fr]">
                <span className="text-sm font-medium text-slate-700">{nhan}</span>
                <select
                  className="inp"
                  value={c.kieu}
                  onChange={(e) => {
                    const kieu = e.target.value as CachDat['kieu']
                    datCach(k, kieu === 'dat' ? { kieu, ngay: today() } : ({ kieu } as CachDat))
                  }}
                >
                  <option value="giu">Giữ nguyên</option>
                  <option value="dat">Đặt ngày…</option>
                  <option value="theoHd">Theo ngày HĐ từng hồ sơ</option>
                  <option value="xoa">Xóa ngày</option>
                </select>
                <div className="col-span-2 md:col-span-1">
                  {c.kieu === 'dat' && <input type="date" className="inp" value={c.ngay} onChange={(e) => datCach(k, { kieu: 'dat', ngay: e.target.value })} />}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
          <div>
            Sẽ đổi <b>{xem.doi}</b> / {list.length} hồ sơ.
          </div>
          {xem.nguoc.length > 0 && (
            <div className="mt-1 text-amber-800">
              ⚠ {xem.nguoc.length} hồ sơ sẽ bị NGÀY NGƯỢC (vẫn lưu được, sửa lại sau cũng được):
              <ul className="mt-1 list-disc pl-5 text-xs">
                {xem.nguoc.slice(0, 6).map(({ d, canhBao }) => (
                  <li key={d.id}>
                    HĐ {d.invoices.map((i) => i.soHd).join(', ')} ({fmtDate(d.invoices[0]?.ngayHd ?? '')}): {canhBao.join('; ')}
                  </li>
                ))}
                {xem.nguoc.length > 6 && <li>… và {xem.nguoc.length - 6} hồ sơ khác</li>}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={!!dangLuu}>
            Hủy
          </button>
          <button className="btn-primary" onClick={apDung} disabled={!xem.doi || !!dangLuu}>
            {dangLuu || `Áp dụng cho ${xem.doi} hồ sơ`}
          </button>
        </div>
      </div>
    </div>
  )
}
