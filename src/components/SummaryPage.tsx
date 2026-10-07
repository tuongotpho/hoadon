import { useMemo, useRef, useState } from 'react'
import { invoicesToCsv } from '../lib/csv'
import { fmtDate, today } from '../lib/dates'
import { downloadBlob, useDossiers, useSettings } from '../lib/hooks'
import { formatMoney } from '../lib/numberToWords'
import { STATUS_COLOR, STATUS_LABEL, waitingDays, warningsOf } from '../lib/status'
import { banDoThayThe } from '../lib/thayThe'
import { KHONG_TAG, TAG_MAC_DINH } from '../lib/hashtag'
import { avgDurations, byCo, byMonth, bySeller, byTag, byYear, coTag, flattenInvoices, khoaNguoiBan, topVaKhac, yearsOf, type InvoiceRow } from '../lib/summary'
import { BieuDoCotChong, BieuDoThanh, trieu } from './BieuDo'
import { TagChips } from './TagChips'

const money = (n: number) => (n ? formatMoney(n) : '—')

function Tile({ label, value, sub, tone = 'text-slate-800' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export default function SummaryPage({ onOpen }: { onOpen: (id: string) => void }) {
  const list = useDossiers()
  const settings = useSettings()
  const allRows = useMemo(() => flattenInvoices(list ?? []), [list])
  const years = useMemo(() => {
    const ys = yearsOf(allRows)
    const now = Number(today().slice(0, 4))
    return ys.includes(now) ? ys : [now, ...ys]
  }, [allRows])
  const [year, setYear] = useState<number | 'all'>(Number(today().slice(0, 4)))
  const [month, setMonth] = useState<number | 'all'>('all')
  const [q, setQ] = useState('')
  // Lọc theo người bán: bấm vào thanh trong biểu đồ "Theo người bán" (bấm lại / ✕ để bỏ)
  const [nguoiBan, setNguoiBan] = useState<string | null>(null)
  const bangKeRef = useRef<HTMLDivElement>(null)

  // Hóa đơn của kỳ đang xem (năm / tháng / từ khoá) — CHƯA lọc người bán: dùng để xếp hạng người bán
  const rowsKy = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return allRows.filter((r) => {
      if (year !== 'all' && Number(r.inv.ngayHd.slice(0, 4)) !== year) return false
      if (month !== 'all' && Number(r.inv.ngayHd.slice(5, 7)) !== month) return false
      if (!kw) return true
      return [r.inv.soHd, r.inv.tenNguoiBan, r.inv.mstNguoiBan, r.d.noiDung].join(' ').toLowerCase().includes(kw)
    })
  }, [allRows, year, month, q])
  // Lọc theo hashtag công việc: bấm vào thanh trong biểu đồ "Theo việc"
  const [tag, setTag] = useState<string | null>(null)
  const hopNb = (r: InvoiceRow) => !nguoiBan || khoaNguoiBan(r.inv) === nguoiBan
  const hopTag = (r: InvoiceRow) => !tag || coTag(r.d, tag)
  // Mỗi biểu đồ xếp hạng theo bộ lọc của biểu đồ KIA (không tự lọc chính nó) — để đổi lựa chọn dễ
  const rowsChoNguoiBan = useMemo(() => rowsKy.filter(hopTag), [rowsKy, tag]) // eslint-disable-line react-hooks/exhaustive-deps
  const rowsChoTag = useMemo(() => rowsKy.filter(hopNb), [rowsKy, nguoiBan]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => rowsKy.filter((r) => hopNb(r) && hopTag(r)), [rowsKy, nguoiBan, tag]) // eslint-disable-line react-hooks/exhaustive-deps
  // biểu đồ tháng / năm cũng chỉ tính người bán + tag đang chọn
  const allRowsNb = useMemo(() => allRows.filter((r) => hopNb(r) && hopTag(r)), [allRows, nguoiBan, tag]) // eslint-disable-line react-hooks/exhaustive-deps
  const tenNguoiBan = nguoiBan ? (allRows.find((r) => khoaNguoiBan(r.inv) === nguoiBan)?.inv.tenNguoiBan || nguoiBan) : ''
  const tagStats = useMemo(() => byTag(rowsChoTag), [rowsChoTag])
  const nhieuTag = rowsChoTag.some((r) => (r.d.tags?.length ?? 0) > 1)

  const cuonToiBangKe = () => setTimeout(() => bangKeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  function chonNguoiBan(khoa: string) {
    const bo = nguoiBan === khoa
    setNguoiBan(bo ? null : khoa)
    if (!bo) cuonToiBangKe()
  }
  function chonTag(ma: string) {
    const bo = tag === ma
    setTag(bo ? null : ma)
    if (!bo) cuonToiBangKe()
  }

  const totals = useMemo(() => {
    const t = { n: rows.length, tong: 0, daTt: 0, choKt: 0, chuaNop: 0, nChoKt: 0, nChuaNop: 0 }
    for (const r of rows) {
      const v = r.inv.tongTien || 0
      t.tong += v
      if (r.status === 'daTt') t.daTt += v
      else if (r.status === 'choKt') {
        t.choKt += v
        t.nChoKt++
      } else {
        t.chuaNop += v
        t.nChuaNop++
      }
    }
    return t
  }, [rows])

  const months = useMemo(() => (year === 'all' ? null : byMonth(allRowsNb, year)), [allRowsNb, year])
  const allSellers = useMemo(() => bySeller(rowsChoNguoiBan), [rowsChoNguoiBan])
  const sellers = allSellers.slice(0, 10)
  const years10 = useMemo(() => (year === 'all' ? byYear(allRowsNb) : null), [allRowsNb, year])
  const coHd = useMemo(() => byCo(rows, [2e6, settings.nguongTien, 10e6, 20e6].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)), [rows, settings.nguongTien])
  const durations = useMemo(() => avgDurations([...new Set(rows.map((r) => r.d))]), [rows])

  // Việc cần xử lý: hồ sơ còn dở, có cảnh báo hoặc chờ lâu (không phụ thuộc bộ lọc)
  const todo = useMemo(() => {
    const thayThe = banDoThayThe(list ?? []) // lập 1 lần cho cả kho
    return (list ?? [])
      .map((d) => ({ d, w: warningsOf(d, settings, thayThe), wait: waitingDays(d) ?? 0 }))
      .filter((x) => x.w.length > 0 || x.wait > 7)
      .sort((a, b) => b.wait - a.wait)
  }, [list, settings])

  if (!list) return <p className="text-slate-500">Đang tải…</p>

  const kyLabel = year === 'all' ? 'tất cả các năm' : month === 'all' ? `năm ${year}` : `tháng ${month}/${year}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-semibold text-slate-800">Tổng hợp hóa đơn {kyLabel}</h2>
        <select className="inp w-auto" value={year} onChange={(e) => { setYear(e.target.value === 'all' ? 'all' : Number(e.target.value)); setMonth('all') }}>
          {years.map((y) => <option key={y} value={y}>Năm {y}</option>)}
          <option value="all">Tất cả các năm</option>
        </select>
        {year !== 'all' && (
          <select className="inp w-auto" value={month} onChange={(e) => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">Cả năm</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>Tháng {i + 1}</option>)}
          </select>
        )}
        {nguoiBan && (
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 py-1 pl-3 pr-1 text-sm text-blue-900">
            <span className="truncate">Người bán: <b>{tenNguoiBan}</b></span>
            <button className="rounded-full px-1.5 text-blue-500 hover:bg-blue-100 hover:text-blue-800" title="Bỏ lọc người bán" onClick={() => setNguoiBan(null)}>
              ✕
            </button>
          </span>
        )}
        {tag && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 py-1 pl-3 pr-1 text-sm text-blue-900">
            Việc: <b>{tag === KHONG_TAG ? tag : `#${tag}`}</b>
            <button className="rounded-full px-1.5 text-blue-500 hover:bg-blue-100 hover:text-blue-800" title="Bỏ lọc hashtag" onClick={() => setTag(null)}>
              ✕
            </button>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Tổng hóa đơn" value={`${totals.n} HĐ`} sub={`${formatMoney(totals.tong)} đ`} />
        <Tile label="Đã được thanh toán" value={`${formatMoney(totals.daTt)} đ`} tone="text-emerald-700"
          sub={totals.tong ? `${Math.round((totals.daTt / totals.tong) * 100)}% số tiền` : undefined} />
        <Tile label="Đã nộp, chờ kế toán" value={`${formatMoney(totals.choKt)} đ`} tone="text-blue-700" sub={`${totals.nChoKt} hóa đơn`} />
        <Tile label="Chưa nộp kế toán" value={`${formatMoney(totals.chuaNop)} đ`} tone="text-orange-700" sub={`${totals.nChuaNop} hóa đơn`} />
        <Tile
          label="Thời gian trung bình"
          value={durations.nopDenTt != null ? `${durations.nopDenTt} ngày` : '—'}
          sub={`từ nộp tới nhận tiền${durations.hdDenNop != null ? ` · HĐ→nộp: ${durations.hdDenNop} ngày` : ''}`}
        />
      </div>

      {todo.length > 0 && (
        <div className="card">
          <h3 className="mb-2 font-semibold text-slate-800">Cần xử lý ({todo.length})</h3>
          <div className="divide-y divide-slate-100">
            {todo.map(({ d, w, wait }) => (
              <button key={d.id} className="flex w-full items-start gap-3 py-1.5 text-left text-sm hover:bg-slate-50" onClick={() => onOpen(d.id)}>
                <span className="w-16 shrink-0 text-xs text-slate-400">{wait > 0 ? `chờ ${wait} ngày` : ''}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-800">{d.noiDung || '(chưa đặt nội dung)'}</span>
                  {w.length > 0 && <span className="block text-xs text-red-600">⚠ {w.join(' · ')}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {years10 && (
          <div className="card">
            <h3 className="mb-2 font-semibold text-slate-800">Theo năm</h3>
            <BieuDoCotChong
              ds={years10.map((y) => ({ khoa: y.nam, nhan: String(y.nam), tieuDe: `Năm ${y.nam}`, soHd: y.soHd, daTt: y.daTt, choKt: y.choKt, chuaNop: y.chuaNop }))}
              onChon={(nam) => setYear(nam)}
            />
            <p className="mt-1 text-xs text-slate-400">Bấm vào một năm để xem chi tiết từng tháng.</p>
          </div>
        )}

        {months && (
          <div className="card overflow-x-auto">
            <h3 className="mb-2 font-semibold text-slate-800">Theo tháng — năm {year}</h3>
            <BieuDoCotChong
              ds={months.map((m) => ({ khoa: m.thang, nhan: `T${m.thang}`, tieuDe: `Tháng ${m.thang}/${year}`, soHd: m.soHd, daTt: m.daTt, choKt: m.choKt, chuaNop: m.chuaNop }))}
              chon={month === 'all' ? undefined : month}
              onChon={(t) => setMonth(month === t ? 'all' : t)}
            />
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500">Xem bảng số</summary>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1">Tháng</th>
                  <th className="py-1 text-right">Số HĐ</th>
                  <th className="py-1 text-right">Tổng tiền</th>
                  <th className="py-1 text-right text-emerald-700">Đã TT</th>
                  <th className="py-1 text-right text-blue-700">Chờ KT</th>
                  <th className="py-1 text-right text-orange-700">Chưa nộp</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.thang}
                    className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/50 ${month === m.thang ? 'bg-blue-50' : ''} ${m.soHd ? '' : 'text-slate-300'}`}
                    onClick={() => setMonth(month === m.thang ? 'all' : m.thang)}>
                    <td className="py-1">Tháng {m.thang}</td>
                    <td className="py-1 text-right">{m.soHd || '—'}</td>
                    <td className="py-1 text-right font-medium">{money(m.tongTien)}</td>
                    <td className="py-1 text-right">{money(m.daTt)}</td>
                    <td className="py-1 text-right">{money(m.choKt)}</td>
                    <td className="py-1 text-right">{money(m.chuaNop)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="py-1">Cả năm</td>
                  <td className="py-1 text-right">{months.reduce((a, m) => a + m.soHd, 0)}</td>
                  <td className="py-1 text-right">{money(months.reduce((a, m) => a + m.tongTien, 0))}</td>
                  <td className="py-1 text-right">{money(months.reduce((a, m) => a + m.daTt, 0))}</td>
                  <td className="py-1 text-right">{money(months.reduce((a, m) => a + m.choKt, 0))}</td>
                  <td className="py-1 text-right">{money(months.reduce((a, m) => a + m.chuaNop, 0))}</td>
                </tr>
              </tbody>
            </table>
            </details>
            <p className="mt-1 text-xs text-slate-400">Bấm vào một tháng để lọc bảng kê bên dưới (bấm lại để bỏ lọc).</p>
          </div>
        )}

        <div className="card overflow-x-auto">
          <h3 className="mb-2 font-semibold text-slate-800">Theo người bán ({kyLabel})</h3>
          {sellers.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có hóa đơn.</p>
          ) : (
            <>
            <BieuDoThanh
              ds={(() => {
                const { top, khac } = topVaKhac(allSellers, 10)
                return [
                  ...top.map((s) => ({ khoa: s.khoa, ten: s.ten, phu: s.mst ? `MST ${s.mst}` : undefined, giaTri: s.tongTien, ghiChu: `${s.soHd} HĐ` })),
                  ...(khac ? [{ khoa: '__khac', ten: `${khac.soNguoi} người bán khác`, giaTri: khac.tongTien, ghiChu: `${khac.soHd} HĐ`, mo: true }] : []),
                ]
              })()}
              chon={nguoiBan ?? undefined}
              onChon={chonNguoiBan}
            />
            <p className="mt-1 text-xs text-slate-400">Bấm vào một người bán để xem các hóa đơn của họ (bấm lại để bỏ lọc).</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500">Xem bảng số (10 người bán nhiều nhất)</summary>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1">Người bán</th>
                  <th className="py-1 text-right">Số HĐ</th>
                  <th className="py-1 text-right">Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.khoa} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/50 ${nguoiBan === s.khoa ? 'bg-blue-50' : ''}`} onClick={() => chonNguoiBan(s.khoa)}>
                    <td className="py-1">
                      {s.ten}
                      {s.mst && <span className="block text-xs text-slate-400">MST {s.mst}</span>}
                    </td>
                    <td className="py-1 text-right">{s.soHd}</td>
                    <td className="py-1 text-right font-medium">{formatMoney(s.tongTien)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </details>
            </>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold text-slate-800">Theo việc — hashtag ({kyLabel})</h3>
          <p className="mb-2 text-xs text-slate-500">
            Gắn tag ở màn hình hồ sơ.{nhieuTag ? ' Hồ sơ nhiều tag được tính vào mỗi tag, nên cộng các dòng có thể lớn hơn tổng tiền.' : ''}
          </p>
          {tagStats.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có hóa đơn.</p>
          ) : (
            <>
              <BieuDoThanh
                ds={tagStats.map((t) => ({
                  khoa: t.ma,
                  ten: t.ma === KHONG_TAG ? t.ma : `#${t.ma}`,
                  phu: TAG_MAC_DINH.find((x) => x.ma === t.ma)?.ten,
                  giaTri: t.tongTien,
                  ghiChu: `${t.soHoSo} hồ sơ`,
                }))}
                chon={tag ?? undefined}
                onChon={chonTag}
              />
              <p className="mt-1 text-xs text-slate-400">Bấm vào một việc để xem các hóa đơn của việc đó (bấm lại để bỏ lọc).</p>
            </>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold text-slate-800">Theo cỡ hóa đơn ({kyLabel})</h3>
          <p className="mb-2 text-xs text-slate-500">
            Từ {trieu(settings.nguongTien)} trở lên: giấy ĐNTT phải in tài khoản người bán, dự trù {trieu(settings.duTruTuNguong)}.
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có hóa đơn.</p>
          ) : (
            <BieuDoThanh
              ds={coHd.map((c) => ({
                khoa: String(c.tu),
                ten: c.den == null ? `Từ ${trieu(c.tu)}` : c.tu === 0 ? `Dưới ${trieu(c.den)}` : `${trieu(c.tu)} – dưới ${trieu(c.den)}`,
                giaTri: c.tongTien,
                ghiChu: `${c.soHd} HĐ`,
              }))}
            />
          )}
        </div>
      </div>

      <div ref={bangKeRef} className="card scroll-mt-20 overflow-x-auto">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-800">Bảng kê hóa đơn ({rows.length}){tag && <span className="font-normal text-slate-500"> — {tag === KHONG_TAG ? tag : `#${tag}`}</span>}{nguoiBan && <span className="font-normal text-slate-500"> — {tenNguoiBan}</span>}</h3>
          <input className="inp max-w-xs" placeholder="Tìm số HĐ, người bán, MST, nội dung…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ml-auto" onClick={() => downloadBlob(invoicesToCsv(rows), `Bang ke hoa don ${kyLabel.replace(/\//g, '-')}${tag ? ` - ${tag === KHONG_TAG ? 'chua gan tag' : tag}` : ''}${nguoiBan ? ` - ${nguoiBan}` : ''}.csv`)}>
            ⬇ Xuất Excel
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-2 py-1.5">STT</th>
              <th className="px-2 py-1.5">Ngày HĐ</th>
              <th className="px-2 py-1.5">Ký hiệu / Số</th>
              <th className="px-2 py-1.5">Người bán</th>
              <th className="px-2 py-1.5 text-right">Tổng tiền</th>
              <th className="px-2 py-1.5">Nội dung</th>
              <th className="px-2 py-1.5">Nộp KT</th>
              <th className="px-2 py-1.5">KT thanh toán</th>
              <th className="px-2 py-1.5">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-6 text-center text-slate-400">Không có hóa đơn nào trong kỳ này.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.inv.id} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/50" onClick={() => onOpen(r.d.id)}>
                <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                <td className="px-2 py-1.5">{fmtDate(r.inv.ngayHd)}</td>
                <td className="px-2 py-1.5">{r.inv.kyHieu} / <b>{r.inv.soHd}</b></td>
                <td className="max-w-[14rem] truncate px-2 py-1.5">{r.inv.tenNguoiBan}</td>
                <td className="px-2 py-1.5 text-right font-medium">{formatMoney(r.inv.tongTien)}</td>
                <td className="max-w-[18rem] truncate px-2 py-1.5 text-slate-600"><TagChips tags={r.d.tags} className="mr-1 align-middle" />{r.d.noiDung}</td>
                <td className="px-2 py-1.5">{fmtDate(r.d.ngayNopKeToan)}</td>
                <td className="px-2 py-1.5">{fmtDate(r.d.ngayKeToanTt)}</td>
                <td className="px-2 py-1.5">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t-2 border-slate-300 font-semibold">
                <td colSpan={4} className="px-2 py-1.5">Cộng</td>
                <td className="px-2 py-1.5 text-right">{formatMoney(totals.tong)}</td>
                <td colSpan={4} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
