// Đọc số tiền thành chữ tiếng Việt: 1234000 -> "Một triệu hai trăm ba mươi tư nghìn đồng"

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

// Đọc 3 chữ số. full = true khi đây không phải nhóm đứng đầu (phải đọc "không trăm", "linh").
function readTriple(n: number, full: boolean): string {
  const tram = Math.floor(n / 100)
  const chuc = Math.floor((n % 100) / 10)
  const dv = n % 10
  const parts: string[] = []

  if (tram > 0 || full) parts.push(DIGITS[tram], 'trăm')

  if (chuc === 0) {
    if (dv > 0 && (tram > 0 || full)) parts.push('linh')
  } else if (chuc === 1) {
    parts.push('mười')
  } else {
    parts.push(DIGITS[chuc], 'mươi')
  }

  if (dv > 0) {
    if (dv === 1 && chuc >= 2) parts.push('mốt')
    else if (dv === 4 && chuc >= 2) parts.push('tư')
    else if (dv === 5 && chuc >= 1) parts.push('lăm')
    else parts.push(DIGITS[dv])
  }
  return parts.join(' ')
}

const UNITS = ['', 'nghìn', 'triệu', 'tỷ']

export function numberToVietnamese(value: number): string {
  let n = Math.round(Math.abs(value))
  if (n === 0) return 'không'

  // tách nhóm 3 chữ số từ phải sang
  const groups: number[] = []
  while (n > 0) {
    groups.push(n % 1000)
    n = Math.floor(n / 1000)
  }

  const words: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    const isFirst = i === groups.length - 1
    // nhóm tỷ lặp lại: 1 000 000 000 000 = "một nghìn tỷ"
    const unit = i === 0 ? '' : i % 3 === 0 ? 'tỷ' : UNITS[i % 3]
    if (g === 0) {
      // vẫn phải đọc "tỷ" khi các nhóm cao hơn có giá trị (vd 1 000 000 000 000 000)
      if (i % 3 === 0 && i > 0 && groups.slice(i + 1).some((x) => x > 0)) words.push('tỷ')
      continue
    }
    words.push(readTriple(g, !isFirst))
    if (unit) words.push(unit)
  }
  return words.join(' ').replace(/\s+/g, ' ').trim()
}

/** chan = true: số tròn nghìn thì thêm "chẵn" (kiểu "Hai mươi triệu đồng chẵn" trong tờ trình). */
export function moneyInWords(value: number, chan = false): string {
  const tron = Math.round(value) % 1000 === 0 && Math.round(value) > 0
  const s = numberToVietnamese(value) + (chan && tron ? ' đồng chẵn' : ' đồng')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatMoney(value: number): string {
  return Math.round(value || 0).toLocaleString('vi-VN')
}
