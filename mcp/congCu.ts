// Công cụ cho AI: tra cứu và sửa hồ sơ hóa đơn bằng ĐÚNG phần tính toán của web app (src/lib) —
// trạng thái, cảnh báo, dự trù, tiền bằng chữ, hóa đơn bị thay thế, hàng cấm, tổng hợp theo tháng / người bán.
// File này không biết gì về Firebase: đọc từ DuLieu, ghi qua NoiGhi (máy chủ cắm Firebase thật, test cắm bộ nhớ).

import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import { today } from '../src/lib/dates.js'
import { timHangCam } from '../src/lib/hangCam.js'
import { InvoiceXmlError, parseInvoiceXml } from '../src/lib/invoiceXml.js'
import { emptyDossier, emptyInvoice, khoaHoaDon, normalizeDossier, toAccountName } from '../src/lib/model.js'
import { moneyInWords } from '../src/lib/numberToWords.js'
import { canThongTinTk, duTruOf, duTruTuDong, tongTienChuOf } from '../src/lib/rules.js'
import { firstInvoiceDate, sapXep, statusOf, STATUS_LABEL, suggestDnttDate, suggestToTrinhDate, totalOf, waitingDays, warningsOf, XEP_MAC_DINH, type KieuXep, type StatusKey } from '../src/lib/status.js'
import { avgDurations, byMonth, bySeller, flattenInvoices, yearsOf } from '../src/lib/summary.js'
import { banDoThayThe, biLienQuan, moTaBiLienQuan, moTaLienQuan } from '../src/lib/thayThe.js'
import type { Dossier, Invoice, Settings, ThanhPhan } from '../src/lib/types.js'

// Bộ đọc XML hóa đơn của web app dùng DOMParser của trình duyệt — trên máy chủ thay bằng xmldom
if (typeof globalThis.DOMParser === 'undefined') (globalThis as { DOMParser?: unknown }).DOMParser = XmlDomParser

export interface DuLieu {
  hoSo: Dossier[]
  caiDat: Settings
  /** id file -> tên file gốc */
  tenFile: Map<string, string>
}

/** Chỗ ghi: máy chủ cắm Firebase của người dùng; mỗi lần ghi / xoá đều để lại nhật ký */
export interface NoiGhi {
  luuHoSo(d: Dossier): Promise<void>
  luuFile(f: { id: string; name: string; type: string; data: Uint8Array }): Promise<void>
  xoaHoSo(d: Dossier): Promise<void>
  nhatKy(congCu: string, moTa: string): Promise<void>
}

/** Lỗi do người dùng / dữ liệu (trả lời AI rõ ràng, không phải lỗi máy chủ) */
export class LoiNguoiDung extends Error {}

const TRANG_THAI = Object.keys(STATUS_LABEL) as StatusKey[]
const NGAY = /^\d{4}-\d{2}-\d{2}$/
const chuan = (s: string) => s.normalize('NFC').toLowerCase()

// ───────────── Tóm tắt / tìm ─────────────

function tomTat(d: Dossier, s: Settings, map: ReturnType<typeof banDoThayThe>) {
  const st = statusOf(d)
  return {
    id: d.id,
    noiDung: d.noiDung,
    doiTac: d.doiTac,
    ngayHd: firstInvoiceDate(d),
    hoaDon: d.invoices.map((i) => `${i.soHd || '?'}${i.kyHieu ? ` (${i.kyHieu})` : ''} — ${i.tenNguoiBan || '?'}`),
    tongTien: totalOf(d),
    trangThai: st,
    trangThaiChu: STATUS_LABEL[st],
    soNgayCho: waitingDays(d),
    hoSoCu: d.hoSoCu,
    soCanhBao: warningsOf(d, s, map).length,
  }
}

function khopTuKhoa(d: Dossier, tim: string) {
  const t = chuan(tim.trim())
  if (!t) return true
  const chu = [d.noiDung, d.doiTac, d.ghiChu, d.lyDo, d.soToTrinh, d.soDntt, d.nguoiDeNghi,
    ...d.invoices.flatMap((i) => [i.soHd, i.kyHieu, i.tenNguoiBan, i.mstNguoiBan, ...i.items.map((x) => x.ten)])]
  return chu.some((x) => x && chuan(x).includes(t))
}

const trongKy = (ngay: string, nam?: number, thang?: number) =>
  (!nam || Number(ngay.slice(0, 4)) === nam) && (!thang || Number(ngay.slice(5, 7)) === thang)

/** Tìm 1 hồ sơ theo id; không có thì thử số hóa đơn (chỉ khi khớp đúng 1 hồ sơ) */
export function timHoSo(du: DuLieu, ma: string): Dossier {
  const m = ma.trim()
  const theoId = du.hoSo.find((d) => d.id === m)
  if (theoId) return theoId
  const so = String(Number(m) || m)
  const theoSo = du.hoSo.filter((d) => d.invoices.some((i) => i.soHd && String(Number(i.soHd) || i.soHd) === so))
  if (theoSo.length === 1) return theoSo[0]
  if (theoSo.length > 1) throw new LoiNguoiDung(`Số hóa đơn ${m} có ở ${theoSo.length} hồ sơ — dùng id: ${theoSo.map((d) => `${d.id} (${d.noiDung || d.invoices[0]?.tenNguoiBan})`).join('; ')}`)
  throw new LoiNguoiDung(`Không có hồ sơ "${m}" (gửi id hồ sơ, hoặc số hóa đơn)`)
}

// ───────────── ĐỌC ─────────────

export function tongQuan(du: DuLieu) {
  const s = du.caiDat
  const map = banDoThayThe(du.hoSo)
  const theoTrangThai = TRANG_THAI.map((k) => {
    const ds = du.hoSo.filter((d) => statusOf(d) === k)
    return { trangThai: k, chu: STATUS_LABEL[k], soHoSo: ds.length, tongTien: ds.reduce((a, d) => a + totalOf(d), 0) }
  })
  const dangXuLy = du.hoSo.filter((d) => statusOf(d) !== 'daTt')
  const canChuY = sapXep(dangXuLy, XEP_MAC_DINH)
    .map((d) => ({ ...tomTat(d, s, map), canhBao: warningsOf(d, s, map) }))
    .filter((d) => d.canhBao.length)
  return {
    homNay: today(),
    soHoSo: du.hoSo.length,
    tongTien: du.hoSo.reduce((a, d) => a + totalOf(d), 0),
    theoTrangThai,
    choKeToanLau: dangXuLy
      .filter((d) => statusOf(d) === 'choKt' && !d.hoSoCu && (waitingDays(d) ?? 0) > s.canhBaoChoKtSauNgay)
      .map((d) => tomTat(d, s, map)),
    canChuY: canChuY.slice(0, 30),
    soHoSoCanChuY: canChuY.length,
    quyTac: {
      nguongTien: s.nguongTien, duTruDuoiNguong: s.duTruDuoiNguong, duTruTuNguong: s.duTruTuNguong,
      soNgayToTrinhTruocHd: s.soNgayToTrinhTruocHd, canhBaoChoKtSauNgay: s.canhBaoChoKtSauNgay,
    },
  }
}

export interface ThamSoDanhSach { trang_thai?: StatusKey; nam?: number; thang?: number; tim?: string; xep?: KieuXep; tang_dan?: boolean; gioi_han?: number }

export function danhSachHoSo(du: DuLieu, a: ThamSoDanhSach) {
  const map = banDoThayThe(du.hoSo)
  const loc = du.hoSo.filter((d) =>
    (!a.trang_thai || statusOf(d) === a.trang_thai)
    && ((!a.nam && !a.thang) || d.invoices.some((i) => trongKy(i.ngayHd, a.nam, a.thang)))
    && khopTuKhoa(d, a.tim ?? ''))
  const xep = sapXep(loc, { theo: a.xep ?? 'ngayHd', giam: !a.tang_dan })
  const gh = a.gioi_han ?? 50
  return {
    soHoSo: loc.length,
    tongTien: loc.reduce((x, d) => x + totalOf(d), 0),
    hienThi: Math.min(gh, loc.length),
    hoSo: xep.slice(0, gh).map((d) => tomTat(d, du.caiDat, map)),
  }
}

export function xemHoSo(du: DuLieu, a: { id: string }) {
  const d = timHoSo(du, a.id)
  const s = du.caiDat
  const map = banDoThayThe(du.hoSo)
  const st = statusOf(d)
  return {
    ...d,
    invoices: undefined,
    hoaDon: d.invoices.map((i) => {
      const b = biLienQuan(i, map)
      return {
        ...i,
        fileIds: undefined,
        file: i.fileIds.map((f) => ({ id: f, ten: du.tenFile.get(f) ?? '(không còn)' })),
        lienQuan: i.hdLienQuan ? moTaLienQuan(i.hdLienQuan) : undefined,
        biThayThe: b ? moTaBiLienQuan(i, b) : undefined,
      }
    }),
    trangThai: st,
    trangThaiChu: STATUS_LABEL[st],
    soNgayCho: waitingDays(d),
    tongTien: totalOf(d),
    tongTienBangChu: tongTienChuOf(d),
    duTru: duTruOf(d, s),
    duTruGoTay: d.duTru || undefined,
    duTruTheoQuyTac: duTruTuDong(d, s),
    canInThongTinTaiKhoan: canThongTinTk(d, s),
    hangCam: timHangCam(d.invoices, s.tuKhoaCam),
    canhBao: warningsOf(d, s, map),
    goiY: { ngayToTrinh: suggestToTrinhDate(d, s), ngayDntt: suggestDnttDate(d) },
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
  }
}

export interface ThamSoTraHoaDon { nam?: number; thang?: number; tim?: string; trang_thai?: StatusKey; ca_bi_thay_the?: boolean; gioi_han?: number }

export function traHoaDon(du: DuLieu, a: ThamSoTraHoaDon) {
  const map = banDoThayThe(du.hoSo)
  const t = chuan(a.tim?.trim() ?? '')
  const dong = flattenInvoices(du.hoSo).filter(({ inv, d, status }) =>
    trongKy(inv.ngayHd, a.nam, a.thang)
    && (!a.trang_thai || status === a.trang_thai)
    && (a.ca_bi_thay_the || biLienQuan(inv, map)?.loai !== 'thayThe')
    && (!t || [inv.soHd, inv.kyHieu, inv.tenNguoiBan, inv.mstNguoiBan, d.noiDung, d.doiTac, ...inv.items.map((x) => x.ten)].some((x) => x && chuan(x).includes(t))))
  const gh = a.gioi_han ?? 50
  return {
    soHoaDon: dong.length,
    tongTien: dong.reduce((x, r) => x + (r.inv.tongTien || 0), 0),
    tienTruocThue: dong.reduce((x, r) => x + (r.inv.tienTruocThue || 0), 0),
    tienThue: dong.reduce((x, r) => x + (r.inv.tienThue || 0), 0),
    hienThi: Math.min(gh, dong.length),
    hoaDon: dong.slice(0, gh).map(({ inv, d, status }) => ({
      soHd: inv.soHd, kyHieu: inv.kyHieu, ngayHd: inv.ngayHd, nguoiBan: inv.tenNguoiBan, mst: inv.mstNguoiBan,
      tienTruocThue: inv.tienTruocThue, tienThue: inv.tienThue, tongTien: inv.tongTien,
      hoSoId: d.id, noiDung: d.noiDung, trangThai: STATUS_LABEL[status],
      biThayThe: biLienQuan(inv, map) ? moTaBiLienQuan(inv, biLienQuan(inv, map)!) : undefined,
    })),
  }
}

export function tongHop(du: DuLieu, a: { nam?: number; top?: number }) {
  const rows = flattenInvoices(du.hoSo)
  const cacNam = yearsOf(rows)
  const nam = a.nam ?? cacNam[0] ?? Number(today().slice(0, 4))
  const trongNam = rows.filter((r) => Number(r.inv.ngayHd.slice(0, 4)) === nam)
  const thang = byMonth(rows, nam)
  return {
    nam,
    cacNamCoDuLieu: cacNam,
    caNam: thang.reduce((x, m) => ({ soHd: x.soHd + m.soHd, tongTien: x.tongTien + m.tongTien, daTt: x.daTt + m.daTt, choKt: x.choKt + m.choKt, chuaNop: x.chuaNop + m.chuaNop }),
      { soHd: 0, tongTien: 0, daTt: 0, choKt: 0, chuaNop: 0 }),
    theoThang: thang.filter((m) => m.soHd),
    theoNguoiBan: bySeller(trongNam).slice(0, a.top ?? 20),
    soNgayTrungBinh: avgDurations(du.hoSo.filter((d) => d.invoices.some((i) => i.ngayHd.startsWith(String(nam))))),
    ghiChu: 'daTt = kế toán đã thanh toán; choKt = đã nộp kế toán, chờ thanh toán; chuaNop = chưa nộp kế toán. soNgayTrungBinh: hdDenNop = từ ngày HĐ đến nộp kế toán, nopDenTt = từ nộp đến được thanh toán.',
  }
}

// ───────────── GHI ─────────────

export const O_NGAY = ['ngayToTrinh', 'ngayDntt', 'ngayNopKeToan', 'ngayKeToanTt'] as const
const O_CHU = ['noiDung', 'doiTac', 'nguoiDeNghi', 'nhiemVu', 'lyDo', 'ghiChu', 'soToTrinh', 'soDntt', 'hinhThucTt'] as const

export interface ThamSoSuaHoSo {
  id: string
  noiDung?: string; doiTac?: string; nguoiDeNghi?: string; nhiemVu?: string; lyDo?: string; ghiChu?: string
  soToTrinh?: string; soDntt?: string; hinhThucTt?: string
  ngayToTrinh?: string; ngayDntt?: string; ngayNopKeToan?: string; ngayKeToanTt?: string
  duTru?: number
  thanhPhan?: ThanhPhan[]
  hoSoCu?: boolean
}

function kiemNgay(ten: string, v: string) {
  if (v !== '' && !NGAY.test(v)) throw new LoiNguoiDung(`${ten}: ngày phải dạng yyyy-mm-dd (hoặc "" để xóa), nhận được "${v}"`)
}

/** Áp các ô cần đổi vào hồ sơ; trả hồ sơ mới + danh sách thay đổi "ô: cũ -> mới" */
function apThayDoi<T extends object>(cu: T, moi: Partial<T>, cacO: readonly (keyof T)[]) {
  const ra = { ...cu }
  const doi: string[] = []
  for (const k of cacO) {
    const v = moi[k]
    if (v === undefined || JSON.stringify(v) === JSON.stringify(cu[k])) continue
    doi.push(`${String(k)}: ${JSON.stringify(cu[k])} -> ${JSON.stringify(v)}`)
    ra[k] = v as T[keyof T]
  }
  return { ra, doi }
}

export async function suaHoSo(du: DuLieu, ghi: NoiGhi, a: ThamSoSuaHoSo) {
  const d = timHoSo(du, a.id)
  for (const k of O_NGAY) if (a[k] !== undefined) kiemNgay(k, a[k])
  if (a.duTru !== undefined && (!Number.isFinite(a.duTru) || a.duTru < 0)) throw new LoiNguoiDung('duTru phải là số tiền ≥ 0 (0 = theo quy tắc)')
  if (a.thanhPhan?.some((t) => !t.donVi?.trim() || !(t.soNguoi >= 0))) throw new LoiNguoiDung('thanhPhan: mỗi dòng cần donVi và soNguoi ≥ 0')
  const { ra, doi } = apThayDoi(d, a as Partial<Dossier>, [...O_CHU, ...O_NGAY, 'duTru', 'thanhPhan', 'hoSoCu'])
  if (!doi.length) return { daLuu: false, moTa: 'Không có gì thay đổi', hoSo: xemHoSo(du, { id: d.id }) }
  const moi = { ...ra, updatedAt: Date.now() }
  await ghi.luuHoSo(moi)
  du.hoSo = du.hoSo.map((x) => (x.id === d.id ? moi : x))
  await ghi.nhatKy('sua_ho_so', `${nhanHoSo(d)}: ${doi.join('; ')}`)
  return { daLuu: true, thayDoi: doi, trangThai: STATUS_LABEL[statusOf(moi)], canhBao: warningsOf(moi, du.caiDat, banDoThayThe(du.hoSo)) }
}

const O_HOA_DON = ['kyHieu', 'soHd', 'ngayHd', 'tenNguoiBan', 'mstNguoiBan', 'diaChiNguoiBan', 'stkNguoiBan', 'nganHangNguoiBan', 'tenTaiKhoan', 'tienBangChu', 'tienTruocThue', 'tienThue', 'tongTien'] as const
export type SuaHoaDon = Partial<Pick<Invoice, (typeof O_HOA_DON)[number]>>

export async function suaHoaDon(du: DuLieu, ghi: NoiGhi, a: { ho_so: string; hoa_don?: string } & SuaHoaDon) {
  const d = timHoSo(du, a.ho_so)
  const ma = a.hoa_don?.trim()
  const ds = ma ? d.invoices.filter((i) => i.id === ma || (i.soHd && String(Number(i.soHd) || i.soHd) === String(Number(ma) || ma))) : d.invoices
  if (ds.length !== 1) {
    throw new LoiNguoiDung(ds.length ? `Hồ sơ có ${ds.length} hóa đơn — ghi rõ hoa_don (số HĐ hoặc id): ${d.invoices.map((i) => i.soHd || i.id).join(', ')}` : `Hồ sơ không có hóa đơn "${ma}"`)
  }
  if (a.ngayHd !== undefined) kiemNgay('ngayHd', a.ngayHd)
  for (const k of ['tienTruocThue', 'tienThue', 'tongTien'] as const) if (a[k] !== undefined && !Number.isFinite(a[k])) throw new LoiNguoiDung(`${k} phải là số`)
  const { ra, doi } = apThayDoi(ds[0], a, O_HOA_DON)
  if (!doi.length) return { daLuu: false, moTa: 'Không có gì thay đổi' }
  const moi = { ...d, invoices: d.invoices.map((i) => (i.id === ds[0].id ? ra : i)), updatedAt: Date.now() }
  await ghi.luuHoSo(moi)
  du.hoSo = du.hoSo.map((x) => (x.id === d.id ? moi : x))
  await ghi.nhatKy('sua_hoa_don', `${nhanHoSo(d)} / HĐ ${ds[0].soHd || '?'}: ${doi.join('; ')}`)
  return { daLuu: true, thayDoi: doi, canhBao: warningsOf(moi, du.caiDat, banDoThayThe(du.hoSo)) }
}

export interface ThamSoTaoHoSo extends Omit<ThamSoSuaHoSo, 'id'> {
  xml?: { ten_file: string; noi_dung: string }[]
  hoa_don_nhap_tay?: (SuaHoaDon & { items?: Invoice['items'] })[]
  vao_ho_so?: string
}

/**
 * Tạo hồ sơ mới (hoặc thêm hóa đơn vào hồ sơ có sẵn) từ XML hóa đơn điện tử và/hoặc số liệu nhập tay.
 * Hóa đơn TRÙNG (cùng số + ngày + MST người bán đã có trong kho) -> từ chối cả lần gọi, không ghi gì.
 */
export async function taoHoSo(du: DuLieu, ghi: NoiGhi, a: ThamSoTaoHoSo) {
  const xml = a.xml ?? []
  const tay = a.hoa_don_nhap_tay ?? []
  if (!xml.length && !tay.length && !a.vao_ho_so && !a.noiDung) throw new LoiNguoiDung('Cần ít nhất 1 hóa đơn (xml hoặc hoa_don_nhap_tay), hoặc nội dung công việc để tạo hồ sơ trống')

  const moi: { inv: Invoice; file?: { ten: string; data: Uint8Array } }[] = []
  for (const x of xml) {
    let p
    try {
      p = parseInvoiceXml(x.noi_dung)
    } catch (e) {
      throw new LoiNguoiDung(`${x.ten_file}: ${e instanceof InvoiceXmlError ? e.message : 'không đọc được XML'}`)
    }
    moi.push({ inv: { ...emptyInvoice(), ...p }, file: { ten: x.ten_file, data: new TextEncoder().encode(x.noi_dung) } })
  }
  for (const t of tay) {
    if (t.ngayHd) kiemNgay('ngayHd', t.ngayHd)
    const inv = { ...emptyInvoice(), ...t, items: t.items ?? [] }
    if (!inv.tongTien && (inv.tienTruocThue || inv.tienThue)) inv.tongTien = inv.tienTruocThue + inv.tienThue
    if (!inv.tienBangChu && inv.tongTien) inv.tienBangChu = moneyInWords(inv.tongTien)
    moi.push({ inv })
  }

  // Chặn trùng: so với kho và với nhau trong cùng lần gọi
  const daCo = new Map(du.hoSo.flatMap((d) => d.invoices.map((i) => [khoaHoaDon(i), d] as const)).filter(([k]) => k))
  const trung: string[] = []
  for (const { inv } of moi) {
    const k = khoaHoaDon(inv)
    if (!k) continue
    const d = daCo.get(k)
    if (d) trung.push(`HĐ ${inv.soHd} ngày ${inv.ngayHd} (${inv.tenNguoiBan}) đã có ở hồ sơ ${d.id} "${nhanHoSo(d)}"`)
    else daCo.set(k, emptyDossier())
  }
  if (trung.length) throw new LoiNguoiDung(`Không tạo — hóa đơn TRÙNG (cùng số + ngày + MST người bán):\n${trung.join('\n')}`)

  // Tên tài khoản: ưu tiên tên đã sửa tay trước đây cho cùng MST, không có thì đổi tên người bán sang không dấu
  for (const { inv } of moi) {
    if (inv.tenTaiKhoan || !inv.tenNguoiBan) continue
    const cu = du.hoSo.flatMap((d) => d.invoices).find((i) => i.mstNguoiBan && i.mstNguoiBan === inv.mstNguoiBan && i.tenTaiKhoan)
    inv.tenTaiKhoan = cu?.tenTaiKhoan ?? toAccountName(inv.tenNguoiBan)
  }

  for (const m of moi) {
    if (!m.file) continue
    const id = crypto.randomUUID()
    await ghi.luuFile({ id, name: m.file.ten, type: 'text/xml', data: m.file.data })
    du.tenFile.set(id, m.file.ten)
    m.inv.fileIds = [id]
  }

  const goc = a.vao_ho_so ? timHoSo(du, a.vao_ho_so) : emptyDossier()
  const { ra } = apThayDoi(goc, a as Partial<Dossier>, [...O_CHU, ...O_NGAY, 'duTru', 'thanhPhan', 'hoSoCu'])
  const d = normalizeDossier({ ...ra, invoices: [...goc.invoices, ...moi.map((m) => m.inv)], updatedAt: Date.now() })
  for (const k of O_NGAY) kiemNgay(k, d[k])
  await ghi.luuHoSo(d)
  du.hoSo = a.vao_ho_so ? du.hoSo.map((x) => (x.id === d.id ? d : x)) : [d, ...du.hoSo]
  await ghi.nhatKy('tao_ho_so', `${a.vao_ho_so ? 'Thêm vào' : 'Tạo'} hồ sơ "${nhanHoSo(d)}": ${moi.map((m) => `HĐ ${m.inv.soHd || '?'} ${m.inv.tongTien} đ`).join(', ') || 'chưa có hóa đơn'}`)
  const map = banDoThayThe(du.hoSo)
  return {
    daLuu: true,
    id: d.id,
    hoaDonMoi: moi.map(({ inv }) => ({ soHd: inv.soHd, ngayHd: inv.ngayHd, nguoiBan: inv.tenNguoiBan, tongTien: inv.tongTien, lienQuan: inv.hdLienQuan ? moTaLienQuan(inv.hdLienQuan) : undefined })),
    tongTien: totalOf(d),
    trangThai: STATUS_LABEL[statusOf(d)],
    canhBao: warningsOf(d, du.caiDat, map),
    ghiChu: 'File PDF / ảnh hóa đơn gốc: mở hồ sơ trên web app để đính kèm.',
  }
}

/** Tên để người dùng nhận ra hồ sơ — cũng là chuỗi xác nhận khi xoá */
export function nhanHoSo(d: Dossier): string {
  return d.noiDung.trim() || `HĐ ${d.invoices.map((i) => i.soHd || '?').join(', ') || '(trống)'}`
}

export async function xoaHoSo(du: DuLieu, ghi: NoiGhi, a: { id: string; xac_nhan: string }) {
  const d = timHoSo(du, a.id)
  const nhan = nhanHoSo(d)
  if (chuan(a.xac_nhan.trim()) !== chuan(nhan)) {
    return { daXoa: false, canXacNhan: nhan, moTa: `Chưa xoá. Hỏi người dùng, nêu đúng hồ sơ "${nhan}" (${d.invoices.length} hóa đơn, ${totalOf(d)} đ); họ đồng ý thì gửi lại xac_nhan = "${nhan}".` }
  }
  await ghi.xoaHoSo(d)
  du.hoSo = du.hoSo.filter((x) => x.id !== d.id)
  await ghi.nhatKy('xoa_ho_so', `XOÁ hồ sơ "${nhan}" (${d.invoices.length} hóa đơn, ${totalOf(d)} đ, ${d.invoices.flatMap((i) => i.fileIds).length} file)`)
  return { daXoa: true, moTa: `Đã xoá hồ sơ "${nhan}" và file gốc của nó.` }
}
