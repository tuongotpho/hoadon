import { useMemo, useState } from 'react'
import { dossiersToCsv } from '../lib/csv'
import { fmtDate, today } from '../lib/dates'
import { sapXep, XEP_MAC_DINH, type CachXep, type KieuXep } from '../lib/status'
import { docLaiHoSoTrong, emptyDossier, filesToInvoices, laHoSoTrong } from '../lib/dossierOps'
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
import SuaNgayHangLoat from './SuaNgayHangLoat'
import { banDoThayThe } from '../lib/thayThe'
import { TagChips } from './TagChips'
import { bao, hoi } from '../lib/dialog'

// Ô trạng thái ở đầu trang (bỏ "Chưa có hóa đơn" theo yêu cầu — hồ sơ chưa có HĐ vẫn hiện ở bộ lọc "Tất cả")
const ORDER: StatusKey[] = ['choLamHs', 'choNop', 'choKt', 'daTt']

export default function DossierList({ onOpen }: { onOpen: (id: string) => void }) {
  const list = useDossiers()
  const settings = useSettings()
  const [filter, setFilter] = useState<StatusKey | 'all' | 'chuaXong' | 'cu'>('chuaXong')
  const [nhapCu, setNhapCu] = useState(false)
  const [chon, setChon] = useState<Set<string>>(new Set()) // hồ sơ đang được chọn (để xóa hàng loạt)
  const [dangLam, setDangLam] = useState('') // tiến độ xóa / đọc lại
  const [suaNgay, setSuaNgay] = useState(false)
  // cách xếp: mặc định ngày HĐ mới nhất trên cùng; nhớ lựa chọn cho lần mở sau (chỉ trên máy này)
  const [xep, setXepState] = useState<CachXep>(() => {
    try {
      return { ...XEP_MAC_DINH, ...JSON.parse(localStorage.getItem('hoadon-xep') ?? '{}') }
    } catch {
      return XEP_MAC_DINH
    }
  })
  const setXep = (c: CachXep) => {
    setXepState(c)
    try {
      localStorage.setItem('hoadon-xep', JSON.stringify(c))
    } catch {}
  }
  // bấm tiêu đề cột: cùng cột thì đảo chiều, cột khác thì xếp giảm dần
  const bamCot = (theo: KieuXep) => setXep(xep.theo === theo ? { theo, giam: !xep.giam } : { theo, giam: true })
  const muiTen = (theo: KieuXep) => (xep.theo === theo ? (xep.giam ? ' ▼' : ' ▲') : '')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const thayThe = useMemo(() => banDoThayThe(list ?? []), [list])

  const stats = useMemo(() => {
    const m = Object.fromEntries(ORDER.map((k) => [k, { n: 0, tien: 0 }])) as Record<StatusKey, { n: number; tien: number }>
    for (const d of list ?? []) {
      const s = statusOf(d)
      if (!m[s]) continue // trạng thái không có ô (chưa có hóa đơn)
      m[s].n++
      m[s].tien += totalOf(d)
    }
    return m
  }, [list])

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const loc = (list ?? []).filter((d) => {
      const s = statusOf(d)
      if (filter === 'chuaXong' && s === 'daTt') return false
      if (filter === 'cu' && !d.hoSoCu) return false
      if (filter !== 'all' && filter !== 'chuaXong' && filter !== 'cu' && s !== filter) return false
      if (!kw) return true
      const hay = [d.noiDung, d.soToTrinh, d.soDntt, ...(d.tags ?? []).map((t) => `#${t}`), ...d.invoices.flatMap((i) => [i.soHd, i.tenNguoiBan, i.mstNguoiBan])]
        .join(' ')
        .toLowerCase()
      return hay.includes(kw)
    })
    return sapXep(loc, xep)
  }, [list, filter, q, xep])

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

  const soTrong = (list ?? []).filter(laHoSoTrong).length

  async function xoaDaChon() {
    const ds = (list ?? []).filter((d) => chon.has(d.id))
    const ok = await hoi(
      `Xóa HẲN ${ds.length} hồ sơ đã chọn cùng file hóa đơn đính kèm?
Tổng tiền: ${formatMoney(ds.reduce((a, d) => a + totalOf(d), 0))} đ

Không lấy lại được (trừ khi có bản sao lưu .zip).`,
      { okLabel: `Xóa ${ds.length} hồ sơ`, nguyHiem: true },
    )
    if (!ok) return
    let n = 0
    for (const d of ds) {
      setDangLam(`Đang xóa ${++n}/${ds.length}…`)
      await store.deleteDossier(d.id)
    }
    setChon(new Set())
    setDangLam('')
    void bao(`Đã xóa ${ds.length} hồ sơ.`)
  }

  async function docLai() {
    try {
      const kq = await docLaiHoSoTrong((x, t) => setDangLam(`Đang đọc lại ${x}/${t} hồ sơ…`))
      setDangLam('')
      const ok = kq.filter((k) => !k.loi)
      const loi = kq.filter((k) => k.loi)
      const trung = kq.filter((k) => k.trungVoi)
      const dong = [`Đã đọc lại ${ok.length}/${kq.length} hồ sơ · ${formatMoney(ok.reduce((a, k) => a + k.tongTien, 0))} đ`]
      if (trung.length) {
        dong.push(`⚠ ${trung.length} hồ sơ TRÙNG (cùng số + ngày + MST) với hồ sơ đã có — xem và xóa bớt: ${trung.map((k) => 'HĐ ' + k.soHd).join(', ')}`)
      }
      if (loi.length) dong.push(`⚠ Chưa đọc được ${loi.length}:`, ...loi.map((k) => `• ${k.tenFile}: ${k.loi}`))
      void bao(dong.join('\n'))
    } catch (e) {
      setDangLam('')
      void bao((e as Error).message)
    }
  }

  if (nhapCu) return <NhapHoaDonCu onClose={() => setNhapCu(false)} onOpen={onOpen} />

  if (!list) return <p className="text-slate-500">Đang tải…</p>

  return (
    <div className="space-y-4">
      {/* Thẻ tổng hợp theo trạng thái */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
        <select
          className="inp w-auto"
          title="Thứ tự hiển thị"
          value={`${xep.theo}-${xep.giam ? 'giam' : 'tang'}`}
          onChange={(e) => {
            const [theo, chieu] = e.target.value.split('-')
            setXep({ theo: theo as KieuXep, giam: chieu === 'giam' })
          }}
        >
          <option value="ngayHd-giam">Ngày HĐ: mới nhất trước</option>
          <option value="ngayHd-tang">Ngày HĐ: cũ nhất trước</option>
          <option value="tongTien-giam">Tiền: nhiều nhất trước</option>
          <option value="tongTien-tang">Tiền: ít nhất trước</option>
          <option value="capNhat-giam">Mới sửa gần đây</option>
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

      {soTrong > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            ⚠ Có <b>{soTrong} hồ sơ chưa có số tiền</b> (0 đ) nhưng file hóa đơn đã đính kèm — đọc lại từ file để điền tự động, không cần tải lên lại.
          </span>
          <button className="btn-primary !py-1" disabled={!!dangLam} onClick={docLai}>
            ↻ Đọc lại từ file đính kèm
          </button>
          <button className="text-xs hover:underline" onClick={() => setChon(new Set((list ?? []).filter(laHoSoTrong).map((d) => d.id)))}>
            Chọn hết các hồ sơ trống
          </button>
        </div>
      )}

      {(chon.size > 0 || dangLam) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-300 bg-blue-50 p-2.5 text-sm text-blue-900">
          {dangLam ? (
            <span className="font-medium">{dangLam}</span>
          ) : (
            <>
              <span>
                Đã chọn <b>{chon.size}</b> hồ sơ · {formatMoney((list ?? []).filter((d) => chon.has(d.id)).reduce((a, d) => a + totalOf(d), 0))} đ
              </span>
              <button className="text-xs hover:underline" onClick={() => setChon(new Set())}>
                Bỏ chọn
              </button>
              <button className="btn ml-auto !py-1" onClick={() => setSuaNgay(true)}>
                📅 Sửa ngày cho {chon.size} hồ sơ
              </button>
              <button className="btn-danger !bg-red-600 !py-1 !text-white" onClick={xoaDaChon}>
                🗑 Xóa {chon.size} hồ sơ đã chọn
              </button>
            </>
          )}
        </div>
      )}

      {suaNgay && <SuaNgayHangLoat ids={[...chon]} onClose={() => setSuaNgay(false)} />}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  title="Chọn tất cả hồ sơ đang hiển thị"
                  checked={shown.length > 0 && shown.every((d) => chon.has(d.id))}
                  onChange={(e) => setChon(e.target.checked ? new Set(shown.map((d) => d.id)) : new Set())}
                />
              </th>
              <th className="px-3 py-2">Nội dung</th>
              <th className="px-3 py-2">Hóa đơn</th>
              <th className="cursor-pointer select-none px-3 py-2 text-right hover:text-blue-700" title="Bấm để xếp theo tổng tiền" onClick={() => bamCot('tongTien')}>
                Tổng tiền{muiTen('tongTien')}
              </th>
              <th className="cursor-pointer select-none px-3 py-2 hover:text-blue-700" title="Bấm để đảo chiều: mới nhất / cũ nhất" onClick={() => bamCot('ngayHd')}>
                Ngày HĐ{muiTen('ngayHd')}
              </th>
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
                <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                  {list.length === 0 ? 'Chưa có hồ sơ nào. Kéo thả file hóa đơn vào ô phía trên để bắt đầu.' : 'Không có hồ sơ khớp bộ lọc.'}
                </td>
              </tr>
            )}
            {shown.map((d) => {
              const st = statusOf(d)
              const w = warningsOf(d, settings, thayThe)
              const wait = waitingDays(d)
              return (
                <tr key={d.id} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/50 ${chon.has(d.id) ? 'bg-blue-50' : ''}`} onClick={() => onOpen(d.id)}>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={chon.has(d.id)}
                      onChange={(e) => {
                        const n = new Set(chon)
                        if (e.target.checked) n.add(d.id)
                        else n.delete(d.id)
                        setChon(n)
                      }}
                    />
                  </td>
                  <td className="max-w-xs px-3 py-2">
                    <div className="truncate font-medium text-slate-800">
                      {d.hoSoCu && <span className="mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">HĐ cũ</span>}
                      <TagChips tags={d.tags} className="mr-1.5 align-middle" />{d.noiDung || (d.hoSoCu ? d.invoices[0]?.tenNguoiBan : '') || <i className="text-slate-400">(chưa đặt nội dung)</i>}
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
