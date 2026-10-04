import { useEffect, useRef, useState } from 'react'
import { fmtDate, today } from '../lib/dates'
import { fillTemplate } from '../lib/docx'
import { emptyInvoice, filesToInvoices } from '../lib/dossierOps'
import { downloadBlob, IS_APP, loadTemplate, rememberOption, safeFileName, TEMPLATE_INFO, useSettings } from '../lib/hooks'
import { canThongTinTk, duTruOf, duTruTuDong, tongTienChuOf, tongTienOf } from '../lib/rules'
import { formatMoney, moneyInWords } from '../lib/numberToWords'
import {
  firstInvoiceDate, STATUS_COLOR, STATUS_LABEL, statusOf, suggestDnttDate, suggestToTrinhDate, totalOf, warningsOf,
} from '../lib/status'
import { store } from '../lib/store'
import { buildTemplateData } from '../lib/tags'
import type { Dossier, Invoice, TemplateKind } from '../lib/types'
import ChoiceInput from './ChoiceInput'
import FileDrop from './FileDrop'
import InvoiceCard from './InvoiceCard'
import PreviewModal from './PreviewModal'
import MoneyInput from './MoneyInput'
import ThanhPhanEditor from './ThanhPhanEditor'
import { bao, hoi } from '../lib/dialog'

export default function DossierEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const settings = useSettings()
  const [d, setD] = useState<Dossier | null>(null)
  const [saved, setSaved] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [preview, setPreview] = useState<TemplateKind | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef<Dossier | null>(null)

  const [goiY, setGoiY] = useState<{ doiTac: string[]; donVi: string[] }>({ doiTac: [], donVi: [] })

  useEffect(() => {
    store.getDossier(id).then((x) => setD(x ?? null))
    // gợi ý từ các hồ sơ cũ: đơn vị làm việc, tên đơn vị tham gia
    store.listDossiers().then((all) => {
      const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]
      setGoiY({ doiTac: uniq(all.map((x) => x.doiTac)), donVi: uniq(all.flatMap((x) => x.thanhPhan.map((t) => t.donVi))) })
    })
  }, [id])

  // Tự lưu sau mỗi lần sửa (chờ 400ms cho gõ xong)
  function update(next: Dossier) {
    const v = { ...next, updatedAt: Date.now() }
    setD(v)
    latest.current = v
    setSaved(false)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      await store.saveDossier(v)
      setSaved(true)
    }, 400)
  }

  // Rời màn hình khi chưa kịp lưu -> lưu ngay
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (latest.current) store.saveDossier(latest.current)
    },
    [],
  )

  if (!d) return <p className="text-slate-500">Đang tải…</p>

  const set = <K extends keyof Dossier>(k: K, v: Dossier[K]) => update({ ...d, [k]: v })

  function setInvoices(invoices: Invoice[]) {
    const next = { ...d!, invoices }
    // có ngày hóa đơn rồi mà chưa có ngày tờ trình -> tự gợi ý
    if (!next.ngayToTrinh) next.ngayToTrinh = suggestToTrinhDate(next, settings)
    update(next)
  }

  async function addInvoiceFiles(files: File[]) {
    const { invoices, errors, notes } = await filesToInvoices(files)
    const msg = [...notes, ...errors.map((e) => '⚠ ' + e)]
    if (msg.length) void bao(msg.join('\n'))
    const next = { ...d!, invoices: [...d!.invoices, ...invoices] }
    if (!next.ngayToTrinh) next.ngayToTrinh = suggestToTrinhDate(next, settings)
    update(next)
  }

  async function removeInvoice(idx: number) {
    const inv = d!.invoices[idx]
    if (!(await hoi(`Xóa hóa đơn ${inv.soHd || idx + 1} cùng các file đính kèm?`))) return
    for (const fid of inv.fileIds) await store.deleteFile(fid)
    setInvoices(d!.invoices.filter((_, i) => i !== idx))
  }

  // Chưa có ngày thì lấy ngày gợi ý, để giấy in ra có ngày (dùng chung cho xuất file và xem trước)
  function withDates(x: Dossier, kinds: TemplateKind[]): Dossier {
    let cur = x
    if (kinds.includes('toTrinh') && !cur.ngayToTrinh) cur = { ...cur, ngayToTrinh: suggestToTrinhDate(cur, settings) }
    if (kinds.includes('dntt') && !cur.ngayDntt) cur = { ...cur, ngayDntt: suggestDnttDate(cur) }
    return cur
  }

  async function exportDocs(kinds: TemplateKind[]) {
    setExporting(true)
    try {
      const cur = withDates(d!, kinds)
      if (cur !== d) update(cur)

      const data = buildTemplateData(cur, settings)
      const tail = safeFileName([cur.noiDung, cur.invoices.map((i) => i.soHd).filter(Boolean).join('-')].filter(Boolean).join(' - '))
      for (const k of kinds) {
        const tpl = await loadTemplate(k)
        const blob = fillTemplate(tpl.buf, data)
        downloadBlob(blob, `${TEMPLATE_INFO[k].tenFile}${tail ? ' - ' + tail : ''}.docx`)
      }
    } catch (e) {
      void bao('Lỗi khi xuất file:\n' + (e as Error).message + '\n\nKiểm tra lại mẫu ở trang "Mẫu in".')
    } finally {
      setExporting(false)
    }
  }

  async function del() {
    if (!(await hoi('Xóa hẳn hồ sơ này cùng toàn bộ file hóa đơn đính kèm?'))) return
    window.clearTimeout(timer.current)
    latest.current = null
    await store.deleteDossier(d!.id)
    onClose()
  }

  const st = statusOf(d)
  const warnings = warningsOf(d, settings)
  const total = totalOf(d)
  const hd = firstInvoiceDate(d)

  // Hàm thường (không phải component) để ô nhập không bị dựng lại mỗi lần gõ
  const dateRow = (
    label: string, field: keyof Dossier, so?: keyof Dossier, suggest?: () => string, hint?: string,
  ) => (
    <div className="border-t border-slate-100 pt-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {suggest && (
          <button className="ml-auto text-xs text-blue-600 hover:underline" onClick={() => set(field, suggest() as never)}>
            {hint}
          </button>
        )}
        {d[field] && (
          <button className={`text-xs text-slate-400 hover:text-red-600 ${suggest ? '' : 'ml-auto'}`} onClick={() => set(field, '' as never)}>
            xóa
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <input type="date" className="inp" value={d[field] as string} onChange={(e) => set(field, e.target.value as never)} />
        {so && (
          <input className="inp" placeholder="Số văn bản" value={d[so] as string} onChange={(e) => set(so, e.target.value as never)} />
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" onClick={onClose}>
          ← Danh sách
        </button>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[st]}`}>{STATUS_LABEL[st]}</span>
        <span className="text-xs text-slate-400">{saved ? '✓ Đã lưu' : 'Đang lưu…'}</span>
        <button className="btn-danger ml-auto" onClick={del}>
          Xóa hồ sơ
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          {/* 1. Nội dung */}
          <section className="card space-y-3">
            <h2 className="font-semibold text-slate-800">1. Nội dung công việc</h2>
            <div>
              <label className="lbl">Nội dung (dùng cho tờ trình "- Nội dung: …" và "Nội dung thanh toán: …")</label>
              <input className="inp" value={d.noiDung} onChange={(e) => set('noiDung', e.target.value)} placeholder="Ví dụ: Làm việc với Công ty Điện lực Hưng Yên về công tác CBM năm 2026" />
            </div>
            <div>
              <label className="lbl">Người đề nghị thanh toán</label>
              <ChoiceInput
                value={d.nguoiDeNghi}
                onChange={(v) => set('nguoiDeNghi', v)}
                options={settings.dsNguoiDeNghi}
                onRemember={(v) => rememberOption('dsNguoiDeNghi', v)}
                placeholder="Chọn bên dưới hoặc gõ tên mới"
              />
            </div>
            <div>
              <label className="lbl">Nhiệm vụ — "Thực hiện nhiệm vụ Công ty giao phòng Kỹ thuật An toàn trong việc <b>…</b> của Công ty"</label>
              <ChoiceInput
                value={d.nhiemVu}
                onChange={(v) => set('nhiemVu', v)}
                options={settings.dsNhiemVu}
                onRemember={(v) => rememberOption('dsNhiemVu', v)}
                placeholder="Chọn bên dưới hoặc gõ mới"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="lbl">Đơn vị đến làm việc ("nội dung làm việc với …")</label>
                <input className="inp" list="ds-doi-tac" value={d.doiTac} onChange={(e) => set('doiTac', e.target.value)} placeholder="Công ty Điện lực Hưng Yên" />
                <datalist id="ds-doi-tac">
                  {goiY.doiTac.map((x) => <option key={x} value={x} />)}
                </datalist>
              </div>
              <div>
                <label className="lbl">Số tiền dự trù trong tờ trình</label>
                {d.duTru ? (
                  <>
                    <MoneyInput value={d.duTru} onChange={(n) => set('duTru', n)} />
                    <div className="mt-0.5 text-xs text-slate-500">
                      Đang gõ tay ·{' '}
                      <button className="text-blue-600 hover:underline" onClick={() => set('duTru', 0)}>
                        về tự động ({formatMoney(duTruTuDong(d, settings))})
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="inp bg-slate-50 text-right font-semibold">{formatMoney(duTruTuDong(d, settings))}</div>
                      <button className="btn shrink-0" onClick={() => set('duTru', duTruTuDong(d, settings))}>
                        Sửa
                      </button>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Tự động: HĐ {tongTienOf(d) < settings.nguongTien ? 'dưới' : 'từ'} {formatMoney(settings.nguongTien)} đ
                    </div>
                  </>
                )}
                <div className="text-xs italic text-slate-500">{moneyInWords(duTruOf(d, settings), true)}</div>
              </div>
            </div>
            <div>
              <label className="lbl">Ghi chú riêng (không in)</label>
              <input className="inp" value={d.ghiChu} onChange={(e) => set('ghiChu', e.target.value)} />
            </div>
          </section>

          <section className="card">
            <h2 className="mb-2 font-semibold text-slate-800">2. Thành phần tham gia</h2>
            <ThanhPhanEditor value={d.thanhPhan} onChange={(v) => set('thanhPhan', v)} currentId={d.id} goiYDonVi={goiY.donVi} />
          </section>

          {/* 3. Hóa đơn */}
          <section className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">3. Hóa đơn ({d.invoices.length})</h2>
              <button className="btn" onClick={() => setInvoices([...d.invoices, emptyInvoice()])}>
                + Nhập tay 1 hóa đơn
              </button>
            </div>
            {d.invoices.map((inv, i) => (
              <InvoiceCard
                key={inv.id}
                index={i}
                inv={inv}
                onChange={(x) => setInvoices(d.invoices.map((y, j) => (j === i ? x : y)))}
                onRemove={() => removeInvoice(i)}
                canTk={canThongTinTk(d, settings)}
              />
            ))}
            <FileDrop onFiles={addInvoiceFiles} accept=".xml,.pdf,image/*">
              Kéo thả thêm file hóa đơn (XML / PDF / ảnh) vào đây
            </FileDrop>
          </section>
        </div>

        <div className="space-y-4">
          {/* Tổng tiền */}
          <section className="card">
            <div className="text-xs text-slate-500">Tổng tiền thanh toán</div>
            <div className="text-2xl font-bold text-slate-800">{formatMoney(total)} đ</div>
            <div className="mt-1 text-xs italic text-slate-600">{tongTienChuOf(d)}</div>
            {d.invoices.length === 1 && d.invoices[0].tienBangChu && <div className="text-[11px] text-slate-400">(chữ lấy nguyên văn trên hóa đơn)</div>}
          </section>

          {/* 3. Xuất file */}
          <section className="card space-y-2">
            <h2 className="font-semibold text-slate-800">4. Xuất file để in</h2>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn justify-center" onClick={() => setPreview('toTrinh')}>
                👁 Xem tờ trình
              </button>
              <button className="btn justify-center" onClick={() => setPreview('dntt')}>
                👁 Xem đề nghị TT
              </button>
            </div>
            <button className="btn-primary w-full justify-center" disabled={exporting} onClick={() => exportDocs(['toTrinh', 'dntt'])}>
              ⬇ Xuất cả 2 file Word
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn justify-center" disabled={exporting} onClick={() => exportDocs(['toTrinh'])}>
                Tờ trình
              </button>
              <button className="btn justify-center" disabled={exporting} onClick={() => exportDocs(['dntt'])}>
                Đề nghị TT
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {IS_APP
                ? 'File cất vào Documents\Hoa don xuat và tự mở bằng Word. Kiểm tra lại rồi in.'
                : 'File tải về thư mục Downloads. Mở bằng Word, kiểm tra lại rồi in.'}
            </p>
          </section>

          {/* 4. Mốc thời gian */}
          <section className="card space-y-3">
            <h2 className="font-semibold text-slate-800">5. Theo dõi ngày</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Ngày hóa đơn</span>
              <span className="ml-auto text-sm">{hd ? fmtDate(hd) : <i className="text-slate-400">chưa có</i>}</span>
            </div>
            {dateRow('Tờ trình xin chủ trương', 'ngayToTrinh', 'soToTrinh', () => suggestToTrinhDate(d, settings),
              `↺ lùi ${settings.soNgayToTrinhTruocHd} ngày làm việc trước HĐ`)}
            {dateRow('Đề nghị thanh toán', 'ngayDntt', 'soDntt', () => suggestDnttDate(d), '↺ hôm nay')}
            {dateRow('Nộp kế toán', 'ngayNopKeToan', undefined, today, 'Hôm nay')}
            {dateRow('Kế toán thanh toán', 'ngayKeToanTt', undefined, today, 'Hôm nay')}
          </section>
        </div>
      </div>
      {preview && (
        <PreviewModal
          dossier={withDates(d, ['toTrinh', 'dntt'])}
          settings={settings}
          initial={preview}
          onClose={() => setPreview(null)}
          onExport={(k) => exportDocs(k)}
        />
      )}
    </div>
  )
}
