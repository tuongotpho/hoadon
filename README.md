# Quản lý hóa đơn — tờ trình & đề nghị thanh toán

Web app **chỉ chạy online**: https://hoadon-npsc.web.app (Firebase Hosting, site `hoadon-npsc`) — bản phụ https://hoadon-npsc.vercel.app — đăng nhập Google, dữ liệu cất trên Firebase
(dự án `app-from-ai`, database Firestore `hoadon`, kho file Storage `hoadon-npsc`). Mỗi tài khoản chỉ thấy dữ liệu của mình.

## Quy trình
1. **Cài đặt** → danh sách người đề nghị, nhiệm vụ, quy tắc tiền (ngưỡng 5 triệu), từ khóa cấm (rượu/bia).
2. **Hồ sơ thanh toán** → kéo thả file hóa đơn: **XML** hoặc **PDF hóa đơn điện tử** tự điền số, ngày, người bán, MST, tiền
   (đã thử mẫu Viettel, MISA, VNPT, Bkav, hộ kinh doanh). Ảnh chụp / scan thì nhập tay.
3. Dự trù tự động: HĐ < 5 triệu → 5 triệu, còn lại 20 triệu. HĐ < 5 triệu không in thông tin tài khoản người bán.
4. **Xem trước** rồi **Xuất 2 file Word** (tờ trình + đề nghị thanh toán) để in.
5. Theo dõi ngày: tờ trình, ĐNTT, nộp kế toán, kế toán thanh toán. Tick nhiều hồ sơ để **sửa ngày / xóa hàng loạt**.

Cảnh báo: rượu/bia trên hóa đơn, hóa đơn **đã bị thay thế / điều chỉnh**, bản nháp "chưa cấp số", chữ ≠ số tiền, ngày ngược.

## Hóa đơn cũ
**📥 Nhập hóa đơn cũ**: thả nhiều file một lúc, mỗi hóa đơn thành 1 hồ sơ "HĐ cũ" (chỉ cần tiền + đã/chưa thanh toán).
**Trùng** = cùng số + ngày xuất + MST đơn vị xuất → bỏ qua.

## Tổng hợp
Theo tháng, theo người bán, việc cần xử lý, bảng kê hóa đơn xuất Excel.

## Mẫu in
Mẫu mặc định gắn ô từ mẫu thật thư mục `HD-Hung Yen` (chỉ trên máy, không đưa lên git) bằng `scripts/gan-o-mau.mjs`.
Muốn dùng mẫu khác: trang **Mẫu in** → up .docx có các ô `{tong_tien}`, `{du_tru}`…

## Sao lưu
Cài đặt → **Tải bản sao lưu (.zip)**: toàn bộ hồ sơ + file + mẫu, nạp lại được vào tài khoản bất kỳ.

## Kết nối AI (MCP) — hỏi Claude / Codex về hồ sơ
Cùng cách làm với app khai thuế. Gõ một lần trên máy cần dùng (PowerShell):
```
claude mcp add --transport http hoadon https://hoadon-npsc.vercel.app/mcp
```
Lần đầu dùng, trình duyệt mở trang **"Cho phép AI truy cập hồ sơ hóa đơn"** → đăng nhập Google (đúng tài khoản dùng app) → xong. Claude Desktop / claude.ai: thêm "custom connector" cùng địa chỉ. Lệnh này cũng có ở trang Cài đặt (bấm để chép).
- AI làm việc **bằng quyền của chính tài khoản Google đó** — luật phân quyền Firebase vẫn canh cửa. Máy chủ không có chìa khoá tổng.
- Đọc: `tong_quan`, `danh_sach_ho_so`, `xem_ho_so`, `tra_hoa_don`, `tong_hop` — dùng đúng hàm tính của app (trạng thái, cảnh báo, dự trù, hóa đơn bị thay thế, rượu/bia).
- Ghi: `sua_ho_so` (mốc ngày, số tờ trình/ĐNTT…), `sua_hoa_don` (tài khoản người bán…), `tao_ho_so` (từ XML hoặc số liệu nhập tay; hóa đơn trùng bị chặn). `xoa_ho_so` phải gửi đúng tên hồ sơ làm xác nhận.
- Mỗi máy là một **phiên** — xem và **Thu hồi** ở trang Cài đặt; ở đó cũng có nhật ký mọi lần AI sửa / xoá.
- Máy chủ chạy trên **Vercel** (`api/mcp.ts` → `mcp/web.ts`), vì Firebase Hosting không chạy được máy chủ. Cần biến môi trường bí mật `HOADON_MCP_KHOA` (≥ 32 ký tự) trên Vercel. Đổi khoá = mọi máy phải kết nối lại.
- Code trong `mcp/` dùng chung `src/lib` → import trong các file đó phải có đuôi `.js` (Vercel chạy Node ESM, thiếu đuôi là sập).

## Cho người sửa code
```
npm run dev            # chạy thử trên máy: http://localhost:5180 (đăng nhập Google được ở localhost)
npm test               # kiểm tra tự động
npm run test:firebase  # kiểm tra trên Firebase giả lập (cần Java) — gồm cả vòng AI ↔ web app qua MCP
npm run mcp:web        # chạy thử máy chủ MCP trên máy: http://localhost:8788/mcp (⚠️ dữ liệu thật)
npm run deploy         # build + đưa lên https://hoadon-npsc.web.app (CHỈ site hoadon-npsc)
npm run deploy:rules   # đặt quy tắc bảo mật cho database "hoadon" + kho "hoadon-npsc" (CHỈ 2 chỗ này)
```
Đẩy lên nhánh `main` → Vercel tự build (~1 phút). Trước khi đẩy: dò số liệu hóa đơn thật (kho GitHub đang công khai).
