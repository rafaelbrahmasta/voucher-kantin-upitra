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
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-sky-100/60 text-slate-800 flex flex-col justify-between font-sans">
      {/* Header */}
      <header className="border-b border-sky-100 backdrop-blur-md bg-white/80 px-6 py-4 shadow-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md shadow-sky-500/20">
              <span className="font-black text-white text-lg">UP</span>
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900 text-base leading-tight">Voucher Kantin UPITRA</h1>
              <p className="text-xs text-sky-700 font-medium">Universitas Pignatelli Triputra</p>
            </div>
          </div>
          <span className="text-xs bg-sky-100 text-sky-800 border border-sky-200 px-3 py-1 rounded-full font-semibold">
            Portal Kampus
          </span>
        </div>
      </header>

      {/* Main Hero */}
      <main className="max-w-5xl mx-auto px-6 py-14 flex-1 flex flex-col justify-center">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 bg-sky-100/80 border border-sky-200 px-3.5 py-1.5 rounded-full text-xs font-bold text-sky-800 mb-4 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Subsidi Voucher Rp5.000 | Jam Berlaku: 10:00 – 16:00 WIB
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4 text-slate-900">
            Sistem Digital Voucher Kantin Kampus
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            Portal terpadu untuk kasir stan kantin, manajemen data penerima voucher dosen & staf, serta audit realisasi anggaran subsidi kampus.
          </p>
        </div>

        {/* Portal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Kasir */}
          <Link
            to="/scan"
            className="group relative rounded-2xl bg-white border border-sky-100 p-7 hover:border-emerald-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-1.5 text-slate-900 group-hover:text-emerald-600 transition-colors">
                Kasir Stan Kantin
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Scan QR voucher dosen/staf via kamera HP dan klaim pesanan menu makan/minum mitra kantin.
              </p>
            </div>
            <div className="flex items-center text-xs font-bold text-emerald-600 gap-1.5 group-hover:translate-x-1 transition-transform">
              Buka Scanner <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Card 2: Admin Super IT */}
          <Link
            to="/admin"
            className="group relative rounded-2xl bg-white border border-sky-200 p-7 hover:border-sky-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 shadow-sm flex flex-col justify-between ring-2 ring-sky-500/10"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-1.5 text-slate-900 group-hover:text-sky-600 transition-colors">
                Admin Super IT
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Kelola master data dosen & staf, penerbitan kuota voucher harian, dan stan kantin mitra.
              </p>
            </div>
            <div className="flex items-center text-xs font-bold text-sky-600 gap-1.5 group-hover:translate-x-1 transition-transform">
              Masuk Portal IT <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Card 3: Biro Keuangan */}
          <Link
            to="/finance"
            className="group relative rounded-2xl bg-white border border-sky-100 p-7 hover:border-amber-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Coins className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-1.5 text-slate-900 group-hover:text-amber-600 transition-colors">
                Biro Keuangan
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Audit realisasi subsidi voucher, grafik anggaran, dan validasi pencairan dana kasir stan.
              </p>
            </div>
            <div className="flex items-center text-xs font-bold text-amber-600 gap-1.5 group-hover:translate-x-1 transition-transform">
              Buka Keuangan <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-sky-100 bg-white/70 backdrop-blur-sm px-6 py-4 text-center text-xs text-slate-500">
        © 2026 Universitas Pignatelli Triputra · Sistem Voucher Kantin Digital
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
