import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { DialogHost } from './lib/dialog'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <DialogHost />
  </StrictMode>,
)
