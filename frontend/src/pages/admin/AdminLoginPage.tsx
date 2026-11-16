import React, { useState } from 'react'
import { Shield, ArrowRight, Sparkles, Building, Lock } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../../services/api'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleQuickLogin = async () => {
    try {
      setLoading(true)
      setError('')
      await api.auth.login('admin')
      navigate('/admin')
    } catch (err: any) {
      setError(err.message || 'Gagal masuk sebagai admin')
    } finally {
      setLoading(false)
    }
  }

  const handleMicrosoftLogin = () => {
    window.location.href = '/auth/microsoft'
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between text-slate-100 font-sans p-4">
      {/* Top Brand */}
      <div className="max-w-md w-full mx-auto pt-8 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 text-xs text-slate-400 hover:text-white">
          ← Kembali ke Beranda
        </Link>
        <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full font-semibold">
          Admin Super IT
        </span>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full mx-auto my-8 bg-slate-900/90 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center mx-auto shadow-xl shadow-blue-500/30 mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Portal Admin Super IT</h1>
          <p className="text-xs text-slate-400 mt-1">
            Universitas Pignatelli Triputra · Sistem Voucher Kantin
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Microsoft Entra ID Button */}
          <button
            onClick={handleMicrosoftLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 text-white text-xs font-bold transition-all shadow-md group"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            <span>Masuk dengan Akun Microsoft UPITRA</span>
          </button>

          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-white/10 w-full"></div>
            <span className="bg-slate-900 px-3 text-[11px] text-slate-500 uppercase tracking-widest font-bold">
              atau mode demo
            </span>
          </div>

          {/* Quick Login Button */}
          <button
            onClick={handleQuickLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loading ? 'Memproses Masuk...' : 'Masuk Langsung (Akun Super Admin)'}</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 text-center text-[11px] text-slate-500">
          Hak akses dibatasi untuk staf IT & pengelola sistem resmi UPITRA.
        </div>
      </div>

      <div className="text-center text-xs text-slate-600 pb-4">
        © 2026 Universitas Pignatelli Triputra
      </div>
    </div>
  )
}
