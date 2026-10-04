import { parseInvoiceXml } from './invoiceXml'
import { moTaHangCam, timHangCam } from './hangCam'
import { banDoThayThe, biLienQuan, moTaBiLienQuan, moTaLienQuan } from './thayThe'
import { laBanNhap, parseInvoiceText } from './invoicePdf'
import { emptyDossier, emptyInvoice } from './model'
import { newId, store } from './store'
import type { Dossier, Invoice, StoredFile } from './types'

/** HỘ KINH DOANH NGUYỄN VĂN A -> HO KINH DOANH NGUYEN VAN A (kiểu tên tài khoản ngân hàng) */
export function toAccountName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tên tài khoản: ưu tiên tên anh đã sửa tay lần trước cho cùng mã số thuế. */
async function guessAccountName(inv: Invoice): Promise<string> {
  if (inv.mstNguoiBan) {
    for (const d of await store.listDossiers()) {
      const hit = d.invoices.find((i) => i.mstNguoiBan === inv.mstNguoiBan && i.tenTaiKhoan)
      if (hit) return hit.tenTaiKhoan
    }
  }
  return toAccountName(inv.tenNguoiBan)
}

export async function saveUpload(file: File): Promise<StoredFile> {
  const f: StoredFile = { id: newId(), name: file.name, type: file.type, size: file.size, data: file, addedAt: Date.now() }
  await store.putFile(f)
  return f
}

const isXml = (f: File) => /\.xml$/i.test(f.name) || f.type.includes('xml')
const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf'

/** Đọc PDF hóa đơn điện tử. Trả về null nếu không dò ra gì (vd PDF scan). */
/** PDF là bản nháp "Số : <Chưa cấp số>" — không phải hóa đơn chính thức */
export class BanNhapError extends Error {
  constructor() {
    super('BẢN NHÁP — hóa đơn CHƯA CẤP SỐ, không phải hóa đơn chính thức. Không tạo hồ sơ.')
  }
}

/** Trang đang mở là bản cũ, web vừa có bản mới -> tệp phần mềm cũ không còn trên mạng. */
export class AppCuError extends Error {
  constructor() {
    super('App vừa có bản cập nhật trên mạng — bấm "Tải lại trang" (hoặc F5) rồi làm lại. Chưa có gì được lưu.')
  }
}

/** Tải phần đọc PDF (nặng). Gọi sẵn khi mở app để không bị lỡ khi web cập nhật giữa chừng. */
export async function taiBoDocPdf() {
  try {
    return await import('./pdfText')
  } catch {
    throw new AppCuError()
  }
}

export async function readPdfInvoice(f: File) {
  const { pdfToLines } = await taiBoDocPdf() // thư viện PDF nặng, chỉ tải khi cần
  const lines = await pdfToLines(await f.arrayBuffer())
  if (laBanNhap(lines)) throw new BanNhapError()
  const parsed = parseInvoiceText(lines)
  if (parsed.found < 3) return null
  const { found: _f, ...rest } = parsed
  return rest
}

/** Chỉ điền vào các ô đang trống, không đè chữ anh đã sửa. */
export function fillEmpty(inv: Invoice, src: Partial<Invoice>): Invoice {
  const out = { ...inv } as Record<string, unknown>
  for (const [k, v] of Object.entries(src)) {
    const cur = out[k]
    if (cur === '' || cur === 0 || (Array.isArray(cur) && cur.length === 0)) out[k] = v
  }
  return out as unknown as Invoice
}

/**
 * Biến 1 lần up nhiều file thành các hóa đơn:
 * - Mỗi file XML -> 1 hóa đơn (tự điền). PDF/ảnh trùng tên gốc với XML được gắn vào hóa đơn đó.
 * - PDF lẻ -> 1 hóa đơn, tự dò thông tin từ chữ trong PDF (cần kiểm tra lại).
 * - Ảnh lẻ -> 1 hóa đơn trống để nhập tay.
 */
export async function filesToInvoices(files: File[]): Promise<{ invoices: Invoice[]; errors: string[]; notes: string[] }> {
  const errors: string[] = []
  const notes: string[] = []
  const invoices: Invoice[] = []
  const byBase = new Map<string, Invoice>()
  const base = (n: string) => n.replace(/\.[^.]+$/, '').toLowerCase()

  for (const f of files.filter(isXml)) {
    let inv = emptyInvoice()
    try {
      inv = { ...inv, ...parseInvoiceXml(await f.text()) }
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`)
    }
    inv.fileIds.push((await saveUpload(f)).id)
    invoices.push(inv)
    byBase.set(base(f.name), inv)
  }
  for (const f of files.filter((x) => !isXml(x))) {
    const stored = await saveUpload(f)
    const match = byBase.get(base(f.name))
    if (match) {
      match.fileIds.push(stored.id)
      continue
    }
    let inv = emptyInvoice()
    inv.fileIds.push(stored.id)
    if (isPdf(f)) {
      try {
        const p = await readPdfInvoice(f)
        if (p) {
          inv = fillEmpty(inv, p)
          notes.push(`${f.name}: đã tự đọc từ PDF — anh soát lại số tiền và mã số thuế.`)
        } else {
          errors.push(`${f.name}: PDF không có chữ đọc được (có thể là bản scan)`)
        }
      } catch (e) {
        if (e instanceof AppCuError) {
          await store.deleteFile(stored.id)
          throw e // dừng hẳn, không tạo hồ sơ trống
        }
        if (e instanceof BanNhapError) {
          errors.push(`${f.name}: ${e.message}`)
          await store.deleteFile(stored.id) // không giữ file nháp
          continue
        }
        errors.push(`${f.name}: không đọc được PDF (${(e as Error).message})`)
      }
    }
    invoices.push(inv)
  }
  for (const inv of invoices) {
    if (!inv.tenTaiKhoan && inv.tenNguoiBan) inv.tenTaiKhoan = await guessAccountName(inv)
  }
  const cam = timHangCam(invoices, (await store.getSettings()).tuKhoaCam)
  if (cam.length) notes.unshift(`⛔ HÓA ĐƠN CÓ RƯỢU/BIA — quy định không được thanh toán:\n${moTaHangCam(cam)}\n`)
  notes.unshift(...(await canhBaoThayThe(invoices)))
  return { invoices, errors, notes }
}

/** So hóa đơn mới với kho: nó thay thế hóa đơn nào đang có, hoặc chính nó đã bị thay thế chưa. */
async function canhBaoThayThe(invoices: Invoice[]): Promise<string[]> {
  if (!invoices.some((i) => i.soHd)) return []
  const kho = await store.listDossiers()
  const map = banDoThayThe(kho)
  const out: string[] = []
  for (const inv of invoices) {
    const b = biLienQuan(inv, map)
    if (b) out.push(`⛔ ${moTaBiLienQuan(inv, b)} (hóa đơn thay thế đã có trong kho).`)
    const q = inv.hdLienQuan
    if (q) {
      const cu = kho.flatMap((d) => d.invoices).find((x) => biLienQuan(x, banDoThayThe([{ ...emptyDossier(), invoices: [inv] }])))
      out.push(
        cu
          ? `🔁 HĐ ${inv.soHd} ${moTaLienQuan(q).toLowerCase()} — HĐ ${cu.soHd} đang có trong kho sẽ được đánh dấu ĐÃ BỊ ${q.loai === 'thayThe' ? 'THAY THẾ' : 'ĐIỀU CHỈNH'}.`
          : `🔁 HĐ ${inv.soHd} ${moTaLienQuan(q).toLowerCase()} (hóa đơn cũ đó chưa có trong kho).`,
      )
    }
  }
  return out
}

export { emptyDossier, emptyInvoice, normalizeDossier } from './model'

/** Dọn file không thuộc hồ sơ nào (vd up dở rồi tắt trình duyệt). Chỉ xóa file cũ hơn 1 giờ để không đụng file đang up. */
export async function cleanOrphanFiles(): Promise<number> {
  const used = new Set((await store.listDossiers()).flatMap((d) => d.invoices.flatMap((i) => i.fileIds)))
  const old = Date.now() - 3600_000
  const orphans = (await store.listFiles()).filter((f) => !used.has(f.id) && f.addedAt < old)
  for (const f of orphans) await store.deleteFile(f.id)
  return orphans.length
}

// ───────────── Nhập hàng loạt hóa đơn cũ ─────────────

export interface KetQuaNhap {
  tenFile: string // các file của hóa đơn này (XML + PDF cùng tên gộp làm một)
  dossierId?: string // hồ sơ đã tạo (không có nếu trùng / lỗi)
  soHd: string
  kyHieu: string
  ngayHd: string
  nguoiBan: string
  tongTien: number
  trung?: boolean // đã có trong kho
  loi?: string
  ghiChu?: string // cảnh báo rượu/bia, đọc PDF…
}

/**
 * Khóa nhận diện 1 hóa đơn — quy tắc của anh: TRÙNG khi cùng SỐ + NGÀY XUẤT + MST đơn vị xuất.
 * Tên file / tên hóa đơn giống nhau không tính. Thiếu 1 trong 3 thì không coi là trùng (giữ cả, để người xem).
 */
export function khoaHoaDon(i: Pick<Invoice, 'soHd' | 'ngayHd' | 'mstNguoiBan'>): string {
  const so = i.soHd.trim()
  if (!so || !i.ngayHd || !i.mstNguoiBan.trim()) return ''
  return [String(Number(so) || so), i.ngayHd, i.mstNguoiBan.replace(/\s/g, '')].join('|')
}

/**
 * Nhập nhiều hóa đơn cũ: mỗi hóa đơn -> 1 hồ sơ "hoSoCu" (chỉ cần tiền + đã/chưa thanh toán).
 * File XML và PDF trùng tên gốc được gộp vào cùng một hóa đơn. Hóa đơn đã có trong kho thì bỏ qua.
 */
export async function nhapHoaDonCu(files: File[], onTienDo?: (xong: number, tong: number) => void): Promise<KetQuaNhap[]> {
  const base = (n: string) => n.replace(/\.[^.]+$/, '').toLowerCase()
  const nhom = new Map<string, File[]>()
  for (const f of files) nhom.set(base(f.name), [...(nhom.get(base(f.name)) ?? []), f])

  const daCo = new Set((await store.listDossiers()).flatMap((d) => d.invoices.map(khoaHoaDon)).filter(Boolean))
  const out: KetQuaNhap[] = []
  let xong = 0
  for (const g of nhom.values()) {
    const tenFile = g.map((f) => f.name).join(' + ')
    try {
      const { invoices, errors, notes } = await filesToInvoices(g)
      for (const inv of invoices) {
        const kq: KetQuaNhap = {
          tenFile, soHd: inv.soHd, kyHieu: inv.kyHieu, ngayHd: inv.ngayHd, nguoiBan: inv.tenNguoiBan, tongTien: inv.tongTien,
          loi: errors.join('; ') || undefined,
          ghiChu: notes.filter((n) => n.includes('RƯỢU')).map(() => 'Có rượu/bia').join('') || undefined,
        }
        const k = khoaHoaDon(inv)
        if (!inv.soHd && !inv.tongTien && errors.length && g.every((f) => !/\.(jpe?g|png)$/i.test(f.name))) {
          // PDF/XML không đọc được -> KHÔNG tạo hồ sơ trống, bỏ file vừa cất
          for (const fid of inv.fileIds) await store.deleteFile(fid)
        } else if (k && daCo.has(k)) {
          kq.trung = true
          for (const fid of inv.fileIds) await store.deleteFile(fid) // không giữ file của bản trùng
        } else {
          const d = { ...emptyDossier(), hoSoCu: true, invoices: [inv] }
          await store.saveDossier(d)
          kq.dossierId = d.id
          if (k) daCo.add(k)
        }
        out.push(kq)
      }
    } catch (e) {
      out.push({ tenFile, soHd: '', kyHieu: '', ngayHd: '', nguoiBan: '', tongTien: 0, loi: (e as Error).message })
      if (e instanceof AppCuError) break // dừng cả lô
    }
    onTienDo?.(++xong, nhom.size)
  }
  // Ghi chú quan hệ thay thế sau khi đã nhập hết (hóa đơn cũ và hóa đơn thay thế có thể cùng một lô)
  const map = banDoThayThe(await store.listDossiers())
  for (const k of out) {
    if (k.trung || !k.dossierId) continue
    const d = await store.getDossier(k.dossierId)
    const inv = d?.invoices[0]
    if (!inv) continue
    const b = biLienQuan(inv, map)
    const them = [b && `⛔ ${b.loai === 'thayThe' ? 'ĐÃ BỊ THAY THẾ' : 'Đã bị điều chỉnh'} bởi HĐ ${b.boiSoHd}`, inv.hdLienQuan && `🔁 ${moTaLienQuan(inv.hdLienQuan)}`]
    k.ghiChu = [k.ghiChu, ...them].filter(Boolean).join(' · ') || undefined
  }
  return out
}

// ───────────── Đọc lại thông tin từ file đã đính kèm ─────────────

/** Hồ sơ có file đính kèm nhưng CHƯA CÓ SỐ TIỀN (0 đ) — vd nhập lúc bộ đọc PDF lỗi, hoặc tổng tiền ở trang sau. */
export function laHoSoTrong(d: Dossier): boolean {
  return d.invoices.length > 0 && d.invoices.every((i) => !i.tongTien && i.fileIds.length > 0)
}

export interface KetQuaDocLai {
  dossierId: string
  tenFile: string
  soHd: string
  tongTien: number
  trungVoi?: string // id hồ sơ đã có cùng số + ngày + MST
  loi?: string
}

/** Đọc lại PDF/XML đã cất của các hồ sơ trống, điền thông tin vào chính hồ sơ đó (không cần tải lên lại). */
export async function docLaiHoSoTrong(onTienDo?: (xong: number, tong: number) => void): Promise<KetQuaDocLai[]> {
  const tatCa = await store.listDossiers()
  const can = tatCa.filter(laHoSoTrong)
  const daCo = new Map(tatCa.filter((d) => !laHoSoTrong(d)).flatMap((d) => d.invoices.map((i) => [khoaHoaDon(i), d.id] as const)).filter(([k]) => k))
  const out: KetQuaDocLai[] = []
  let xong = 0
  for (const d of can) {
    const inv = { ...d.invoices[0] }
    let tenFile = ''
    try {
      for (const fid of inv.fileIds) {
        const f = await store.getFile(fid)
        if (!f) continue
        tenFile = f.name
        const file = new File([f.data], f.name, { type: f.type })
        if (isXml(file)) Object.assign(inv, fillEmpty(inv, parseInvoiceXml(await file.text())))
        else if (isPdf(file)) {
          const p = await readPdfInvoice(file)
          if (p) Object.assign(inv, fillEmpty(inv, p))
        }
      }
      if (!inv.tenTaiKhoan && inv.tenNguoiBan) inv.tenTaiKhoan = toAccountName(inv.tenNguoiBan)
      const k = khoaHoaDon(inv)
      const kq: KetQuaDocLai = { dossierId: d.id, tenFile, soHd: inv.soHd, tongTien: inv.tongTien }
      if (k && daCo.has(k)) kq.trungVoi = daCo.get(k)
      else if (k) daCo.set(k, d.id)
      if (!inv.tongTien) kq.loi = 'Vẫn không đọc được số tiền (PDF scan / mẫu lạ) — mở hồ sơ để nhập tay'
      else await store.saveDossier({ ...d, invoices: [inv, ...d.invoices.slice(1)], updatedAt: Date.now() })
      out.push(kq)
    } catch (e) {
      out.push({ dossierId: d.id, tenFile, soHd: '', tongTien: 0, loi: (e as Error).message })
      if (e instanceof AppCuError) break
    }
    onTienDo?.(++xong, can.length)
  }
  return out
}
