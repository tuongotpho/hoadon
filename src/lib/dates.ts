// Ngày lưu dạng chuỗi yyyy-mm-dd (đúng định dạng ô <input type="date">)

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '')
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function today(): string {
  return toIso(new Date())
}

function isWeekend(d: Date) {
  const w = d.getDay()
  return w === 0 || w === 6
}

// Cộng/trừ ngày làm việc (bỏ thứ 7, chủ nhật). days âm = lùi lại.
export function addWorkingDays(iso: string, days: number): string {
  const d = fromIso(iso)
  if (!d) return ''
  const step = days < 0 ? -1 : 1
  let left = Math.abs(days)
  while (left > 0) {
    d.setDate(d.getDate() + step)
    if (!isWeekend(d)) left--
  }
  // nếu days = 0 mà rơi vào cuối tuần thì lùi về thứ 6
  while (isWeekend(d)) d.setDate(d.getDate() - 1)
  return toIso(d)
}

export function daysBetween(fromIsoStr: string, toIsoStr: string): number | null {
  const a = fromIso(fromIsoStr)
  const b = fromIso(toIsoStr)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

// 2026-10-03 -> 03/10/2026
export function fmtDate(iso: string): string {
  const d = fromIso(iso)
  if (!d) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// 2026-10-03 -> "ngày 03 tháng 10 năm 2026"
export function fmtDateWords(iso: string): string {
  const d = fromIso(iso)
  if (!d) return 'ngày …… tháng …… năm ……'
  return `ngày ${String(d.getDate()).padStart(2, '0')} tháng ${String(d.getMonth() + 1).padStart(2, '0')} năm ${d.getFullYear()}`
}
