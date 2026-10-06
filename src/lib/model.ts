import { newId } from './store/DataStore.js'
import type { Dossier, Invoice } from './types.js'

export function emptyInvoice(): Invoice {
  return {
    id: newId(), kyHieu: '', soHd: '', ngayHd: '', tenNguoiBan: '', mstNguoiBan: '', diaChiNguoiBan: '',
    stkNguoiBan: '', nganHangNguoiBan: '', tenTaiKhoan: '', tienBangChu: '', hdLienQuan: null, tienTruocThue: 0, tienThue: 0, tongTien: 0, items: [],
    fileIds: [],
  }
}

export function emptyDossier(): Dossier {
  const now = Date.now()
  return {
    id: newId(), noiDung: '', doiTac: '', duTru: 0, nguoiDeNghi: '', nhiemVu: '', thanhPhan: [], lyDo: '', ghiChu: '', invoices: [], soToTrinh: '',
    ngayToTrinh: '', soDntt: '', ngayDntt: '', ngayNopKeToan: '', ngayKeToanTt: '', hinhThucTt: 'Chuyển khoản', hoSoCu: false,
    createdAt: now, updatedAt: now,
  }
}

/** HỘ KINH DOANH NGUYỄN VĂN A -> HO KINH DOANH NGUYEN VAN A (kiểu tên tài khoản ngân hàng) */
export function toAccountName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Khóa nhận diện 1 hóa đơn — quy tắc của anh: TRÙNG khi cùng SỐ + NGÀY XUẤT + MST đơn vị xuất.
 * Tên file / tên hóa đơn giống nhau không tính. Thiếu 1 trong 3 thì không coi là trùng (giữ cả, để người xem).
 */
export function khoaHoaDon(i: Pick<Invoice, 'soHd' | 'ngayHd' | 'mstNguoiBan'>): string {
  const so = i.soHd.trim()
  if (!so || !i.ngayHd || !i.mstNguoiBan.trim()) return ''
  return [String(Number(so) || so), i.ngayHd, i.mstNguoiBan.replace(/\s/g, '')].join('|')
}

/** Bù các trường mới cho hồ sơ tạo từ phiên bản app cũ hơn. */
export function normalizeDossier(d: Dossier): Dossier {
  const base = emptyDossier()
  return {
    ...base,
    ...d,
    invoices: (d.invoices ?? []).map((i) => ({ ...emptyInvoice(), ...i })),
  }
}
