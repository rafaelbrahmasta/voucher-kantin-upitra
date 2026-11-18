import React, { useState } from 'react'
import { Shield, ArrowRight, Lock, User } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../../services/api'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin.it')
  const [password, setPassword] = useState('Admin@IT2025')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setError('Password wajib diisi')
      return
    }

    try {
      setLoading(true)
      setError('')
      await api.auth.login('admin', username, password)
      navigate('/admin')
    } catch (err: any) {
      setError(err.message || 'Gagal masuk sebagai Admin Super IT')
    } finally {
      setLoading(false)
    }
  }

  const handleMicrosoftLogin = () => {
    const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
    window.location.href = `${apiBase}/auth/microsoft?role=admin`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100/70 flex flex-col justify-between text-slate-800 font-sans p-4">
      {/* Top Brand */}
      <div className="max-w-md w-full mx-auto pt-8 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xs font-semibold text-sky-700 hover:text-sky-900 transition-colors">
          ← Kembali ke Beranda
        </Link>
        <span className="text-[11px] bg-sky-100 text-sky-800 border border-sky-200 px-2.5 py-0.5 rounded-full font-bold">
          Admin Super IT
        </span>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full mx-auto my-8 bg-white border border-sky-100 rounded-3xl p-8 shadow-xl shadow-sky-900/5">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center mx-auto shadow-lg shadow-sky-500/25 mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Portal Admin Super IT</h1>
          <p className="text-xs text-slate-500 mt-1">
            Universitas Pignatelli Triputra · Sistem Voucher Kantin
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Username / Akun Admin
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin.it"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500 transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Kata Sandi (Password)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500 transition-all font-mono"
              />
            </div>
          </div>

          <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-xl text-[11px] text-sky-800 flex items-center justify-between">
            <span>Kredensial Dev: <strong className="font-mono">admin.it</strong> / <strong className="font-mono">Admin@IT2025</strong></span>
            <button
              type="button"
              onClick={() => { setUsername('admin.it'); setPassword('Admin@IT2025') }}
              className="text-xs font-bold text-sky-600 hover:text-sky-800 underline"
            >
              Isi Otomatis
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/25 transition-all disabled:opacity-50 mt-2"
          >
            <span>{loading ? 'Memverifikasi Sandi...' : 'Masuk ke Portal Admin'}</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </form>

        <div className="relative flex items-center justify-center my-6">
          <div className="border-t border-slate-200 w-full"></div>
          <span className="bg-white px-3 text-[11px] text-slate-400 uppercase tracking-widest font-bold">
            atau SSO
          </span>
        </div>

        {/* Microsoft Entra ID Button */}
        <button
          type="button"
          onClick={handleMicrosoftLogin}
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold transition-all shadow-xs group"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          <span>Masuk dengan Akun Microsoft UPITRA</span>
        </button>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center text-[11px] text-slate-500">
          Hak akses dibatasi untuk staf IT & pengelola sistem resmi UPITRA.
        </div>
      </div>

      <div className="text-center text-xs text-slate-500 pb-4 font-medium">
        © 2026 Universitas Pignatelli Triputra
      </div>
    </div>
  )
}
