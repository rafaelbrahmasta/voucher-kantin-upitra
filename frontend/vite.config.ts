import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Build untuk produksi: Go serve React SPA di /app/*
  // Semua asset path akan menjadi /app/assets/... sesuai route Go
  base: '/app/',
  server: {
    port: 5173,
    // Saat dev, override base agar tetap '/' supaya mudah diakses di localhost:5173
    // (base '/app/' tidak mempengaruhi dev server behavior URL)
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
})
