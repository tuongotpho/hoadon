// @vitest-environment node
// Công cụ MCP cho AI — chạy trên dữ liệu giả trong bộ nhớ (không cần Firebase).
// Chạy môi trường node: giống máy chủ thật (không có DOMParser của trình duyệt -> dùng xmldom).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as cc from '../mcp/congCu'
import { toIso } from '../src/lib/dates'
import { emptyDossier, emptyInvoice } from '../src/lib/model'
import { waitingDays, warningsOf } from '../src/lib/status'
import { DEFAULT_SETTINGS, type Dossier, type Invoice } from '../src/lib/types'

const XML = readFileSync(new URL('./fixtures/hoa-don-tt78.xml', import.meta.url), 'utf8')

const hd = (o: Partial<Invoice>): Invoice => ({ ...emptyInvoice(), mstNguoiBan: '0100000009', tenNguoiBan: 'Nhà hàng A', ...o })
const hs = (o: Partial<Dossier>): Dossier => ({ ...emptyDossier(), ...o })

function duLieu() {
  return {
    hoSo: [
      // đã thanh toán
      hs({ id: 'a', noiDung: 'Làm việc với PC Hưng Yên', doiTac: 'PC Hưng Yên', ngayToTrinh: '2026-03-02', ngayDntt: '2026-03-06', ngayNopKeToan: '2026-03-07', ngayKeToanTt: '2026-03-20',
        invoices: [hd({ soHd: '11', ngayHd: '2026-03-04', tongTien: 3_000_000, tienTruocThue: 2_777_778, tienThue: 222_222 })] }),
      // chờ kế toán từ lâu + có bia
      hs({ id: 'b', noiDung: 'Làm việc với PC Thái Bình', doiTac: 'PC Thái Bình', nguoiDeNghi: 'X', thanhPhan: [{ donVi: 'Phòng KT', soNguoi: 3 }],
        ngayToTrinh: '2026-04-01', ngayDntt: '2026-04-06', ngayNopKeToan: '2026-04-07',
        invoices: [hd({ soHd: '12', ngayHd: '2026-04-03', tenNguoiBan: 'Nhà hàng B', mstNguoiBan: '0100000008', tongTien: 2_000_000,
          items: [{ ten: 'Bia Hà Nội', dvt: 'lon', soLuong: 10, donGia: 20000, thanhTien: 200000, thueSuat: '10%' }] })] }),
      // chờ làm hồ sơ; HĐ 13 bị HĐ 14 thay thế
      hs({ id: 'c', noiDung: 'Hội nghị CBM', invoices: [hd({ kyHieu: '1C26TAA', soHd: '13', ngayHd: '2026-04-10', tongTien: 1_000_000 })] }),
      hs({ id: 'd', noiDung: 'Hội nghị CBM (HĐ thay thế)', invoices: [hd({ kyHieu: '1C26TAA', soHd: '14', ngayHd: '2026-04-12', tongTien: 1_100_000,
        hdLienQuan: { loai: 'thayThe', kyHieu: '1C26TAA', soHd: '13', ngayHd: '2026-04-10' } })] }),
    ],
    caiDat: DEFAULT_SETTINGS,
    tenFile: new Map<string, string>(),
  } satisfies cc.DuLieu
}

/** Chỗ ghi giả: nhớ lại mọi lần ghi */
function noiGhi() {
  const g = { hoSo: [] as Dossier[], file: [] as { id: string; name: string; data: Uint8Array }[], xoa: [] as string[], nhatKy: [] as string[] }
  const ghi: cc.NoiGhi = {
    luuHoSo: async (d) => void g.hoSo.push(structuredClone(d)),
    luuFile: async (f) => void g.file.push(f),
    xoaHoSo: async (d) => void g.xoa.push(d.id),
    nhatKy: async (c, m) => void g.nhatKy.push(`${c}: ${m}`),
  }
  return { g, ghi }
}

describe('Công cụ đọc', () => {
  it('tong_quan: đếm theo trạng thái, hồ sơ chờ kế toán lâu, hồ sơ có cảnh báo', () => {
    const t = cc.tongQuan(duLieu())
    expect(t.soHoSo).toBe(4)
    expect(t.tongTien).toBe(7_100_000)
    expect(Object.fromEntries(t.theoTrangThai.map((x) => [x.trangThai, x.soHoSo]))).toEqual({ chuaHd: 0, choLamHs: 2, choNop: 0, choKt: 1, daTt: 1 })
    expect(t.choKeToanLau.map((d) => d.id)).toEqual(['b'])
    const b = t.canChuY.find((d) => d.id === 'b')!
    expect(b.canhBao[0]).toContain('RƯỢU/BIA')
    expect(t.canChuY.find((d) => d.id === 'c')!.canhBao.join()).toContain('ĐÃ BỊ THAY THẾ bởi HĐ 14')
  })

  it('danh_sach_ho_so: lọc theo trạng thái / tháng / từ khoá; tổng tiền cả kết quả', () => {
    const du = duLieu()
    expect(cc.danhSachHoSo(du, { trang_thai: 'choLamHs' }).hoSo.map((d) => d.id)).toEqual(['d', 'c'])
    expect(cc.danhSachHoSo(du, { nam: 2026, thang: 4 })).toMatchObject({ soHoSo: 3, tongTien: 4_100_000 })
    expect(cc.danhSachHoSo(du, { tim: 'bia hà nội' }).hoSo.map((d) => d.id)).toEqual(['b'])
    expect(cc.danhSachHoSo(du, { tim: 'thái bình', gioi_han: 1 })).toMatchObject({ soHoSo: 1, hienThi: 1 })
  })

  it('xem_ho_so: theo id hoặc số HĐ; có dự trù, tiền bằng chữ, gợi ý ngày', () => {
    const x = cc.xemHoSo(duLieu(), { id: '13' })
    expect(x).toMatchObject({ id: 'c', trangThai: 'choLamHs', tongTien: 1_000_000, duTru: 5_000_000, tongTienBangChu: 'Một triệu đồng' })
    expect(x.goiY.ngayToTrinh).toBe('2026-04-08') // lùi 2 ngày làm việc từ thứ Sáu 10/4
    expect(x.hoaDon[0].biThayThe).toContain('ĐÃ BỊ THAY THẾ')
    expect(() => cc.xemHoSo(duLieu(), { id: 'khong-co' })).toThrow('Không có hồ sơ')
  })

  it('tra_hoa_don: bỏ hóa đơn đã bị thay thế (trừ khi hỏi), cộng tiền cả kết quả', () => {
    const du = duLieu()
    expect(cc.traHoaDon(du, { nam: 2026, thang: 4 })).toMatchObject({ soHoaDon: 2, tongTien: 3_100_000 })
    expect(cc.traHoaDon(du, { nam: 2026, thang: 4, ca_bi_thay_the: true }).soHoaDon).toBe(3)
    expect(cc.traHoaDon(du, { tim: '0100000008' }).hoaDon.map((h) => h.soHd)).toEqual(['12'])
  })

  it('tong_hop: theo tháng (đã TT / chờ KT / chưa nộp) và theo người bán', () => {
    const t = cc.tongHop(duLieu(), { nam: 2026 })
    expect(t.theoThang).toEqual([
      { thang: 3, soHd: 1, tongTien: 3_000_000, daTt: 3_000_000, choKt: 0, chuaNop: 0 },
      { thang: 4, soHd: 3, tongTien: 4_100_000, daTt: 0, choKt: 2_000_000, chuaNop: 2_100_000 },
    ])
    expect(t.theoNguoiBan[0]).toMatchObject({ ten: 'Nhà hàng A', soHd: 3, tongTien: 5_100_000 })
    expect(t.soNgayTrungBinh).toEqual({ hdDenNop: 3.5, nopDenTt: 13 })
  })
})

describe('Công cụ ghi', () => {
  it('sua_ho_so: điền ngày kế toán thanh toán -> đã thanh toán; ghi nhật ký; sai định dạng ngày thì từ chối', async () => {
    const du = duLieu()
    const { g, ghi } = noiGhi()
    await expect(cc.suaHoSo(du, ghi, { id: 'b', ngayKeToanTt: '20/04/2026' })).rejects.toThrow('yyyy-mm-dd')
    const r = await cc.suaHoSo(du, ghi, { id: 'b', ngayKeToanTt: '2026-04-20', soDntt: '15/ĐNTT' })
    expect(r).toMatchObject({ daLuu: true, trangThai: 'Đã thanh toán' })
    expect(g.hoSo[0]).toMatchObject({ id: 'b', ngayKeToanTt: '2026-04-20', soDntt: '15/ĐNTT', noiDung: 'Làm việc với PC Thái Bình' })
    expect(g.nhatKy[0]).toContain('ngayKeToanTt: "" -> "2026-04-20"')
    expect(cc.tongQuan(du).choKeToanLau).toEqual([]) // dữ liệu trong lần gọi đã cập nhật
    expect(await cc.suaHoSo(du, ghi, { id: 'b', ngayKeToanTt: '2026-04-20' })).toMatchObject({ daLuu: false })
  })

  it('sua_hoa_don: bổ sung tài khoản người bán, chỉ đổi ô được gửi', async () => {
    const du = duLieu()
    const { g, ghi } = noiGhi()
    await cc.suaHoaDon(du, ghi, { ho_so: 'c', stkNguoiBan: '0011', tenTaiKhoan: 'NHA HANG A' })
    expect(g.hoSo[0].invoices[0]).toMatchObject({ soHd: '13', stkNguoiBan: '0011', tenTaiKhoan: 'NHA HANG A', tongTien: 1_000_000 })
  })

  it('tao_ho_so từ XML: đọc đúng hóa đơn, cất file gốc, tên tài khoản không dấu; nạp lại -> báo TRÙNG, không ghi gì', async () => {
    const du = duLieu()
    const { g, ghi } = noiGhi()
    const r = await cc.taoHoSo(du, ghi, { xml: [{ ten_file: 'HD123.xml', noi_dung: XML }], noiDung: 'Mua vật tư thử', hoSoCu: true })
    expect(r).toMatchObject({ daLuu: true, tongTien: 1_188_000, hoaDonMoi: [{ soHd: '123', ngayHd: '2026-09-28', nguoiBan: 'CÔNG TY TNHH THỬ NGHIỆM' }] })
    const d = g.hoSo[0]
    expect(d.invoices[0]).toMatchObject({ kyHieu: '1C26TAA', mstNguoiBan: '0100000001', stkNguoiBan: '1234567890', tenTaiKhoan: 'CONG TY TNHH THU NGHIEM', tienThue: 88000 })
    expect(d.invoices[0].items).toHaveLength(2)
    expect(g.file).toMatchObject([{ id: d.invoices[0].fileIds[0], name: 'HD123.xml' }])
    expect(new TextDecoder().decode(g.file[0].data)).toBe(XML)

    await expect(cc.taoHoSo(du, ghi, { xml: [{ ten_file: 'HD123 (1).xml', noi_dung: XML }] })).rejects.toThrow('TRÙNG')
    expect(g.hoSo).toHaveLength(1)
    expect(g.file).toHaveLength(1)
    await expect(cc.taoHoSo(du, ghi, { xml: [{ ten_file: 'x.xml', noi_dung: '<a>khong phai hoa don</a>' }] })).rejects.toThrow('Không nhận ra cấu trúc')
  })

  it('tao_ho_so nhập tay vào hồ sơ có sẵn: tự cộng tổng, tự viết chữ; dò được rượu', async () => {
    const du = duLieu()
    const { g, ghi } = noiGhi()
    const r = await cc.taoHoSo(du, ghi, { vao_ho_so: 'c', hoa_don_nhap_tay: [{ soHd: '99', ngayHd: '2026-04-11', tenNguoiBan: 'Quán C', mstNguoiBan: '0300000003', tienTruocThue: 500_000, tienThue: 40_000,
      items: [{ ten: 'Rượu vang đỏ', dvt: 'chai', soLuong: 1, donGia: 500000, thanhTien: 500000, thueSuat: '8%' }] }] })
    expect(r.tongTien).toBe(1_540_000)
    expect(g.hoSo[0].id).toBe('c')
    expect(g.hoSo[0].invoices[1]).toMatchObject({ tongTien: 540_000, tienBangChu: 'Năm trăm bốn mươi nghìn đồng' })
    expect(r.canhBao.join(' | ')).toContain('RƯỢU/BIA')
  })

  it('xoa_ho_so: sai xác nhận thì KHÔNG xoá và trả chuỗi cần xác nhận', async () => {
    const du = duLieu()
    const { g, ghi } = noiGhi()
    const r = await cc.xoaHoSo(du, ghi, { id: 'c', xac_nhan: 'c' })
    expect(r).toMatchObject({ daXoa: false, canXacNhan: 'Hội nghị CBM' })
    expect(g.xoa).toEqual([])
    expect(await cc.xoaHoSo(du, ghi, { id: 'c', xac_nhan: 'hội nghị cbm' })).toMatchObject({ daXoa: true })
    expect(g.xoa).toEqual(['c'])
    expect(g.nhatKy[0]).toContain('XOÁ hồ sơ "Hội nghị CBM"')
    expect(du.hoSo.map((d) => d.id)).not.toContain('c')
  })
})

const truoc = (n: number) => toIso(new Date(Date.now() - n * 86400000))

describe('Chờ kế toán quá lâu — cả hóa đơn cũ nhập kho', () => {
  const cu = (o: Partial<Dossier>) => hs({ hoSoCu: true, invoices: [hd({ soHd: '7', ngayHd: truoc(60), tongTien: 9_000_000 })], ...o })
  it('nộp kế toán quá 15 ngày -> cảnh báo + vào danh sách chờ lâu', () => {
    const d = cu({ id: 'x', ngayNopKeToan: truoc(20) })
    expect(warningsOf(d, DEFAULT_SETTINGS)).toEqual(['Đã nộp kế toán 20 ngày, chưa được thanh toán'])
    expect(cc.tongQuan({ ...duLieu(), hoSo: [d] }).choKeToanLau.map((x) => x.id)).toEqual(['x'])
  })
  it('chưa ghi ngày nộp -> tính từ ngày hóa đơn, nói rõ', () => {
    expect(warningsOf(cu({}), DEFAULT_SETTINGS)).toEqual(['Hóa đơn đã 60 ngày chưa được thanh toán (chưa ghi ngày nộp kế toán)'])
    expect(waitingDays(cu({}))).toBe(60)
  })
  it('mới nộp 9 ngày, hoặc đã thanh toán -> không cảnh báo', () => {
    expect(warningsOf(cu({ ngayNopKeToan: truoc(9) }), DEFAULT_SETTINGS)).toEqual([])
    expect(warningsOf(cu({ ngayKeToanTt: truoc(1) }), DEFAULT_SETTINGS)).toEqual([])
  })
})

describe('sua_nhieu_ho_so — sửa ngày hàng loạt', () => {
  it('xem trước: báo đổi gì, KHÔNG ghi', async () => {
    const du = duLieu()
    const { g, ghi } = noiGhi()
    const r = await cc.suaNhieuHoSo(du, ghi, { ho_so: ['b', '13'], ngayKeToanTt: '2026-04-20', chi_xem_truoc: true })
    expect(r).toMatchObject({ daLuu: false, xemTruoc: true, soHoSoGui: 2, soHoSoDoi: 2 })
    expect(r.hoSo.find((x) => x.id === 'b')).toMatchObject({ trangThaiMoi: 'Đã thanh toán', thayDoi: ['ngayKeToanTt: "" -> "2026-04-20"'] })
    expect(g.hoSo).toEqual([])
    expect(g.nhatKy).toEqual([])
  })
  it('ghi thật: chỉ ghi hồ sơ thực sự đổi, 1 dòng nhật ký; báo ngày ngược', async () => {
    const du = duLieu()
    const { g, ghi } = noiGhi()
    // 'a' đã có ngày thanh toán 20/03 -> đặt lại đúng ngày đó thì không đổi; 'c' chưa nộp kế toán mà có ngày TT 01/04 trước HĐ 10/04
    const r = await cc.suaNhieuHoSo(du, ghi, { ho_so: ['a', 'b', 'c'], ngayKeToanTt: '2026-03-20' })
    expect(r).toMatchObject({ daLuu: true, soHoSoDoi: 2, khongDoi: ['Làm việc với PC Hưng Yên'] })
    expect(g.hoSo.map((d) => [d.id, d.ngayKeToanTt])).toEqual([['b', '2026-03-20'], ['c', '2026-03-20']])
    expect(r.hoSo.find((x) => x.id === 'b')!.ngayNguoc).toEqual(['Ngày kế toán thanh toán TRƯỚC ngày nộp'])
    expect(g.nhatKy).toHaveLength(1)
    expect(g.nhatKy[0]).toContain('Sửa ngày 2 hồ sơ (ngayKeToanTt=2026-03-20)')
  })
  it('"theo_hd" lấy ngày hóa đơn của từng hồ sơ; "" xoá ngày', async () => {
    const du = duLieu()
    const { g, ghi } = noiGhi()
    await cc.suaNhieuHoSo(du, ghi, { ho_so: ['c', 'd'], ngayDntt: 'theo_hd', ngayToTrinh: '' })
    expect(g.hoSo.map((d) => [d.id, d.ngayDntt])).toEqual([['c', '2026-04-10'], ['d', '2026-04-12']])
  })
  it('một mã sai / ngày sai định dạng / không có ngày nào -> từ chối, không ghi gì', async () => {
    const du = duLieu()
    const { g, ghi } = noiGhi()
    await expect(cc.suaNhieuHoSo(du, ghi, { ho_so: ['b', 'khong-co'], ngayKeToanTt: '2026-04-20' })).rejects.toThrow('Không có hồ sơ')
    await expect(cc.suaNhieuHoSo(du, ghi, { ho_so: ['b'], ngayKeToanTt: '20/04/2026' })).rejects.toThrow('yyyy-mm-dd')
    await expect(cc.suaNhieuHoSo(du, ghi, { ho_so: ['b'] })).rejects.toThrow('Chưa có ngày nào')
    expect(g.hoSo).toEqual([])
  })
})

describe('Hashtag công việc qua AI', () => {
  it('gan_tag: xem trước không ghi; ghi thật giữ tag cũ, bỏ trùng, chuẩn hoá "#cbm" -> CBM, 1 dòng nhật ký', async () => {
    const du = duLieu()
    du.hoSo[0].tags = ['KHCN']
    const { g, ghi } = noiGhi()
    const xt = await cc.ganTag(du, ghi, { ho_so: ['a', 'b'], them: ['#cbm', 'CBM'], chi_xem_truoc: true })
    expect(xt).toMatchObject({ daLuu: false, soHoSoDoi: 2, hoSo: [{ id: 'a', tagCu: ['KHCN'], tagMoi: ['KHCN', 'CBM'] }, { id: 'b', tagCu: [], tagMoi: ['CBM'] }] })
    expect(g.hoSo).toEqual([])
    await cc.ganTag(du, ghi, { ho_so: ['a', 'b'], them: ['#cbm'] })
    expect(g.hoSo.map((d) => [d.id, d.tags])).toEqual([['a', ['KHCN', 'CBM']], ['b', ['CBM']]])
    expect(g.nhatKy).toEqual(['gan_tag: Gắn #CBM cho 2 hồ sơ: Làm việc với PC Hưng Yên; Làm việc với PC Thái Bình'])
    await cc.ganTag(du, ghi, { ho_so: ['a'], bo: ['khcn'] })
    expect(g.hoSo.at(-1)!.tags).toEqual(['CBM'])
    await expect(cc.ganTag(du, ghi, { ho_so: ['a', 'khong-co'], them: ['SCL'] })).rejects.toThrow('Không có hồ sơ')
    expect((await cc.ganTag(du, ghi, { ho_so: ['c'], them: ['CBMM'], chi_xem_truoc: true })).tagLa).toEqual(['CBMM'])
  })
  it('lọc + thống kê theo tag; sua_ho_so chuẩn hoá tag', async () => {
    const du = duLieu()
    const { ghi } = noiGhi()
    await cc.suaHoSo(du, ghi, { id: 'a', tags: ['#khcn', ' sáng kiến ', 'KHCN'] })
    expect(du.hoSo.find((d) => d.id === 'a')!.tags).toEqual(['KHCN', 'SANGKIEN'])
    expect(cc.danhSachHoSo(du, { tag: '#KHCN' }).hoSo.map((d) => d.id)).toEqual(['a'])
    expect(cc.danhSachHoSo(du, { tag: 'chưa gắn' }).soHoSo).toBe(3)
    expect(cc.traHoaDon(du, { tag: 'sangkien' })).toMatchObject({ soHoaDon: 1, tongTien: 3_000_000 })
    expect(cc.tongHop(du, { nam: 2026 }).theoViec.map((t) => [t.tag, t.soHoSo, t.tongTien])).toEqual([
      ['#KHCN', 1, 3_000_000], ['#SANGKIEN', 1, 3_000_000], ['(chưa gắn)', 3, 4_100_000],
    ])
  })
})
