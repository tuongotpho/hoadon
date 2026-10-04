import type { Invoice } from './types'

/**
 * Dò hàng CẤM trên hóa đơn (quy định: không thanh toán rượu/bia).
 * So theo TỪ trọn vẹn, giữ nguyên dấu tiếng Việt: "bia" khớp "Bia Tiger" nhưng KHÔNG khớp "bìa hồ sơ".
 * Danh sách từ khóa sửa được ở Cài đặt.
 */
export const TU_KHOA_CAM_MAC_DINH = [
  'rượu', 'bia', 'beer', 'wine', 'rượu vang', 'vang đỏ', 'vang trắng', 'vang ngọt',
  'vodka', 'whisky', 'whiskey', 'soju', 'sake', 'cognac', 'champagne', 'sâm panh', 'brandy', 'rum', 'gin', 'tequila', 'cocktail',
  'tiger', 'heineken', 'larue', 'budweiser', 'sapporo', 'carlsberg', 'hoegaarden', 'corona', 'strongbow', 'halida', 'huda',
  'hennessy', 'chivas', 'johnnie walker', 'ballantine', 'jack daniel', 'absolut', 'smirnoff', 'macallan', 'remy martin',
]

export interface DongCam {
  soHd: string
  ten: string // tên dòng hàng
  tu: string // từ khóa khớp
  thanhTien: number
}

const chuan = (s: string) => s.normalize('NFC').toLowerCase()

// Món ăn nấu với rượu/bia ("tôm hấp bia", "gà hấp rượu") không phải đồ uống -> bỏ qua
const CACH_NAU = '(?:hấp|nấu|om|sốt|ngâm|tẩm|ướp|luộc|kho|xào|nướng|chưng|quay)'

function khop(ten: string, tu: string): boolean {
  const t = chuan(tu).trim()
  if (!t) return false
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  // không có chữ/số dính liền hai bên => khớp nguyên từ; đứng ngay sau cách nấu => là món ăn
  return new RegExp(`(?<![\\p{L}\\p{N}])(?<!${CACH_NAU}\\s+)${esc}(?![\\p{L}\\p{N}])`, 'u').test(chuan(ten))
}

export function timHangCam(invoices: Invoice[], tuKhoa: string[]): DongCam[] {
  const out: DongCam[] = []
  for (const inv of invoices) {
    for (const it of inv.items) {
      const tu = tuKhoa.find((k) => khop(it.ten, k))
      if (tu) out.push({ soHd: inv.soHd, ten: it.ten, tu, thanhTien: it.thanhTien })
    }
  }
  return out
}

export function moTaHangCam(ds: DongCam[]): string {
  return ds.map((d) => `• HĐ ${d.soHd || '?'}: "${d.ten}"`).join('\n')
}
