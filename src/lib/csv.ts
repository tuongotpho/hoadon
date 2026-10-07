import { fmtDate } from './dates'
import { STATUS_LABEL, statusOf, totalOf } from './status'
import type { Dossier } from './types'

function cell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: (string | number)[][]): Blob {
  const text = rows.map((r) => r.map(cell).join(',')).join('\r\n')
  return new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
}

/** Bảng kê từng hóa đơn (mỗi hóa đơn 1 dòng). */
export function invoicesToCsv(rows: { inv: import('./types').Invoice; d: Dossier }[]): Blob {
  return toCsv([
    ['STT', 'Ngày HĐ', 'Ký hiệu', 'Số HĐ', 'Người bán', 'MST', 'Trước thuế', 'Thuế', 'Tổng tiền', 'Nội dung', 'Hashtag', 'Ngày nộp KT', 'Ngày KT thanh toán', 'Trạng thái'],
    ...rows.map(({ inv, d }, i) => [
      i + 1, fmtDate(inv.ngayHd), inv.kyHieu, inv.soHd, inv.tenNguoiBan, inv.mstNguoiBan,
      Math.round(inv.tienTruocThue), Math.round(inv.tienThue), Math.round(inv.tongTien), d.noiDung, (d.tags ?? []).map((t) => `#${t}`).join(' '),
      fmtDate(d.ngayNopKeToan), fmtDate(d.ngayKeToanTt), STATUS_LABEL[statusOf(d)],
    ]),
  ])
}

/** Sổ theo dõi dạng CSV, mở thẳng bằng Excel (có BOM để Excel hiện đúng tiếng Việt). */
export function dossiersToCsv(list: Dossier[]): Blob {
  const header = [
    'STT', 'Nội dung', 'Số HĐ', 'Ngày HĐ', 'Người bán', 'Tổng tiền',
    'Số tờ trình', 'Ngày tờ trình', 'Số ĐNTT', 'Ngày ĐNTT', 'Ngày nộp KT', 'Ngày KT thanh toán', 'Trạng thái',
  ]
  const rows = list.map((d, i) => [
    i + 1,
    d.noiDung,
    d.invoices.map((x) => x.soHd).join(', '),
    d.invoices.map((x) => fmtDate(x.ngayHd)).join(', '),
    [...new Set(d.invoices.map((x) => x.tenNguoiBan))].join(', '),
    Math.round(totalOf(d)),
    d.soToTrinh,
    fmtDate(d.ngayToTrinh),
    d.soDntt,
    fmtDate(d.ngayDntt),
    fmtDate(d.ngayNopKeToan),
    fmtDate(d.ngayKeToanTt),
    STATUS_LABEL[statusOf(d)],
  ])
  const text = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
  return new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
}
