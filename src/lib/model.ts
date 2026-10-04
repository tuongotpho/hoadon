import { newId } from './store/DataStore'
import type { Dossier, Invoice } from './types'

export function emptyInvoice(): Invoice {
  return {
    id: newId(), kyHieu: '', soHd: '', ngayHd: '', tenNguoiBan: '', mstNguoiBan: '', diaChiNguoiBan: '',
    stkNguoiBan: '', nganHangNguoiBan: '', tenTaiKhoan: '', tienBangChu: '', tienTruocThue: 0, tienThue: 0, tongTien: 0, items: [],
    fileIds: [],
  }
}

export function emptyDossier(): Dossier {
  const now = Date.now()
  return {
    id: newId(), noiDung: '', doiTac: '', duTru: 0, nguoiDeNghi: '', nhiemVu: '', thanhPhan: [], lyDo: '', ghiChu: '', invoices: [], soToTrinh: '',
    ngayToTrinh: '', soDntt: '', ngayDntt: '', ngayNopKeToan: '', ngayKeToanTt: '', hinhThucTt: 'Chuyển khoản',
    createdAt: now, updatedAt: now,
  }
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
