import { useState, type ReactNode } from 'react'
import { formatMoney } from '../lib/numberToWords'

/**
 * Biểu đồ trang Tổng hợp — SVG thuần, không thêm thư viện.
 * Màu: 3 ô đầu của bảng màu chuẩn (đã kiểm mù màu bằng validate_palette: đạt mọi cặp),
 * gán khớp màu chữ đang dùng trong bảng số: đã TT = xanh lục lam, chờ KT = xanh dương, chưa nộp = cam.
 * Màu xanh lục lam hơi nhạt trên nền trắng -> luôn kèm chú thích + chú giải khi rê chuột + bảng số bên dưới.
 */
export const MAU = { daTt: '#1baf7a', choKt: '#2a78d6', chuaNop: '#eb6834', mot: '#2a78d6' } as const
const CHU = { chinh: '#0b0b0b', phu: '#52514e', mo: '#8a8984', luoi: '#e7e6e2' }

const TANG = [
  ['daTt', 'Đã thanh toán'],
  ['choKt', 'Chờ kế toán'],
  ['chuaNop', 'Chưa nộp'],
] as const
type Tang = (typeof TANG)[number][0]

/** 12.500.000 -> "12,5 tr"; dưới 1 triệu -> "850 nghìn" */
export function trieu(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`
  if (n === 0) return '0'
  return `${Math.round(n / 1e3).toLocaleString('vi-VN')} nghìn`
}

/** Vạch chia trục "tròn": 0, 10tr, 20tr… */
export function vachChia(max: number, soVach = 4): number[] {
  if (max <= 0) return [0]
  const tho = max / soVach
  const mu = 10 ** Math.floor(Math.log10(tho))
  const buoc = [1, 2, 2.5, 5, 10].map((k) => k * mu).find((b) => b >= tho)!
  return Array.from({ length: Math.ceil(max / buoc) + 1 }, (_, i) => i * buoc)
}

function ChuGiai() {
  return (
    <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {TANG.map(([k, ten]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: MAU[k] }} />
          {ten}
        </span>
      ))}
    </div>
  )
}

/** Ô chú giải nổi khi rê chuột / chạm vào cột */
function Nhan({ x, y, rong, children }: { x: number; y: number; rong: number; children: ReactNode }) {
  const trai = x > rong * 0.6 // gần mép phải thì lật sang trái
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-40 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: `${(x / rong) * 100}%`, top: y, transform: `translate(${trai ? 'calc(-100% - 8px)' : '8px'}, -50%)` }}
    >
      {children}
    </div>
  )
}

const DongNhan = ({ mau, ten, gt }: { mau?: string; ten: string; gt: string }) => (
  <div className="flex items-center gap-1.5 whitespace-nowrap">
    {mau && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: mau }} />}
    <span className="text-slate-500">{ten}</span>
    <span className="ml-auto pl-3 font-medium text-slate-800">{gt}</span>
  </div>
)

export interface CotChong {
  khoa: number
  nhan: string // "T1", "2025"
  tieuDe: string // "Tháng 1/2026"
  soHd: number
  daTt: number
  choKt: number
  chuaNop: number
}

/** Cột chồng: mỗi cột 1 tháng (hoặc 1 năm), chia 3 tầng theo tình trạng thanh toán. Bấm cột để lọc. */
export function BieuDoCotChong({ ds, chon, onChon }: { ds: CotChong[]; chon?: number; onChon?: (khoa: number) => void }) {
  const [tro, setTro] = useState<number | null>(null)
  const W = 640
  const H = 230
  const L = 52 // chỗ cho chữ trục dọc
  const T = 10
  const B = 24
  const tong = (c: CotChong) => c.daTt + c.choKt + c.chuaNop
  const vach = vachChia(Math.max(...ds.map(tong), 0))
  const dinh = vach.at(-1) || 1
  const y = (v: number) => T + (H - T - B) * (1 - v / dinh)
  const o = (W - L) / Math.max(ds.length, 1)
  const rongCot = Math.min(o * 0.62, 44)
  const c = tro == null ? null : ds[tro]

  return (
    <div>
      <ChuGiai />
      <div className="relative" onMouseLeave={() => setTro(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Biểu đồ tiền hóa đơn theo tình trạng thanh toán">
          {vach.map((v) => (
            <g key={v}>
              <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke={CHU.luoi} strokeWidth={1} />
              <text x={L - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill={CHU.mo}>{trieu(v)}</text>
            </g>
          ))}
          {ds.map((cot, i) => {
            const x = L + o * i + (o - rongCot) / 2
            let day = 0
            const tang = TANG.map(([k]) => ({ k, v: cot[k as Tang] })).filter((t) => t.v > 0)
            return (
              <g key={cot.khoa} opacity={chon != null && chon !== cot.khoa ? 0.35 : 1}>
                {tang.map((t, j) => {
                  const y1 = y(day + t.v)
                  const cao = y(day) - y1
                  day += t.v
                  const tren = j === tang.length - 1
                  // khe 2px giữa các tầng; tầng trên cùng bo 4px ở đỉnh
                  const h = Math.max(cao - (tren ? 0 : 2), 1)
                  return tren ? (
                    <path key={t.k} fill={MAU[t.k as Tang]}
                      d={`M${x},${y1 + h} V${y1 + Math.min(4, h)} Q${x},${y1} ${x + Math.min(4, h)},${y1} H${x + rongCot - Math.min(4, h)} Q${x + rongCot},${y1} ${x + rongCot},${y1 + Math.min(4, h)} V${y1 + h} Z`} />
                  ) : (
                    <rect key={t.k} x={x} y={y1 + 2} width={rongCot} height={h} fill={MAU[t.k as Tang]} />
                  )
                })}
                <text x={x + rongCot / 2} y={H - 6} textAnchor="middle" fontSize={11} fill={chon === cot.khoa ? CHU.chinh : CHU.phu} fontWeight={chon === cot.khoa ? 600 : 400}>
                  {cot.nhan}
                </text>
                {/* vùng bắt chuột rộng hơn cột */}
                <rect x={L + o * i} y={T} width={o} height={H - T} fill="transparent" style={{ cursor: onChon ? 'pointer' : undefined }}
                  onMouseMove={() => tro !== i && setTro(i)} onClick={() => { setTro(i); onChon?.(cot.khoa) }} />
              </g>
            )
          })}
          <line x1={L} x2={W} y1={y(0)} y2={y(0)} stroke={CHU.mo} strokeWidth={1} />
        </svg>
        {c && tong(c) > 0 && (
          <Nhan x={L + o * tro! + o / 2} y={y(tong(c) / 2)} rong={W}>
            <div className="mb-1 font-semibold text-slate-800">{c.tieuDe} · {c.soHd} HĐ</div>
            {TANG.filter(([k]) => c[k]).map(([k, ten]) => <DongNhan key={k} mau={MAU[k]} ten={ten} gt={`${formatMoney(c[k])} đ`} />)}
            <div className="mt-1 border-t border-slate-100 pt-1"><DongNhan ten="Cộng" gt={`${formatMoney(tong(c))} đ`} /></div>
          </Nhan>
        )}
      </div>
    </div>
  )
}

export interface ThanhNgang {
  khoa: string
  ten: string
  phu?: string // MST, số HĐ…
  giaTri: number
  ghiChu?: string
  mo?: boolean // dòng gộp "Khác" -> màu xám
}

/** Thanh ngang xếp hạng (người bán, cỡ hóa đơn…): 1 màu, số tiền ghi ngay cuối thanh. */
export function BieuDoThanh({ ds, donVi = (n: number) => trieu(n) }: { ds: ThanhNgang[]; donVi?: (n: number) => string }) {
  const max = Math.max(...ds.map((d) => d.giaTri), 1)
  return (
    <div className="space-y-1.5">
      {ds.map((d) => (
        <div key={d.khoa} className="group grid grid-cols-[minmax(0,38%)_1fr] sm:grid-cols-[minmax(0,13rem)_1fr] items-center gap-2 text-xs" title={`${d.ten}${d.phu ? ` (${d.phu})` : ''}: ${formatMoney(d.giaTri)} đ${d.ghiChu ? ` · ${d.ghiChu}` : ''}`}>
          <div className="min-w-0 text-right">
            <div className="truncate text-slate-700">{d.ten}</div>
            {d.phu && <div className="truncate text-[10px] text-slate-400">{d.phu}</div>}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 rounded-r group-hover:opacity-80" style={{ width: `${Math.max((d.giaTri / max) * 82, 0.5)}%`, background: d.mo ? '#b9b8b2' : MAU.mot }} />
            <span className="whitespace-nowrap font-medium text-slate-700">{donVi(d.giaTri)}</span>
            {d.ghiChu && <span className="whitespace-nowrap text-slate-400">· {d.ghiChu}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
