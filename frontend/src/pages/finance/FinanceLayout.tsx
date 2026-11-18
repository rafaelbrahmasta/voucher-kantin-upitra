import React, { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Coins, LayoutDashboard, HandCoins, ReceiptText, LogOut } from 'lucide-react'
import { api } from '../../services/api'
import { AuthSession } from '../../types'

export default function FinanceLayout() {
  const navigate = useNavigate()
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const data = await api.auth.me()
      if (!data.authenticated || (data.role !== 'finance' && data.role !== 'admin')) {
        navigate('/finance/masuk')
      } else {
        setSession(data)
      }
    } catch (err) {
      console.error('Auth error', err)
      navigate('/finance/masuk')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await api.auth.logout()
      navigate('/finance/masuk')
    } catch (err) {
      console.error('Logout error', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50/50 flex items-center justify-center text-slate-600">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium">Memuat Portal Biro Keuangan...</p>
        </div>
      </div>
    )
  }

  const navItems = [
    { to: '/finance', label: 'Ringkasan Kas', icon: LayoutDashboard, end: true },
    { to: '/finance/pencairan', label: 'Rekap Pencairan Stan', icon: HandCoins, end: false },
    { to: '/finance/transaksi', label: 'Audit Transaksi', icon: ReceiptText, end: false },
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-sky-100 shadow-xs px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Portal Title */}
          <div className="flex items-center gap-3.5">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
                <Coins className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-extrabold text-sm sm:text-base leading-tight text-slate-900 tracking-wide">
                    Biro Keuangan
                  </h1>
                  <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    Subsidi UPITRA
                  </span>
                </div>
                <p className="text-xs text-sky-700 font-medium">Universitas Pignatelli Triputra</p>
              </div>
            </Link>
          </div>

          {/* User Badge & Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-amber-50 border border-amber-200/80 px-3.5 py-1.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
              <span className="text-xs font-semibold text-slate-800">
                {session?.displayName || 'Biro Keuangan UPITRA'}
              </span>
              <span className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded-md font-bold">
                Finance
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-lg transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Subheader */}
      <nav className="bg-white border-b border-slate-200/80 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto py-2 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'bg-amber-600 text-white shadow-sm shadow-amber-500/25'
                      : 'text-slate-600 hover:text-amber-700 hover:bg-amber-50'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            )
          })}
        </div>
      </nav>

      {/* Main Outlet */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-center text-xs text-slate-500">
        © 2026 Universitas Pignatelli Triputra · Sistem Voucher Kantin Digital Kampus
      </footer>
    </div>
  )
}
