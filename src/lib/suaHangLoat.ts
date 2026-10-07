import { firstInvoiceDate, suggestToTrinhDate, warningsOf } from './status.js'
import type { Dossier, Settings } from './types.js'

/** Sửa ngày hàng loạt cho nhiều hồ sơ đã chọn. */
export type CachDat =
  | { kieu: 'giu' } // giữ nguyên
  | { kieu: 'dat'; ngay: string } // đặt 1 ngày cho tất cả
  | { kieu: 'theoHd' } // theo ngày hóa đơn của TỪNG hồ sơ (tờ trình: lùi theo Cài đặt)
  | { kieu: 'xoa' } // xóa ngày

export const TRUONG_NGAY = [
  ['ngayToTrinh', 'Ngày tờ trình'],
  ['ngayDntt', 'Ngày đề nghị thanh toán'],
  ['ngayNopKeToan', 'Ngày nộp kế toán'],
  ['ngayKeToanTt', 'Ngày kế toán thanh toán'],
] as const

export type TruongNgay = (typeof TRUONG_NGAY)[number][0]
export type ThayDoiNgay = Record<TruongNgay, CachDat>

export const KHONG_DOI: ThayDoiNgay = {
  ngayToTrinh: { kieu: 'giu' },
  ngayDntt: { kieu: 'giu' },
  ngayNopKeToan: { kieu: 'giu' },
  ngayKeToanTt: { kieu: 'giu' },
}

export function apDungNgay(d: Dossier, td: ThayDoiNgay, s: Settings): Dossier {
  const out = { ...d }
  for (const [k] of TRUONG_NGAY) {
    const c = td[k]
    if (c.kieu === 'dat' && c.ngay) out[k] = c.ngay
    else if (c.kieu === 'xoa') out[k] = ''
    else if (c.kieu === 'theoHd') {
      const hd = firstInvoiceDate(d)
      if (hd) out[k] = k === 'ngayToTrinh' ? suggestToTrinhDate(d, s) : hd
    }
  }
  return out
}

/** Xem trước: bao nhiêu hồ sơ thật sự đổi, bao nhiêu bị ngày ngược (nộp trước ĐNTT…) sau khi áp dụng. */
export function xemTruocNgay(list: Dossier[], td: ThayDoiNgay, s: Settings) {
  let doi = 0
  const nguoc: { d: Dossier; canhBao: string[] }[] = []
  for (const d of list) {
    const moi = apDungNgay(d, td, s)
    if (TRUONG_NGAY.some(([k]) => moi[k] !== d[k])) doi++
    const cb = warningsOf(moi, s).filter((w) => /TRƯỚC|SAU ngày/.test(w))
    if (cb.length) nguoc.push({ d: moi, canhBao: cb })
  }
  return { doi, nguoc }
}
