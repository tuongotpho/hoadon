// Một dòng hàng hóa / dịch vụ trên hóa đơn
export interface InvoiceItem {
  ten: string
  dvt: string
  soLuong: number
  donGia: number
  thanhTien: number
  thueSuat: string
}

// Một hóa đơn đỏ (hóa đơn GTGT)
export interface Invoice {
  id: string
  kyHieu: string // ký hiệu hóa đơn, ví dụ 1C26TAA
  soHd: string
  ngayHd: string // yyyy-mm-dd
  tenNguoiBan: string
  mstNguoiBan: string
  diaChiNguoiBan: string
  stkNguoiBan: string
  nganHangNguoiBan: string
  tenTaiKhoan: string // tên chủ tài khoản ngân hàng (không dấu, như trên sao kê)
  tienBangChu: string // dòng "Số tiền viết bằng chữ" in trên hóa đơn
  tienTruocThue: number
  tienThue: number
  tongTien: number
  items: InvoiceItem[]
  fileIds: string[] // các file gốc (XML, PDF, ảnh) lưu trong bảng files
}

// Một dòng "thành phần tham gia" của buổi làm việc
export interface ThanhPhan {
  donVi: string
  soNguoi: number
}

// Một hồ sơ = một việc đi làm, gồm 1 hoặc nhiều hóa đơn
export interface Dossier {
  id: string
  noiDung: string // ví dụ: "Làm việc với Công ty Điện lực Hưng Yên về công tác CBM năm 2026"
  doiTac: string // đơn vị đến làm việc, ví dụ "Công ty Điện lực Hưng Yên"
  duTru: number // dự trù gõ tay; 0 = theo quy tắc (HĐ < 5tr -> 5tr, còn lại 20tr)
  nguoiDeNghi: string // người đề nghị thanh toán (chọn từ danh sách)
  nhiemVu: string // "...trong việc ___ của Công ty"
  thanhPhan: ThanhPhan[]
  lyDo: string
  ghiChu: string
  invoices: Invoice[]

  soToTrinh: string
  ngayToTrinh: string
  soDntt: string
  ngayDntt: string
  ngayNopKeToan: string
  ngayKeToanTt: string

  hinhThucTt: string // Chuyển khoản / Tiền mặt
  createdAt: number
  updatedAt: number
}

export interface StoredFile {
  id: string
  name: string
  type: string
  size: number
  data: Blob
  addedAt: number
}

export type TemplateKind = 'toTrinh' | 'dntt'

export interface StoredTemplate {
  kind: TemplateKind
  name: string
  data: Blob
  uploadedAt: number
}

export interface Settings {
  hoTen: string
  chucVu: string
  boPhan: string
  donVi: string // đơn vị chủ quản, ví dụ "CÔNG TY ..."
  donViCapTren: string
  kinhGui: string // nơi nhận tờ trình
  kinhGuiDntt: string
  diaDanh: string // "Hà Nội"
  nguoiDuyet: string
  chucVuNguoiDuyet: string
  dsNguoiDeNghi: string[] // danh sách người đề nghị đã lưu
  dsNhiemVu: string[] // danh sách nhiệm vụ đã lưu
  nguongTien: number // ngưỡng 5tr: dưới thì không in TK người bán, dự trù nhỏ
  duTruDuoiNguong: number
  duTruTuNguong: number
  soNgayToTrinhTruocHd: number // tờ trình lùi trước ngày hóa đơn bao nhiêu ngày làm việc
  canhBaoChoKtSauNgay: number // nộp kế toán quá bao nhiêu ngày chưa thanh toán thì cảnh báo
}

export const DEFAULT_SETTINGS: Settings = {
  hoTen: '',
  chucVu: '',
  boPhan: '',
  donVi: '',
  donViCapTren: '',
  kinhGui: '',
  kinhGuiDntt: '',
  diaDanh: 'Hà Nội',
  nguoiDuyet: '',
  chucVuNguoiDuyet: '',
  dsNguoiDeNghi: ['Lê Việt Thanh', 'Nguyễn Đình Cường'],
  dsNhiemVu: ['quản lý kỹ thuật công tác CBM'],
  nguongTien: 5000000,
  duTruDuoiNguong: 5000000,
  duTruTuNguong: 20000000,
  soNgayToTrinhTruocHd: 2,
  canhBaoChoKtSauNgay: 15,
}
