// Máy chủ MCP "hoadon": cho Claude Code / Claude Desktop / claude.ai / Codex... tra cứu và sửa hồ sơ hóa đơn
// bằng ĐÚNG phần tính toán của web app. Dữ liệu là dữ liệu thật trên mây (Firebase của chính người dùng).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as cc from './congCu.js'
import type { DuLieu, NoiGhi } from './congCu.js'

const HUONG_DAN = `Máy chủ quản lý hóa đơn đỏ (hóa đơn GTGT) đi công tác / tiếp khách: mỗi HỒ SƠ = một việc đi làm, gồm 1 hoặc nhiều hóa đơn, kèm tờ trình xin chủ trương và giấy đề nghị thanh toán (ĐNTT).
- Tiền tính bằng đồng (VND), số nguyên. Ngày dạng yyyy-mm-dd.
- 5 mốc của hồ sơ: ngày hóa đơn -> ngày tờ trình (thường TRƯỚC ngày hóa đơn) -> ngày ĐNTT -> ngày nộp kế toán (ngayNopKeToan) -> ngày kế toán thanh toán (ngayKeToanTt).
- Trạng thái: chuaHd (chưa có hóa đơn), choLamHs (chờ làm tờ trình/ĐNTT), choNop (chờ nộp kế toán), choKt (chờ kế toán thanh toán), daTt (đã thanh toán). Trạng thái tự suy ra từ các ngày, không sửa trực tiếp.
- hoSoCu = hóa đơn cũ nhập vào kho: chỉ cần tiền + đã/chưa thanh toán, không bắt buộc tờ trình.
- Quy định: không thanh toán rượu/bia (app tự dò); hóa đơn từ ngưỡng (mặc định 5 triệu) phải có số tài khoản + tên tài khoản người bán; hóa đơn ĐÃ BỊ THAY THẾ không dùng để thanh toán.
- Bắt đầu bằng tong_quan. Số liệu chỉ lấy từ hồ sơ đã có — thiếu thì nói rõ là thiếu, KHÔNG đoán số.
- Công cụ ghi (sua_ho_so, sua_hoa_don, tao_ho_so, xoa_ho_so) thay đổi dữ liệu THẬT — chỉ gọi khi người dùng yêu cầu rõ. Mọi lần ghi/xoá được ghi nhật ký; người dùng xem và thu hồi quyền của máy này trên web app (Cài đặt).
- xoa_ho_so không hoàn tác được: phải hỏi người dùng, nêu đúng tên hồ sơ, được đồng ý rồi mới gửi xac_nhan.
- In tờ trình / ĐNTT ra Word làm trên web app (https://hoadon-npsc.web.app), không làm qua đây.`

const json = (x: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(x, null, 1) }] })
type KetQua = { content: { type: 'text'; text: string }[]; isError?: boolean }

/** Nguồn dữ liệu cắm vào máy chủ: đọc (tải 1 lần mỗi yêu cầu) và chỗ ghi */
export interface NguonMcp {
  lay(): Promise<DuLieu>
  ghi: NoiGhi
}

const trangThai = z.enum(['chuaHd', 'choLamHs', 'choNop', 'choKt', 'daTt'])
const nam = z.number().int().min(2000).max(2100)
const thang = z.number().int().min(1).max(12)
const ngay = z.string().describe('yyyy-mm-dd, hoặc "" để xoá ngày')
const oHoSo = {
  noiDung: z.string().optional().describe('Nội dung công việc, vd "Làm việc với Công ty Điện lực Hưng Yên về công tác CBM năm 2026"'),
  doiTac: z.string().optional().describe('Đơn vị đến làm việc'),
  nguoiDeNghi: z.string().optional().describe('Người đề nghị thanh toán'),
  nhiemVu: z.string().optional().describe('"...trong việc ___ của Công ty"'),
  lyDo: z.string().optional(),
  ghiChu: z.string().optional(),
  soToTrinh: z.string().optional(),
  soDntt: z.string().optional(),
  hinhThucTt: z.string().optional().describe('Chuyển khoản / Tiền mặt'),
  ngayToTrinh: ngay.optional(),
  ngayDntt: ngay.optional(),
  ngayNopKeToan: ngay.optional().describe('Ngày nộp hồ sơ cho kế toán. yyyy-mm-dd hoặc ""'),
  ngayKeToanTt: ngay.optional().describe('Ngày kế toán đã thanh toán. yyyy-mm-dd hoặc ""'),
  duTru: z.number().min(0).optional().describe('Số tiền dự trù trong tờ trình; 0 = theo quy tắc ngưỡng'),
  thanhPhan: z.array(z.object({ donVi: z.string(), soNguoi: z.number().int().min(0) })).optional().describe('Thành phần tham gia (thay cả danh sách)'),
  hoSoCu: z.boolean().optional().describe('true = hóa đơn cũ nhập kho (không cần tờ trình)'),
}
const oHoaDon = {
  kyHieu: z.string().optional().describe('Ký hiệu, vd 1C26TAA'),
  soHd: z.string().optional(),
  ngayHd: z.string().optional().describe('yyyy-mm-dd'),
  tenNguoiBan: z.string().optional(),
  mstNguoiBan: z.string().optional(),
  diaChiNguoiBan: z.string().optional(),
  stkNguoiBan: z.string().optional().describe('Số tài khoản ngân hàng người bán'),
  nganHangNguoiBan: z.string().optional(),
  tenTaiKhoan: z.string().optional().describe('Tên chủ tài khoản (không dấu, như sao kê)'),
  tienBangChu: z.string().optional().describe('Dòng "số tiền viết bằng chữ" in trên hóa đơn'),
  tienTruocThue: z.number().optional(),
  tienThue: z.number().optional(),
  tongTien: z.number().optional(),
}

export function taoMayChu(nguon: NguonMcp) {
  const server = new McpServer({ name: 'hoadon', version: '1.0.0' }, { instructions: HUONG_DAN })

  // Bọc mọi công cụ: lỗi do người dùng/dữ liệu thì trả lời rõ ràng (isError) thay vì làm sập máy chủ
  const boc = <A,>(fn: (d: DuLieu, a: A) => unknown) => async (a: A): Promise<KetQua> => {
    try {
      return json(await fn(await nguon.lay(), a))
    } catch (e) {
      return { ...json({ loi: (e as Error).message }), isError: true }
    }
  }
  const chiDoc = { readOnlyHint: true, openWorldHint: false } as const
  const ghiDuoc = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const

  server.registerTool('tong_quan', {
    title: 'Tổng quan hồ sơ hóa đơn',
    description: 'Bức tranh toàn bộ: số hồ sơ và tiền theo từng trạng thái, hồ sơ chờ kế toán quá lâu, các hồ sơ đang có cảnh báo (rượu/bia, vượt dự trù, thiếu số tài khoản, ngày ngược, hóa đơn bị thay thế…), và các ngưỡng quy tắc đang dùng. Gọi đầu tiên.',
    inputSchema: {},
    annotations: chiDoc,
  }, boc((d) => cc.tongQuan(d)))

  server.registerTool('danh_sach_ho_so', {
    title: 'Danh sách hồ sơ',
    description: 'Lọc hồ sơ theo trạng thái, năm/tháng hóa đơn, từ khoá (nội dung, đơn vị, người bán, MST, số HĐ, tên hàng, số tờ trình…). Trả tổng tiền của toàn bộ kết quả và tối đa gioi_han dòng, mỗi dòng có id để xem / sửa.',
    inputSchema: {
      trang_thai: trangThai.optional(),
      nam: nam.optional(), thang: thang.optional(),
      tim: z.string().optional().describe('Từ khoá'),
      xep: z.enum(['ngayHd', 'tongTien', 'capNhat']).optional().describe('Mặc định ngayHd (mới nhất trên cùng)'),
      tang_dan: z.boolean().optional(),
      gioi_han: z.number().int().min(1).max(500).optional().describe('Mặc định 50'),
    },
    annotations: chiDoc,
  }, boc(cc.danhSachHoSo))

  server.registerTool('xem_ho_so', {
    title: 'Xem chi tiết hồ sơ',
    description: 'Toàn bộ một hồ sơ: các hóa đơn (dòng hàng, người bán, tài khoản, file gốc), các mốc ngày, trạng thái, dự trù, tổng tiền bằng chữ, cảnh báo, hàng cấm, và ngày gợi ý cho tờ trình / ĐNTT.',
    inputSchema: { id: z.string().describe('id hồ sơ, hoặc số hóa đơn (nếu chỉ có ở 1 hồ sơ)') },
    annotations: chiDoc,
  }, boc(cc.xemHoSo))

  server.registerTool('tra_hoa_don', {
    title: 'Tra hóa đơn',
    description: 'Tìm hóa đơn (từng tờ, không theo hồ sơ) theo năm/tháng, trạng thái hồ sơ, từ khoá. Mặc định bỏ hóa đơn đã bị thay thế. Trả tổng tiền trước thuế / thuế / tổng của toàn bộ kết quả.',
    inputSchema: {
      nam: nam.optional(), thang: thang.optional(),
      trang_thai: trangThai.optional(),
      tim: z.string().optional().describe('Người bán, MST, số HĐ, ký hiệu, tên hàng, nội dung hồ sơ'),
      ca_bi_thay_the: z.boolean().optional().describe('true = gồm cả hóa đơn đã bị thay thế'),
      gioi_han: z.number().int().min(1).max(500).optional().describe('Mặc định 50'),
    },
    annotations: chiDoc,
  }, boc(cc.traHoaDon))

  server.registerTool('tong_hop', {
    title: 'Tổng hợp theo năm',
    description: 'Như trang Tổng hợp của app: từng tháng (số HĐ, tổng tiền, đã thanh toán / chờ kế toán / chưa nộp), xếp hạng người bán, số ngày trung bình từ hóa đơn đến nộp kế toán và từ nộp đến được thanh toán.',
    inputSchema: { nam: nam.optional().describe('Mặc định năm mới nhất có hóa đơn'), top: z.number().int().min(1).max(200).optional().describe('Số người bán (mặc định 20)') },
    annotations: chiDoc,
  }, boc(cc.tongHop))

  server.registerTool('sua_ho_so', {
    title: 'Sửa hồ sơ / cập nhật mốc ngày',
    description: 'Đổi các ô của MỘT hồ sơ (chỉ gửi ô cần đổi): nội dung, đơn vị, người đề nghị, số + ngày tờ trình, số + ngày ĐNTT, ngày nộp kế toán, ngày kế toán thanh toán, dự trù, thành phần tham gia… Vd "đã nộp kế toán hôm nay" = ngayNopKeToan. Trả danh sách thay đổi và cảnh báo mới.',
    inputSchema: { id: z.string().describe('id hồ sơ hoặc số hóa đơn'), ...oHoSo },
    annotations: { ...ghiDuoc, idempotentHint: true },
  }, boc((d, a: cc.ThamSoSuaHoSo) => cc.suaHoSo(d, nguon.ghi, a)))

  server.registerTool('sua_hoa_don', {
    title: 'Sửa thông tin một hóa đơn',
    description: 'Sửa ô của MỘT hóa đơn trong hồ sơ (chỉ gửi ô cần đổi) — hay dùng để bổ sung số tài khoản / ngân hàng / tên tài khoản người bán, hoặc sửa số liệu đọc sai từ PDF.',
    inputSchema: { ho_so: z.string().describe('id hồ sơ hoặc số hóa đơn'), hoa_don: z.string().optional().describe('Số HĐ hoặc id hóa đơn — bắt buộc nếu hồ sơ có nhiều hóa đơn'), ...oHoaDon },
    annotations: { ...ghiDuoc, idempotentHint: true },
  }, boc((d, a: { ho_so: string; hoa_don?: string } & cc.SuaHoaDon) => cc.suaHoaDon(d, nguon.ghi, a)))

  server.registerTool('tao_ho_so', {
    title: 'Tạo hồ sơ / thêm hóa đơn',
    description: 'Tạo hồ sơ mới — hoặc thêm hóa đơn vào hồ sơ có sẵn (vao_ho_so) — từ file XML hóa đơn điện tử (gửi nguyên văn, app tự đọc và cất file gốc) và/hoặc số liệu hóa đơn nhập tay (vd đọc từ PDF). Hóa đơn trùng (cùng số + ngày + MST người bán đã có) thì từ chối, không ghi gì. File PDF gốc người dùng tự đính kèm trên web app.',
    inputSchema: {
      xml: z.array(z.object({ ten_file: z.string(), noi_dung: z.string().describe('Nội dung XML nguyên văn') })).optional(),
      hoa_don_nhap_tay: z.array(z.object({
        ...oHoaDon,
        items: z.array(z.object({ ten: z.string(), dvt: z.string(), soLuong: z.number(), donGia: z.number(), thanhTien: z.number(), thueSuat: z.string() })).optional().describe('Dòng hàng (để app dò rượu/bia)'),
      })).optional(),
      vao_ho_so: z.string().optional().describe('id hồ sơ có sẵn để thêm hóa đơn vào; bỏ trống = tạo hồ sơ mới'),
      ...oHoSo,
    },
    annotations: { ...ghiDuoc, idempotentHint: false },
  }, boc((d, a: cc.ThamSoTaoHoSo) => cc.taoHoSo(d, nguon.ghi, a)))

  server.registerTool('xoa_ho_so', {
    title: 'XOÁ một hồ sơ (không hoàn tác)',
    description: 'Xoá hẳn MỘT hồ sơ cùng file hóa đơn gốc. KHÔNG hoàn tác được. Bắt buộc: hỏi người dùng trước, nêu đúng tên hồ sơ; chỉ khi họ đồng ý mới gửi xac_nhan = đúng tên hồ sơ (nội dung công việc, hoặc "HĐ <số>" nếu chưa có nội dung). Gửi sai xac_nhan thì không xoá và trả về chuỗi cần xác nhận.',
    inputSchema: { id: z.string().describe('id hồ sơ'), xac_nhan: z.string().describe('Đúng bằng tên hồ sơ') },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, boc((d, a: { id: string; xac_nhan: string }) => cc.xoaHoSo(d, nguon.ghi, a)))

  return server
}
