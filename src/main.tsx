import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { DialogHost, hoi } from './lib/dialog'

// Trang đang mở là bản cũ, web vừa có bản mới -> tệp cũ không còn. Hỏi tải lại trang (1 lần).
let daHoi = false
window.addEventListener('vite:preloadError', () => {
  if (daHoi) return
  daHoi = true
  void hoi('App vừa có bản cập nhật trên mạng. Tải lại trang để dùng bản mới?', { okLabel: 'Tải lại trang' }).then((ok) => ok && location.reload())
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <DialogHost />
  </StrictMode>,
)
