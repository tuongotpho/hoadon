import { useMemo, useState } from 'react'
import { dossiersToCsv } from '../lib/csv'
import { fmtDate, today } from '../lib/dates'
import { emptyDossier, filesToInvoices } from '../lib/dossierOps'
import { downloadBlob, useDossiers, useSettings } from '../lib/hooks'
import { formatMoney } from '../lib/numberToWords'
import {
  firstInvoiceDate, STATUS_COLOR, STATUS_LABEL, statusOf, suggestToTrinhDate, totalOf, waitingDays, warningsOf,
  type StatusKey,
} from '../lib/status'
import { store } from '../lib/store'
import type { Dossier } from '../lib/types'
import FileDrop from './FileDrop'
import NhapHoaDonCu from './NhapHoaDonCu'
import { banDoThayThe } from '../lib/thayThe'
import { bao } from '../lib/dialog'

const ORDER: StatusKey[] = ['chuaHd', 'choLamHs', 'choNop', 'choKt', 'daTt']

export default function DossierList({ onOpen }: { onOpen: (id: string) => void }) {
  const list = useDossiers()
  const settings = useSettings()
  const [filter, setFilter] = useState<StatusKey | 'all' | 'chuaXong' | 'cu'>('chuaXong')
  const [nhapCu, setNhapCu] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const thayThe = useMemo(() => banDoThayThe(list ?? []), [list])

  const stats = useMemo(() => {
    const m = Object.fromEntries(ORDER.map((k) => [k, { n: 0, tien: 0 }])) as Record<StatusKey, { n: number; tien: number }>
    for (const d of list ?? []) {
      const s = statusOf(d)
      m[s].n++
      m[s].tien += totalOf(d)
    }
    return m
  }, [list])

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return (list ?? []).filter((d) => {
      const s = statusOf(d)
      if (filter === 'chuaXong' && s === 'daTt') return false
      if (filter === 'cu' && !d.hoSoCu) return false
      if (filter !== 'all' && filter !== 'chuaXong' && filter !== 'cu' && s !== filter) return false
      if (!kw) return true
      const hay = [d.noiDung, d.soToTrinh, d.soDntt, ...d.invoices.flatMap((i) => [i.soHd, i.tenNguoiBan, i.mstNguoiBan])]
        .join(' ')
        .toLowerCase()
      return hay.includes(kw)
    })
  }, [list, filter, q])

  async function createNew(files: File[] = []) {
    setBusy(true)
    try {
      const d = emptyDossier()
      // người đề nghị / nhiệm vụ: lấy theo hồ sơ gần nhất, chưa có thì lấy cái đầu danh sách
      d.nguoiDeNghi = list?.[0]?.nguoiDeNghi || settings.dsNguoiDeNghi[0] || ''
      d.nhiemVu = list?.[0]?.nhiemVu || settings.dsNhiemVu[0] || ''
      if (files.length) {
        const { invoices, errors, notes } = await filesToInvoices(files)
        d.invoices = invoices
        d.ngayToTrinh = suggestToTrinhDate(d, settings)
        const msg = [...notes, ...errors.map((e) => '⚠ ' + e)]
        if (msg.length) void bao(msg.join('\n'))
      }
      await store.saveDossier(d)
      onOpen(d.id)
    } finally {
      setBusy(false)
    }
  }

  async function quickSet(d: Dossier, field: 'ngayNopKeToan' | 'ngayKeToanTt') {
    await store.saveDossier({ ...d, [field]: today(), updatedAt: Date.now() })
  }

  if (nhapCu) return <NhapHoaDonCu onClose={() => setNhapCu(false)} onOpen={onOpen} />

  if (!list) return <p className="text-slate-500">Đang tải…</p>

  return (
    <div className="space-y-4">
      {/* Thẻ tổng hợp theo trạng thái */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {ORDER.map((k) => (
          <button
            key={k}
            onClick={() => setFilter(filter === k ? 'chuaXong' : k)}
            className={`card text-left transition hover:border-blue-400 ${filter === k ? 'ring-2 ring-blue-500' : ''}`}
          >
            <div className="text-xs font-medium text-slate-500">{STATUS_LABEL[k]}</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{stats[k].n}</div>
            <div className="text-xs text-slate-500">{formatMoney(stats[k].tien)} đ</div>
          </button>
        ))}
      </div>

      <FileDrop onFiles={(f) => createNew(f)} accept=".xml,.pdf,image/*">
        {busy ? (
          'Đang đọc hóa đơn…'
        ) : (
          <>
            <b className="text-blue-700">Kéo thả file hóa đơn vào đây</b> (hoặc bấm để chọn) để tạo hồ sơ mới.
            <div className="mt-1 text-xs text-slate-500">
              File <b>XML</b> hóa đơn điện tử sẽ được tự điền thông tin. File PDF / ảnh được đính kèm để nhập tay. Chọn nhiều
              file cùng lúc = nhiều hóa đơn trong 1 hồ sơ.
            </div>
          </>
        )}
      </FileDrop>

      <div className="flex flex-wrap items-center gap-2">
        <input className="inp max-w-xs" placeholder="Tìm nội dung, số HĐ, người bán…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="inp w-auto" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="chuaXong">Chưa thanh toán xong</option>
          <option value="all">Tất cả</option>
          <option value="cu">Hóa đơn cũ (nhập vào kho)</option>
          {ORDER.map((k) => (
            <option key={k} value={k}>
              {STATUS_LABEL[k]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => downloadBlob(dossiersToCsv(shown), `So theo doi hoa don ${today()}.csv`)}>
            ⬇ Xuất Excel
          </button>
          <button className="btn" onClick={() => setNhapCu(true)} title="Thả nhiều hóa đơn cũ vào kho, chỉ cần số tiền + tình trạng thanh toán">
            📥 Nhập hóa đơn cũ
          </button>
          <button className="btn-primary" onClick={() => createNew()} disabled={busy}>
            + Hồ sơ mới (nhập tay)
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Nội dung</th>
              <th className="px-3 py-2">Hóa đơn</th>
              <th className="px-3 py-2 text-right">Tổng tiền</th>
              <th className="px-3 py-2">Ngày HĐ</th>
              <th className="px-3 py-2">Tờ trình</th>
              <th className="px-3 py-2">ĐNTT</th>
              <th className="px-3 py-2">Nộp KT</th>
              <th className="px-3 py-2">KT thanh toán</th>
              <th className="px-3 py-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  {list.length === 0 ? 'Chưa có hồ sơ nào. Kéo thả file hóa đơn vào ô phía trên để bắt đầu.' : 'Không có hồ sơ khớp bộ lọc.'}
                </td>
              </tr>
            )}
            {shown.map((d) => {
              const st = statusOf(d)
              const w = warningsOf(d, settings, thayThe)
              const wait = waitingDays(d)
              return (
                <tr key={d.id} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/50" onClick={() => onOpen(d.id)}>
                  <td className="max-w-xs px-3 py-2">
                    <div className="truncate font-medium text-slate-800">
                      {d.hoSoCu && <span className="mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">HĐ cũ</span>}
                      {d.noiDung || (d.hoSoCu ? d.invoices[0]?.tenNguoiBan : '') || <i className="text-slate-400">(chưa đặt nội dung)</i>}
                    </div>
                    {w.length > 0 && <div className="truncate text-xs text-red-600" title={w.join('\n')}>⚠ {w[0]}{w.length > 1 && ` (+${w.length - 1})`}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {d.invoices.length === 0 ? '—' : d.invoices.map((i) => i.soHd || '?').join(', ')}
                    <div className="max-w-[12rem] truncate text-slate-400">{d.invoices[0]?.tenNguoiBan}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatMoney(totalOf(d))}</td>
                  <td className="px-3 py-2">{fmtDate(firstInvoiceDate(d))}</td>
                  <td className="px-3 py-2">{fmtDate(d.ngayToTrinh)}</td>
                  <td className="px-3 py-2">{fmtDate(d.ngayDntt)}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {d.ngayNopKeToan ? fmtDate(d.ngayNopKeToan) : st === 'choNop' ? (
                      <button className="text-xs text-blue-600 hover:underline" onClick={() => quickSet(d, 'ngayNopKeToan')}>
                        Đã nộp hôm nay
                      </button>
                    ) : ''}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {d.ngayKeToanTt ? fmtDate(d.ngayKeToanTt) : st === 'choKt' ? (
                      <button className="text-xs text-blue-600 hover:underline" onClick={() => quickSet(d, 'ngayKeToanTt')}>
                        Đã nhận tiền hôm nay
                      </button>
                    ) : ''}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[st]}`}>{d.hoSoCu && st === 'choKt' ? 'Chưa thanh toán' : STATUS_LABEL[st]}</span>
                    {wait != null && wait > 0 && <div className="mt-0.5 text-xs text-slate-400">chờ {wait} ngày</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
