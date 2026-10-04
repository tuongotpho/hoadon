# Quản lý hóa đơn — tờ trình & đề nghị thanh toán

App chạy **offline trên máy**, mở bằng trình duyệt tại `http://localhost:5180`.

## Cài đặt (bản dùng hằng ngày)
Có 2 bản trong thư mục `release`:
- **`QuanLyHoaDon-Portable-x.y.z.exe`** — 1 file, không cần cài, nháy đúp là chạy (mở chậm hơn vài giây vì tự giải nén).
- **`QuanLyHoaDon-Setup-x.y.z.exe`** — bộ cài, có biểu tượng trên màn hình.

Hai bản dùng **chung** dữ liệu trên cùng máy. Chạy bộ cài → biểu tượng "Quản lý hóa đơn" trên màn hình.
- Windows báo "Windows protected your PC" → **More info → Run anyway** (bộ cài chưa có chữ ký số).
- File Word xuất ra cất ở `Documents\Hoa don xuat` và tự mở bằng Word.
- Dữ liệu ở `%APPDATA%\Quản lý hóa đơn`. Gỡ app **không** xóa dữ liệu.
- Menu **Trợ giúp**: mở thư mục file đã xuất, thư mục dữ liệu, xem phiên bản.

Đóng gói lại sau khi sửa code: `npm run dong-goi` (tắt `npm run dev` trước — máy chủ thử nghiệm khóa thư mục `release`).
Kiểm tra bản đóng gói: `node scripts/kiem-tra-app.mjs "release\win-unpacked\Quản lý hóa đơn.exe"`.

## Chạy bản thử trong trình duyệt (cho người sửa code)
Nháy đúp **`Mo app hoa don.bat`** → `localhost:5180`. Dữ liệu ở đây **tách riêng** với bản cài đặt — chuyển qua lại bằng Sao lưu / Nạp lại.

## Quy trình
1. **Cài đặt** → điền họ tên, bộ phận, kính gửi... (làm 1 lần).
2. **Hồ sơ thanh toán** → kéo thả file hóa đơn vào ô. File **XML** hoặc **PDF hóa đơn điện tử** tự điền số HĐ, ngày, người bán, MST, tài khoản, tiền (PDF: soát lại). Ảnh chụp/scan thì nhập tay.
   Điền thêm: nội dung, đơn vị đến làm việc, **số tiền dự trù** (tờ trình), **thành phần tham gia**.
3. Ngày tờ trình tự lùi trước ngày hóa đơn (mặc định 2 ngày làm việc, đổi ở Cài đặt).
4. Bấm **Xuất cả 2 file Word**, mở bằng Word rồi in.
5. Nộp kế toán / nhận tiền: bấm "Hôm nay" ở hồ sơ hoặc ngay trên danh sách.

## Tổng hợp
Trang **Tổng hợp**: lọc theo năm/tháng; tiền đã thanh toán / chờ kế toán / chưa nộp; bảng theo tháng, theo người bán; danh sách việc cần xử lý; bảng kê từng hóa đơn xuất Excel.

## Mẫu in
Mẫu mặc định là **mẫu thật trong thư mục `HD-Hung Yen`**, đã gắn ô bằng `npm run gan-o-mau` (script `scripts/gan-o-mau.mjs`).
Muốn dùng mẫu khác: trang **Mẫu in** → up .docx đã gõ các ô `{tong_tien}`, `{du_tru}`... Danh sách ô có ngay trên trang.

## Dữ liệu & sao lưu
- Dữ liệu nằm trong trình duyệt của **máy này**, gắn với địa chỉ `localhost:5180` (không đổi cổng).
- **Cài đặt → Tải bản sao lưu (.zip)** mỗi tuần, cất ra USB/Drive.
- Không dùng chế độ ẩn danh, không xóa dữ liệu duyệt web của trang này.

## Chuyển sang online sau này
Mọi chỗ đọc/ghi dữ liệu đi qua `src/lib/store/DataStore.ts`. Muốn lên mạng:
1. Viết `FirebaseStore implements DataStore` (Firestore cho hồ sơ/cài đặt, Storage cho file và mẫu).
2. Đổi 1 dòng trong `src/lib/store/index.ts`.
3. Nạp file sao lưu .zip vào bản online để chuyển dữ liệu cũ sang.

## Cho người sửa code
```
npm test          # 34 bài kiểm tra (gồm nghiệm thu so khớp với hồ sơ Hưng Yên thật)
npm run dev       # chạy thử
npm run gan-o-mau        # gắn lại ô vào 2 mẫu trong HD-Hung Yen -> public/mau/
```
