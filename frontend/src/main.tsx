import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Saat di-build (produksi), Vite menetapkan BASE_URL = '/app/' sesuai vite.config.ts.
// BrowserRouter perlu tahu basename agar Link/NavLink menghasilkan path yang benar.
// Hapus trailing slash: '/app/' → '/app'
const basename = (import.meta.env.BASE_URL as string).replace(/\/$/, '') || ''

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
