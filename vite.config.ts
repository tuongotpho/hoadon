import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Cổng cố định: dữ liệu trình duyệt gắn với địa chỉ localhost:5180,
// đổi cổng là trình duyệt coi như "trang khác" và không thấy dữ liệu cũ.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // không theo dõi thư mục bộ cài — tránh khóa thư mục khi đóng gói trên Windows
  server: { port: 5180, strictPort: true, watch: { ignored: ['**/release/**', '**/HD-Hung Yen/**'] } },
  preview: { port: 5180, strictPort: true },
  test: { environment: 'jsdom' },
})
