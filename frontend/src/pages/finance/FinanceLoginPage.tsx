import React, { useState } from 'react'
import { Coins, ArrowRight, Lock, User } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../../services/api'

export default function FinanceLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin.finance')
  const [password, setPassword] = useState('Finance@2025')
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
      await api.auth.login('finance', username, password)
      navigate('/finance')
    } catch (err: any) {
      setError(err.message || 'Gagal masuk sebagai Biro Keuangan')
    } finally {
      setLoading(false)
    }
  }

  const handleMicrosoftLogin = () => {
    window.location.href = '/auth/microsoft?role=finance'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100/70 flex flex-col justify-between text-slate-800 font-sans p-4">
      {/* Top Brand */}
      <div className="max-w-md w-full mx-auto pt-8 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xs font-semibold text-sky-700 hover:text-sky-900 transition-colors">
          ← Kembali ke Beranda
        </Link>
        <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full font-bold">
          Biro Keuangan
        </span>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full mx-auto my-8 bg-white border border-sky-100 rounded-3xl p-8 shadow-xl shadow-sky-900/5">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center mx-auto shadow-lg shadow-sky-500/25 mb-4">
            <Coins className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Portal Biro Keuangan</h1>
          <p className="text-xs text-slate-500 mt-1">
            Universitas Pignatelli Triputra · Audit & Pencairan Subsidi Voucher
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
              Username / Akun Keuangan
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin.finance"
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

          <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl text-[11px] text-amber-800 flex items-center justify-between">
            <span>Kredensial Dev: <strong className="font-mono">admin.finance</strong> / <strong className="font-mono">Finance@2025</strong></span>
            <button
              type="button"
              onClick={() => { setUsername('admin.finance'); setPassword('Finance@2025') }}
              className="text-xs font-bold text-amber-700 hover:text-amber-900 underline"
            >
              Isi Otomatis
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/25 transition-all disabled:opacity-50 mt-2"
          >
            <span>{loading ? 'Memverifikasi Sandi...' : 'Masuk ke Portal Keuangan'}</span>
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
          Hak akses dibatasi untuk staf Biro Keuangan & Pimpinan UPITRA.
        </div>
      </div>

      <div className="text-center text-xs text-slate-500 pb-4 font-medium">
        © 2026 Universitas Pignatelli Triputra
      </div>
    </div>
  )
}
