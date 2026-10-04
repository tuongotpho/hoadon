import { fmtDate, fmtDateWords, fromIso } from './dates'
import { formatMoney, moneyInWords } from './numberToWords'
import { canThongTinTk, duTruOf, sumInvoices, tongTienChuOf } from './rules'
import type { Dossier, Invoice, Settings } from './types'

export { sumInvoices }

/**
 * Danh sách "ô trống" anh gõ vào mẫu Word, dạng {ten_o}.
 * App sẽ thay mỗi ô bằng dữ liệu thật khi xuất file.
 */
export interface TagDoc {
  tag: string
  moTa: string
  viDu: string
}
export interface TagGroup {
  nhom: string
  ghiChu?: string
  tags: TagDoc[]
}

export const TAG_GROUPS: TagGroup[] = [
  {
    nhom: 'Người làm hồ sơ (lấy từ trang Cài đặt)',
    tags: [
      { tag: 'ho_ten', moTa: 'Người đề nghị thanh toán (chọn ở từng hồ sơ)', viDu: 'Lê Việt Thanh' },
      { tag: 'chuc_vu', moTa: 'Chức vụ', viDu: 'Kỹ sư' },
      { tag: 'bo_phan', moTa: 'Bộ phận / phòng', viDu: 'Phòng Kỹ thuật' },
      { tag: 'don_vi', moTa: 'Đơn vị', viDu: 'CÔNG TY ...' },
      { tag: 'don_vi_cap_tren', moTa: 'Đơn vị cấp trên', viDu: 'TẬP ĐOÀN ĐIỆN LỰC VIỆT NAM' },
      { tag: 'kinh_gui', moTa: 'Kính gửi (tờ trình)', viDu: 'Giám đốc Công ty' },
      { tag: 'kinh_gui_dntt', moTa: 'Kính gửi (đề nghị thanh toán)', viDu: 'Phòng Tài chính kế toán' },
      { tag: 'dia_danh', moTa: 'Địa danh', viDu: 'Hà Nội' },
      { tag: 'nguoi_duyet', moTa: 'Người duyệt', viDu: 'Trần Văn B' },
      { tag: 'chuc_vu_nguoi_duyet', moTa: 'Chức vụ người duyệt', viDu: 'Giám đốc' },
    ],
  },
  {
    nhom: 'Nội dung hồ sơ',
    tags: [
      { tag: 'noi_dung', moTa: 'Nội dung công việc', viDu: 'Làm việc với Công ty Điện lực Hưng Yên về công tác CBM năm 2026' },
      { tag: 'nhiem_vu', moTa: 'Nhiệm vụ: "…trong việc ___ của Công ty"', viDu: 'quản lý kỹ thuật công tác CBM' },
      { tag: 'doi_tac', moTa: 'Đơn vị đến làm việc', viDu: 'Công ty Điện lực Hưng Yên' },
      { tag: 'tong_so_nguoi', moTa: 'Tổng số người tham gia (2 chữ số)', viDu: '25' },
      { tag: 'ly_do', moTa: 'Lý do / sự cần thiết', viDu: '...' },
      { tag: 'ghi_chu', moTa: 'Ghi chú', viDu: '' },
      { tag: 'hinh_thuc_tt', moTa: 'Hình thức thanh toán', viDu: 'Chuyển khoản' },
      { tag: 'chung_tu_kem_theo', moTa: 'Liệt kê hóa đơn kèm theo', viDu: 'Hóa đơn GTGT số 123 ngày 28/09/2026 của Công ty X' },
    ],
  },
  {
    nhom: 'Ngày tháng',
    ghiChu: 'Mỗi ngày có 5 kiểu: _chu (ngày 03 tháng 10 năm 2026), _ngay, _thang, _nam, và kiểu ngắn 03/10/2026.',
    tags: [
      { tag: 'so_to_trinh', moTa: 'Số tờ trình', viDu: '123/TTr-KT' },
      { tag: 'ngay_to_trinh', moTa: 'Ngày tờ trình', viDu: '01/10/2026' },
      { tag: 'ngay_to_trinh_chu', moTa: 'Ngày tờ trình bằng chữ', viDu: 'ngày 01 tháng 10 năm 2026' },
      { tag: 'ngay_to_trinh_ngay / _thang / _nam', moTa: 'Tách riêng ngày, tháng, năm', viDu: '01 / 10 / 2026' },
      { tag: 'so_dntt', moTa: 'Số đề nghị thanh toán', viDu: '45/ĐNTT' },
      { tag: 'ngay_dntt', moTa: 'Ngày đề nghị thanh toán', viDu: '05/10/2026' },
      { tag: 'ngay_dntt_chu', moTa: 'Ngày ĐNTT bằng chữ', viDu: 'ngày 05 tháng 10 năm 2026' },
      { tag: 'ngay_dntt_ngay / _thang / _nam', moTa: 'Tách riêng ngày, tháng, năm', viDu: '05 / 10 / 2026' },
    ],
  },
  {
    nhom: 'Tiền',
    ghiChu: 'Dự trù = số tiền xin trong tờ trình (nhập tay). Tổng tiền = cộng các hóa đơn.',
    tags: [
      { tag: 'du_tru', moTa: 'Dự trù (tờ trình): HĐ < 5tr → 5tr, còn lại 20tr', viDu: '20.000.000' },
      { tag: 'du_tru_chu', moTa: 'Dự trù bằng chữ (số tròn có "chẵn")', viDu: 'Hai mươi triệu đồng chẵn' },
      { tag: 'tong_tien', moTa: 'Tổng tiền thanh toán', viDu: '1.234.000' },
      { tag: 'tong_tien_chu', moTa: 'Tổng tiền bằng chữ (lấy nguyên văn trên hóa đơn)', viDu: 'Một triệu hai trăm ba mươi tư nghìn đồng' },
      { tag: 'tien_truoc_thue', moTa: 'Tiền trước thuế', viDu: '1.142.593' },
      { tag: 'tien_thue', moTa: 'Tiền thuế GTGT', viDu: '91.407' },
    ],
  },
  {
    nhom: 'Hóa đơn',
    ghiChu: 'Nếu hồ sơ có nhiều hóa đơn, các ô này nối các giá trị bằng dấu phẩy.',
    tags: [
      { tag: 'so_hd', moTa: 'Số hóa đơn', viDu: '00000123' },
      { tag: 'ky_hieu', moTa: 'Ký hiệu hóa đơn', viDu: '1C26TAA' },
      { tag: 'ngay_hd', moTa: 'Ngày hóa đơn', viDu: '28/09/2026' },
      { tag: 'nguoi_ban', moTa: 'Tên đơn vị bán', viDu: 'Công ty TNHH X' },
      { tag: 'mst_nguoi_ban', moTa: 'Mã số thuế người bán', viDu: '0101234567' },
      { tag: 'dia_chi_nguoi_ban', moTa: 'Địa chỉ người bán', viDu: '' },
      { tag: 'stk_nguoi_ban', moTa: 'Số tài khoản người bán', viDu: '' },
      { tag: 'ngan_hang_nguoi_ban', moTa: 'Ngân hàng người bán', viDu: 'Ngân hàng Vietinbank' },
      { tag: 'ten_tai_khoan', moTa: 'Tên chủ tài khoản (không dấu)', viDu: 'HO KINH DOANH NGUYEN VAN A' },
      { tag: 'so_luong_hd', moTa: 'Số lượng hóa đơn (2 chữ số)', viDu: '01' },
    ],
  },
  {
    nhom: 'Bảng lặp (dùng trong bảng Word)',
    ghiChu:
      'Đặt {#ds_hoa_don} ở ô đầu và {/ds_hoa_don} ở ô cuối của MỘT dòng bảng — app sẽ nhân dòng đó ra theo số hóa đơn. Bên trong dùng {stt} {so_hd} {ky_hieu} {ngay_hd} {nguoi_ban} {mst} {tien_truoc_thue} {tien_thue} {tong_tien}. Tương tự {#ds_hang_hoa}…{/ds_hang_hoa} với {stt} {ten} {dvt} {so_luong} {don_gia} {thanh_tien} {thue_suat}; và {#thanh_phan}…{/thanh_phan} với {stt} {don_vi} {so_nguoi} {dau}. Muốn lặp cả đoạn văn (vd các dòng "+ …"): đặt {#thanh_phan} và {/thanh_phan} mỗi cái 1 dòng riêng, dòng giữa là "+ {don_vi}{dau}" — {dau} là ";" và "." ở dòng cuối.',
    tags: [
      { tag: '#ds_hoa_don … /ds_hoa_don', moTa: 'Lặp theo từng hóa đơn', viDu: '' },
      { tag: '#ds_hang_hoa … /ds_hang_hoa', moTa: 'Lặp theo từng dòng hàng hóa', viDu: '' },
      { tag: '#thanh_phan … /thanh_phan', moTa: 'Lặp theo thành phần tham gia', viDu: '' },
      { tag: '#co_tt_thanh_toan … /co_tt_thanh_toan', moTa: 'Chỉ in phần bên trong khi HĐ từ 5 triệu trở lên', viDu: '' },
    ],
  },
]

function dateParts(prefix: string, iso: string): Record<string, string> {
  const d = fromIso(iso)
  return {
    [prefix]: fmtDate(iso),
    [`${prefix}_chu`]: fmtDateWords(iso),
    [`${prefix}_ngay`]: d ? String(d.getDate()).padStart(2, '0') : '……',
    [`${prefix}_thang`]: d ? String(d.getMonth() + 1).padStart(2, '0') : '……',
    [`${prefix}_nam`]: d ? String(d.getFullYear()) : '……',
  }
}

function uniqJoin(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(', ')
}

export function chungTuKemTheo(invoices: Invoice[]): string {
  return invoices
    .map((i) => {
      const parts = ['Hóa đơn GTGT']
      if (i.kyHieu) parts.push(`ký hiệu ${i.kyHieu}`)
      if (i.soHd) parts.push(`số ${i.soHd}`)
      if (i.ngayHd) parts.push(`ngày ${fmtDate(i.ngayHd)}`)
      if (i.tenNguoiBan) parts.push(`của ${i.tenNguoiBan}`)
      return parts.join(' ')
    })
    .join('; ')
}

/** Ô trống in thành "……" — để điền tay khi in, và để bản xem trước tô vàng chỗ thiếu. */
function fillBlanks<T>(v: T): T {
  if (typeof v === 'string') return (v.trim() === '' ? '……' : v) as T
  if (Array.isArray(v)) return v.map(fillBlanks) as T
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillBlanks(x)])) as T
  return v
}

/** Dữ liệu đưa vào mẫu Word. Khóa trùng tên các ô {…} ở TAG_GROUPS. */
export function buildTemplateData(d: Dossier, s: Settings): Record<string, unknown> {
  const sum = sumInvoices(d.invoices)
  const inv = d.invoices
  let sttHang = 0

  return fillBlanks({
    ho_ten: d.nguoiDeNghi || s.hoTen,
    nguoi_de_nghi: d.nguoiDeNghi || s.hoTen,
    nhiem_vu: d.nhiemVu,
    co_tt_thanh_toan: canThongTinTk(d, s),
    chuc_vu: s.chucVu,
    bo_phan: s.boPhan,
    don_vi: s.donVi,
    don_vi_cap_tren: s.donViCapTren,
    kinh_gui: s.kinhGui,
    kinh_gui_dntt: s.kinhGuiDntt,
    dia_danh: s.diaDanh,
    nguoi_duyet: s.nguoiDuyet,
    chuc_vu_nguoi_duyet: s.chucVuNguoiDuyet,

    noi_dung: d.noiDung,
    doi_tac: d.doiTac,
    tong_so_nguoi: String(d.thanhPhan.reduce((a, t) => a + (t.soNguoi || 0), 0)).padStart(2, '0'),
    du_tru: formatMoney(duTruOf(d, s)),
    du_tru_chu: moneyInWords(duTruOf(d, s), true),
    thanh_phan: d.thanhPhan.map((t, i, arr) => ({
      stt: i + 1,
      don_vi: t.donVi,
      so_nguoi: String(t.soNguoi || 0).padStart(2, '0'),
      dau: i === arr.length - 1 ? '.' : ';',
    })),
    ly_do: d.lyDo,
    ghi_chu: d.ghiChu,
    hinh_thuc_tt: d.hinhThucTt,
    chung_tu_kem_theo: chungTuKemTheo(inv),

    so_to_trinh: d.soToTrinh,
    ...dateParts('ngay_to_trinh', d.ngayToTrinh),
    so_dntt: d.soDntt,
    ...dateParts('ngay_dntt', d.ngayDntt),

    tong_tien: formatMoney(sum.tongTien),
    tong_tien_chu: tongTienChuOf(d),
    tien_truoc_thue: formatMoney(sum.tienTruocThue),
    tien_thue: formatMoney(sum.tienThue),

    so_hd: uniqJoin(inv.map((i) => i.soHd)),
    ky_hieu: uniqJoin(inv.map((i) => i.kyHieu)),
    ngay_hd: uniqJoin(inv.map((i) => fmtDate(i.ngayHd))),
    nguoi_ban: uniqJoin(inv.map((i) => i.tenNguoiBan)),
    mst_nguoi_ban: uniqJoin(inv.map((i) => i.mstNguoiBan)),
    dia_chi_nguoi_ban: uniqJoin(inv.map((i) => i.diaChiNguoiBan)),
    stk_nguoi_ban: uniqJoin(inv.map((i) => i.stkNguoiBan)),
    ngan_hang_nguoi_ban: uniqJoin(inv.map((i) => i.nganHangNguoiBan)),
    ten_tai_khoan: uniqJoin(inv.map((i) => i.tenTaiKhoan)),
    so_luong_hd: String(inv.length).padStart(2, '0'),

    ds_hoa_don: inv.map((i, idx) => ({
      stt: idx + 1,
      so_hd: i.soHd,
      ky_hieu: i.kyHieu,
      ngay_hd: fmtDate(i.ngayHd),
      nguoi_ban: i.tenNguoiBan,
      mst: i.mstNguoiBan,
      tien_truoc_thue: formatMoney(i.tienTruocThue),
      tien_thue: formatMoney(i.tienThue),
      tong_tien: formatMoney(i.tongTien),
    })),
    ds_hang_hoa: inv.flatMap((i) =>
      i.items.map((it) => ({
        stt: ++sttHang,
        ten: it.ten,
        dvt: it.dvt,
        so_luong: it.soLuong.toLocaleString('vi-VN'),
        don_gia: formatMoney(it.donGia),
        thanh_tien: formatMoney(it.thanhTien),
        thue_suat: it.thueSuat,
      })),
    ),
  })
}

/** Mọi tên ô hợp lệ ở cấp ngoài cùng (để cảnh báo ô gõ sai trong mẫu). */
export function knownTopLevelTags(): Set<string> {
  const dummy: Dossier = {
    id: '', noiDung: '', doiTac: '', duTru: 0, nguoiDeNghi: '', nhiemVu: '', thanhPhan: [], lyDo: '', ghiChu: '', invoices: [], soToTrinh: '', ngayToTrinh: '',
    soDntt: '', ngayDntt: '', ngayNopKeToan: '', ngayKeToanTt: '', hinhThucTt: '', createdAt: 0, updatedAt: 0,
  }
  const s = { hoTen: '', nguongTien: 0 } as Settings
  return new Set(Object.keys(buildTemplateData(dummy, s)))
}

export const LOOP_INNER_TAGS: Record<string, string[]> = {
  ds_hoa_don: ['stt', 'so_hd', 'ky_hieu', 'ngay_hd', 'nguoi_ban', 'mst', 'tien_truoc_thue', 'tien_thue', 'tong_tien'],
  ds_hang_hoa: ['stt', 'ten', 'dvt', 'so_luong', 'don_gia', 'thanh_tien', 'thue_suat'],
  thanh_phan: ['stt', 'don_vi', 'so_nguoi', 'dau'],
}
