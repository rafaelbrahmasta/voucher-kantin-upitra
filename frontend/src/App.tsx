import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { Shield, Coins, QrCode, ArrowRight } from 'lucide-react'

// Admin IT Pages
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminStaffPage from './pages/admin/AdminStaffPage'
import AdminTenantsPage from './pages/admin/AdminTenantsPage'
import AdminTransactionsPage from './pages/admin/AdminTransactionsPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'

// Finance Pages
import FinanceLayout from './pages/finance/FinanceLayout'
import FinanceDashboard from './pages/finance/FinanceDashboard'
import FinancePayoutsPage from './pages/finance/FinancePayoutsPage'
import FinanceLoginPage from './pages/finance/FinanceLoginPage'

// Kasir Pages
import ScanPage from './pages/kasir/ScanPage'
import KasirLoginPage from './pages/kasir/KasirLoginPage'

function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white flex flex-col justify-between font-sans">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-md bg-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="font-extrabold text-white text-lg">UP</span>
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">Voucher Kantin UPITRA</h1>
              <p className="text-xs text-blue-200/70">Universitas Pignatelli Triputra</p>
            </div>
          </div>
          <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-400/30 px-3 py-1 rounded-full font-medium">
            React v18 SPA
          </span>
        </div>
      </header>

      {/* Main Hero */}
      <main className="max-w-5xl mx-auto px-6 py-12 flex-1 flex flex-col justify-center">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-white to-blue-300">
            Sistem Digital Voucher Kantin Kampus
          </h2>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Portal terintegrasi untuk kasir stan kantin, manajemen data dosen & staf, serta audit keuangan subsidi kampus.
          </p>
        </div>

        {/* Portal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Kasir */}
          <Link
            to="/scan"
            className="group relative rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-lg hover:bg-white/10 hover:border-emerald-500/50 transition-all duration-300 shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-1 text-white group-hover:text-emerald-300 transition-colors">
                Kasir Stan Kantin
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Scan QR voucher dosen/staf via kamera HP dan klaim pesanan menu makan/minum.
              </p>
            </div>
            <div className="flex items-center text-xs font-semibold text-emerald-400 gap-1 group-hover:translate-x-1 transition-transform">
              Buka Scanner <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Card 2: Admin Super IT */}
          <Link
            to="/admin"
            className="group relative rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-lg hover:bg-white/10 hover:border-blue-500/50 transition-all duration-300 shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-1 text-white group-hover:text-blue-300 transition-colors">
                Admin Super IT
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Kelola master data dosen & staf, penerbitan kuota voucher harian, dan stan kantin.
              </p>
            </div>
            <div className="flex items-center text-xs font-semibold text-blue-400 gap-1 group-hover:translate-x-1 transition-transform">
              Masuk Portal IT <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Card 3: Biro Keuangan */}
          <Link
            to="/finance"
            className="group relative rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-lg hover:bg-white/10 hover:border-amber-500/50 transition-all duration-300 shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Coins className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-1 text-white group-hover:text-amber-300 transition-colors">
                Biro Keuangan
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Audit realisasi subsidi voucher, grafik anggaran, dan validasi pencairan dana kasir.
              </p>
            </div>
            <div className="flex items-center text-xs font-semibold text-amber-400 gap-1 group-hover:translate-x-1 transition-transform">
              Buka Keuangan <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-4 text-center text-xs text-slate-400">
        © 2026 Universitas Pignatelli Triputra · Proyek Magang Sistem Voucher Kantin Digital
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />

      {/* Admin IT Routes */}
      <Route path="/admin/masuk" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="staf" element={<AdminStaffPage />} />
        <Route path="tenant" element={<AdminTenantsPage />} />
        <Route path="transaksi" element={<AdminTransactionsPage />} />
      </Route>

      {/* Finance Routes */}
      <Route path="/finance/masuk" element={<FinanceLoginPage />} />
      <Route path="/finance" element={<FinanceLayout />}>
        <Route index element={<FinanceDashboard />} />
        <Route path="pencairan" element={<FinancePayoutsPage />} />
        <Route path="transaksi" element={<AdminTransactionsPage />} />
      </Route>

      {/* Kasir / Scanner Routes */}
      <Route path="/scan/masuk" element={<KasirLoginPage />} />
      <Route path="/scan" element={<ScanPage />} />

      {/* Fallback route */}
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}
