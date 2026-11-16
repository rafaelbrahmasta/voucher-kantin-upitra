import React, { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Shield, Users, Store, ReceiptText, LogOut, LayoutDashboard, ChevronRight } from 'lucide-react'
import { api } from '../../services/api'
import { AuthSession } from '../../types'

export default function AdminLayout() {
  const navigate = useNavigate()
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const data = await api.auth.me()
      if (!data.authenticated || data.role !== 'admin') {
        // Auto-login for seamless dev preview if not yet logged in
        try {
          const loginRes = await api.auth.login('admin')
          setSession({ authenticated: true, role: 'admin', displayName: loginRes.displayName })
        } catch {
          navigate('/admin/masuk')
        }
      } else {
        setSession(data)
      }
    } catch (err) {
      console.error('Auth error', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await api.auth.logout()
      navigate('/admin/masuk')
    } catch (err) {
      console.error('Logout error', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm">Memuat Portal Admin IT...</p>
        </div>
      </div>
    )
  }

  const navItems = [
    { to: '/admin', label: 'Ringkasan', icon: LayoutDashboard, end: true },
    { to: '/admin/staf', label: 'Dosen & Staf', icon: Users, end: false },
    { to: '/admin/tenant', label: 'Stan Kantin', icon: Store, end: false },
    { to: '/admin/transaksi', label: 'Transaksi', icon: ReceiptText, end: false },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-white/10 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Portal Title */}
          <div className="flex items-center gap-3.5">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-sm sm:text-base leading-tight text-white tracking-wide">
                    Admin Super IT
                  </h1>
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                    Voucher UPITRA
                  </span>
                </div>
                <p className="text-xs text-slate-400">Universitas Pignatelli Triputra</p>
              </div>
            </Link>
          </div>

          {/* User Badge & Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-slate-800/80 border border-white/10 px-3.5 py-1.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-xs font-medium text-slate-200">
                {session?.displayName || 'Rafael Bramasta'}
              </span>
              <span className="text-[10px] bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded-md font-semibold">
                Super Admin
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-medium text-rose-300 hover:text-white bg-rose-500/10 hover:bg-rose-600/80 border border-rose-500/30 px-3 py-1.5 rounded-lg transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Subheader */}
      <nav className="bg-slate-900 border-b border-white/5 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto py-2.5 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 border border-blue-400/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
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
      <footer className="border-t border-white/10 bg-slate-900/60 px-6 py-4 text-center text-xs text-slate-500">
        © 2026 Universitas Pignatelli Triputra · Sistem Voucher Kantin Digital Kampus
      </footer>
    </div>
  )
}
