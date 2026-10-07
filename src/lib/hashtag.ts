/**
 * Hashtag công việc của hồ sơ (#KHCN, #CBM, #SCL, #PCCC…) — để thống kê tiền theo loại việc.
 * Bộ mặc định lập từ nội dung các giấy đề nghị thanh toán đã có (2024–2026).
 * Một hồ sơ có thể có nhiều tag (vd vừa CBM vừa SCL). Người dùng thêm tag mới tùy ý.
 */
export interface TagInfo {
  ma: string // KHCN — viết hoa, không dấu, không khoảng trắng
  ten: string // mô tả hiện khi rê chuột
}

export const TAG_MAC_DINH: TagInfo[] = [
  { ma: 'KHCN', ten: 'Đề tài / kế hoạch khoa học công nghệ' },
  { ma: 'SANGKIEN', ten: 'Sáng kiến (bảo vệ, xét duyệt)' },
  { ma: 'CBM', ten: 'Thí nghiệm theo tình trạng vận hành (CBM)' },
  { ma: 'BTBD', ten: 'Bảo trì bảo dưỡng thiết bị điện TBA 110kV' },
  { ma: 'PCCC', ten: 'Phòng cháy chữa cháy' },
  { ma: 'SCL', ten: 'Sửa chữa lớn' },
  { ma: 'MBA', ten: 'Thí nghiệm / sửa chữa máy biến áp' },
  { ma: 'ATLD', ten: 'An toàn lao động' },
  { ma: 'CNTT', ten: 'Công nghệ thông tin: phần mềm, an toàn thông tin' },
  { ma: 'TRUYENTHONG', ten: 'Truyền thông, quảng bá' },
]

/** "#khcn " -> "KHCN"; "sáng kiến" -> "SANGKIEN" */
export function chuanTag(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

// Quy tắc nhận diện từ nội dung công việc. Thứ tự không quan trọng — một nội dung có thể khớp nhiều tag.
const QUY_TAC: [string, RegExp][] = [
  ['KHCN', /\bKHCN\b|NCKH|khoa học công nghệ|đề tài/i],
  ['SANGKIEN', /sáng kiến/i],
  ['CBM', /\bCBM\b/i],
  ['BTBD', /bảo trì bảo dưỡng (?:các )?thiết bị điện/i],
  ['PCCC', /\bPCCC\b|phòng cháy/i],
  ['SCL', /\bSCL\b|sửa chữa lớn/i],
  ['MBA', /(?:sửa chữa|thí nghiệm và sửa chữa|rà soát)\s+MBA/i],
  ['ATLD', /an toàn lao động|công tác an toàn tại/i],
  ['CNTT', /an toàn thông tin|an ninh mạng|phần mềm dùng chung|\bCNTT\b/i],
  ['TRUYENTHONG', /video|quảng bá|truyền thông/i],
]

/** Gợi ý tag từ nội dung công việc (giấy ĐNTT / tờ trình). */
export function goiYTag(noiDung: string): string[] {
  const t = noiDung.normalize('NFC')
  return QUY_TAC.filter(([, re]) => re.test(t)).map(([ma]) => ma)
}

/** Mọi tag đang biết: mặc định + tag người dùng tự đặt trong các hồ sơ. Giữ thứ tự mặc định trước. */
export function tatCaTag(dsTagHoSo: string[][]): TagInfo[] {
  const co = new Set(TAG_MAC_DINH.map((t) => t.ma))
  const them = [...new Set(dsTagHoSo.flat())].filter((m) => !co.has(m)).sort()
  return [...TAG_MAC_DINH, ...them.map((ma) => ({ ma, ten: 'Tag tự đặt' }))]
}

export const KHONG_TAG = '(chưa gắn)'
